import Database from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

/**
 * Migration 1: Initial Normalized Core Schema
 * Defines the 6 core business tables and constraints documented in docs/architecture/DATABASE_SCHEMA.md
 */
const migrationV1: Migration = {
  version: 1,
  name: '001_initial_core_schema',
  up: (db: Database.Database) => {
    // 1. users table
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('citizen', 'volunteer', 'coordinator', 'admin')),
        full_name TEXT NOT NULL,
        phone TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);

    // 2. incidents table
    db.exec(`
      CREATE TABLE IF NOT EXISTS incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_report_id TEXT NOT NULL UNIQUE,
        reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN (
          'MAROONED_RESCUE',
          'MEDICAL_EMERGENCY',
          'FOOD_WATER_CRISIS',
          'INFRASTRUCTURE_BREACH',
          'GENERAL_RELIEF'
        )),
        reported_urgency TEXT CHECK (reported_urgency IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
        severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN (
          'LOW',
          'MEDIUM',
          'HIGH',
          'CRITICAL'
        )),
        verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN (
          'PENDING',
          'VERIFIED',
          'REJECTED',
          'RESOLVED'
        )),
        latitude REAL,
        longitude REAL,
        landmark TEXT NOT NULL,
        affected_count INTEGER NOT NULL DEFAULT 1 CHECK (affected_count >= 0),
        verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        verified_at TEXT,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_incidents_client_id ON incidents(client_report_id);
      CREATE INDEX IF NOT EXISTS idx_incidents_verification ON incidents(verification_status);
      CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
      CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents(category);
      CREATE INDEX IF NOT EXISTS idx_incidents_coords ON incidents(latitude, longitude);
      CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_incidents_active ON incidents(deleted_at) WHERE deleted_at IS NULL;
    `);

    // 3. resources table
    db.exec(`
      CREATE TABLE IF NOT EXISTS resources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN (
          'WATER_PURIFICATION',
          'FOOD_RATIONS',
          'RESCUE_BOAT',
          'MEDICAL_KIT',
          'SHELTER_EQUIPMENT'
        )),
        total_quantity INTEGER NOT NULL CHECK (total_quantity >= 0),
        available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0 AND available_quantity <= total_quantity),
        unit TEXT NOT NULL,
        location_name TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category);
      CREATE INDEX IF NOT EXISTS idx_resources_available ON resources(available_quantity);
    `);

    // 4. assignments table
    db.exec(`
      CREATE TABLE IF NOT EXISTS assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE RESTRICT,
        resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
        assigned_quantity INTEGER NOT NULL CHECK (assigned_quantity > 0),
        status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN (
          'ASSIGNED',
          'IN_TRANSIT',
          'DELIVERED',
          'RETURNED',
          'CANCELLED'
        )),
        inventory_restored INTEGER NOT NULL DEFAULT 0 CHECK (inventory_restored IN (0, 1)),
        assigned_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        notes TEXT,
        dispatched_at TEXT,
        returned_at TEXT,
        assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_assignments_incident ON assignments(incident_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_resource ON assignments(resource_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments(status);
    `);

    // 5. incident_events table
    db.exec(`
      CREATE TABLE IF NOT EXISTS incident_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
        actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        event_type TEXT NOT NULL CHECK (event_type IN (
          'CREATED',
          'VERIFIED',
          'REJECTED',
          'SEVERITY_UPDATED',
          'RESOURCE_ASSIGNED',
          'RESOURCE_DISPATCHED',
          'RESOURCE_DELIVERED',
          'RESOURCE_RETURNED',
          'ASSIGNMENT_CANCELLED',
          'DUPLICATE_FLAGGED',
          'DUPLICATE_RESOLVED',
          'STATUS_RESOLVED',
          'INCIDENT_ARCHIVED'
        )),
        payload TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_events_incident ON incident_events(incident_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_events_type ON incident_events(event_type);
    `);

    // 6. duplicate_candidates table
    db.exec(`
      CREATE TABLE IF NOT EXISTS duplicate_candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        primary_incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
        candidate_incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
        distance_meters REAL NOT NULL,
        time_delta_seconds INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'SUGGESTED' CHECK (status IN (
          'SUGGESTED',
          'DISMISSED',
          'MERGED'
        )),
        reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CONSTRAINT uq_duplicate_pair UNIQUE (primary_incident_id, candidate_incident_id),
        CHECK (primary_incident_id < candidate_incident_id)
      );

      CREATE INDEX IF NOT EXISTS idx_dup_primary ON duplicate_candidates(primary_incident_id);
      CREATE INDEX IF NOT EXISTS idx_dup_candidate ON duplicate_candidates(candidate_incident_id);
      CREATE INDEX IF NOT EXISTS idx_dup_status ON duplicate_candidates(status);
    `);
  },
};

const ALL_MIGRATIONS: Migration[] = [migrationV1];

/**
 * Ensures the schema_migrations table exists and applies all pending migrations in order.
 * This guarantees idempotency: already applied migrations are skipped, existing data is preserved.
 */
export function initializeSchema(db: Database.Database): { appliedCount: number; currentVersion: number } {
  // Create schema_migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  const getAppliedStmt = db.prepare('SELECT version FROM schema_migrations');
  const appliedRows = getAppliedStmt.all() as { version: number }[];
  const appliedVersions = new Set(appliedRows.map(r => r.version));

  let appliedCount = 0;
  let currentVersion = appliedVersions.size > 0 ? Math.max(...appliedVersions) : 0;

  const insertMigrationStmt = db.prepare(
    'INSERT INTO schema_migrations (version, name) VALUES (?, ?)'
  );

  const runMigrationTx = db.transaction((migration: Migration) => {
    migration.up(db);
    insertMigrationStmt.run(migration.version, migration.name);
  });

  for (const migration of ALL_MIGRATIONS) {
    if (!appliedVersions.has(migration.version)) {
      runMigrationTx(migration);
      appliedCount++;
      currentVersion = migration.version;
    }
  }

  return {
    appliedCount,
    currentVersion,
  };
}

