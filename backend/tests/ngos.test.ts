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

const TEST_JWT_SECRET = 'super-secret-test-jwt-signing-key-32chars!';

const testEnvConfig: EnvConfig = {
  NODE_ENV: 'test',
  PORT: 5099,
  HOST: '127.0.0.1',
  CORS_ORIGIN: '*',
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX_REQUESTS: 1000,
  API_PREFIX: '/api/v1',
  JWT_SECRET: TEST_JWT_SECRET,
  SQLITE_PATH: ':memory:',
};

function generateTestToken(user: { id: number; username: string; role: string }, expiresIn = '1h'): string {
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

describe('NGO Network API Endpoints (/api/v1/ngos)', () => {
  let tempDbDir: string;
  let tempDbPath: string;
  let db: Database.Database;
  let app: any;

  let coordinatorToken: string;
  let volunteerToken: string;

  beforeEach(() => {
    tempDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suraksha-ngo-api-test-'));
    tempDbPath = path.join(tempDbDir, 'test_ngo_api.sqlite');

    db = createDatabaseConnection({ dbPath: tempDbPath });
    initializeSchema(db); // Applies Migrations 1, 2, and 3

    // Seed test users
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, full_name, phone)
      VALUES (1, 'coord_sarma', 'hash123', 'coordinator', 'Dr. N. Sarma', '9435012345'),
             (2, 'vol_borah', 'hash123', 'volunteer', 'Bikash Borah', '9854099887')
    `).run();

    coordinatorToken = generateTestToken({ id: 1, username: 'coord_sarma', role: 'coordinator' });
    volunteerToken = generateTestToken({ id: 2, username: 'vol_borah', role: 'volunteer' });

    app = createApp({ db, config: testEnvConfig });
  });

  afterEach(() => {
    if (db && db.open) {
      closeDatabase(db);
    }
    try {
      fs.rmSync(tempDbDir, { recursive: true, force: true });
    } catch {}
  });

  test('Registration: POST /ngos requires coordinator, forces is_simulated=1, and starts with 0 verifications', async () => {
    // 1. Unauthenticated -> 401
    const unauthRes = await request(app)
      .post('/api/v1/ngos')
      .send({
        id: 'ngo-kampur-vahini',
        name: 'Kampur Jal-Suraksha Vahini',
        primary_contact_name: 'Pranjal Saikia',
        primary_contact_phone: '9854012345',
      });
    assert.equal(unauthRes.status, 401);

    // 2. Volunteer token -> 403
    const volRes = await request(app)
      .post('/api/v1/ngos')
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({
        id: 'ngo-kampur-vahini',
        name: 'Kampur Jal-Suraksha Vahini',
        primary_contact_name: 'Pranjal Saikia',
        primary_contact_phone: '9854012345',
      });
    assert.equal(volRes.status, 403);
    assert.equal(volRes.body.error.code, 'FORBIDDEN');
    assert.ok(volRes.body.error.message.includes('Coordinator privileges required'));

    // 3. Attempt to bypass simulation with is_simulated: false -> 400 Bad Request
    const bypassRes = await request(app)
      .post('/api/v1/ngos')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        id: 'ngo-kampur-vahini',
        name: 'Kampur Jal-Suraksha Vahini',
        primary_contact_name: 'Pranjal Saikia',
        primary_contact_phone: '9854012345',
        is_simulated: false,
      });
    assert.equal(bypassRes.status, 400);
    assert.equal(bypassRes.body.error.code, 'VALIDATION_ERROR');

    // 4. Valid Coordinator Creation -> 201 Created
    const createRes = await request(app)
      .post('/api/v1/ngos')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        id: 'ngo-kampur-vahini',
        name: 'Kampur Jal-Suraksha Vahini',
        legal_name: 'Kampur Jal-Suraksha Vahini Trust',
        registration_reference: 'AS-NAG-2018-9921',
        description: 'Specialized flood search and rescue unit.',
        primary_contact_name: 'Pranjal Saikia',
        primary_contact_phone: '9854012345',
        primary_contact_email: 'contact@kampur-jal.org',
      });

    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.success, true);
    assert.equal(createRes.body.data.id, 'ngo-kampur-vahini');
    assert.equal(createRes.body.data.is_simulated, true);
    assert.equal(createRes.body.data.active_verifications_count, 0, 'Must have 0 initial verifications');

    // Verify database has 0 verification records
    const verifCount = db.prepare('SELECT count(*) as c FROM ngo_verification_records WHERE ngo_id = ?').get('ngo-kampur-vahini') as { c: number };
    assert.equal(verifCount.c, 0, 'No automatic verification records created');
  });

  test('Privacy & PII Protection: Public view masks contact info, exact coordinates, and private notes', async () => {
    // Seed an NGO with operating depot, equipment, and check-in
    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone, primary_contact_email, is_simulated)
      VALUES ('ngo-pii-test', 'Nagaon Seva Samiti', 'Biren Das', '9435012345', 'biren@nagaonseva.org', 1)
    `).run();

    db.prepare(`
      INSERT INTO ngo_operating_areas (id, ngo_id, state, district, revenue_circle, administrative_scope, depot_location_name, depot_latitude, depot_longitude, is_primary_depot)
      VALUES (50, 'ngo-pii-test', 'Assam', 'Nagaon', 'Kampur', 'REVENUE_CIRCLE', 'Kampur River Staging Depot', 26.155, 92.835, 1)
    `).run();

    db.prepare(`
      INSERT INTO ngo_availability_logs (ngo_id, status, available_personnel_count, reporting_person_name, reporting_person_phone, operational_notes)
      VALUES ('ngo-pii-test', 'ACTIVE_STANDBY', 15, 'Private Reporter', '9854099887', 'Confidential tactical dispatch notes.')
    `).run();

    // 1. Public Unauthenticated Request
    const publicRes = await request(app).get('/api/v1/ngos/ngo-pii-test');
    assert.equal(publicRes.status, 200);
    assert.equal(publicRes.body.data.primary_contact_name, null, 'Public must not receive contact name');
    assert.equal(publicRes.body.data.primary_contact_phone, null, 'Public must not receive contact phone');
    assert.equal(publicRes.body.data.primary_contact_email, null, 'Public must not receive contact email');

    // Check operating areas public projection
    const publicAreasRes = await request(app).get('/api/v1/ngos/ngo-pii-test/operating-areas');
    assert.equal(publicAreasRes.status, 200);
    assert.equal(publicAreasRes.body.data[0].depot_latitude, null, 'Public must not receive exact depot latitude');
    assert.equal(publicAreasRes.body.data[0].depot_longitude, null, 'Public must not receive exact depot longitude');
    assert.equal(publicAreasRes.body.data[0].depot_location_name, 'Kampur River Staging Depot');

    // Check availability public projection
    const publicAvailRes = await request(app).get('/api/v1/ngos/ngo-pii-test/availability');
    assert.equal(publicAvailRes.status, 200);
    assert.equal(publicAvailRes.body.data.reporting_person_name, null, 'Public must not receive reporter name');
    assert.equal(publicAvailRes.body.data.reporting_person_phone, null, 'Public must not receive reporter phone');
    assert.equal(publicAvailRes.body.data.operational_notes, null, 'Public must not receive operational notes');

    // 2. Authenticated Coordinator Request
    const staffRes = await request(app)
      .get('/api/v1/ngos/ngo-pii-test')
      .set('Authorization', `Bearer ${coordinatorToken}`);
    assert.equal(staffRes.status, 200);
    assert.equal(staffRes.body.data.primary_contact_name, 'Biren Das');
    assert.equal(staffRes.body.data.primary_contact_phone, '9435012345');
    assert.equal(staffRes.body.data.primary_contact_email, 'biren@nagaonseva.org');
    assert.equal(staffRes.body.data.depots[0].depot_latitude, 26.155);
    assert.equal(staffRes.body.data.depots[0].depot_longitude, 92.835);
  });

  test('Invalid Optional Auth Token: Malformed or expired token returns 401 UNAUTHORIZED', async () => {
    // Malformed token
    const malformedRes = await request(app)
      .get('/api/v1/ngos')
      .set('Authorization', 'Bearer this-is-not-a-valid-token');
    assert.equal(malformedRes.status, 401);
    assert.equal(malformedRes.body.error.code, 'UNAUTHORIZED');

    // Expired token
    const expiredToken = jwt.sign(
      { id: 1, username: 'coord_sarma', role: 'coordinator' },
      TEST_JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '-10s' }
    );
    const expiredRes = await request(app)
      .get('/api/v1/ngos')
      .set('Authorization', `Bearer ${expiredToken}`);
    assert.equal(expiredRes.status, 401);
  });

  test('Verification Ledger: Multi-dimensional audit, append-only history, and expiration handling', async () => {
    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone)
      VALUES ('ngo-verif-test', 'Brahmaputra Health Trust', 'Dr. Saikia', '9854011223')
    `).run();

    // 1. Add IDENTITY_VERIFIED
    const v1Res = await request(app)
      .post('/api/v1/ngos/ngo-verif-test/verifications')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        dimension: 'IDENTITY_VERIFIED',
        is_verified: true,
        valid_until: '2027-10-31T00:00:00.000Z',
        evidence_reference: 'Registration certificate verified on e-District portal.',
        notes: 'Darpan ID valid.',
      });
    assert.equal(v1Res.status, 201);

    // 2. Add second concurrent dimension: EQUIPMENT_INDEPENDENTLY_VERIFIED
    const v2Res = await request(app)
      .post('/api/v1/ngos/ngo-verif-test/verifications')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        dimension: 'EQUIPMENT_INDEPENDENTLY_VERIFIED',
        is_verified: true,
        valid_until: '2027-01-31T00:00:00.000Z',
        evidence_reference: 'Boat and motor inspection report #881.',
      });
    assert.equal(v2Res.status, 201);

    // 3. Supersede IDENTITY_VERIFIED with new audit
    const v3Res = await request(app)
      .post('/api/v1/ngos/ngo-verif-test/verifications')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        dimension: 'IDENTITY_VERIFIED',
        is_verified: true,
        valid_until: '2028-10-31T00:00:00.000Z',
        evidence_reference: 'Annual recertification audit 2028.',
      });
    assert.equal(v3Res.status, 201);

    // 4. Query verification ledger as coordinator -> should return 3 history records
    const listRes = await request(app)
      .get('/api/v1/ngos/ngo-verif-test/verifications')
      .set('Authorization', `Bearer ${coordinatorToken}`);
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.data.length, 3, 'Must retain append-only historical audit trail');

    // 5. Expired verification test: post expired record
    await request(app)
      .post('/api/v1/ngos/ngo-verif-test/verifications')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        dimension: 'AVAILABILITY_CONFIRMED',
        is_verified: true,
        valid_until: '2020-01-01T00:00:00.000Z', // In the past!
        evidence_reference: 'Old 2020 roster check.',
      });

    const getDossier = await request(app).get('/api/v1/ngos/ngo-verif-test');
    assert.equal(getDossier.body.data.active_verification_dimensions.includes('AVAILABILITY_CONFIRMED'), false, 'Expired verification must NOT count as active');
  });

  test('Operational Promotion: PATCH /operational-status requires all 5 verification dimensions', async () => {
    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone, is_simulated)
      VALUES ('ngo-promo-test', 'Candidate Operational NGO', 'Lead Person', '9854011999', 1)
    `).run();

    // 1. Attempt promotion with 0 verifications -> 422 Unprocessable Entity
    const failRes = await request(app)
      .patch('/api/v1/ngos/ngo-promo-test/operational-status')
      .set('Authorization', `Bearer ${coordinatorToken}`);
    assert.equal(failRes.status, 422);
    assert.equal(failRes.body.error.code, 'UNPROCESSABLE_ENTITY');

    // 2. Add all 5 verification dimensions
    const dimensions = [
      'DOCUMENTED_IN_DDMP',
      'IDENTITY_VERIFIED',
      'CURRENTLY_OPERATIONAL',
      'AVAILABILITY_CONFIRMED',
      'EQUIPMENT_INDEPENDENTLY_VERIFIED',
    ];

    for (const dim of dimensions) {
      await request(app)
        .post('/api/v1/ngos/ngo-promo-test/verifications')
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({
          dimension: dim,
          is_verified: true,
          valid_until: '2028-01-01T00:00:00.000Z',
          evidence_reference: `Accreditation audit for ${dim}`,
        });
    }

    // 3. Promote to operational -> 200 OK
    const promoRes = await request(app)
      .patch('/api/v1/ngos/ngo-promo-test/operational-status')
      .set('Authorization', `Bearer ${coordinatorToken}`);
    assert.equal(promoRes.status, 200);
    assert.equal(promoRes.body.data.is_simulated, false);

    // Verify in database
    const dbNgo = db.prepare('SELECT is_simulated FROM ngos WHERE id = ?').get('ngo-promo-test') as { is_simulated: number };
    assert.equal(dbNgo.is_simulated, 0, 'Database is_simulated must be updated to 0');
  });

  test('Volunteer Arbitrary Check-In Protection: Volunteers cannot submit check-ins for arbitrary NGOs', async () => {
    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone)
      VALUES ('ngo-checkin-test', 'Checkin Target NGO', 'Contact Saikia', '9854011888')
    `).run();

    // 1. Volunteer attempting check-in -> 403 Forbidden
    const volRes = await request(app)
      .post('/api/v1/ngos/ngo-checkin-test/availability')
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({
        status: 'ACTIVE_STANDBY',
        available_personnel_count: 10,
        certified_helmsmen_count: 4,
        reporting_person_name: 'Volunteer User',
        reporting_person_phone: '9854099887',
      });
    assert.equal(volRes.status, 403);
    assert.equal(volRes.body.error.code, 'FORBIDDEN');

    // 2. Coordinator check-in -> 201 Created
    const coordRes = await request(app)
      .post('/api/v1/ngos/ngo-checkin-test/availability')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        status: 'ACTIVE_STANDBY',
        available_personnel_count: 12,
        certified_helmsmen_count: 6,
        reporting_person_name: 'Field Officer',
        reporting_person_phone: '9854012345',
      });
    assert.equal(coordRes.status, 201);
    assert.equal(coordRes.body.data.freshness, 'FRESH');
  });

  test('Equipment: Cross-depot validation, parent ownership, and merged balance integrity', async () => {
    // Create NGO 1 and NGO 2 with depots
    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone)
      VALUES ('ngo-eq-1', 'NGO One', 'Person 1', '9854011111'),
             ('ngo-eq-2', 'NGO Two', 'Person 2', '9854022222')
    `).run();

    db.prepare(`
      INSERT INTO ngo_operating_areas (id, ngo_id, state, district, revenue_circle, administrative_scope, depot_location_name)
      VALUES (101, 'ngo-eq-1', 'Assam', 'Nagaon', 'Kampur', 'REVENUE_CIRCLE', 'Depot NGO 1'),
             (102, 'ngo-eq-2', 'Assam', 'Nagaon', 'Raha', 'REVENUE_CIRCLE', 'Depot NGO 2')
    `).run();

    // 1. Attempt to add equipment to NGO 1 with Depot belonging to NGO 2 -> 422
    const crossDepotRes = await request(app)
      .post('/api/v1/ngos/ngo-eq-1/equipment')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        equipment_type_id: 'INFLATABLE_BOAT',
        operating_area_id: 102, // Belongs to NGO 2!
        total_quantity: 4,
        available_quantity: 4,
      });
    assert.equal(crossDepotRes.status, 422);

    // 2. Valid create with own depot -> 201
    const validCreateRes = await request(app)
      .post('/api/v1/ngos/ngo-eq-1/equipment')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        equipment_type_id: 'INFLATABLE_BOAT',
        operating_area_id: 101,
        total_quantity: 5,
        available_quantity: 4,
        reserved_quantity: 1,
        operational_condition: 'SERVICEABLE',
      });
    assert.equal(validCreateRes.status, 201);
    const equipId = validCreateRes.body.data.id;

    // 3. Cross-tenant patch attempt: Target NGO 2 with equipId belonging to NGO 1 -> 404
    const crossPatchRes = await request(app)
      .patch(`/api/v1/ngos/ngo-eq-2/equipment/${equipId}`)
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({ available_quantity: 3 });
    assert.equal(crossPatchRes.status, 404);

    // 4. Merged balance violation: update available to 5 when reserved is 1 and total is 5 (5+1=6 > 5) -> 400
    const balanceViolateRes = await request(app)
      .patch(`/api/v1/ngos/ngo-eq-1/equipment/${equipId}`)
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({ available_quantity: 5 }); // 5 available + 1 existing reserved = 6 > 5 total
    assert.equal(balanceViolateRes.status, 400);

    // 5. Merged unserviceable violation: update condition to UNDER_REPAIR when existing available is 4 -> 400
    const unserviceableViolateRes = await request(app)
      .patch(`/api/v1/ngos/ngo-eq-1/equipment/${equipId}`)
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({ operational_condition: 'UNDER_REPAIR' }); // existing available is 4 > 0
    assert.equal(unserviceableViolateRes.status, 400);

    // 6. Valid patch: set available to 0 and condition to UNDER_REPAIR -> 200
    const validPatchRes = await request(app)
      .patch(`/api/v1/ngos/ngo-eq-1/equipment/${equipId}`)
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        available_quantity: 0,
        operational_condition: 'UNDER_REPAIR',
      });
    assert.equal(validPatchRes.status, 200);
    assert.equal(validPatchRes.body.data.operational_condition, 'UNDER_REPAIR');
  });

  test('Capabilities: PUT /capabilities replaces entire list and allows empty array', async () => {
    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone)
      VALUES ('ngo-cap-test', 'Capability Test NGO', 'Lead Saikia', '9854011777')
    `).run();

    // 1. Initial replacement with 2 capabilities
    const putRes1 = await request(app)
      .put('/api/v1/ngos/ngo-cap-test/capabilities')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        capabilities: [
          { capability_id: 'WATER_SEARCH_AND_RESCUE', certification_level: 'SPECIALIST', is_verified: true },
          { capability_id: 'MOBILE_MEDICAL_TRIAGE', certification_level: 'BASIC', is_verified: false },
        ],
      });
    assert.equal(putRes1.status, 200);
    assert.equal(putRes1.body.data.length, 2);

    // 2. Replace with single capability
    const putRes2 = await request(app)
      .put('/api/v1/ngos/ngo-cap-test/capabilities')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        capabilities: [
          { capability_id: 'COMMUNITY_EARLY_WARNING', certification_level: 'INTERMEDIATE', is_verified: true },
        ],
      });
    assert.equal(putRes2.status, 200);
    assert.equal(putRes2.body.data.length, 1);
    assert.equal(putRes2.body.data[0].capability_id, 'COMMUNITY_EARLY_WARNING');

    // 3. Clear all capabilities with empty array
    const putRes3 = await request(app)
      .put('/api/v1/ngos/ngo-cap-test/capabilities')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({ capabilities: [] });
    assert.equal(putRes3.status, 200);
    assert.equal(putRes3.body.data.length, 0);
  });

  test('Soft Deletion: DELETE /ngos/:id sets deleted_at and preserves historical availability logs', async () => {
    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone)
      VALUES ('ngo-del-test', 'To Be Archived NGO', 'Archival Contact', '9854011666')
    `).run();

    db.prepare(`
      INSERT INTO ngo_availability_logs (ngo_id, status, available_personnel_count, reporting_person_name, reporting_person_phone)
      VALUES ('ngo-del-test', 'ACTIVE_STANDBY', 20, 'Archival Contact', '9854011666')
    `).run();

    // 1. Delete NGO -> 200 OK
    const delRes = await request(app)
      .delete('/api/v1/ngos/ngo-del-test')
      .set('Authorization', `Bearer ${coordinatorToken}`);
    assert.equal(delRes.status, 200);

    // 2. Subsequent GET /ngos/:id -> 404
    const getRes = await request(app).get('/api/v1/ngos/ngo-del-test');
    assert.equal(getRes.status, 404);

    // 3. Verify availability logs in database are NOT destroyed
    const logCount = db.prepare('SELECT count(*) as c FROM ngo_availability_logs WHERE ngo_id = ?').get('ngo-del-test') as { c: number };
    assert.equal(logCount.c, 1, 'Historical availability logs must remain intact in SQLite');
  });

  test('Directory Query Deduplication: Multiple operating depots do NOT duplicate NGO in paginated directory', async () => {
    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone, is_simulated)
      VALUES ('ngo-multi-depot-test', 'Multi Depot Organization', 'Officer Saikia', '9854011555', 0)
    `).run();

    // Add 3 staging depots in district Nagaon for this single NGO
    db.prepare(`
      INSERT INTO ngo_operating_areas (ngo_id, state, district, revenue_circle, administrative_scope, depot_location_name)
      VALUES ('ngo-multi-depot-test', 'Assam', 'Nagaon', 'Kampur', 'REVENUE_CIRCLE', 'Depot A'),
             ('ngo-multi-depot-test', 'Assam', 'Nagaon', 'Raha', 'REVENUE_CIRCLE', 'Depot B'),
             ('ngo-multi-depot-test', 'Assam', 'Nagaon', 'Nagaon Sadar', 'REVENUE_CIRCLE', 'Depot C')
    `).run();

    const dirRes = await request(app).get('/api/v1/ngos?district=Nagaon&filter_mode=OPERATIONAL');
    assert.equal(dirRes.status, 200);
    assert.equal(dirRes.body.meta.total, 1, 'Total pagination count must be exactly 1 unique NGO');
    assert.equal(dirRes.body.data.length, 1, 'Must return exactly 1 unique NGO row');
    assert.equal(dirRes.body.data[0].id, 'ngo-multi-depot-test');
  });

  test('REGRESSION: Coordinator NGO registration authentication path and privilege enforcement', async () => {
    // 1. Valid coordinator token format: id & sub matching SQLite coordinator user
    const devCoordToken = generateTestToken({ id: 1, username: 'coord_assam_dev', role: 'coordinator' });

    const regRes = await request(app)
      .post('/api/v1/ngos')
      .set('Authorization', `Bearer ${devCoordToken}`)
      .send({
        id: 'ngo-barpeta-mitra',
        name: 'Barpeta Banya Mitra',
        primary_contact_name: 'Bhupen Kalita',
        primary_contact_phone: '+919435099887',
      });

    assert.equal(regRes.status, 201);
    assert.equal(regRes.body.success, true);
    assert.equal(regRes.body.data.id, 'ngo-barpeta-mitra');
    assert.equal(regRes.body.data.is_simulated, true);

    // 2. Token with non-existent user ID -> 401 UNAUTHORIZED
    const ghostToken = jwt.sign(
      { id: 9999, sub: 9999, username: 'ghost_user', role: 'coordinator' },
      TEST_JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
    const ghostRes = await request(app)
      .post('/api/v1/ngos')
      .set('Authorization', `Bearer ${ghostToken}`)
      .send({
        id: 'ngo-fail-1',
        name: 'Ghost NGO',
        primary_contact_name: 'Ghost',
        primary_contact_phone: '12345678',
      });
    assert.equal(ghostRes.status, 401);
    assert.equal(ghostRes.body.error.code, 'UNAUTHORIZED');
    assert.ok(ghostRes.body.error.message.includes('does not correspond to an existing user'));

    // 3. Forged token: claims coordinator in JWT payload, but SQLite record has role 'volunteer' -> 403 FORBIDDEN
    const forgedToken = jwt.sign(
      { id: 2, sub: 2, username: 'vol_borah', role: 'coordinator' },
      TEST_JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
    const forgedRes = await request(app)
      .post('/api/v1/ngos')
      .set('Authorization', `Bearer ${forgedToken}`)
      .send({
        id: 'ngo-fail-2',
        name: 'Forged NGO',
        primary_contact_name: 'Impostor',
        primary_contact_phone: '12345678',
      });
    assert.equal(forgedRes.status, 403);
    assert.equal(forgedRes.body.error.code, 'FORBIDDEN');
    assert.ok(forgedRes.body.error.message.includes('Coordinator privileges required'));

    // 4. Token with leading/trailing whitespace in Authorization header
    const paddedRes = await request(app)
      .post('/api/v1/ngos')
      .set('Authorization', `Bearer   ${devCoordToken}   `)
      .send({
        id: 'ngo-dhubri-relief',
        name: 'Dhubri Flood Relief Corps',
        primary_contact_name: 'Rafiqul Islam',
        primary_contact_phone: '9854088776',
      });
    assert.equal(paddedRes.status, 201);
    assert.equal(paddedRes.body.success, true);
  });

  test('REGRESSION: NGO Readiness availability check-in schema validation and simulation preservation', async () => {
    // 1. Setup a simulated NGO (is_simulated = 1)
    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone, is_simulated)
      VALUES ('ngo-sim-readiness', 'Simulated Relief Taskforce', 'Majuli Incharge', '9854011222', 1)
    `).run();

    // 2. Valid check-in by authenticated coordinator on simulated NGO with string-coerced counts and empty string optionals
    const validCheckinRes = await request(app)
      .post('/api/v1/ngos/ngo-sim-readiness/availability')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        status: 'ACTIVE_STANDBY',
        available_personnel_count: '15',
        certified_helmsmen_count: '5',
        reporting_person_name: 'Dr. N. Sarma',
        reporting_person_phone: '9435012345',
        operational_notes: '',
        valid_until: '',
      });

    assert.equal(validCheckinRes.status, 201);
    assert.equal(validCheckinRes.body.success, true);
    assert.equal(validCheckinRes.body.data.status, 'ACTIVE_STANDBY');
    assert.equal(validCheckinRes.body.data.available_personnel_count, 15);
    assert.equal(validCheckinRes.body.data.certified_helmsmen_count, 5);
    assert.equal(validCheckinRes.body.data.is_simulated, 1, 'Availability log must preserve parent NGO simulation flag');
    assert.equal(validCheckinRes.body.data.operational_notes, null);
    assert.equal(validCheckinRes.body.data.valid_until, null);

    // 3. Detail fetch reflects availability check-in and preserves simulation flag
    const detailRes = await request(app)
      .get('/api/v1/ngos/ngo-sim-readiness')
      .set('Authorization', `Bearer ${coordinatorToken}`);
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.body.data.is_simulated, true);
    assert.ok(detailRes.body.data.latest_availability);
    assert.equal(detailRes.body.data.latest_availability.available_personnel_count, 15);
    assert.equal(detailRes.body.data.latest_availability.certified_helmsmen_count, 5);
    assert.equal(detailRes.body.data.latest_availability.is_simulated, 1);

    // 4. Invalid payload: Missing reporting_person_name -> 400 VALIDATION_ERROR
    const missingNameRes = await request(app)
      .post('/api/v1/ngos/ngo-sim-readiness/availability')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        status: 'ACTIVE_STANDBY',
        available_personnel_count: 10,
        certified_helmsmen_count: 2,
        reporting_person_phone: '9435012345',
      });
    assert.equal(missingNameRes.status, 400);
    assert.equal(missingNameRes.body.error.code, 'VALIDATION_ERROR');

    // 5. Invalid payload: Missing reporting_person_phone -> 400 VALIDATION_ERROR
    const missingPhoneRes = await request(app)
      .post('/api/v1/ngos/ngo-sim-readiness/availability')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        status: 'ACTIVE_STANDBY',
        available_personnel_count: 10,
        certified_helmsmen_count: 2,
        reporting_person_name: 'Dr. N. Sarma',
      });
    assert.equal(missingPhoneRes.status, 400);
    assert.equal(missingPhoneRes.body.error.code, 'VALIDATION_ERROR');

    // 6. Invalid payload: Invalid status enum (e.g. DEPLOYED_FIELD) -> 400 VALIDATION_ERROR
    const invalidStatusRes = await request(app)
      .post('/api/v1/ngos/ngo-sim-readiness/availability')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        status: 'DEPLOYED_FIELD',
        available_personnel_count: 10,
        certified_helmsmen_count: 2,
        reporting_person_name: 'Dr. N. Sarma',
        reporting_person_phone: '9435012345',
      });
    assert.equal(invalidStatusRes.status, 400);
    assert.equal(invalidStatusRes.body.error.code, 'VALIDATION_ERROR');

    // 7. Invalid payload: Helmsmen exceeding available personnel -> 400 VALIDATION_ERROR
    const helmsmenExceedRes = await request(app)
      .post('/api/v1/ngos/ngo-sim-readiness/availability')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        status: 'ACTIVE_STANDBY',
        available_personnel_count: 4,
        certified_helmsmen_count: 10,
        reporting_person_name: 'Dr. N. Sarma',
        reporting_person_phone: '9435012345',
      });
    assert.equal(helmsmenExceedRes.status, 400);
    assert.equal(helmsmenExceedRes.body.error.code, 'VALIDATION_ERROR');
    assert.ok(
      helmsmenExceedRes.body.error.details.some((d: any) =>
        (d.issue || d.message || '').toLowerCase().includes('cannot exceed')
      )
    );

    // 8. Invalid payload: Negative personnel count -> 400 VALIDATION_ERROR
    const negativePersonnelRes = await request(app)
      .post('/api/v1/ngos/ngo-sim-readiness/availability')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        status: 'ACTIVE_STANDBY',
        available_personnel_count: -1,
        certified_helmsmen_count: 0,
        reporting_person_name: 'Dr. N. Sarma',
        reporting_person_phone: '9435012345',
      });
    assert.equal(negativePersonnelRes.status, 400);
    assert.equal(negativePersonnelRes.body.error.code, 'VALIDATION_ERROR');
  });

  test('Phase 4.4: Complete NGO Management workflows (Catalogues, Operating Areas, Depots, Equipment, Capabilities)', async () => {
    // Seed test NGOs
    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone, is_simulated)
      VALUES ('ngo-mgmt-1', 'Brahmaputra Disaster Response', 'Anupam Das', '9854011223', 1),
             ('ngo-mgmt-2', 'Suraksha Seva Dal', 'Kavita Roy', '9854022334', 0)
    `).run();

    // 1. Catalogue Endpoints
    const capCatRes = await request(app).get('/api/v1/capabilities');
    assert.equal(capCatRes.status, 200);
    assert.equal(capCatRes.body.success, true);
    assert.ok(Array.isArray(capCatRes.body.data));
    assert.ok(capCatRes.body.data.some((c: any) => c.id === 'WATER_SEARCH_AND_RESCUE'));

    const eqCatRes = await request(app).get('/api/v1/equipment-catalogue');
    assert.equal(eqCatRes.status, 200);
    assert.equal(eqCatRes.body.success, true);
    assert.ok(Array.isArray(eqCatRes.body.data));
    assert.ok(eqCatRes.body.data.some((e: any) => e.id === 'INFLATABLE_BOAT'));

    // 2. Operating Areas & Staging Depots
    // 2a. Unauthenticated creation -> 401
    const unauthAreaRes = await request(app)
      .post('/api/v1/ngos/ngo-mgmt-1/operating-areas')
      .send({
        district: 'Kamrup',
        depot_location_name: 'Guwahati Central Depot',
      });
    assert.equal(unauthAreaRes.status, 401);

    // 2b. Volunteer creation -> 403
    const volAreaRes = await request(app)
      .post('/api/v1/ngos/ngo-mgmt-1/operating-areas')
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({
        district: 'Kamrup',
        depot_location_name: 'Guwahati Central Depot',
      });
    assert.equal(volAreaRes.status, 403);

    // 2c. Coordinator creation -> 201
    const coordAreaRes = await request(app)
      .post('/api/v1/ngos/ngo-mgmt-1/operating-areas')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        state: 'Assam',
        district: 'Kamrup',
        revenue_circle: 'Guwahati',
        administrative_scope: 'REVENUE_CIRCLE',
        depot_location_name: 'Guwahati Central Relief Depot',
        depot_latitude: 26.18,
        depot_longitude: 91.75,
        is_primary_depot: true,
      });
    assert.equal(coordAreaRes.status, 201);
    assert.equal(coordAreaRes.body.data.is_primary_depot, true);
    const areaId1 = coordAreaRes.body.data.id;

    // 2d. Public view masks coordinates
    const publicAreaRes = await request(app).get('/api/v1/ngos/ngo-mgmt-1/operating-areas');
    assert.equal(publicAreaRes.status, 200);
    assert.equal(publicAreaRes.body.data[0].depot_latitude, null);
    assert.equal(publicAreaRes.body.data[0].depot_longitude, null);

    // 2e. Coordinator view exposes coordinates
    const coordGetAreaRes = await request(app)
      .get('/api/v1/ngos/ngo-mgmt-1/operating-areas')
      .set('Authorization', `Bearer ${coordinatorToken}`);
    assert.equal(coordGetAreaRes.status, 200);
    assert.equal(coordGetAreaRes.body.data[0].depot_latitude, 26.18);
    assert.equal(coordGetAreaRes.body.data[0].depot_longitude, 91.75);

    // 2f. Cross-NGO depot deletion attempt -> 404 (NGO 2 trying to delete NGO 1's depot)
    const crossDeleteAreaRes = await request(app)
      .delete(`/api/v1/ngos/ngo-mgmt-2/operating-areas/${areaId1}`)
      .set('Authorization', `Bearer ${coordinatorToken}`);
    assert.equal(crossDeleteAreaRes.status, 404);

    // 3. Equipment Inventory
    // 3a. Condition invariant check: UNSERVICEABLE with available_quantity > 0 -> 400
    const unserviceableRes = await request(app)
      .post('/api/v1/ngos/ngo-mgmt-1/equipment')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        equipment_type_id: 'INFLATABLE_BOAT',
        operating_area_id: areaId1,
        total_quantity: 5,
        available_quantity: 2,
        operational_condition: 'UNSERVICEABLE',
      });
    assert.equal(unserviceableRes.status, 400);

    // 3b. Balance invariant check: available + reserved > total -> 400
    const balanceRes = await request(app)
      .post('/api/v1/ngos/ngo-mgmt-1/equipment')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        equipment_type_id: 'INFLATABLE_BOAT',
        operating_area_id: areaId1,
        total_quantity: 5,
        available_quantity: 4,
        reserved_quantity: 2, // 4 + 2 = 6 > 5
        operational_condition: 'SERVICEABLE',
      });
    assert.equal(balanceRes.status, 400);

    // 3c. Valid equipment creation -> 201 with simulation isolation preserved
    const validEqRes = await request(app)
      .post('/api/v1/ngos/ngo-mgmt-1/equipment')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        equipment_type_id: 'INFLATABLE_BOAT',
        operating_area_id: areaId1,
        total_quantity: 6,
        available_quantity: 4,
        reserved_quantity: 2,
        operational_condition: 'SERVICEABLE',
        inspection_status: 'PHYSICALLY_INSPECTED',
        storage_location_name: 'Guwahati Depot Boat Shed',
        storage_latitude: 26.18,
        storage_longitude: 91.75,
      });
    assert.equal(validEqRes.status, 201);
    assert.equal(validEqRes.body.data.is_simulated, 1);
    const equipId = validEqRes.body.data.id;

    // 3d. Patch equipment: update condition to UNDER_REPAIR with available_quantity: 0 -> 200
    const patchEqRes = await request(app)
      .patch(`/api/v1/ngos/ngo-mgmt-1/equipment/${equipId}`)
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        available_quantity: 0,
        operational_condition: 'UNDER_REPAIR',
      });
    assert.equal(patchEqRes.status, 200);
    assert.equal(patchEqRes.body.data.operational_condition, 'UNDER_REPAIR');
    assert.equal(patchEqRes.body.data.available_quantity, 0);

    // 3e. Cross-NGO equipment delete attempt -> 404
    const crossDeleteEqRes = await request(app)
      .delete(`/api/v1/ngos/ngo-mgmt-2/equipment/${equipId}`)
      .set('Authorization', `Bearer ${coordinatorToken}`);
    assert.equal(crossDeleteEqRes.status, 404);

    // 3f. Valid equipment delete -> 200
    const validDeleteEqRes = await request(app)
      .delete(`/api/v1/ngos/ngo-mgmt-1/equipment/${equipId}`)
      .set('Authorization', `Bearer ${coordinatorToken}`);
    assert.equal(validDeleteEqRes.status, 200);
    assert.equal(validDeleteEqRes.body.data.deleted, true);

    // 3g. Delete depot -> 200
    const validDeleteAreaRes = await request(app)
      .delete(`/api/v1/ngos/ngo-mgmt-1/operating-areas/${areaId1}`)
      .set('Authorization', `Bearer ${coordinatorToken}`);
    assert.equal(validDeleteAreaRes.status, 200);
    assert.equal(validDeleteAreaRes.body.data.deleted, true);

    // 4. Capabilities Full Replacement
    // 4a. Sync 2 capabilities -> 200
    const syncCapRes1 = await request(app)
      .put('/api/v1/ngos/ngo-mgmt-1/capabilities')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        capabilities: [
          { capability_id: 'WATER_SEARCH_AND_RESCUE', certification_level: 'SPECIALIST', is_verified: true },
          { capability_id: 'MOBILE_MEDICAL_TRIAGE', certification_level: 'BASIC', is_verified: false },
        ],
      });
    assert.equal(syncCapRes1.status, 200);
    assert.equal(syncCapRes1.body.data.length, 2);

    // 4b. Remove one capability via sync -> 200, length becomes 1
    const syncCapRes2 = await request(app)
      .put('/api/v1/ngos/ngo-mgmt-1/capabilities')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        capabilities: [
          { capability_id: 'WATER_SEARCH_AND_RESCUE', certification_level: 'SPECIALIST', is_verified: true },
        ],
      });
    assert.equal(syncCapRes2.status, 200);
    assert.equal(syncCapRes2.body.data.length, 1);
    assert.equal(syncCapRes2.body.data[0].capability_id, 'WATER_SEARCH_AND_RESCUE');
  });

  test('Demo Readiness: seedDemoNgo populates assam_relief_demo idempotently with simulation isolation', async () => {
    // 1. First run of seedDemoNgo against the test database
    seedDemoNgo(tempDbPath);

    // 2. Query dossier via GET /api/v1/ngos/assam_relief_demo
    const dossierRes = await request(app)
      .get('/api/v1/ngos/assam_relief_demo')
      .set('Authorization', `Bearer ${coordinatorToken}`);

    assert.equal(dossierRes.status, 200);
    assert.equal(dossierRes.body.success, true);
    const data = dossierRes.body.data;

    // Check basic properties & simulation isolation
    assert.equal(data.id, 'assam_relief_demo');
    assert.equal(data.is_simulated, true, 'NGO must be marked is_simulated = true');
    assert.equal(data.active_verification_dimensions.length, 0, 'Must preserve 0/5 verification status');

    // Check 4 capabilities
    assert.equal(data.capabilities.length, 4, 'Must have 4 capabilities populated');
    const capIds = data.capabilities.map((c: any) => c.capability_id);
    assert.ok(capIds.includes('WATER_SEARCH_AND_RESCUE'));
    assert.ok(capIds.includes('MOBILE_MEDICAL_TRIAGE'));
    assert.ok(capIds.includes('RELIEF_CAMP_LOGISTICS'));
    assert.ok(capIds.includes('WATER_SANITATION_WASH'));

    // Check 2 staging depots in Nagaon district
    assert.equal(data.depots.length, 2, 'Must have 2 staging depots');
    assert.ok(data.depots.every((d: any) => d.district === 'Nagaon'));
    const primaryDepots = data.depots.filter((d: any) => d.is_primary_depot);
    assert.equal(primaryDepots.length, 1, 'Exactly one depot must be designated primary');
    assert.equal(primaryDepots[0].revenue_circle, 'Kampur');

    // Check equipment inventory
    assert.equal(data.equipment.length, 5, 'Must have 5 equipment inventory records');
    assert.ok(data.equipment.some((e: any) => e.equipment_type_id === 'INFLATABLE_BOAT'));
    assert.ok(data.equipment.some((e: any) => e.equipment_type_id === 'LIFEJACKET'));
    assert.ok(data.equipment.some((e: any) => e.equipment_type_id === 'MOBILE_MEDICAL_KIT'));
    assert.ok(data.equipment.some((e: any) => e.equipment_type_id === 'RELIEF_TENT'));
    assert.ok(data.equipment.some((e: any) => e.equipment_type_id === 'DEWATERING_PUMP' && e.operational_condition === 'UNDER_REPAIR'));

    // Check simulated availability check-in
    assert.ok(data.latest_availability, 'Must have latest availability telemetry');
    assert.equal(data.latest_availability.status, 'ACTIVE_STANDBY');
    assert.equal(data.latest_availability.available_personnel_count, 14);
    assert.equal(data.latest_availability.certified_helmsmen_count, 4);
    assert.ok(data.latest_availability.operational_notes.includes('[SIMULATED DRILL]'));

    // 3. Second run to verify idempotency (must not duplicate depots or equipment)
    seedDemoNgo(tempDbPath);

    const dossierRes2 = await request(app)
      .get('/api/v1/ngos/assam_relief_demo')
      .set('Authorization', `Bearer ${coordinatorToken}`);

    assert.equal(dossierRes2.body.data.capabilities.length, 4, 'Idempotent: capabilities count unchanged');
    assert.equal(dossierRes2.body.data.depots.length, 2, 'Idempotent: depots count unchanged');
    assert.equal(dossierRes2.body.data.equipment.length, 5, 'Idempotent: equipment count unchanged');
  });
});
