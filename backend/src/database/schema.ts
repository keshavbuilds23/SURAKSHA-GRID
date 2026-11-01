import Database from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
  down?: (db: Database.Database) => void;
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
  down: (db: Database.Database) => {
    db.exec(`
      DROP TABLE IF EXISTS duplicate_candidates;
      DROP TABLE IF EXISTS incident_events;
      DROP TABLE IF EXISTS assignments;
      DROP TABLE IF EXISTS resources;
      DROP TABLE IF EXISTS incidents;
      DROP TABLE IF EXISTS users;
    `);
  },
};

/**
 * Migration 2: NGO Network, Capability Profiling, Equipment Tracking & Operating Areas
 * Implements the normalized NGO tracking foundation for Phase 4.1.
 */
const migrationV2: Migration = {
  version: 2,
  name: '002_ngo_network_and_equipment_tracking',
  up: (db: Database.Database) => {
    // 1. ngos table
    db.exec(`
      CREATE TABLE IF NOT EXISTS ngos (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        legal_name TEXT,
        registration_reference TEXT,
        description TEXT,
        primary_contact_name TEXT NOT NULL,
        primary_contact_phone TEXT NOT NULL,
        primary_contact_email TEXT,
        verification_status TEXT NOT NULL DEFAULT 'DOCUMENTED_IN_DDMP' CHECK (
          verification_status IN (
            'DOCUMENTED_IN_DDMP',
            'IDENTITY_VERIFIED',
            'CURRENTLY_OPERATIONAL',
            'AVAILABILITY_CONFIRMED',
            'EQUIPMENT_INDEPENDENTLY_VERIFIED'
          )
        ),
        is_simulated INTEGER NOT NULL DEFAULT 1 CHECK (is_simulated IN (0, 1)),
        verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        verified_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_ngos_verification ON ngos(verification_status);
      CREATE INDEX IF NOT EXISTS idx_ngos_simulated ON ngos(is_simulated);
      CREATE INDEX IF NOT EXISTS idx_ngos_name ON ngos(name);
    `);

    // 2. capabilities catalog table
    db.exec(`
      CREATE TABLE IF NOT EXISTS capabilities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL CHECK (
          category IN (
            'RESCUE_OPERATIONS',
            'MEDICAL_HEALTH',
            'WATER_SANITATION',
            'SHELTER_RELIEF',
            'LOGISTICS_SUPPLY',
            'COMMUNITY_PREPAREDNESS'
          )
        ),
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_capabilities_category ON capabilities(category);
    `);

    // 3. ngo_capabilities table (Normalized Many-to-Many with Certifications)
    db.exec(`
      CREATE TABLE IF NOT EXISTS ngo_capabilities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ngo_id TEXT NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
        capability_id TEXT NOT NULL REFERENCES capabilities(id) ON DELETE RESTRICT,
        certification_level TEXT NOT NULL DEFAULT 'BASIC' CHECK (
          certification_level IN ('BASIC', 'INTERMEDIATE', 'ADVANCED', 'SPECIALIST')
        ),
        certified_by TEXT,
        certified_at TEXT,
        expires_at TEXT,
        is_verified INTEGER NOT NULL DEFAULT 0 CHECK (is_verified IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CONSTRAINT uq_ngo_capability UNIQUE (ngo_id, capability_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ngo_cap_ngo ON ngo_capabilities(ngo_id);
      CREATE INDEX IF NOT EXISTS idx_ngo_cap_capability ON ngo_capabilities(capability_id);
    `);

    // 4. equipment_catalogue table
    db.exec(`
      CREATE TABLE IF NOT EXISTS equipment_catalogue (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK (
          category IN (
            'RESCUE_WATERCRAFT',
            'LIFE_SAFETY',
            'MEDICAL_FIRST_AID',
            'WATER_SANITATION',
            'SHELTER_LOGISTICS',
            'COMMUNICATIONS',
            'POWER_DEWATERING',
            'OTHER'
          )
        ),
        description TEXT,
        unit_of_measure TEXT NOT NULL DEFAULT 'UNITS',
        is_critical INTEGER NOT NULL DEFAULT 0 CHECK (is_critical IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_eq_catalogue_category ON equipment_catalogue(category);
    `);

    // 5. ngo_equipment_inventory table
    db.exec(`
      CREATE TABLE IF NOT EXISTS ngo_equipment_inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ngo_id TEXT NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
        equipment_type_id TEXT NOT NULL REFERENCES equipment_catalogue(id) ON DELETE RESTRICT,
        total_quantity INTEGER NOT NULL CHECK (total_quantity >= 0),
        available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0),
        reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
        operational_condition TEXT NOT NULL DEFAULT 'SERVICEABLE' CHECK (
          operational_condition IN (
            'SERVICEABLE',
            'NEEDS_MAINTENANCE',
            'UNDER_REPAIR',
            'UNSERVICEABLE'
          )
        ),
        inspection_status TEXT NOT NULL DEFAULT 'SELF_REPORTED' CHECK (
          inspection_status IN (
            'SELF_REPORTED',
            'PHYSICALLY_INSPECTED',
            'AUDIT_EXPIRED'
          )
        ),
        storage_location_name TEXT,
        storage_latitude REAL,
        storage_longitude REAL,
        last_inspected_at TEXT,
        inspected_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_simulated INTEGER NOT NULL DEFAULT 1 CHECK (is_simulated IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CONSTRAINT chk_equipment_quantity_balance CHECK (available_quantity + reserved_quantity <= total_quantity),
        CONSTRAINT uq_ngo_equipment_condition UNIQUE (ngo_id, equipment_type_id, operational_condition)
      );

      CREATE INDEX IF NOT EXISTS idx_ngo_eq_ngo ON ngo_equipment_inventory(ngo_id);
      CREATE INDEX IF NOT EXISTS idx_ngo_eq_type ON ngo_equipment_inventory(equipment_type_id);
      CREATE INDEX IF NOT EXISTS idx_ngo_eq_avail ON ngo_equipment_inventory(available_quantity);
      CREATE INDEX IF NOT EXISTS idx_ngo_eq_cond ON ngo_equipment_inventory(operational_condition);
    `);

    // 6. ngo_availability_logs table
    db.exec(`
      CREATE TABLE IF NOT EXISTS ngo_availability_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ngo_id TEXT NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (
          status IN (
            'ACTIVE_STANDBY',
            'DEPLOYED',
            'PARTIALLY_AVAILABLE',
            'UNAVAILABLE',
            'INACTIVE_STALE'
          )
        ),
        available_personnel_count INTEGER NOT NULL DEFAULT 0 CHECK (available_personnel_count >= 0),
        certified_helmsmen_count INTEGER NOT NULL DEFAULT 0 CHECK (certified_helmsmen_count >= 0),
        reporting_person_name TEXT NOT NULL,
        reporting_person_phone TEXT NOT NULL,
        operational_notes TEXT,
        checkin_timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        valid_until TEXT,
        recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_simulated INTEGER NOT NULL DEFAULT 1 CHECK (is_simulated IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_ngo_avail_ngo_ts ON ngo_availability_logs(ngo_id, checkin_timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_ngo_avail_status ON ngo_availability_logs(status);
    `);

    // 7. ngo_operating_areas table
    db.exec(`
      CREATE TABLE IF NOT EXISTS ngo_operating_areas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ngo_id TEXT NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
        state TEXT NOT NULL DEFAULT 'Assam',
        district TEXT NOT NULL,
        revenue_circle TEXT,
        administrative_scope TEXT NOT NULL CHECK (
          administrative_scope IN (
            'STATE',
            'DISTRICT',
            'REVENUE_CIRCLE',
            'BLOCK',
            'GRAM_PANCHAYAT'
          )
        ),
        geographic_identifier TEXT,
        depot_location_name TEXT NOT NULL,
        depot_latitude REAL,
        depot_longitude REAL,
        is_primary_depot INTEGER NOT NULL DEFAULT 1 CHECK (is_primary_depot IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CONSTRAINT uq_ngo_area UNIQUE (ngo_id, district, revenue_circle, administrative_scope)
      );

      CREATE INDEX IF NOT EXISTS idx_ngo_areas_ngo ON ngo_operating_areas(ngo_id);
      CREATE INDEX IF NOT EXISTS idx_ngo_areas_district ON ngo_operating_areas(district, revenue_circle);
      CREATE INDEX IF NOT EXISTS idx_ngo_areas_coords ON ngo_operating_areas(depot_latitude, depot_longitude);
    `);

    // 8. Seed standard catalogues (capabilities & equipment types)
    const seedCapability = db.prepare(`
      INSERT OR IGNORE INTO capabilities (id, name, category, description)
      VALUES (?, ?, ?, ?)
    `);

    const standardCapabilities = [
      ['WATER_SEARCH_AND_RESCUE', 'Water Search & Rescue', 'RESCUE_OPERATIONS', 'Powerboat helmsmanship, deep-current navigation, marooned resident extraction'],
      ['MOBILE_MEDICAL_TRIAGE', 'Mobile Medical Triage', 'MEDICAL_HEALTH', 'Paramedic emergency care, anti-venom administration, mobile trauma stabilization'],
      ['WATER_SANITATION_WASH', 'Water Sanitation & Hygiene', 'WATER_SANITATION', 'Mobile RO water purification, halogen chlorination, safe water supply'],
      ['RELIEF_CAMP_LOGISTICS', 'Relief Camp Management', 'SHELTER_RELIEF', 'Camp shelter administration, registration, food and bedding distribution'],
      ['FOOD_RATION_DISTRIBUTION', 'Food Ration Logistics', 'LOGISTICS_SUPPLY', 'Bulk dry and cooked ration packaging, staging, and last-mile distribution'],
      ['COMMUNITY_EARLY_WARNING', 'Early Warning Dissemination', 'COMMUNITY_PREPAREDNESS', 'Siren/megaphone alerts, upstream river gauge monitoring dissemination'],
      ['EVACUATION_ASSISTANCE', 'Vulnerable Group Evacuation', 'RESCUE_OPERATIONS', 'Specialized transit for elderly, children, disabled persons, and livestock']
    ];

    for (const cap of standardCapabilities) {
      seedCapability.run(cap[0], cap[1], cap[2], cap[3]);
    }

    const seedEquipment = db.prepare(`
      INSERT OR IGNORE INTO equipment_catalogue (id, name, category, description, unit_of_measure, is_critical)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const standardEquipment = [
      ['INFLATABLE_BOAT', 'Inflatable Motorized Rescue Boat', 'RESCUE_WATERCRAFT', 'Heavy-duty inflatable rubber boat with outboard motor (OBM 25-40 HP)', 'UNITS', 1],
      ['LIFEJACKET', 'Certified Flotation Lifejacket', 'LIFE_SAFETY', 'Adult and child SOLAS/ISO 12402-4 compliant buoyancy lifevest', 'UNITS', 1],
      ['WATER_PURIFIER_RO', 'Mobile RO Water Purification Plant', 'WATER_SANITATION', 'Trailer/skid-mounted high-capacity portable drinking water system', 'UNITS', 1],
      ['MOBILE_MEDICAL_KIT', 'Disaster First Aid & Trauma Kit', 'MEDICAL_FIRST_AID', 'Sterile dressings, suture kits, anti-venom, ORS, IV fluids', 'SETS', 1],
      ['DEWATERING_PUMP', 'High-Volume Dewatering Pump', 'POWER_DEWATERING', 'Diesel/petrol portable centrifugal mud and flood dewatering pump', 'UNITS', 0],
      ['RELIEF_TENT', 'All-Weather Disaster Relief Shelter', 'SHELTER_LOGISTICS', 'Waterproof canvas community dome shelter for displaced inmates', 'UNITS', 0],
      ['COMMUNICATION_RADIO', 'VHF/UHF Handheld Radio Transceiver', 'COMMUNICATIONS', 'Dustproof/water-resistant dual-band two-way radio for rescue teams', 'UNITS', 0]
    ];

    for (const eq of standardEquipment) {
      seedEquipment.run(eq[0], eq[1], eq[2], eq[3], eq[4], eq[5]);
    }
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP TABLE IF EXISTS ngo_operating_areas;
      DROP TABLE IF EXISTS ngo_availability_logs;
      DROP TABLE IF EXISTS ngo_equipment_inventory;
      DROP TABLE IF EXISTS equipment_catalogue;
      DROP TABLE IF EXISTS ngo_capabilities;
      DROP TABLE IF EXISTS capabilities;
      DROP TABLE IF EXISTS ngos;
    `);
  },
};

/**
 * Migration 3: NGO Schema Hardening, Verification Normalization & Depot-Aware Inventory
 * Implements the normalized audit and data integrity foundation for Phase 4.2.3.
 */
const migrationV3: Migration = {
  version: 3,
  name: '003_ngo_schema_hardening_and_normalization',
  up: (db: Database.Database) => {
    // 1. Normalized Multi-Dimensional Verification Ledger
    db.exec(`
      CREATE TABLE IF NOT EXISTS ngo_verification_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ngo_id TEXT NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
        dimension TEXT NOT NULL CHECK (
          dimension IN (
            'DOCUMENTED_IN_DDMP',
            'IDENTITY_VERIFIED',
            'CURRENTLY_OPERATIONAL',
            'AVAILABILITY_CONFIRMED',
            'EQUIPMENT_INDEPENDENTLY_VERIFIED'
          )
        ),
        is_verified INTEGER NOT NULL DEFAULT 1 CHECK (is_verified IN (0, 1)),
        verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        verified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        valid_until TEXT,
        evidence_reference TEXT,
        notes TEXT,
        is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_ngo_verif_ngo ON ngo_verification_records(ngo_id);
      CREATE INDEX IF NOT EXISTS idx_ngo_verif_dim ON ngo_verification_records(dimension, is_current);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ngo_verif_current ON ngo_verification_records(ngo_id, dimension) WHERE is_current = 1;
    `);

    // 2. Add deleted_at to ngos for soft-deletion
    db.exec(`
      ALTER TABLE ngos ADD COLUMN deleted_at TEXT;
      CREATE INDEX IF NOT EXISTS idx_ngos_active ON ngos(deleted_at) WHERE deleted_at IS NULL;
    `);

    // 3. Preserve historical availability logs: Alter foreign key to ON DELETE RESTRICT
    db.exec(`
      CREATE TABLE IF NOT EXISTS ngo_availability_logs_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ngo_id TEXT NOT NULL REFERENCES ngos(id) ON DELETE RESTRICT,
        status TEXT NOT NULL CHECK (
          status IN (
            'ACTIVE_STANDBY',
            'DEPLOYED',
            'PARTIALLY_AVAILABLE',
            'UNAVAILABLE',
            'INACTIVE_STALE'
          )
        ),
        available_personnel_count INTEGER NOT NULL DEFAULT 0 CHECK (available_personnel_count >= 0),
        certified_helmsmen_count INTEGER NOT NULL DEFAULT 0 CHECK (certified_helmsmen_count >= 0),
        reporting_person_name TEXT NOT NULL,
        reporting_person_phone TEXT NOT NULL,
        operational_notes TEXT,
        checkin_timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        valid_until TEXT,
        recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_simulated INTEGER NOT NULL DEFAULT 1 CHECK (is_simulated IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      INSERT INTO ngo_availability_logs_new SELECT * FROM ngo_availability_logs;
      DROP TABLE ngo_availability_logs;
      ALTER TABLE ngo_availability_logs_new RENAME TO ngo_availability_logs;

      CREATE INDEX IF NOT EXISTS idx_ngo_avail_ngo_ts ON ngo_availability_logs(ngo_id, checkin_timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_ngo_avail_status ON ngo_availability_logs(status);
    `);

    // 4 & 5. Correct multi-depot equipment inventory and enforce equipment availability integrity
    db.exec(`
      CREATE TABLE IF NOT EXISTS ngo_equipment_inventory_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ngo_id TEXT NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
        equipment_type_id TEXT NOT NULL REFERENCES equipment_catalogue(id) ON DELETE RESTRICT,
        operating_area_id INTEGER REFERENCES ngo_operating_areas(id) ON DELETE SET NULL,
        total_quantity INTEGER NOT NULL CHECK (total_quantity >= 0),
        available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0),
        reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
        operational_condition TEXT NOT NULL DEFAULT 'SERVICEABLE' CHECK (
          operational_condition IN (
            'SERVICEABLE',
            'NEEDS_MAINTENANCE',
            'UNDER_REPAIR',
            'UNSERVICEABLE'
          )
        ),
        inspection_status TEXT NOT NULL DEFAULT 'SELF_REPORTED' CHECK (
          inspection_status IN (
            'SELF_REPORTED',
            'PHYSICALLY_INSPECTED',
            'AUDIT_EXPIRED'
          )
        ),
        storage_location_name TEXT,
        storage_latitude REAL,
        storage_longitude REAL,
        last_inspected_at TEXT,
        inspected_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_simulated INTEGER NOT NULL DEFAULT 1 CHECK (is_simulated IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CONSTRAINT chk_equipment_quantity_balance CHECK (available_quantity + reserved_quantity <= total_quantity),
        CONSTRAINT chk_serviceable_availability CHECK (operational_condition = 'SERVICEABLE' OR available_quantity = 0)
      );

      INSERT INTO ngo_equipment_inventory_new (
        id, ngo_id, equipment_type_id, operating_area_id, total_quantity, available_quantity, reserved_quantity,
        operational_condition, inspection_status, storage_location_name, storage_latitude, storage_longitude,
        last_inspected_at, inspected_by, is_simulated, created_at, updated_at
      )
      SELECT 
        id, ngo_id, equipment_type_id, NULL, total_quantity, available_quantity, reserved_quantity,
        operational_condition, inspection_status, storage_location_name, storage_latitude, storage_longitude,
        last_inspected_at, inspected_by, is_simulated, created_at, updated_at
      FROM ngo_equipment_inventory;

      DROP TABLE ngo_equipment_inventory;
      ALTER TABLE ngo_equipment_inventory_new RENAME TO ngo_equipment_inventory;

      CREATE INDEX IF NOT EXISTS idx_ngo_eq_ngo ON ngo_equipment_inventory(ngo_id);
      CREATE INDEX IF NOT EXISTS idx_ngo_eq_type ON ngo_equipment_inventory(equipment_type_id);
      CREATE INDEX IF NOT EXISTS idx_ngo_eq_area ON ngo_equipment_inventory(operating_area_id);
      CREATE INDEX IF NOT EXISTS idx_ngo_eq_avail ON ngo_equipment_inventory(available_quantity);
      CREATE INDEX IF NOT EXISTS idx_ngo_eq_cond ON ngo_equipment_inventory(operational_condition);

      CREATE UNIQUE INDEX IF NOT EXISTS uq_ngo_equipment_depot ON ngo_equipment_inventory(
        ngo_id, equipment_type_id, operating_area_id, operational_condition
      ) WHERE operating_area_id IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS uq_ngo_equipment_unassigned ON ngo_equipment_inventory(
        ngo_id, equipment_type_id, operational_condition
      ) WHERE operating_area_id IS NULL;
    `);
  },
  down: (db: Database.Database) => {
    // 1. Drop verification records
    db.exec(`DROP TABLE IF EXISTS ngo_verification_records;`);

    // 2. Drop deleted_at from ngos
    db.exec(`
      DROP INDEX IF EXISTS idx_ngos_active;
      ALTER TABLE ngos DROP COLUMN deleted_at;
    `);

    // 3. Revert ngo_availability_logs to ON DELETE CASCADE
    db.exec(`
      CREATE TABLE IF NOT EXISTS ngo_availability_logs_revert (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ngo_id TEXT NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (
          status IN (
            'ACTIVE_STANDBY',
            'DEPLOYED',
            'PARTIALLY_AVAILABLE',
            'UNAVAILABLE',
            'INACTIVE_STALE'
          )
        ),
        available_personnel_count INTEGER NOT NULL DEFAULT 0 CHECK (available_personnel_count >= 0),
        certified_helmsmen_count INTEGER NOT NULL DEFAULT 0 CHECK (certified_helmsmen_count >= 0),
        reporting_person_name TEXT NOT NULL,
        reporting_person_phone TEXT NOT NULL,
        operational_notes TEXT,
        checkin_timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        valid_until TEXT,
        recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_simulated INTEGER NOT NULL DEFAULT 1 CHECK (is_simulated IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      INSERT INTO ngo_availability_logs_revert SELECT * FROM ngo_availability_logs;
      DROP TABLE ngo_availability_logs;
      ALTER TABLE ngo_availability_logs_revert RENAME TO ngo_availability_logs;

      CREATE INDEX IF NOT EXISTS idx_ngo_avail_ngo_ts ON ngo_availability_logs(ngo_id, checkin_timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_ngo_avail_status ON ngo_availability_logs(status);
    `);

    // 4. Revert ngo_equipment_inventory
    db.exec(`
      CREATE TABLE IF NOT EXISTS ngo_equipment_inventory_revert (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ngo_id TEXT NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
        equipment_type_id TEXT NOT NULL REFERENCES equipment_catalogue(id) ON DELETE RESTRICT,
        total_quantity INTEGER NOT NULL CHECK (total_quantity >= 0),
        available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0),
        reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
        operational_condition TEXT NOT NULL DEFAULT 'SERVICEABLE' CHECK (
          operational_condition IN (
            'SERVICEABLE',
            'NEEDS_MAINTENANCE',
            'UNDER_REPAIR',
            'UNSERVICEABLE'
          )
        ),
        inspection_status TEXT NOT NULL DEFAULT 'SELF_REPORTED' CHECK (
          inspection_status IN (
            'SELF_REPORTED',
            'PHYSICALLY_INSPECTED',
            'AUDIT_EXPIRED'
          )
        ),
        storage_location_name TEXT,
        storage_latitude REAL,
        storage_longitude REAL,
        last_inspected_at TEXT,
        inspected_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_simulated INTEGER NOT NULL DEFAULT 1 CHECK (is_simulated IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CONSTRAINT chk_equipment_quantity_balance CHECK (available_quantity + reserved_quantity <= total_quantity),
        CONSTRAINT uq_ngo_equipment_condition UNIQUE (ngo_id, equipment_type_id, operational_condition)
      );

      INSERT INTO ngo_equipment_inventory_revert (
        id, ngo_id, equipment_type_id, total_quantity, available_quantity, reserved_quantity,
        operational_condition, inspection_status, storage_location_name, storage_latitude, storage_longitude,
        last_inspected_at, inspected_by, is_simulated, created_at, updated_at
      )
      SELECT 
        id, ngo_id, equipment_type_id, total_quantity, available_quantity, reserved_quantity,
        operational_condition, inspection_status, storage_location_name, storage_latitude, storage_longitude,
        last_inspected_at, inspected_by, is_simulated, created_at, updated_at
      FROM ngo_equipment_inventory;

      DROP TABLE ngo_equipment_inventory;
      ALTER TABLE ngo_equipment_inventory_revert RENAME TO ngo_equipment_inventory;

      CREATE INDEX IF NOT EXISTS idx_ngo_eq_ngo ON ngo_equipment_inventory(ngo_id);
      CREATE INDEX IF NOT EXISTS idx_ngo_eq_type ON ngo_equipment_inventory(equipment_type_id);
      CREATE INDEX IF NOT EXISTS idx_ngo_eq_avail ON ngo_equipment_inventory(available_quantity);
      CREATE INDEX IF NOT EXISTS idx_ngo_eq_cond ON ngo_equipment_inventory(operational_condition);
    `);
  },
};

export const ALL_MIGRATIONS: Migration[] = [migrationV1, migrationV2, migrationV3];

/**
 * Ensures the schema_migrations table exists and applies all pending migrations in order.
 * If targetVersion is provided, migrations above targetVersion are skipped.
 * This guarantees idempotency: already applied migrations are skipped, existing data is preserved.
 */
export function initializeSchema(
  db: Database.Database,
  targetVersion?: number
): { appliedCount: number; currentVersion: number } {
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

  const migrationsToRun = ALL_MIGRATIONS.filter(m =>
    targetVersion !== undefined ? m.version <= targetVersion : true
  );

  for (const migration of migrationsToRun) {
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

/**
 * Rolls back applied migrations down to targetVersion in reverse order.
 * Uses transactional execution to ensure atomic schema reversion.
 */
export function rollbackSchema(
  db: Database.Database,
  targetVersion: number = 0
): { rolledBackCount: number; currentVersion: number } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  const getAppliedStmt = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version DESC');
  const appliedRows = getAppliedStmt.all() as { version: number; name: string }[];

  let rolledBackCount = 0;
  const migrationsByVersion = new Map(ALL_MIGRATIONS.map(m => [m.version, m]));

  const deleteMigrationStmt = db.prepare('DELETE FROM schema_migrations WHERE version = ?');

  const runRollbackTx = db.transaction((migration: Migration) => {
    if (!migration.down) {
      throw new Error(`Migration ${migration.version} (${migration.name}) does not define a down rollback handler.`);
    }
    migration.down(db);
    deleteMigrationStmt.run(migration.version);
  });

  for (const row of appliedRows) {
    if (row.version > targetVersion) {
      const migration = migrationsByVersion.get(row.version);
      if (!migration) {
        throw new Error(`Cannot rollback unknown migration version ${row.version}`);
      }
      runRollbackTx(migration);
      rolledBackCount++;
    }
  }

  const remaining = db.prepare('SELECT MAX(version) as currentVersion FROM schema_migrations').get() as { currentVersion: number | null };
  const currentVersion = remaining?.currentVersion ?? 0;

  return {
    rolledBackCount,
    currentVersion,
  };
}
