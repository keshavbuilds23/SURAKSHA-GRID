import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { createDatabaseConnection, closeDatabase } from '../src/database/connection.js';
import { initializeSchema } from '../src/database/schema.js';
import { EnvConfig } from '../src/config/env.js';
import { seedDemoNgo } from '../scripts/seed-demo-ngo.js';
import {
  calculateHaversineDistanceKm,
  computeFreshness,
  ALL_VERIFICATION_DIMENSIONS,
} from '../src/services/recommendationService.js';

const TEST_JWT_SECRET = 'super-secret-test-jwt-signing-key-32chars!';

const testEnvConfig: EnvConfig = {
  NODE_ENV: 'test',
  PORT: 5098,
  HOST: '127.0.0.1',
  CORS_ORIGIN: '*',
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX_REQUESTS: 1000,
  API_PREFIX: '/api/v1',
  JWT_SECRET: TEST_JWT_SECRET,
  SQLITE_PATH: ':memory:',
};

function generateTestToken(
  user: { id: number; username: string; role: string },
  expiresIn = '1h'
): string {
  return jwt.sign(
    {
      id: user.id,
      sub: user.id,
      username: user.username,
      role: user.role,
    },
    TEST_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: expiresIn as any }
  );
}

describe('NGO Recommendation Engine Unit & Integration Tests', () => {
  let tempDbDir: string;
  let tempDbPath: string;
  let db: Database.Database;
  let app: any;

  let coordinatorToken: string;
  let volunteerToken: string;

  beforeEach(() => {
    tempDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suraksha-rec-test-'));
    tempDbPath = path.join(tempDbDir, 'test_rec.sqlite');

    db = createDatabaseConnection({ dbPath: tempDbPath });
    initializeSchema(db);

    // Seed test users
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, full_name, phone)
      VALUES 
        (1, 'coord_tester', '$2a$10$xyz', 'coordinator', 'Coordinator Tester', '9876543210'),
        (2, 'vol_tester', '$2a$10$xyz', 'volunteer', 'Volunteer Tester', '9876543211')
    `).run();

    coordinatorToken = generateTestToken({ id: 1, username: 'coord_tester', role: 'coordinator' });
    volunteerToken = generateTestToken({ id: 2, username: 'vol_tester', role: 'volunteer' });

    app = createApp({ db, config: testEnvConfig });
  });

  afterEach(() => {
    closeDatabase(db);
    if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
    if (fs.existsSync(tempDbDir)) fs.rmdirSync(tempDbDir);
  });

  // -------------------------------------------------------------
  // Unit Tests: Haversine & Freshness
  // -------------------------------------------------------------
  test('Haversine distance calculation is accurate', () => {
    // Same coordinates
    assert.strictEqual(calculateHaversineDistanceKm(26.2, 92.5, 26.2, 92.5), 0);

    // Nagaon (26.35, 92.68) to Guwahati (26.14, 91.73) ~ 97 km
    const dist = calculateHaversineDistanceKm(26.35, 92.68, 26.14, 91.73);
    assert.ok(dist >= 90 && dist <= 110, `Expected distance ~97km, got ${dist}`);
  });

  test('Freshness helper returns correct status based on timestamps', () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();
    const thirtyHoursAgo = new Date(now.getTime() - 30 * 3600 * 1000).toISOString();
    const threeDaysAgo = new Date(now.getTime() - 72 * 3600 * 1000).toISOString();

    assert.strictEqual(computeFreshness(twoHoursAgo, 'ACTIVE_STANDBY'), 'FRESH');
    assert.strictEqual(computeFreshness(thirtyHoursAgo, 'ACTIVE_STANDBY'), 'AGING');
    assert.strictEqual(computeFreshness(threeDaysAgo, 'ACTIVE_STANDBY'), 'STALE');
    assert.strictEqual(computeFreshness(twoHoursAgo, 'INACTIVE_STALE'), 'STALE');
  });

  // -------------------------------------------------------------
  // Integration Tests: Operational vs Demo Mode Segregation
  // -------------------------------------------------------------
  test('Strict simulation isolation: Operational mode excludes simulated NGOs', async () => {
    // Seed demo NGO (is_simulated = 1)
    seedDemoNgo(tempDbPath);

    // Call recommendations with demo_mode = false
    const res = await request(app)
      .post('/api/v1/recommendations/ngos')
      .send({
        latitude: 26.35,
        longitude: 92.68,
        district: 'Nagaon',
        severity: 'HIGH',
        demo_mode: false,
      })
      .expect(200);

    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.is_demo_mode, false);
    assert.strictEqual(res.body.data.is_advisory_only, true);
    assert.strictEqual(res.body.data.coordinator_approval_required, true);

    // Simulated NGO must be in excluded_ngos with SIMULATION_ISOLATION
    const excludedSimulated = res.body.data.excluded_ngos.find(
      (e: any) => e.ngo_id === 'assam_relief_demo'
    );
    assert.ok(excludedSimulated, 'Expected assam_relief_demo to be in excluded_ngos');
    assert.ok(excludedSimulated.exclusion_codes.includes('SIMULATION_ISOLATION'));

    // Recommendations list must not contain any simulated NGO
    const simulatedInRecs = res.body.data.recommendations.filter((r: any) => r.is_simulated);
    assert.strictEqual(simulatedInRecs.length, 0);
  });

  test('Demo mode evaluates simulated NGOs and excludes operational NGOs', async () => {
    // 1. Seed simulated NGO
    seedDemoNgo(tempDbPath);

    // 2. Insert an operational NGO (is_simulated = 0)
    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone, is_simulated)
      VALUES ('operational_ngo_1', 'Operational Disaster Team', 'Commander Baruah', '9876543299', 0)
    `).run();

    // Call recommendations with demo_mode = true
    const res = await request(app)
      .post('/api/v1/recommendations/ngos')
      .send({
        latitude: 26.35,
        longitude: 92.68,
        district: 'Nagaon',
        severity: 'HIGH',
        required_capabilities: ['WATER_SEARCH_AND_RESCUE'],
        demo_mode: true,
      })
      .expect(200);

    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.is_demo_mode, true);

    // Operational NGO must be excluded in demo mode
    const excludedOperational = res.body.data.excluded_ngos.find(
      (e: any) => e.ngo_id === 'operational_ngo_1'
    );
    assert.ok(excludedOperational, 'Operational NGO should be excluded in demo mode');
    assert.ok(excludedOperational.exclusion_codes.includes('OPERATIONAL_EXCLUDED_IN_DEMO'));

    // Simulated NGO must be recommended
    const demoRec = res.body.data.recommendations.find(
      (r: any) => r.ngo_id === 'assam_relief_demo'
    );
    assert.ok(demoRec, 'Expected assam_relief_demo to be recommended in demo mode');
    assert.strictEqual(demoRec.is_simulated, true);
    assert.strictEqual(demoRec.simulated_watermark, 'DEMO DATA (SIMULATED)');
    assert.ok(demoRec.composite_score > 0);
    assert.ok(demoRec.scores.proximity_score > 0);
    assert.ok(demoRec.scores.capability_score > 0);
    assert.ok(demoRec.scores.equipment_score > 0);
    assert.ok(demoRec.scores.personnel_score > 0);
    assert.ok(demoRec.scores.freshness_score > 0);
    assert.ok(demoRec.justification_reasons.length >= 4);
  });

  // -------------------------------------------------------------
  // Verification Gate in Operational Mode
  // -------------------------------------------------------------
  test('Operational mode requires full 5-dimension verification', async () => {
    // Create an operational NGO with only 2 dimensions verified
    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone, is_simulated)
      VALUES ('partial_verified_ngo', 'Partially Verified NGO', 'Officer Das', '9876543200', 0)
    `).run();

    // Add only 2 verification dimensions
    const insertVerif = db.prepare(`
      INSERT INTO ngo_verification_records (ngo_id, dimension, is_verified, is_current)
      VALUES (?, ?, 1, 1)
    `);
    insertVerif.run('partial_verified_ngo', 'DOCUMENTED_IN_DDMP');
    insertVerif.run('partial_verified_ngo', 'IDENTITY_VERIFIED');

    // Add fresh check-in
    db.prepare(`
      INSERT INTO ngo_availability_logs (ngo_id, status, available_personnel_count, reporting_person_name, reporting_person_phone, is_simulated)
      VALUES ('partial_verified_ngo', 'ACTIVE_STANDBY', 10, 'Officer Das', '9876543200', 0)
    `).run();

    const res = await request(app)
      .post('/api/v1/recommendations/ngos')
      .send({
        demo_mode: false,
      })
      .expect(200);

    const excluded = res.body.data.excluded_ngos.find(
      (e: any) => e.ngo_id === 'partial_verified_ngo'
    );
    assert.ok(excluded, 'Partially verified NGO should be excluded');
    assert.ok(excluded.exclusion_codes.includes('UNVERIFIED_GATE_FAILED'));
    assert.ok(excluded.reasons[0].includes('2/5 dimensions verified'));

    // Now complete all 5 dimensions
    insertVerif.run('partial_verified_ngo', 'CURRENTLY_OPERATIONAL');
    insertVerif.run('partial_verified_ngo', 'AVAILABILITY_CONFIRMED');
    insertVerif.run('partial_verified_ngo', 'EQUIPMENT_INDEPENDENTLY_VERIFIED');

    const res2 = await request(app)
      .post('/api/v1/recommendations/ngos')
      .send({
        demo_mode: false,
      })
      .expect(200);

    const recommended = res2.body.data.recommendations.find(
      (r: any) => r.ngo_id === 'partial_verified_ngo'
    );
    assert.ok(recommended, 'Fully verified NGO should now be recommended');
    assert.strictEqual(recommended.verification.is_fully_verified, true);
    assert.strictEqual(recommended.verification.verified_count, 5);
  });

  // -------------------------------------------------------------
  // Availability & Telemetry Gates
  // -------------------------------------------------------------
  test('Excludes NGOs with UNAVAILABLE status or missing telemetry', async () => {
    // 1. NGO with no telemetry
    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone, is_simulated)
      VALUES ('no_telemetry_ngo', 'No Telemetry NGO', 'A B', '9876543201', 0)
    `).run();

    for (const dim of ALL_VERIFICATION_DIMENSIONS) {
      db.prepare(`
        INSERT INTO ngo_verification_records (ngo_id, dimension, is_verified, is_current)
        VALUES ('no_telemetry_ngo', ?, 1, 1)
      `).run(dim);
    }

    // 2. NGO with status UNAVAILABLE
    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone, is_simulated)
      VALUES ('unavailable_ngo', 'Unavailable NGO', 'C D', '9876543202', 0)
    `).run();

    for (const dim of ALL_VERIFICATION_DIMENSIONS) {
      db.prepare(`
        INSERT INTO ngo_verification_records (ngo_id, dimension, is_verified, is_current)
        VALUES ('unavailable_ngo', ?, 1, 1)
      `).run(dim);
    }

    db.prepare(`
      INSERT INTO ngo_availability_logs (ngo_id, status, available_personnel_count, reporting_person_name, reporting_person_phone, is_simulated)
      VALUES ('unavailable_ngo', 'UNAVAILABLE', 0, 'C D', '9876543202', 0)
    `).run();

    const res = await request(app)
      .post('/api/v1/recommendations/ngos')
      .send({ demo_mode: false })
      .expect(200);

    const excluded1 = res.body.data.excluded_ngos.find((e: any) => e.ngo_id === 'no_telemetry_ngo');
    assert.ok(excluded1);
    assert.ok(excluded1.exclusion_codes.includes('NO_AVAILABILITY_TELEMETRY'));

    const excluded2 = res.body.data.excluded_ngos.find((e: any) => e.ngo_id === 'unavailable_ngo');
    assert.ok(excluded2);
    assert.ok(excluded2.exclusion_codes.includes('STATUS_UNAVAILABLE'));
  });

  // -------------------------------------------------------------
  // PII Redaction for Public vs Coordinator Access
  // -------------------------------------------------------------
  test('Redacts contact PII for public requests and includes it for coordinators', async () => {
    seedDemoNgo(tempDbPath);

    // Public request (no token)
    const publicRes = await request(app)
      .get('/api/v1/recommendations/ngos?demo_mode=true')
      .expect(200);

    const publicRec = publicRes.body.data.recommendations[0];
    assert.strictEqual(publicRec.contact.primary_contact_name, null);
    assert.strictEqual(publicRec.contact.primary_contact_phone, null);
    assert.strictEqual(publicRec.contact.primary_contact_email, null);
    assert.strictEqual(publicRec.readiness.reporting_person_name, null);

    // Coordinator request (with token)
    const coordRes = await request(app)
      .get('/api/v1/recommendations/ngos?demo_mode=true')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .expect(200);

    const coordRec = coordRes.body.data.recommendations[0];
    assert.ok(coordRec.contact.primary_contact_name !== null);
    assert.ok(coordRec.contact.primary_contact_phone !== null);
  });

  // -------------------------------------------------------------
  // Incident-Specific Recommendation Endpoint
  // -------------------------------------------------------------
  test('GET /incidents/:id/recommendations pulls incident context and matches partners', async () => {
    seedDemoNgo(tempDbPath);

    // Seed a test incident
    const insertInc = db.prepare(`
      INSERT INTO incidents (
        client_report_id, title, description, category, severity,
        verification_status, latitude, longitude, landmark, affected_count
      ) VALUES (
        'inc_test_rec_001', 'Marooned Villagers in Kaliabor',
        'Flood waters breached dike, marooning 35 residents', 'MAROONED_RESCUE', 'CRITICAL',
        'VERIFIED', 26.55, 92.95, 'Kaliabor, Nagaon District', 35
      )
    `).run();

    const incidentId = insertInc.lastInsertRowid;

    const res = await request(app)
      .get(`/api/v1/incidents/${incidentId}/recommendations?demo_mode=true`)
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .expect(200);

    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.query.severity, 'CRITICAL');
    assert.ok(res.body.data.query.required_capabilities.includes('WATER_SEARCH_AND_RESCUE'));
    assert.strictEqual(res.body.data.recommendations.length, 1);

    const rec = res.body.data.recommendations[0];
    assert.strictEqual(rec.ngo_id, 'assam_relief_demo');
    assert.ok(rec.closest_depot);
    assert.ok(rec.closest_depot.distance_km != null);
  });

  test('GET /incidents/:id/recommendations returns 404 for non-existent incident', async () => {
    await request(app)
      .get('/api/v1/incidents/999999/recommendations')
      .expect(404);
  });
});
