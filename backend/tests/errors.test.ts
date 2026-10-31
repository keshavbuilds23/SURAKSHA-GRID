import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { createDatabaseConnection, closeDatabase } from '../src/database/connection.js';
import { initializeSchema } from '../src/database/schema.js';
import { EnvConfig } from '../src/config/env.js';
import { AppError } from '../src/types/index.js';

describe('Centralized Error Handling & Security Middleware', () => {
  let db: Database.Database;

  const baseConfig: EnvConfig = {
    PORT: 5000,
    NODE_ENV: 'test',
    API_PREFIX: '/api/v1',
    CORS_ORIGIN: 'http://localhost:5173',
    DB_PATH: ':memory:',
    JWT_SECRET: 'test-secret-key-that-is-at-least-32-chars-long!',
    JWT_EXPIRES_IN: '24h',
    RATE_LIMIT_WINDOW_MS: 60000,
    RATE_LIMIT_MAX_REQUESTS: 100,
  };

  beforeEach(() => {
    db = createDatabaseConnection({ dbPath: ':memory:' });
    initializeSchema(db);
  });

  afterEach(() => {
    if (db && db.open) {
      closeDatabase(db);
    }
  });

  test('404 Handler: Unmatched route returns standard 404 error envelope', async () => {
    const app = createApp({ db, config: baseConfig });
    const res = await request(app).get('/api/v1/nonexistent-route-endpoint');

    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'NOT_FOUND');
    assert.ok(res.body.error.message.includes('Cannot GET /api/v1/nonexistent-route-endpoint'));
    assert.ok(typeof res.body.error.timestamp === 'string');
  });

  test('JSON Parser: Malformed JSON payload returns 400 BAD_REQUEST error envelope', async () => {
    const app = createApp({ db, config: baseConfig });
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{ malformed: true, missing_quotes }');

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'BAD_REQUEST');
    assert.ok(res.body.error.message.includes('Malformed JSON'));
  });

  test('Custom AppError: Returns specified status code and error details', async () => {
    const app = createApp({
      db,
      config: baseConfig,
      customRoutes: (testApp) => {
        testApp.get('/api/v1/test-app-error', () => {
          throw new AppError('Resource allocation failed: stock depleted.', 409, 'INSUFFICIENT_STOCK', [
            { field: 'quantity', issue: 'Requested 5, available 2' },
          ]);
        });
      },
    });

    const res = await request(app).get('/api/v1/test-app-error');

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'INSUFFICIENT_STOCK');
    assert.equal(res.body.error.message, 'Resource allocation failed: stock depleted.');
    assert.equal(res.body.error.details?.length, 1);
    assert.equal(res.body.error.details?.[0].field, 'quantity');
  });

  test('Database Error Sanitization: Does NOT leak raw SQL or file paths to client', async () => {
    const app = createApp({
      db,
      config: baseConfig,
      customRoutes: (testApp) => {
        testApp.get('/api/v1/test-db-error', () => {
          db.prepare('SELECT * FROM non_existent_table WHERE id = ?').get(1);
        });
      },
    });

    const res = await request(app).get('/api/v1/test-db-error');

    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'DATABASE_ERROR');
    // Must NOT leak table name or SQL statement
    assert.ok(!res.body.error.message.includes('non_existent_table'));
    assert.ok(!res.body.error.message.includes('SELECT *'));
  });

  test('Production Error Sanitization: Never leaks stack traces or file paths', async () => {
    const prodConfig: EnvConfig = {
      ...baseConfig,
      NODE_ENV: 'production',
    };
    const app = createApp({
      db,
      config: prodConfig,
      customRoutes: (testApp) => {
        testApp.get('/api/v1/test-crash', () => {
          throw new Error('Secret crash on C:\\Users\\Admin\\Private\\server.ts');
        });
      },
    });

    const res = await request(app).get('/api/v1/test-crash');

    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'INTERNAL_ERROR');
    assert.equal(res.body.error.message, 'An internal server error occurred.');
    // Ensure no stack trace or paths in JSON
    const bodyStr = JSON.stringify(res.body);
    assert.ok(!bodyStr.includes('C:\\Users'));
    assert.ok(!bodyStr.includes('stack'));
  });

  test('CORS Policy: Rejects unauthorized origins with 403 CORS_REJECTED', async () => {
    const app = createApp({ db, config: baseConfig });

    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://malicious-disaster-hijack.com');

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'CORS_REJECTED');
  });
});
