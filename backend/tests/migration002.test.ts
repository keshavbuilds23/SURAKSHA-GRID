import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { createDatabaseConnection, closeDatabase } from '../src/database/connection.js';
import { initializeSchema, rollbackSchema } from '../src/database/schema.js';

describe('Database Migration 002: NGO Network & Equipment Tracking', () => {
  let tempDbDir: string;
  let tempDbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suraksha-mig002-test-'));
    tempDbPath = path.join(tempDbDir, 'test_mig002.sqlite');
  });

  afterEach(() => {
    if (db && db.open) {
      closeDatabase(db);
    }
    try {
      fs.rmSync(tempDbDir, { recursive: true, force: true });
    } catch {}
  });

  test('successfully applies Migration 001, then upgrades to Migration 002 without data loss', () => {
    db = createDatabaseConnection({ dbPath: tempDbPath });

    // Step 1: Initialize database at Migration 001
    const v1Result = initializeSchema(db, 1);
    assert.equal(v1Result.appliedCount, 1, 'Should apply exactly Migration 1');
    assert.equal(v1Result.currentVersion, 1, 'Current version should be 1');

    // Insert baseline test record into Migration 001 tables
    db.prepare(`
      INSERT INTO users (username, password_hash, role, full_name, phone)
      VALUES (?, ?, ?, ?, ?)
    `).run('coordinator_guwahati', '$2a$12$dummyhash', 'coordinator', 'Bhupen Hazarika', '9876543210');

    db.prepare(`
      INSERT INTO incidents (client_report_id, title, description, category, landmark)
      VALUES (?, ?, ?, ?, ?)
    `).run('client-rep-001', 'Kampur Levee Breach', 'High water overflowing levee near bridge', 'INFRASTRUCTURE_BREACH', 'Kampur Bridge');

    // Step 2: Apply Migration 002 onto existing Migration 001 database
    const v2Result = initializeSchema(db, 2);
    assert.equal(v2Result.appliedCount, 1, 'Should apply exactly 1 pending migration (Migration 2)');
    assert.equal(v2Result.currentVersion, 2, 'Current version should be 2');

    // Step 3: Verify existing data in users and incidents is 100% intact
    const user = db.prepare('SELECT username, full_name FROM users WHERE username = ?').get('coordinator_guwahati') as {
      username: string;
      full_name: string;
    };
    assert.ok(user, 'User record must be preserved across migration 002');
    assert.equal(user.full_name, 'Bhupen Hazarika');

    const incident = db.prepare('SELECT client_report_id, title FROM incidents WHERE client_report_id = ?').get('client-rep-001') as {
      client_report_id: string;
      title: string;
    };
    assert.ok(incident, 'Incident record must be preserved across migration 002');
    assert.equal(incident.title, 'Kampur Levee Breach');

    // Step 4: Verify all 7 new tables from Migration 002 exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    const tableNames = new Set(tables.map(t => t.name));

    assert.ok(tableNames.has('ngos'), 'ngos table must exist');
    assert.ok(tableNames.has('capabilities'), 'capabilities table must exist');
    assert.ok(tableNames.has('ngo_capabilities'), 'ngo_capabilities table must exist');
    assert.ok(tableNames.has('equipment_catalogue'), 'equipment_catalogue table must exist');
    assert.ok(tableNames.has('ngo_equipment_inventory'), 'ngo_equipment_inventory table must exist');
    assert.ok(tableNames.has('ngo_availability_logs'), 'ngo_availability_logs table must exist');
    assert.ok(tableNames.has('ngo_operating_areas'), 'ngo_operating_areas table must exist');
  });

  test('re-running Migration 002 is idempotent and does not duplicate schema or seed records', () => {
    db = createDatabaseConnection({ dbPath: tempDbPath });

    // Initial migration to latest
    const firstRun = initializeSchema(db, 2);
    assert.equal(firstRun.appliedCount, 2);
    assert.equal(firstRun.currentVersion, 2);

    // Count standard catalogue seeds
    const initialCapCount = (db.prepare('SELECT COUNT(*) as count FROM capabilities').get() as { count: number }).count;
    const initialEqCount = (db.prepare('SELECT COUNT(*) as count FROM equipment_catalogue').get() as { count: number }).count;
    assert.ok(initialCapCount > 0, 'Capabilities catalogue must be seeded');
    assert.ok(initialEqCount > 0, 'Equipment catalogue must be seeded');

    // Second run: must do nothing and preserve count
    const secondRun = initializeSchema(db, 2);
    assert.equal(secondRun.appliedCount, 0, 'Applied count must be 0 on idempotent rerun');
    assert.equal(secondRun.currentVersion, 2, 'Version must remain 2');

    const postRerunCapCount = (db.prepare('SELECT COUNT(*) as count FROM capabilities').get() as { count: number }).count;
    const postRerunEqCount = (db.prepare('SELECT COUNT(*) as count FROM equipment_catalogue').get() as { count: number }).count;
    assert.equal(postRerunCapCount, initialCapCount, 'Capabilities count must not duplicate');
    assert.equal(postRerunEqCount, initialEqCount, 'Equipment catalogue count must not duplicate');
  });

  test('enforces foreign key constraints: rejects invalid NGO and catalogue references', () => {
    db = createDatabaseConnection({ dbPath: tempDbPath });
    initializeSchema(db, 2);

    // 1. Rejects inserting capability for non-existent NGO
    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO ngo_capabilities (ngo_id, capability_id, certification_level)
          VALUES (?, ?, ?)
        `).run('non-existent-ngo-uuid', 'WATER_SEARCH_AND_RESCUE', 'ADVANCED');
      },
      /FOREIGN KEY constraint failed/,
      'Must reject capability for non-existent NGO'
    );

    // 2. Rejects inserting inventory for non-existent NGO
    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO ngo_equipment_inventory (ngo_id, equipment_type_id, total_quantity, available_quantity)
          VALUES (?, ?, ?, ?)
        `).run('non-existent-ngo-uuid', 'INFLATABLE_BOAT', 4, 4);
      },
      /FOREIGN KEY constraint failed/,
      'Must reject equipment inventory for non-existent NGO'
    );

    // 3. Rejects inserting inventory for non-existent equipment type
    // Insert valid NGO first
    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone, verification_status)
      VALUES (?, ?, ?, ?, ?)
    `).run('ngo-kjv-01', 'Kampur Jal-Suraksha Vahini', 'Pranab Saikia', '9435012345', 'CURRENTLY_OPERATIONAL');

    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO ngo_equipment_inventory (ngo_id, equipment_type_id, total_quantity, available_quantity)
          VALUES (?, ?, ?, ?)
        `).run('ngo-kjv-01', 'NON_EXISTENT_EQUIPMENT_CODE', 2, 2);
      },
      /FOREIGN KEY constraint failed/,
      'Must reject invalid equipment catalogue reference'
    );
  });

  test('enforces non-negative quantity constraints on equipment inventory', () => {
    db = createDatabaseConnection({ dbPath: tempDbPath });
    initializeSchema(db, 2);

    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone)
      VALUES (?, ?, ?, ?)
    `).run('ngo-test-qty', 'Test Rescue Team', 'Arup Das', '9854011223');

    // Reject negative total_quantity
    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO ngo_equipment_inventory (ngo_id, equipment_type_id, total_quantity, available_quantity)
          VALUES (?, ?, ?, ?)
        `).run('ngo-test-qty', 'INFLATABLE_BOAT', -5, 0);
      },
      /CHECK constraint failed/,
      'Must reject negative total_quantity'
    );

    // Reject negative available_quantity
    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO ngo_equipment_inventory (ngo_id, equipment_type_id, total_quantity, available_quantity)
          VALUES (?, ?, ?, ?)
        `).run('ngo-test-qty', 'INFLATABLE_BOAT', 5, -1);
      },
      /CHECK constraint failed/,
      'Must reject negative available_quantity'
    );

    // Reject negative reserved_quantity
    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO ngo_equipment_inventory (ngo_id, equipment_type_id, total_quantity, available_quantity, reserved_quantity)
          VALUES (?, ?, ?, ?, ?)
        `).run('ngo-test-qty', 'INFLATABLE_BOAT', 5, 2, -1);
      },
      /CHECK constraint failed/,
      'Must reject negative reserved_quantity'
    );
  });

  test('enforces quantity balance constraint: available + reserved cannot exceed total quantity', () => {
    db = createDatabaseConnection({ dbPath: tempDbPath });
    initializeSchema(db, 2);

    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone)
      VALUES (?, ?, ?, ?)
    `).run('ngo-test-bal', 'Test Logistics Team', 'Nayan Borah', '9854099887');

    // 1. Available (3) + Reserved (3) = 6 > Total (5) -> must throw
    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO ngo_equipment_inventory (ngo_id, equipment_type_id, total_quantity, available_quantity, reserved_quantity)
          VALUES (?, ?, ?, ?, ?)
        `).run('ngo-test-bal', 'LIFEJACKET', 5, 3, 3);
      },
      /CHECK constraint failed/,
      'Available + reserved must not exceed total quantity'
    );

    // 2. Available (3) + Reserved (2) = 5 <= Total (5) -> must succeed
    db.prepare(`
      INSERT INTO ngo_equipment_inventory (ngo_id, equipment_type_id, total_quantity, available_quantity, reserved_quantity)
      VALUES (?, ?, ?, ?, ?)
    `).run('ngo-test-bal', 'LIFEJACKET', 5, 3, 2);

    const row = db.prepare(`
      SELECT total_quantity, available_quantity, reserved_quantity
      FROM ngo_equipment_inventory
      WHERE ngo_id = ? AND equipment_type_id = ?
    `).get('ngo-test-bal', 'LIFEJACKET') as { total_quantity: number; available_quantity: number; reserved_quantity: number };

    assert.equal(row.total_quantity, 5);
    assert.equal(row.available_quantity, 3);
    assert.equal(row.reserved_quantity, 2);
  });

  test('enforces unique constraints on NGO capabilities and operating areas', () => {
    db = createDatabaseConnection({ dbPath: tempDbPath });
    initializeSchema(db, 2);

    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone)
      VALUES (?, ?, ?, ?)
    `).run('ngo-test-uq', 'Assam Flood Response Taskforce', 'Minoti Devi', '9435088776');

    // 1. Capability uniqueness
    db.prepare(`
      INSERT INTO ngo_capabilities (ngo_id, capability_id, certification_level)
      VALUES (?, ?, ?)
    `).run('ngo-test-uq', 'WATER_SEARCH_AND_RESCUE', 'SPECIALIST');

    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO ngo_capabilities (ngo_id, capability_id, certification_level)
          VALUES (?, ?, ?)
        `).run('ngo-test-uq', 'WATER_SEARCH_AND_RESCUE', 'BASIC');
      },
      /UNIQUE constraint failed/,
      'Must reject duplicate capability for the same NGO'
    );

    // 2. Operating area uniqueness
    db.prepare(`
      INSERT INTO ngo_operating_areas (ngo_id, district, revenue_circle, administrative_scope, depot_location_name)
      VALUES (?, ?, ?, ?, ?)
    `).run('ngo-test-uq', 'Nagaon', 'Kampur', 'REVENUE_CIRCLE', 'Kampur High School Depot');

    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO ngo_operating_areas (ngo_id, district, revenue_circle, administrative_scope, depot_location_name)
          VALUES (?, ?, ?, ?, ?)
        `).run('ngo-test-uq', 'Nagaon', 'Kampur', 'REVENUE_CIRCLE', 'Another Duplicate Depot Entry');
      },
      /UNIQUE constraint failed/,
      'Must reject duplicate operating area scope for the same NGO'
    );
  });

  test('enforces cascading delete: deleting an NGO removes capabilities, inventory, availability and operating areas', () => {
    db = createDatabaseConnection({ dbPath: tempDbPath });
    initializeSchema(db, 2);

    // Insert an NGO
    db.prepare(`
      INSERT INTO ngos (id, name, primary_contact_name, primary_contact_phone)
      VALUES (?, ?, ?, ?)
    `).run('ngo-cascade-del', 'Ephemeral NGO', 'Tarun Gogoi', '9435011990');

    // Insert child records across all 4 tables
    db.prepare(`
      INSERT INTO ngo_capabilities (ngo_id, capability_id)
      VALUES (?, ?)
    `).run('ngo-cascade-del', 'FOOD_RATION_DISTRIBUTION');

    db.prepare(`
      INSERT INTO ngo_equipment_inventory (ngo_id, equipment_type_id, total_quantity, available_quantity)
      VALUES (?, ?, ?, ?)
    `).run('ngo-cascade-del', 'RELIEF_TENT', 10, 10);

    db.prepare(`
      INSERT INTO ngo_availability_logs (ngo_id, status, available_personnel_count, reporting_person_name, reporting_person_phone)
      VALUES (?, ?, ?, ?, ?)
    `).run('ngo-cascade-del', 'ACTIVE_STANDBY', 8, 'Tarun Gogoi', '9435011990');

    db.prepare(`
      INSERT INTO ngo_operating_areas (ngo_id, district, revenue_circle, administrative_scope, depot_location_name)
      VALUES (?, ?, ?, ?, ?)
    `).run('ngo-cascade-del', 'Nagaon', 'Raha', 'REVENUE_CIRCLE', 'Raha Circle Office Staging Point');

    // Confirm records exist
    assert.equal(db.prepare('SELECT COUNT(*) as count FROM ngo_capabilities WHERE ngo_id = ?').get('ngo-cascade-del').count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) as count FROM ngo_equipment_inventory WHERE ngo_id = ?').get('ngo-cascade-del').count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) as count FROM ngo_availability_logs WHERE ngo_id = ?').get('ngo-cascade-del').count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) as count FROM ngo_operating_areas WHERE ngo_id = ?').get('ngo-cascade-del').count, 1);

    // Delete NGO
    db.prepare('DELETE FROM ngos WHERE id = ?').run('ngo-cascade-del');

    // Confirm cascade deletion
    assert.equal(db.prepare('SELECT COUNT(*) as count FROM ngo_capabilities WHERE ngo_id = ?').get('ngo-cascade-del').count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) as count FROM ngo_equipment_inventory WHERE ngo_id = ?').get('ngo-cascade-del').count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) as count FROM ngo_availability_logs WHERE ngo_id = ?').get('ngo-cascade-del').count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) as count FROM ngo_operating_areas WHERE ngo_id = ?').get('ngo-cascade-del').count, 0);
  });

  test('rollbackSchema rolls back Migration 002 cleanly and leaves Migration 001 intact', () => {
    db = createDatabaseConnection({ dbPath: tempDbPath });

    // Initialize to version 2
    initializeSchema(db, 2);
    assert.equal(db.prepare('SELECT MAX(version) as v FROM schema_migrations').get().v, 2);

    // Rollback to version 1
    const rollbackResult = rollbackSchema(db, 1);
    assert.equal(rollbackResult.rolledBackCount, 1, 'Should roll back 1 migration');
    assert.equal(rollbackResult.currentVersion, 1, 'Current version should revert to 1');

    // NGO tables should be dropped
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    const tableNames = new Set(tables.map(t => t.name));

    assert.equal(tableNames.has('ngos'), false, 'ngos table must be dropped');
    assert.equal(tableNames.has('ngo_capabilities'), false, 'ngo_capabilities must be dropped');
    assert.equal(tableNames.has('ngo_equipment_inventory'), false, 'ngo_equipment_inventory must be dropped');

    // Core tables must remain intact
    assert.ok(tableNames.has('users'), 'users table must remain');
    assert.ok(tableNames.has('incidents'), 'incidents table must remain');
    assert.ok(tableNames.has('resources'), 'resources table must remain');
    assert.ok(tableNames.has('assignments'), 'assignments table must remain');
    assert.ok(tableNames.has('incident_events'), 'incident_events table must remain');
    assert.ok(tableNames.has('duplicate_candidates'), 'duplicate_candidates table must remain');
  });
});

