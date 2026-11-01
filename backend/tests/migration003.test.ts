import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { createDatabaseConnection, closeDatabase } from '../src/database/connection.js';
import { initializeSchema, rollbackSchema } from '../src/database/schema.js';

describe('Database Migration 003: NGO Schema Hardening, Verification Normalization & Depot-Aware Inventory', () => {
  let tempDbDir: string;
  let tempDbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suraksha-mig003-test-'));
    tempDbPath = path.join(tempDbDir, 'test_mig003.sqlite');
  });

  afterEach(() => {
    if (db && db.open) {
      closeDatabase(db);
    }
    try {
      fs.rmSync(tempDbDir, { recursive: true, force: true });
    } catch {}
  });

  test('successfully upgrades from Migration 002 to Migration 003 without data loss', () => {
    db = createDatabaseConnection({ dbPath: tempDbPath });

    // Step 1: Initialize database up to Migration 002
    const v2Result = initializeSchema(db, 2);
    assert.equal(v2Result.appliedCount, 2, 'Should apply Migrations 1 and 2');
    assert.equal(v2Result.currentVersion, 2, 'Current schema version should be 2');

    // Seed test user, NGO, and operating area under Migration 002
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, full_name, phone)
      VALUES (1, 'coordinator_nagaon', '$2a$12$dummyhash', 'coordinator', 'Dr. N. Sarma', '9435011223')
    `).run();

    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone, verification_status, is_simulated)
      VALUES ('ngo-kampur-01', 'Kampur Jal-Suraksha Vahini', 'Pranjal Saikia', '9854012345', 'DOCUMENTED_IN_DDMP', 1)
    `).run();

    db.prepare(`
      INSERT INTO ngo_operating_areas (id, ngo_id, state, district, revenue_circle, administrative_scope, depot_location_name, is_primary_depot)
      VALUES (10, 'ngo-kampur-01', 'Assam', 'Nagaon', 'Kampur', 'REVENUE_CIRCLE', 'Kampur River Staging Depot', 1)
    `).run();

    // Step 2: Apply Migration 003
    const v3Result = initializeSchema(db, 3);
    assert.equal(v3Result.appliedCount, 1, 'Should apply exactly 1 pending migration (Migration 3)');
    assert.equal(v3Result.currentVersion, 3, 'Current schema version should be 3');

    // Step 3: Verify existing data preserved
    const ngo = db.prepare('SELECT id, name, verification_status, is_simulated FROM ngos WHERE id = ?').get('ngo-kampur-01') as {
      id: string;
      name: string;
      verification_status: string;
      is_simulated: number;
    };
    assert.ok(ngo, 'NGO record must be preserved across Migration 003');
    assert.equal(ngo.name, 'Kampur Jal-Suraksha Vahini');
    assert.equal(ngo.is_simulated, 1);

    const area = db.prepare('SELECT id, depot_location_name FROM ngo_operating_areas WHERE id = 10').get() as {
      id: number;
      depot_location_name: string;
    };
    assert.ok(area, 'Operating area must be preserved across Migration 003');
    assert.equal(area.depot_location_name, 'Kampur River Staging Depot');

    // Step 4: Verify new table ngo_verification_records exists
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'ngo_verification_records'")
      .all();
    assert.equal(tables.length, 1, 'ngo_verification_records table must exist');
  });

  test('normalizes multi-dimensional verification with append-only history and active uniqueness', () => {
    db = createDatabaseConnection({ dbPath: tempDbPath });
    initializeSchema(db, 3);

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, full_name)
      VALUES (1, 'coord1', 'hash', 'coordinator', 'Officer Sarma')
    `).run();

    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone)
      VALUES ('ngo-01', 'Test NGO', 'Contact Person', '9854011111')
    `).run();

    // 1. Insert initial active verification for IDENTITY_VERIFIED
    db.prepare(`
      INSERT INTO ngo_verification_records (ngo_id, dimension, is_verified, verified_by, is_current, notes)
      VALUES ('ngo-01', 'IDENTITY_VERIFIED', 1, 1, 1, 'Initial registration audit 2026')
    `).run();

    // 2. Insert concurrent active verification for a different dimension: EQUIPMENT_INDEPENDENTLY_VERIFIED
    // Must succeed because dimension is different!
    db.prepare(`
      INSERT INTO ngo_verification_records (ngo_id, dimension, is_verified, verified_by, is_current, notes)
      VALUES ('ngo-01', 'EQUIPMENT_INDEPENDENTLY_VERIFIED', 1, 1, 1, 'Physical boat inspection at depot')
    `).run();

    // 3. Attempt duplicate active verification for same NGO and same dimension -> must FAIL
    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO ngo_verification_records (ngo_id, dimension, is_verified, verified_by, is_current, notes)
          VALUES ('ngo-01', 'IDENTITY_VERIFIED', 1, 1, 1, 'Duplicate active verification attempt')
        `).run();
      },
      /UNIQUE constraint failed/,
      'Duplicate active verification for the same NGO and dimension must be rejected'
    );

    // 4. Append-only history: mark previous record as superseded (is_current = 0), then insert new active
    db.prepare(`
      UPDATE ngo_verification_records
      SET is_current = 0
      WHERE ngo_id = 'ngo-01' AND dimension = 'IDENTITY_VERIFIED'
    `).run();

    db.prepare(`
      INSERT INTO ngo_verification_records (ngo_id, dimension, is_verified, verified_by, is_current, notes)
      VALUES ('ngo-01', 'IDENTITY_VERIFIED', 1, 1, 1, 'Annual recertification audit 2027')
    `).run();

    // Verify history preserved: 2 records for IDENTITY_VERIFIED, exactly 1 active
    const totalIdentityRecords = db.prepare(`
      SELECT count(*) as c FROM ngo_verification_records
      WHERE ngo_id = 'ngo-01' AND dimension = 'IDENTITY_VERIFIED'
    `).get() as { c: number };
    assert.equal(totalIdentityRecords.c, 2, 'Must retain append-only historical audit trail');

    const activeIdentityRecords = db.prepare(`
      SELECT count(*) as c FROM ngo_verification_records
      WHERE ngo_id = 'ngo-01' AND dimension = 'IDENTITY_VERIFIED' AND is_current = 1
    `).get() as { c: number };
    assert.equal(activeIdentityRecords.c, 1, 'Must have exactly 1 active verification record');
  });

  test('enforces soft deletion on ngos with partial active index', () => {
    db = createDatabaseConnection({ dbPath: tempDbPath });
    initializeSchema(db, 3);

    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone)
      VALUES ('ngo-active-1', 'Active NGO 1', 'Contact 1', '9854011111'),
             ('ngo-active-2', 'Active NGO 2', 'Contact 2', '9854022222')
    `).run();

    const activeCountBefore = (db.prepare('SELECT count(*) as c FROM ngos WHERE deleted_at IS NULL').get() as { c: number }).c;
    assert.equal(activeCountBefore, 2);

    // Soft delete ngo-active-2
    db.prepare("UPDATE ngos SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 'ngo-active-2'").run();

    const activeCountAfter = (db.prepare('SELECT count(*) as c FROM ngos WHERE deleted_at IS NULL').get() as { c: number }).c;
    assert.equal(activeCountAfter, 1, 'Active NGO query must exclude soft-deleted organization');

    const totalCount = (db.prepare('SELECT count(*) as c FROM ngos').get() as { c: number }).c;
    assert.equal(totalCount, 2, 'Total record count in database must remain 2 (not hard deleted)');
  });

  test('preserves historical availability logs by enforcing foreign key RESTRICT on hard delete', () => {
    db = createDatabaseConnection({ dbPath: tempDbPath });
    initializeSchema(db, 3);

    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone)
      VALUES ('ngo-roster-1', 'Roster Tracked NGO', 'Contact Saikia', '9854033333')
    `).run();

    db.prepare(`
      INSERT INTO ngo_availability_logs (ngo_id, status, available_personnel_count, reporting_person_name, reporting_person_phone)
      VALUES ('ngo-roster-1', 'ACTIVE_STANDBY', 10, 'Contact Saikia', '9854033333')
    `).run();

    // Attempt hard delete on parent NGO -> must be BLOCKED by foreign key restrict
    assert.throws(
      () => {
        db.prepare("DELETE FROM ngos WHERE id = 'ngo-roster-1'").run();
      },
      /FOREIGN KEY constraint failed/,
      'Parent NGO hard-delete must be rejected when historical availability logs exist'
    );

    // Soft delete -> must SUCCEED and preserve historical availability log
    db.prepare("UPDATE ngos SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 'ngo-roster-1'").run();

    const logCount = (db.prepare("SELECT count(*) as c FROM ngo_availability_logs WHERE ngo_id = 'ngo-roster-1'").get() as { c: number }).c;
    assert.equal(logCount, 1, 'Availability log must be preserved after soft delete of parent NGO');
  });

  test('supports multi-depot inventory and blocks duplicates at the same depot', () => {
    db = createDatabaseConnection({ dbPath: tempDbPath });
    initializeSchema(db, 3);

    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone)
      VALUES ('ngo-multi-depot', 'Multi Depot Taskforce', 'Depot Lead', '9854044444')
    `).run();

    db.prepare(`
      INSERT INTO ngo_operating_areas (id, ngo_id, state, district, revenue_circle, administrative_scope, depot_location_name, is_primary_depot)
      VALUES (101, 'ngo-multi-depot', 'Assam', 'Nagaon', 'Kampur', 'REVENUE_CIRCLE', 'Kampur Staging Depot', 1),
             (102, 'ngo-multi-depot', 'Assam', 'Nagaon', 'Raha', 'REVENUE_CIRCLE', 'Raha Staging Depot', 0)
    `).run();

    // 1. Stage 4 rescue boats at Kampur Depot (id: 101)
    db.prepare(`
      INSERT INTO ngo_equipment_inventory (ngo_id, equipment_type_id, operating_area_id, total_quantity, available_quantity, reserved_quantity, operational_condition)
      VALUES ('ngo-multi-depot', 'INFLATABLE_BOAT', 101, 4, 3, 1, 'SERVICEABLE')
    `).run();

    // 2. Stage 2 rescue boats at Raha Depot (id: 102) -> must SUCCEED because depot is different
    db.prepare(`
      INSERT INTO ngo_equipment_inventory (ngo_id, equipment_type_id, operating_area_id, total_quantity, available_quantity, reserved_quantity, operational_condition)
      VALUES ('ngo-multi-depot', 'INFLATABLE_BOAT', 102, 2, 2, 0, 'SERVICEABLE')
    `).run();

    // 3. Stage 1 boat unassigned to any depot (operating_area_id: NULL) -> must SUCCEED
    db.prepare(`
      INSERT INTO ngo_equipment_inventory (ngo_id, equipment_type_id, operating_area_id, total_quantity, available_quantity, reserved_quantity, operational_condition)
      VALUES ('ngo-multi-depot', 'INFLATABLE_BOAT', NULL, 1, 1, 0, 'SERVICEABLE')
    `).run();

    // 4. Duplicate entry at Kampur Depot (id: 101) with same condition -> must FAIL
    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO ngo_equipment_inventory (ngo_id, equipment_type_id, operating_area_id, total_quantity, available_quantity, reserved_quantity, operational_condition)
          VALUES ('ngo-multi-depot', 'INFLATABLE_BOAT', 101, 1, 1, 0, 'SERVICEABLE')
        `).run();
      },
      /UNIQUE constraint failed/,
      'Duplicate inventory row for same NGO, equipment, depot, and condition must be rejected'
    );
  });

  test('enforces serviceable availability integrity: non-serviceable equipment must have available_quantity = 0', () => {
    db = createDatabaseConnection({ dbPath: tempDbPath });
    initializeSchema(db, 3);

    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone)
      VALUES ('ngo-equip-test', 'Equipment Test Team', 'Inspector', '9854055555')
    `).run();

    // 1. Attempt UNSERVICEABLE with available_quantity = 3 -> must FAIL
    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO ngo_equipment_inventory (ngo_id, equipment_type_id, total_quantity, available_quantity, reserved_quantity, operational_condition)
          VALUES ('ngo-equip-test', 'DEWATERING_PUMP', 3, 3, 0, 'UNSERVICEABLE')
        `).run();
      },
      /CHECK constraint failed: chk_serviceable_availability/,
      'Unserviceable equipment must not be marked as available for dispatch'
    );

    // 2. Attempt UNDER_REPAIR with available_quantity = 1 -> must FAIL
    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO ngo_equipment_inventory (ngo_id, equipment_type_id, total_quantity, available_quantity, reserved_quantity, operational_condition)
          VALUES ('ngo-equip-test', 'DEWATERING_PUMP', 3, 1, 0, 'UNDER_REPAIR')
        `).run();
      },
      /CHECK constraint failed: chk_serviceable_availability/,
      'Under-repair equipment must not be marked as available for dispatch'
    );

    // 3. UNSERVICEABLE with available_quantity = 0 -> must SUCCEED
    db.prepare(`
      INSERT INTO ngo_equipment_inventory (ngo_id, equipment_type_id, total_quantity, available_quantity, reserved_quantity, operational_condition)
      VALUES ('ngo-equip-test', 'DEWATERING_PUMP', 3, 0, 0, 'UNSERVICEABLE')
    `).run();

    const row = db.prepare(`
      SELECT total_quantity, available_quantity, operational_condition
      FROM ngo_equipment_inventory
      WHERE ngo_id = 'ngo-equip-test' AND equipment_type_id = 'DEWATERING_PUMP'
    `).get() as { total_quantity: number; available_quantity: number; operational_condition: string };

    assert.equal(row.total_quantity, 3);
    assert.equal(row.available_quantity, 0);
    assert.equal(row.operational_condition, 'UNSERVICEABLE');
  });

  test('rollbackSchema rolls back Migration 003 cleanly to Migration 002', () => {
    db = createDatabaseConnection({ dbPath: tempDbPath });

    // Initialize to version 3
    const initRes = initializeSchema(db);
    assert.equal(initRes.currentVersion, 3);

    // Rollback from 3 to 2
    const rollbackRes = rollbackSchema(db, 2);
    assert.equal(rollbackRes.rolledBackCount, 1, 'Should roll back exactly 1 migration');
    assert.equal(rollbackRes.currentVersion, 2, 'Current schema version must revert to 2');

    // ngo_verification_records must be dropped
    const verifTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'ngo_verification_records'").all();
    assert.equal(verifTable.length, 0, 'ngo_verification_records table must be dropped');

    // deleted_at must be removed from ngos
    const ngoCols = db.prepare('PRAGMA table_info(ngos)').all() as { name: string }[];
    assert.equal(ngoCols.some(c => c.name === 'deleted_at'), false, 'deleted_at column must be removed from ngos on rollback');
  });
});

