import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { createDatabaseConnection, closeDatabase } from '../src/database/connection.js';
import { initializeSchema } from '../src/database/schema.js';
import { EnvConfig } from '../src/config/env.js';

describe('Incident API & Batch Synchronization Endpoints', () => {
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

    // Seed a coordinator user for verification tests
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, full_name, phone)
      VALUES (1, 'coordinator_sarma', 'hash123', 'coordinator', 'Dr. N. Sarma', '+919876543210')
    `).run();
  });

  afterEach(() => {
    if (db && db.open) {
      closeDatabase(db);
    }
  });

  test('POST /api/v1/incidents: successfully ingests a valid incident and calculates severity', async () => {
    const app = createApp({ db, config: mockConfig });
    const payload = {
      client_report_id: 'a0000000-0000-4000-8000-000000000001',
      title: 'Family of 8 marooned on roof in Kampur',
      description: 'Floodwaters rose 5 feet overnight following bund breach near railway bridge.',
      category: 'MAROONED_RESCUE',
      reported_urgency: 'HIGH',
      latitude: 26.1523,
      longitude: 92.8341,
      landmark: 'Near Kampur Railway Station School',
      affected_count: 8,
      medical_required: true,
    };

    const res = await request(app)
      .post('/api/v1/incidents')
      .send(payload);

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.id > 0);
    assert.equal(res.body.data.client_report_id, payload.client_report_id);
    assert.equal(res.body.data.severity, 'CRITICAL'); // MAROONED_RESCUE calculates to CRITICAL
    assert.equal(res.body.data.verification_status, 'PENDING');

    // Confirm persisted in SQLite
    const row = db.prepare('SELECT * FROM incidents WHERE id = ?').get(res.body.data.id) as any;
    assert.ok(row);
    assert.equal(row.client_report_id, payload.client_report_id);
    assert.equal(row.affected_count, 8);

    // Confirm audit event recorded in incident_events
    const event = db.prepare('SELECT * FROM incident_events WHERE incident_id = ?').get(res.body.data.id) as any;
    assert.ok(event);
    assert.equal(event.event_type, 'CREATED');
  });

  test('POST /api/v1/incidents: rejects invalid coordinates, negative counts, or missing fields with 400 VALIDATION_ERROR', async () => {
    const app = createApp({ db, config: mockConfig });

    // Invalid latitude (> 90) and negative affected_count
    const invalidPayload = {
      client_report_id: 'a0000000-0000-4000-8000-000000000002',
      title: 'Hi', // Too short (min 3)
      description: 'Test',
      category: 'INVALID_CATEGORY',
      latitude: 145.2,
      longitude: 92.8,
      landmark: 'X', // Too short (min 2)
      affected_count: -5,
    };

    const res = await request(app)
      .post('/api/v1/incidents')
      .send(invalidPayload);

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(Array.isArray(res.body.error.details));
    assert.ok(res.body.error.details.length >= 4);

    // Confirm nothing persisted
    const count = db.prepare('SELECT COUNT(*) as count FROM incidents').get() as { count: number };
    assert.equal(count.count, 0);
  });

  test('POST /api/v1/incidents: idempotent duplicate replay returns 200 without creating second record', async () => {
    const app = createApp({ db, config: mockConfig });
    const payload = {
      client_report_id: 'a0000000-0000-4000-8000-000000000003',
      title: 'Drinking water emergency in Bhuragaon',
      description: 'Tube wells submerged under silt; 50 families need clean drinking water packets.',
      category: 'FOOD_WATER_CRISIS',
      reported_urgency: 'HIGH',
      latitude: 26.259,
      longitude: 92.349,
      landmark: 'Bhuragaon Primary Health Sub-centre',
      affected_count: 50,
    };

    // First submission
    const res1 = await request(app).post('/api/v1/incidents').send(payload);
    assert.equal(res1.status, 201);
    const incidentId = res1.body.data.id;

    // Second submission with exact same client_report_id and content
    const res2 = await request(app).post('/api/v1/incidents').send(payload);
    assert.equal(res2.status, 200);
    assert.equal(res2.body.success, true);
    assert.equal(res2.body.data.id, incidentId);
    assert.equal(res2.body.meta.idempotent_replay, true);

    // Ensure only 1 record exists in database
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM incidents').get() as { count: number };
    assert.equal(totalCount.count, 1);
  });

  test('POST /api/v1/incidents: conflicting payload under existing report UUID returns 409 IDEMPOTENCY_CONFLICT', async () => {
    const app = createApp({ db, config: mockConfig });
    const payload1 = {
      client_report_id: 'a0000000-0000-4000-8000-000000000004',
      title: 'Embankment crack observed',
      description: 'Minor water seepage through earthen dyke.',
      category: 'INFRASTRUCTURE_BREACH',
      landmark: 'Brahmaputra dyke km 18',
      affected_count: 5,
    };

    const res1 = await request(app).post('/api/v1/incidents').send(payload1);
    assert.equal(res1.status, 201);

    // Attempt second submission with SAME UUID but DIFFERENT title and affected_count
    const payload2 = {
      ...payload1,
      title: 'Embankment totally collapsed washed away 400 people',
      affected_count: 400,
    };

    const res2 = await request(app).post('/api/v1/incidents').send(payload2);
    assert.equal(res2.status, 409);
    assert.equal(res2.body.success, false);
    assert.equal(res2.body.error.code, 'IDEMPOTENCY_CONFLICT');

    // Confirm original record was NOT modified
    const row = db.prepare('SELECT * FROM incidents WHERE client_report_id = ?').get(payload1.client_report_id) as any;
    assert.equal(row.title, payload1.title);
    assert.equal(row.affected_count, 5);
  });

  test('GET /api/v1/incidents: lists incidents with filtering, search and pagination', async () => {
    const app = createApp({ db, config: mockConfig });

    // Ingest 3 incidents
    const reports = [
      {
        client_report_id: 'b0000000-0000-4000-8000-000000000001',
        title: 'Trapped villagers in Majuli Char',
        description: 'Rising river water cut off ferry ghat.',
        category: 'MAROONED_RESCUE',
        landmark: 'Kamalabari Ghat',
        affected_count: 25,
      },
      {
        client_report_id: 'b0000000-0000-4000-8000-000000000002',
        title: 'Snakebite patient in Dhemaji camp',
        description: 'Emergency anti-venom required immediately.',
        category: 'MEDICAL_EMERGENCY',
        landmark: 'Dhemaji Relief Camp No 3',
        affected_count: 1,
        medical_required: true,
      },
      {
        client_report_id: 'b0000000-0000-4000-8000-000000000003',
        title: 'Tarpaulin shelter sheets needed',
        description: 'Temporary tents flooded; families displaced.',
        category: 'GENERAL_RELIEF',
        landmark: 'Morigaon PWD School',
        affected_count: 60,
      },
    ];

    for (const r of reports) {
      await request(app).post('/api/v1/incidents').send(r);
    }

    // 1. Unfiltered query
    const resAll = await request(app).get('/api/v1/incidents');
    assert.equal(resAll.status, 200);
    assert.equal(resAll.body.data.length, 3);
    assert.equal(resAll.body.meta.total, 3);

    // 2. Filter by category
    const resCat = await request(app).get('/api/v1/incidents?category=MEDICAL_EMERGENCY');
    assert.equal(resCat.status, 200);
    assert.equal(resCat.body.data.length, 1);
    assert.equal(resCat.body.data[0].category, 'MEDICAL_EMERGENCY');

    // 3. Search query
    const resSearch = await request(app).get('/api/v1/incidents?search=Majuli');
    assert.equal(resSearch.status, 200);
    assert.equal(resSearch.body.data.length, 1);
    assert.equal(resSearch.body.data[0].landmark, 'Kamalabari Ghat');

    // 4. Pagination
    const resPage = await request(app).get('/api/v1/incidents?page=1&limit=2');
    assert.equal(resPage.status, 200);
    assert.equal(resPage.body.data.length, 2);
    assert.equal(resPage.body.meta.limit, 2);
    assert.equal(resPage.body.meta.total_pages, 2);
  });

  test('GET /api/v1/incidents/:id: returns incident dossier with event history or 404', async () => {
    const app = createApp({ db, config: mockConfig });
    const createRes = await request(app).post('/api/v1/incidents').send({
      client_report_id: 'c0000000-0000-4000-8000-000000000001',
      title: 'Waterlogged school shelter',
      description: 'Camp inmates need drinking water.',
      category: 'FOOD_WATER_CRISIS',
      landmark: 'Kampur High School',
      affected_count: 45,
    });

    const incidentId = createRes.body.data.id;

    // Fetch existing incident
    const res = await request(app).get(`/api/v1/incidents/${incidentId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, incidentId);
    assert.ok(Array.isArray(res.body.data.events));
    assert.equal(res.body.data.events.length, 1);
    assert.equal(res.body.data.events[0].event_type, 'CREATED');

    // Fetch non-existent ID
    const resNotFound = await request(app).get('/api/v1/incidents/999999');
    assert.equal(resNotFound.status, 404);
    assert.equal(resNotFound.body.error.code, 'NOT_FOUND');
  });

  test('PATCH /api/v1/incidents/:id/verify: enforces strict cryptographic JWT verification and database actor lookup', async () => {
    const app = createApp({ db, config: mockConfig });

    // Seed a volunteer user (id: 2) in database
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, full_name, phone)
      VALUES (2, 'volunteer_pooja', 'hash456', 'volunteer', 'Pooja Saikia', '+919876543211')
    `).run();

    const createRes = await request(app).post('/api/v1/incidents').send({
      client_report_id: 'd0000000-0000-4000-8000-000000000001',
      title: 'Marooned cattle and farmers',
      description: 'Island sandbar flooded.',
      category: 'MAROONED_RESCUE',
      landmark: 'Ahatguri Char',
      affected_count: 12,
    });
    const incidentId = createRes.body.data.id;

    // 1. Anonymous request without credentials MUST be rejected with 401 UNAUTHORIZED
    const resAnon = await request(app)
      .patch(`/api/v1/incidents/${incidentId}/verify`)
      .send({ verification_notes: 'Confirmed by anonymous caller' });
    assert.equal(resAnon.status, 401);
    assert.equal(resAnon.body.error.code, 'UNAUTHORIZED');

    // 2. Forged x-actor-role header without valid Bearer token MUST be rejected with 401 UNAUTHORIZED
    const resForgedHeader = await request(app)
      .patch(`/api/v1/incidents/${incidentId}/verify`)
      .set('x-actor-role', 'coordinator')
      .set('x-actor-id', '1')
      .send({ verification_notes: 'Forged header attempt' });
    assert.equal(resForgedHeader.status, 401);
    assert.equal(resForgedHeader.body.error.code, 'UNAUTHORIZED');

    // 3. Invalid JWT signature (signed with an attacker's wrong secret) MUST be rejected with 401
    const invalidSigToken = jwt.sign(
      { id: 1, role: 'coordinator' },
      'attacker-forged-secret-key-32-chars-long!',
      { algorithm: 'HS256' }
    );
    const resBadSig = await request(app)
      .patch(`/api/v1/incidents/${incidentId}/verify`)
      .set('Authorization', `Bearer ${invalidSigToken}`)
      .send({ verification_notes: 'Forged signature attempt' });
    assert.equal(resBadSig.status, 401);
    assert.equal(resBadSig.body.error.code, 'UNAUTHORIZED');

    // 4. Expired JWT token MUST be rejected with 401 UNAUTHORIZED
    const expiredToken = jwt.sign(
      { id: 1, role: 'coordinator' },
      mockConfig.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '-10s' }
    );
    const resExpired = await request(app)
      .patch(`/api/v1/incidents/${incidentId}/verify`)
      .set('Authorization', `Bearer ${expiredToken}`)
      .send({ verification_notes: 'Expired token attempt' });
    assert.equal(resExpired.status, 401);
    assert.equal(resExpired.body.error.code, 'UNAUTHORIZED');

    // 5. Token with non-existent database user ID MUST be rejected with 401 UNAUTHORIZED
    const nonExistentUserToken = jwt.sign(
      { id: 999999, role: 'coordinator' },
      mockConfig.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
    const resPhantom = await request(app)
      .patch(`/api/v1/incidents/${incidentId}/verify`)
      .set('Authorization', `Bearer ${nonExistentUserToken}`)
      .send({ verification_notes: 'Phantom actor attempt' });
    assert.equal(resPhantom.status, 401);
    assert.equal(resPhantom.body.error.code, 'UNAUTHORIZED');

    // 6. Token for volunteer user (id: 2) MUST be rejected with 403 FORBIDDEN
    const volunteerToken = jwt.sign(
      { id: 2, role: 'volunteer' },
      mockConfig.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
    const resVolunteer = await request(app)
      .patch(`/api/v1/incidents/${incidentId}/verify`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ verification_notes: 'Volunteer verification attempt' });
    assert.equal(resVolunteer.status, 403);
    assert.equal(resVolunteer.body.error.code, 'FORBIDDEN');

    // 7. Forged role claim in token (claims 'coordinator' in JWT, but user id: 2 is volunteer in SQLite) MUST be rejected with 403
    const forgedRoleClaimToken = jwt.sign(
      { id: 2, role: 'coordinator' }, // Forged role claim
      mockConfig.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
    const resForgedClaim = await request(app)
      .patch(`/api/v1/incidents/${incidentId}/verify`)
      .set('Authorization', `Bearer ${forgedRoleClaimToken}`)
      .send({ verification_notes: 'Forged role claim attempt' });
    assert.equal(resForgedClaim.status, 403);
    assert.equal(resForgedClaim.body.error.code, 'FORBIDDEN');

    // 8. Cryptographically signed coordinator token (user id: 1 in SQLite) succeeds
    const validCoordinatorToken = jwt.sign(
      { id: 1, role: 'coordinator', full_name: 'Dr. N. Sarma' },
      mockConfig.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
    const resCoordinator = await request(app)
      .patch(`/api/v1/incidents/${incidentId}/verify`)
      .set('Authorization', `Bearer ${validCoordinatorToken}`)
      .send({
        verification_status: 'VERIFIED',
        verification_notes: 'Ground truth confirmed via VHF radio contact with Circle Officer.',
      });

    assert.equal(resCoordinator.status, 200);
    assert.equal(resCoordinator.body.data.verification_status, 'VERIFIED');
    assert.ok(resCoordinator.body.data.verified_at);
    assert.equal(resCoordinator.body.data.verified_by.full_name, 'Dr. N. Sarma');
    assert.equal(resCoordinator.body.data.verified_by.id, 1);

    // Verify incident_events table has audit trail
    const events = db
      .prepare('SELECT * FROM incident_events WHERE incident_id = ? ORDER BY created_at ASC')
      .all(incidentId) as any[];
    assert.equal(events.length, 2); // CREATED, then VERIFIED
    assert.equal(events[1].event_type, 'VERIFIED');
    assert.equal(events[1].actor_id, 1);
  });

  test('Field-level privacy: unauthenticated public requests mask phone numbers while staff tokens reveal them', async () => {
    const app = createApp({ db, config: mockConfig });

    // Seed reporter user (id: 10) with private phone
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, full_name, phone)
      VALUES (10, 'reporter_citizen', 'hash789', 'citizen', 'Anup Borah', '+919435012345')
    `).run();

    // Create incident linked to reporter id: 10
    const now = new Date().toISOString();
    const insertRes = db.prepare(`
      INSERT INTO incidents (
        client_report_id, reporter_id, title, description, category, severity, landmark, affected_count, created_at, updated_at
      ) VALUES ('d0000000-0000-4000-8000-000000000099', 10, 'Privacy test incident', 'Water rising', 'MAROONED_RESCUE', 'CRITICAL', 'Landmark', 5, ?, ?)
    `).run(now, now);
    const incId = Number(insertRes.lastInsertRowid);

    // 1. Unauthenticated public request: phone MUST be null (masked)
    const publicRes = await request(app).get(`/api/v1/incidents/${incId}`);
    assert.equal(publicRes.status, 200);
    assert.equal(publicRes.body.data.reporter.full_name, 'Anup Borah');
    assert.equal(publicRes.body.data.reporter.phone, null, 'Public request must NOT expose private phone numbers');

    // 2. Authenticated staff token: phone MUST be unmasked for operational coordination
    const coordinatorToken = jwt.sign(
      { id: 1, role: 'coordinator' },
      mockConfig.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
    const staffRes = await request(app)
      .get(`/api/v1/incidents/${incId}`)
      .set('Authorization', `Bearer ${coordinatorToken}`);
    assert.equal(staffRes.status, 200);
    assert.equal(staffRes.body.data.reporter.phone, '+919435012345', 'Staff request should have access to operational contact');
  });

  test('POST /api/v1/sync/batch: processes offline reports with granular idempotency outcomes', async () => {
    const app = createApp({ db, config: mockConfig });

    // Seed 1 incident already existing on server
    const existingPayload = {
      client_report_id: 'e0000000-0000-4000-8000-000000000001',
      title: 'Breached bund in Dhemaji',
      description: 'Water flowing into market.',
      category: 'INFRASTRUCTURE_BREACH',
      landmark: 'Near Market Bridge',
      affected_count: 10,
    };
    await request(app).post('/api/v1/incidents').send(existingPayload);

    // Send batch containing:
    // Report 1: Exact match of existing (should be already_synced)
    // Report 2: Same UUID as existing but conflicting payload (should be rejected with IDEMPOTENCY_CONFLICT)
    // Report 3: Brand new report (should be synced)
    const batchPayload = {
      reports: [
        existingPayload, // identical replay
        {
          client_report_id: 'e0000000-0000-4000-8000-000000000002', // fresh
          title: 'Roof collapse in school camp',
          description: 'Classroom roof partially caved in from heavy rainfall.',
          category: 'INFRASTRUCTURE_BREACH',
          landmark: 'Kampur Middle School',
          affected_count: 15,
        },
      ],
    };

    const res = await request(app)
      .post('/api/v1/sync/batch')
      .send(batchPayload);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.processed_count, 2);
    assert.equal(res.body.data.already_synced_count, 1);
    assert.equal(res.body.data.synced_count, 1);
    assert.equal(res.body.data.rejected_count, 0);

    const outcomes = res.body.data.items;
    assert.equal(outcomes[0].client_report_id, existingPayload.client_report_id);
    assert.equal(outcomes[0].result, 'already_synced');
    assert.equal(outcomes[1].client_report_id, 'e0000000-0000-4000-8000-000000000002');
    assert.equal(outcomes[1].result, 'synced');

    // Now test a conflicting batch item
    const conflictBatch = {
      reports: [
        {
          client_report_id: existingPayload.client_report_id,
          title: 'Different title that conflicts with server report',
          description: 'Conflict description',
          category: 'MAROONED_RESCUE',
          landmark: 'Different landmark',
          affected_count: 999,
        },
      ],
    };

    const resConflict = await request(app)
      .post('/api/v1/sync/batch')
      .send(conflictBatch);

    assert.equal(resConflict.status, 200);
    assert.equal(resConflict.body.data.rejected_count, 1);
    assert.equal(resConflict.body.data.items[0].result, 'rejected');
    assert.equal(resConflict.body.data.items[0].error.code, 'IDEMPOTENCY_CONFLICT');
  });

  test('POST /api/v1/sync/batch: retrying after network failure does not create duplicate incidents', async () => {
    const app = createApp({ db, config: mockConfig });
    const batch = {
      reports: [
        {
          client_report_id: 'f0000000-0000-4000-8000-000000000001',
          title: 'Stranded boat near Kamalabari ghat',
          description: 'Engine failure during flood evacuation.',
          category: 'MAROONED_RESCUE',
          landmark: 'Kamalabari Ghat Point B',
          affected_count: 6,
        },
      ],
    };

    // First attempt succeeds
    const res1 = await request(app).post('/api/v1/sync/batch').send(batch);
    assert.equal(res1.body.data.synced_count, 1);
    const incidentId = res1.body.data.items[0].incident_id;

    // Simulated retry (e.g. client never received response or timed out)
    const res2 = await request(app).post('/api/v1/sync/batch').send(batch);
    assert.equal(res2.body.data.synced_count, 0);
    assert.equal(res2.body.data.already_synced_count, 1);
    assert.equal(res2.body.data.items[0].incident_id, incidentId);

    // Database still has exactly 1 record
    const count = db.prepare('SELECT COUNT(*) as count FROM incidents').get() as { count: number };
    assert.equal(count.count, 1);
  });

  test('Database persistence: incident records survive database close and reconnection', async () => {
    // Create a temporary disk database
    const tempDir = path.join(os.tmpdir(), `suraksha-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const tempDbPath = path.join(tempDir, 'persist_test.sqlite');

    try {
      // 1. Open database and initialize schema
      let diskDb = createDatabaseConnection({ dbPath: tempDbPath });
      initializeSchema(diskDb);

      const diskApp = createApp({ db: diskDb, config: { ...mockConfig, DB_PATH: tempDbPath } });
      const payload = {
        client_report_id: 'a0000000-0000-4000-8000-000000000099',
        title: 'Permanent disk persistence test incident',
        description: 'Verifying data survives process close and restart.',
        category: 'MAROONED_RESCUE',
        landmark: 'Guwahati Panbazar Riverbank',
        affected_count: 7,
      };

      const res = await request(diskApp).post('/api/v1/incidents').send(payload);
      assert.equal(res.status, 201);
      const insertedId = res.body.data.id;

      // 2. Sever connection completely
      closeDatabase(diskDb);

      // 3. Reconnect to same database file on disk
      diskDb = createDatabaseConnection({ dbPath: tempDbPath });
      const row = diskDb.prepare('SELECT * FROM incidents WHERE id = ?').get(insertedId) as any;
      assert.ok(row, 'Record should exist after reopening SQLite file');
      assert.equal(row.client_report_id, payload.client_report_id);
      assert.equal(row.title, payload.title);
      assert.equal(row.affected_count, 7);

      closeDatabase(diskDb);
    } finally {
      // Clean up temporary database files
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore windows transient file lock on temp
      }
    }
  });

  test('Transaction rollback: failure in multi-write operation preserves database consistency', async () => {
    // Verify that if a transaction fails (e.g. invalid event reference), no partial incident row is leaked
    const countBefore = db.prepare('SELECT COUNT(*) as count FROM incidents').get() as { count: number };

    assert.throws(
      () => {
        db.transaction(() => {
          db.prepare(`
            INSERT INTO incidents (
              client_report_id, title, description, category, severity, landmark, affected_count
            ) VALUES ('h0000000-0000-4000-8000-000000000001', 'Rollback test', 'Desc', 'MAROONED_RESCUE', 'CRITICAL', 'Landmark', 1)
          `).run();

          // Force an intentional foreign key violation error in incident_events (referencing non-existent user 999999)
          db.prepare(`
            INSERT INTO incident_events (incident_id, actor_id, event_type)
            VALUES (999999, 999999, 'INVALID_TYPE')
          `).run();
        })();
      },
      /CHECK constraint failed|FOREIGN KEY constraint failed/
    );

    // Assert that the first INSERT was cleanly rolled back
    const countAfter = db.prepare('SELECT COUNT(*) as count FROM incidents').get() as { count: number };
    assert.equal(countAfter.count, countBefore.count, 'Transaction rollback must leave table unaltered');
  });
});
