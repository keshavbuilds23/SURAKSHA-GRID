import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { createDatabaseConnection, closeDatabase } from '../src/database/connection.js';
import { initializeSchema } from '../src/database/schema.js';
import { EnvConfig } from '../src/config/env.js';

describe('API Health Endpoint (GET /api/v1/health)', () => {
  let db: Database.Database;
  const mockConfig: EnvConfig = {
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

  test('GET /api/v1/health returns 200 with standard healthy payload', async () => {
    const app = createApp({ db, config: mockConfig });
    const res = await request(app).get('/api/v1/health');

    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');

    // Standard Success Envelope
    assert.equal(res.body.success, true);
    assert.ok(res.body.data);
    assert.equal(res.body.data.status, 'healthy');
    assert.equal(res.body.data.service, 'suraksha-grid-api');
    assert.equal(res.body.data.version, '1.0.0');
    assert.equal(res.body.data.database.status, 'connected');
    assert.ok(typeof res.body.data.uptime === 'number');
    assert.ok(typeof res.body.data.timestamp === 'string');
  });

  test('HEAD /api/v1/health returns 200 with empty body for lightweight connectivity checks', async () => {
    const app = createApp({ db, config: mockConfig });
    const res = await request(app).head('/api/v1/health');

    assert.equal(res.status, 200);
    assert.equal(res.text, undefined);
  });

  test('SECURITY CHECK: Health endpoint NEVER leaks secrets, credentials, or internal file paths', async () => {
    const app = createApp({ db, config: mockConfig });
    const res = await request(app).get('/api/v1/health');

    const jsonString = JSON.stringify(res.body);

    // 1. JWT_SECRET must never appear anywhere in output
    assert.ok(
      !jsonString.includes(mockConfig.JWT_SECRET),
      'Output must not contain JWT_SECRET'
    );
    assert.ok(!jsonString.includes('secret'), 'Output must not contain secret tokens');

    // 2. Internal filesystem paths must never be exposed
    assert.ok(!jsonString.includes('C:\\'), 'Output must not contain Windows disk paths');
    assert.ok(!jsonString.includes('/Users/'), 'Output must not contain user directories');
    assert.ok(!jsonString.includes('suraksha_grid.sqlite'), 'Output must not contain database filenames');
  });

  test('GET /api/v1/health reports 503 degraded when database connection is severed', async () => {
    // Intentionally close the database to simulate failure
    closeDatabase(db);

    const app = createApp({ db, config: mockConfig });
    const res = await request(app).get('/api/v1/health');

    assert.equal(res.status, 503);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'degraded');
    assert.equal(res.body.data.database.status, 'disconnected');
  });
});

