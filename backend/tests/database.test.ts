import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { createDatabaseConnection, checkDatabaseHealth, closeDatabase } from '../src/database/connection.js';
import { initializeSchema } from '../src/database/schema.js';

describe('Database Connection & Schema Foundation', () => {
  let tempDbDir: string;
  let tempDbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suraksha-db-test-'));
    tempDbPath = path.join(tempDbDir, 'test_isolated.sqlite');
  });

  afterEach(() => {
    if (db && db.open) {
      closeDatabase(db);
    }
    try {
      fs.rmSync(tempDbDir, { recursive: true, force: true });
    } catch {}
  });

  test('should establish SQLite connection and configure required PRAGMAs', () => {
    db = createDatabaseConnection({ dbPath: tempDbPath });
    assert.equal(db.open, true, 'Database should be open');

    // 1. Foreign keys must be ON
    const foreignKeys = db.pragma('foreign_keys', { simple: true });
    assert.equal(foreignKeys, 1, 'PRAGMA foreign_keys should be 1 (ON)');

    // 2. Busy timeout must be 5000ms
    const busyTimeout = db.pragma('busy_timeout', { simple: true });
    assert.equal(busyTimeout, 5000, 'PRAGMA busy_timeout should be 5000');

    // 3. Journal mode must be WAL for disk files
    const journalMode = db.pragma('journal_mode', { simple: true });
    assert.equal(String(journalMode).toLowerCase(), 'wal', 'PRAGMA journal_mode should be WAL');

    // 4. Synchronous must be NORMAL
    const synchronous = db.pragma('synchronous', { simple: true });
    assert.equal(synchronous, 1, 'PRAGMA synchronous should be 1 (NORMAL)');
  });

  test('checkDatabaseHealth reports connected on a healthy database', () => {
    db = createDatabaseConnection({ dbPath: tempDbPath });
    const health = checkDatabaseHealth(db);
    assert.equal(health.connected, true);
    assert.equal(String(health.journalMode).toLowerCase(), 'wal');
  });

  test('initializeSchema applies migration 1 and creates the 6 documented tables', () => {
    db = createDatabaseConnection({ dbPath: tempDbPath });

    const result = initializeSchema(db, 1);
    assert.equal(result.appliedCount, 1, 'Should apply 1 migration');
    assert.equal(result.currentVersion, 1, 'Current schema version should be 1');

    // Verify all 6 core tables + migrations tracking table exist
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as { name: string }[];

    const tableNames = tables.map(t => t.name);
    assert.ok(tableNames.includes('schema_migrations'), 'schema_migrations table must exist');
    assert.ok(tableNames.includes('users'), 'users table must exist');
    assert.ok(tableNames.includes('incidents'), 'incidents table must exist');
    assert.ok(tableNames.includes('resources'), 'resources table must exist');
    assert.ok(tableNames.includes('assignments'), 'assignments table must exist');
    assert.ok(tableNames.includes('incident_events'), 'incident_events table must exist');
    assert.ok(tableNames.includes('duplicate_candidates'), 'duplicate_candidates table must exist');
  });

  test('initializeSchema is idempotent and does not erase existing data', () => {
    db = createDatabaseConnection({ dbPath: tempDbPath });

    // Initial run - apply all registered migrations
    const initialResult = initializeSchema(db);
    assert.equal(initialResult.appliedCount, 3, 'Should apply all 3 migrations initially');
    assert.equal(initialResult.currentVersion, 3, 'Current version should be 3');

    // Insert a test user into users table
    db.prepare(`
      INSERT INTO users (username, password_hash, role, full_name, phone)
      VALUES (?, ?, ?, ?, ?)
    `).run('coordinator_test', '$2a$12$dummyhash', 'coordinator', 'Officer Sarma', '9876543210');

    // Second run: must not recreate or overwrite
    const rerunResult = initializeSchema(db);
    assert.equal(rerunResult.appliedCount, 0, 'Should apply 0 migrations on rerun');
    assert.equal(rerunResult.currentVersion, 3, 'Version should remain 3');

    // User must still exist
    const user = db.prepare('SELECT username, full_name FROM users WHERE username = ?').get('coordinator_test') as {
      username: string;
      full_name: string;
    };
    assert.ok(user, 'User must be preserved across schema initialization reruns');
    assert.equal(user.full_name, 'Officer Sarma');
  });

  test('enforces duplicate_candidates canonical constraint (primary_id < candidate_id)', () => {
    db = createDatabaseConnection({ dbPath: tempDbPath });
    initializeSchema(db);

    // Create 2 dummy incidents
    const inc1 = db.prepare(`
      INSERT INTO incidents (client_report_id, title, description, category, landmark)
      VALUES ('c-1111', 'Flood Majuli 1', 'Desc', 'MAROONED_RESCUE', 'Ghat')
    `).run();
    const inc2 = db.prepare(`
      INSERT INTO incidents (client_report_id, title, description, category, landmark)
      VALUES ('c-2222', 'Flood Majuli 2', 'Desc', 'MAROONED_RESCUE', 'Ghat')
    `).run();

    const id1 = Number(inc1.lastInsertRowid);
    const id2 = Number(inc2.lastInsertRowid);
    assert.ok(id1 < id2, 'Incident IDs should be sequential');

    // Valid canonical insertion: id1 < id2
    db.prepare(`
      INSERT INTO duplicate_candidates (primary_incident_id, candidate_incident_id, distance_meters, time_delta_seconds)
      VALUES (?, ?, 120.5, 300)
    `).run(id1, id2);

    // Invalid non-canonical insertion: id2 < id1 must be rejected by CHECK constraint
    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO duplicate_candidates (primary_incident_id, candidate_incident_id, distance_meters, time_delta_seconds)
          VALUES (?, ?, 120.5, 300)
        `).run(id2, id1);
      },
      /CHECK constraint failed/,
      'Must reject candidate pair where primary_incident_id >= candidate_incident_id'
    );
  });
});

