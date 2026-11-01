import { validateEnv } from '../src/config/env.js';
import { createDatabaseConnection, closeDatabase } from '../src/database/connection.js';
import { initializeSchema } from '../src/database/schema.js';

/**
 * Seed Script: Populate Demo NGO Dossier (assam_relief_demo)
 *
 * Guarantees:
 * 1. Safe & repeatable: Fully idempotent, rerunning will not duplicate records.
 * 2. Strict simulation isolation: All records remain tagged is_simulated = 1.
 * 3. Preserves 0/5 verification status: Does not create verified records or promote to operational.
 * 4. Fictional demo facilities: Clear demo / simulated naming in Nagaon district.
 * 5. Full dossier coherence across Overview, Staging Depots, Equipment, and Readiness.
 */
export function seedDemoNgo(dbPath?: string): void {
  const config = validateEnv();
  const db = createDatabaseConnection({ dbPath: dbPath || config.DB_PATH });

  try {
    initializeSchema(db);

    const tx = db.transaction(() => {
      const NGO_ID = 'assam_relief_demo';

      // 1. Ensure simulated NGO record exists and is_simulated = 1
      const existingNgo = db.prepare('SELECT id FROM ngos WHERE id = ?').get(NGO_ID);
      if (!existingNgo) {
        db.prepare(`
          INSERT INTO ngos (
            id, name, legal_name, registration_reference, description,
            primary_contact_name, primary_contact_phone, primary_contact_email,
            verification_status, is_simulated
          ) VALUES (
            :id, :name, :legal_name, :registration_reference, :description,
            :primary_contact_name, :primary_contact_phone, :primary_contact_email,
            'DOCUMENTED_IN_DDMP', 1
          )
        `).run({
          id: NGO_ID,
          name: 'Assam Relief Response Demo',
          legal_name: 'Assam Relief Response Demo Trust',
          registration_reference: 'DEMO-2026-001',
          description: 'Demonstration partner organization configured with simulated field depots, rescue equipment, and standby personnel for Assam flood response exercises.',
          primary_contact_name: 'Demo Field Coordinator',
          primary_contact_phone: '+919435000000',
          primary_contact_email: 'coordinator@assam-relief-demo.org',
        });
        console.log(`[SEED] Created base NGO record '${NGO_ID}'.`);
      } else {
        db.prepare(`
          UPDATE ngos
          SET is_simulated = 1,
              description = 'Demonstration partner organization configured with simulated field depots, rescue equipment, and standby personnel for Assam flood response exercises.',
              primary_contact_name = 'Demo Field Coordinator',
              primary_contact_phone = '+919435000000',
              primary_contact_email = 'coordinator@assam-relief-demo.org',
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?
        `).run(NGO_ID);
        console.log(`[SEED] Updated existing NGO record '${NGO_ID}' (preserved is_simulated = 1).`);
      }

      // 2. Preserve 0/5 verification status: Clear any verifications if present
      db.prepare('DELETE FROM ngo_verification_records WHERE ngo_id = ?').run(NGO_ID);
      console.log(`[SEED] Confirmed 0/5 verification dimensions for '${NGO_ID}'.`);

      // 3. Operational Capabilities (Water rescue, medical, shelter/logistics, WASH)
      const capabilitiesToSeed = [
        {
          capability_id: 'WATER_SEARCH_AND_RESCUE',
          certification_level: 'ADVANCED',
          certified_by: 'ASDMA State Disaster Response Cell (Demo)',
          is_verified: 0,
        },
        {
          capability_id: 'MOBILE_MEDICAL_TRIAGE',
          certification_level: 'INTERMEDIATE',
          certified_by: 'National Health Mission Assam (Demo)',
          is_verified: 0,
        },
        {
          capability_id: 'RELIEF_CAMP_LOGISTICS',
          certification_level: 'BASIC',
          certified_by: 'Nagaon District DDMA (Demo)',
          is_verified: 0,
        },
        {
          capability_id: 'WATER_SANITATION_WASH',
          certification_level: 'BASIC',
          certified_by: 'Public Health Engineering Dept Assam (Demo)',
          is_verified: 0,
        },
      ];

      db.prepare('DELETE FROM ngo_capabilities WHERE ngo_id = ?').run(NGO_ID);
      const insertCap = db.prepare(`
        INSERT INTO ngo_capabilities (
          ngo_id, capability_id, certification_level, certified_by, is_verified
        ) VALUES (?, ?, ?, ?, ?)
      `);

      for (const cap of capabilitiesToSeed) {
        insertCap.run(NGO_ID, cap.capability_id, cap.certification_level, cap.certified_by, cap.is_verified);
      }
      console.log(`[SEED] Populated ${capabilitiesToSeed.length} operational capabilities for '${NGO_ID}'.`);

      // 4. Staging Depots in Nagaon District (2 simulated staging facilities)
      const depotsToSeed = [
        {
          district: 'Nagaon',
          revenue_circle: 'Kampur',
          administrative_scope: 'REVENUE_CIRCLE',
          geographic_identifier: 'Simulated Flood Relief Staging Base - Sector 4',
          depot_location_name: 'Kampur Simulation Staging Depot (Demo)',
          depot_latitude: 26.1550,
          depot_longitude: 92.8350,
          is_primary_depot: 1,
        },
        {
          district: 'Nagaon',
          revenue_circle: 'Raha',
          administrative_scope: 'REVENUE_CIRCLE',
          geographic_identifier: 'Simulated Upstream River Monitoring Camp',
          depot_location_name: 'Raha Auxiliary Relief Point (Demo)',
          depot_latitude: 26.2230,
          depot_longitude: 92.5180,
          is_primary_depot: 0,
        },
      ];

      const depotIds: Record<string, number> = {};

      for (const depot of depotsToSeed) {
        const existingArea = db.prepare(`
          SELECT id FROM ngo_operating_areas
          WHERE ngo_id = ? AND district = ? AND revenue_circle = ? AND administrative_scope = ?
        `).get(NGO_ID, depot.district, depot.revenue_circle, depot.administrative_scope) as { id: number } | undefined;

        if (existingArea) {
          db.prepare(`
            UPDATE ngo_operating_areas
            SET depot_location_name = :depot_location_name,
                geographic_identifier = :geographic_identifier,
                depot_latitude = :depot_latitude,
                depot_longitude = :depot_longitude,
                is_primary_depot = :is_primary_depot
            WHERE id = :id
          `).run({
            id: existingArea.id,
            depot_location_name: depot.depot_location_name,
            geographic_identifier: depot.geographic_identifier,
            depot_latitude: depot.depot_latitude,
            depot_longitude: depot.depot_longitude,
            is_primary_depot: depot.is_primary_depot,
          });
          depotIds[depot.revenue_circle] = existingArea.id;
        } else {
          const insertAreaRes = db.prepare(`
            INSERT INTO ngo_operating_areas (
              ngo_id, state, district, revenue_circle, administrative_scope,
              geographic_identifier, depot_location_name, depot_latitude, depot_longitude, is_primary_depot
            ) VALUES (
              :ngo_id, 'Assam', :district, :revenue_circle, :administrative_scope,
              :geographic_identifier, :depot_location_name, :depot_latitude, :depot_longitude, :is_primary_depot
            )
          `).run({
            ngo_id: NGO_ID,
            district: depot.district,
            revenue_circle: depot.revenue_circle,
            administrative_scope: depot.administrative_scope,
            geographic_identifier: depot.geographic_identifier,
            depot_location_name: depot.depot_location_name,
            depot_latitude: depot.depot_latitude,
            depot_longitude: depot.depot_longitude,
            is_primary_depot: depot.is_primary_depot,
          });
          depotIds[depot.revenue_circle] = Number(insertAreaRes.lastInsertRowid);
        }
      }
      console.log(`[SEED] Populated 2 simulated staging depots in Nagaon district:`, depotIds);

      // 5. Equipment Inventory (Boats, lifejackets, medical kits, tents, pumps)
      const kampurDepotId = depotIds['Kampur'];
      const rahaDepotId = depotIds['Raha'];

      const equipmentToSeed = [
        {
          equipment_type_id: 'INFLATABLE_BOAT',
          operating_area_id: kampurDepotId,
          total_quantity: 4,
          available_quantity: 3,
          reserved_quantity: 1,
          operational_condition: 'SERVICEABLE',
          inspection_status: 'SELF_REPORTED',
          storage_location_name: 'Kampur Boat Shelter - Bay 1 (Demo)',
          storage_latitude: 26.1550,
          storage_longitude: 92.8350,
        },
        {
          equipment_type_id: 'LIFEJACKET',
          operating_area_id: kampurDepotId,
          total_quantity: 50,
          available_quantity: 40,
          reserved_quantity: 10,
          operational_condition: 'SERVICEABLE',
          inspection_status: 'SELF_REPORTED',
          storage_location_name: 'Kampur Storage Locker A (Demo)',
          storage_latitude: 26.1550,
          storage_longitude: 92.8350,
        },
        {
          equipment_type_id: 'MOBILE_MEDICAL_KIT',
          operating_area_id: rahaDepotId,
          total_quantity: 8,
          available_quantity: 6,
          reserved_quantity: 2,
          operational_condition: 'SERVICEABLE',
          inspection_status: 'SELF_REPORTED',
          storage_location_name: 'Raha Medical Staging Pack (Demo)',
          storage_latitude: 26.2230,
          storage_longitude: 92.5180,
        },
        {
          equipment_type_id: 'RELIEF_TENT',
          operating_area_id: rahaDepotId,
          total_quantity: 15,
          available_quantity: 12,
          reserved_quantity: 3,
          operational_condition: 'SERVICEABLE',
          inspection_status: 'SELF_REPORTED',
          storage_location_name: 'Raha Warehouse Bay 2 (Demo)',
          storage_latitude: 26.2230,
          storage_longitude: 92.5180,
        },
        {
          equipment_type_id: 'DEWATERING_PUMP',
          operating_area_id: kampurDepotId,
          total_quantity: 2,
          available_quantity: 0,
          reserved_quantity: 0,
          operational_condition: 'UNDER_REPAIR',
          inspection_status: 'SELF_REPORTED',
          storage_location_name: 'Kampur Workshop Shed (Demo)',
          storage_latitude: 26.1550,
          storage_longitude: 92.8350,
        },
      ];

      // Remove existing equipment for this NGO to ensure clean idempotency
      db.prepare('DELETE FROM ngo_equipment_inventory WHERE ngo_id = ?').run(NGO_ID);

      const insertEq = db.prepare(`
        INSERT INTO ngo_equipment_inventory (
          ngo_id, equipment_type_id, operating_area_id, total_quantity, available_quantity, reserved_quantity,
          operational_condition, inspection_status, storage_location_name, storage_latitude, storage_longitude,
          is_simulated
        ) VALUES (
          :ngo_id, :equipment_type_id, :operating_area_id, :total_quantity, :available_quantity, :reserved_quantity,
          :operational_condition, :inspection_status, :storage_location_name, :storage_latitude, :storage_longitude,
          1
        )
      `);

      for (const eq of equipmentToSeed) {
        insertEq.run({
          ngo_id: NGO_ID,
          ...eq,
        });
      }
      console.log(`[SEED] Populated ${equipmentToSeed.length} simulated equipment assets (is_simulated = 1).`);

      // 6. Availability Check-in: Clearly labeled simulated readiness check-in
      // Insert fresh simulated telemetry check-in
      db.prepare(`
        INSERT INTO ngo_availability_logs (
          ngo_id, status, available_personnel_count, certified_helmsmen_count,
          reporting_person_name, reporting_person_phone, operational_notes,
          checkin_timestamp, valid_until, recorded_by, is_simulated
        ) VALUES (
          :ngo_id, 'ACTIVE_STANDBY', 14, 4,
          'Demo Field Incharge (Simulation)', '+919435000000',
          '[SIMULATED DRILL] Regular monsoon standby telemetry check-in for Kopili river basin demonstration.',
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+24 hours'),
          NULL, 1
        )
      `).run({ ngo_id: NGO_ID });

      console.log(`[SEED] Recorded fresh simulated availability check-in for '${NGO_ID}' (is_simulated = 1).`);
    });

    tx();
    console.log(`\n[SUCCESS] Demo dossier for 'assam_relief_demo' populated successfully!`);
  } finally {
    closeDatabase(db);
  }
}

// Execute directly if run as CLI script
if (process.argv[1] && process.argv[1].endsWith('seed-demo-ngo.ts')) {
  seedDemoNgo();
}

