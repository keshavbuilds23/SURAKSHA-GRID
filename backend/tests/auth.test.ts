import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { createDatabaseConnection, closeDatabase } from '../src/database/connection.js';
import { initializeSchema } from '../src/database/schema.js';
import { EnvConfig } from '../src/config/env.js';

const TEST_JWT_SECRET = 'super-secret-test-jwt-signing-key-32chars!';

const testEnvConfig: EnvConfig = {
  NODE_ENV: 'test',
  PORT: 5097,
  HOST: '127.0.0.1',
  CORS_ORIGIN: '*',
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX_REQUESTS: 1000,
  AUTH_RATE_LIMIT_WINDOW_MS: 60000,
  AUTH_RATE_LIMIT_MAX_REQUESTS: 3, // Lower threshold for rate-limit test
  API_PREFIX: '/api/v1',
  JWT_SECRET: TEST_JWT_SECRET,
  JWT_EXPIRES_IN: '12h',
  SQLITE_PATH: ':memory:',
};

describe('Coordinator Authentication & Authorization (/api/v1/auth)', () => {
  let tempDbDir: string;
  let tempDbPath: string;
  let db: Database.Database;
  let app: any;

  const TEST_PASSWORD = 'CorrectPassword@123';

  beforeEach(() => {
    tempDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suraksha-auth-test-'));
    tempDbPath = path.join(tempDbDir, 'test_auth.sqlite');

    db = createDatabaseConnection({ dbPath: tempDbPath });
    initializeSchema(db);

    // Seed test users with bcrypt hash
    const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 10);

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, full_name, phone)
      VALUES 
        (1, 'coord_test', ?, 'coordinator', 'Test Coordinator Officer', '+919876543210'),
        (2, 'citizen_test', ?, 'citizen', 'Citizen Test User', '+919876543211')
    `).run(passwordHash, passwordHash);

    app = createApp({ db, config: testEnvConfig });
  });

  afterEach(() => {
    closeDatabase(db);
    if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
    if (fs.existsSync(tempDbDir)) fs.rmdirSync(tempDbDir);
  });

  // -------------------------------------------------------------
  // 1. Successful Login
  // -------------------------------------------------------------
  test('POST /api/v1/auth/login succeeds with valid credentials and returns HS256 JWT', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        username: 'coord_test',
        password: TEST_PASSWORD,
      })
      .expect(200);

    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.token, 'Should return a JWT token string');
    assert.strictEqual(res.body.data.user.id, 1);
    assert.strictEqual(res.body.data.user.username, 'coord_test');
    assert.strictEqual(res.body.data.user.role, 'coordinator');
    assert.strictEqual(res.body.data.user.full_name, 'Test Coordinator Officer');
    assert.strictEqual(res.body.data.expires_in, '12h');

    // Verify token can be decoded and verified with secret
    const decoded = jwt.verify(res.body.data.token, TEST_JWT_SECRET, { algorithms: ['HS256'] }) as any;
    assert.strictEqual(decoded.id, 1);
    assert.strictEqual(decoded.username, 'coord_test');
    assert.strictEqual(decoded.role, 'coordinator');
  });

  test('POST /api/v1/auth/login is case-insensitive for username', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        username: 'COORD_TEST', // uppercase
        password: TEST_PASSWORD,
      })
      .expect(200);

    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.user.id, 1);
  });

  // -------------------------------------------------------------
  // 2. Generic Error on Incorrect Password
  // -------------------------------------------------------------
  test('POST /api/v1/auth/login rejects incorrect password with generic 401 error', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        username: 'coord_test',
        password: 'WrongPassword!',
      })
      .expect(401);

    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'INVALID_CREDENTIALS');
    assert.strictEqual(res.body.error.message, 'Invalid username or password.');
  });

  // -------------------------------------------------------------
  // 3. Generic Error on Non-Existent Username (No Enumeration)
  // -------------------------------------------------------------
  test('POST /api/v1/auth/login rejects non-existent username with identical generic 401 error', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        username: 'completely_unknown_user_999',
        password: 'SomePassword123',
      })
      .expect(401);

    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'INVALID_CREDENTIALS');
    // Must be completely identical to prevent username enumeration
    assert.strictEqual(res.body.error.message, 'Invalid username or password.');
  });

  // -------------------------------------------------------------
  // 4. Zod Input Validation
  // -------------------------------------------------------------
  test('POST /api/v1/auth/login validates required fields and rejects invalid payload', async () => {
    // Missing password
    const res1 = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'coord_test' })
      .expect(400);

    assert.strictEqual(res1.body.success, false);
    assert.strictEqual(res1.body.error.code, 'VALIDATION_ERROR');

    // Missing username
    const res2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ password: 'SomePassword' })
      .expect(400);

    assert.strictEqual(res2.body.success, false);
    assert.strictEqual(res2.body.error.code, 'VALIDATION_ERROR');

    // Empty strings
    const res3 = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: '   ', password: '' })
      .expect(400);

    assert.strictEqual(res3.body.success, false);
  });

  // -------------------------------------------------------------
  // 5. Rate Limiting on Login
  // -------------------------------------------------------------
  test('POST /api/v1/auth/login enforces rate limiting after excessive attempts', async () => {
    // Create an app instance where rate limiter tests are NOT skipped
    const rateLimitApp = createApp({
      db,
      config: {
        ...testEnvConfig,
        AUTH_RATE_LIMIT_MAX_REQUESTS: 3,
        AUTH_RATE_LIMIT_WINDOW_MS: 60000,
      },
      authOptions: {
        skipRateLimitTest: false,
      },
    });

    // We make 3 attempts (allowed)
    for (let i = 0; i < 3; i++) {
      await request(rateLimitApp)
        .post('/api/v1/auth/login')
        .send({ username: 'coord_test', password: 'WrongPassword' })
        .expect(401);
    }

    // 4th attempt should exceed the limit of 3
    const blockedRes = await request(rateLimitApp)
      .post('/api/v1/auth/login')
      .send({ username: 'coord_test', password: 'WrongPassword' })
      .expect(429);

    assert.strictEqual(blockedRes.body.success, false);
    assert.strictEqual(blockedRes.body.error.code, 'RATE_LIMIT_EXCEEDED');
  });

  // -------------------------------------------------------------
  // 6. Token Authorizes Protected Operations (requireCoordinator)
  // -------------------------------------------------------------
  test('Token issued from login allows accessing coordinator-protected endpoints', async () => {
    // 1. Log in
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        username: 'coord_test',
        password: TEST_PASSWORD,
      })
      .expect(200);

    const token = loginRes.body.data.token;

    // 2. Access protected endpoint (Register NGO) with Bearer token
    const regRes = await request(app)
      .post('/api/v1/ngos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: 'ngo-authorized-test',
        name: 'Authorized Test NGO',
        primary_contact_name: 'Coordinator In Charge',
        primary_contact_phone: '+919435111222',
      })
      .expect(201);

    assert.strictEqual(regRes.body.success, true);
    assert.strictEqual(regRes.body.data.id, 'ngo-authorized-test');
  });

  // -------------------------------------------------------------
  // 7. Expired & Invalid Tokens Rejected
  // -------------------------------------------------------------
  test('Protected endpoint rejects expired JWT tokens with 401', async () => {
    // Mint expired token
    const expiredToken = jwt.sign(
      { id: 1, sub: 1, username: 'coord_test', role: 'coordinator' },
      TEST_JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '-10s' }
    );

    const res = await request(app)
      .post('/api/v1/ngos')
      .set('Authorization', `Bearer ${expiredToken}`)
      .send({
        id: 'ngo-fail',
        name: 'Fail NGO',
        primary_contact_name: 'Contact',
        primary_contact_phone: '+919999999999',
      })
      .expect(401);

    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.message.includes('expired'));
  });

  test('Protected endpoint rejects tokens with invalid signature or algorithm', async () => {
    // Token signed with forged secret
    const forgedToken = jwt.sign(
      { id: 1, sub: 1, username: 'coord_test', role: 'coordinator' },
      'forged-secret-attacker-key-12345678',
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    const res = await request(app)
      .post('/api/v1/ngos')
      .set('Authorization', `Bearer ${forgedToken}`)
      .send({
        id: 'ngo-forged-fail',
        name: 'Fail NGO',
        primary_contact_name: 'Contact',
        primary_contact_phone: '+919999999999',
      })
      .expect(401);

    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.message.includes('signature'));
  });

  // -------------------------------------------------------------
  // 8. Role Privilege Separation & GET /auth/me
  // -------------------------------------------------------------
  test('Token belonging to citizen user is rejected on coordinator endpoint with 403', async () => {
    // Log in as citizen
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        username: 'citizen_test',
        password: TEST_PASSWORD,
      })
      .expect(200);

    const citizenToken = loginRes.body.data.token;

    // Try coordinator action
    const res = await request(app)
      .post('/api/v1/ngos')
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({
        id: 'ngo-unauthorized',
        name: 'Unauthorized NGO',
        primary_contact_name: 'Contact',
        primary_contact_phone: '+919999999999',
      })
      .expect(403);

    assert.strictEqual(res.body.success, false);
  });

  test('GET /api/v1/auth/me returns authenticated user details', async () => {
    // 1. Log in
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        username: 'coord_test',
        password: TEST_PASSWORD,
      })
      .expect(200);

    const token = loginRes.body.data.token;

    // 2. Fetch /auth/me
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    assert.strictEqual(meRes.body.success, true);
    assert.strictEqual(meRes.body.data.user.username, 'coord_test');
    assert.strictEqual(meRes.body.data.user.role, 'coordinator');
  });
});
