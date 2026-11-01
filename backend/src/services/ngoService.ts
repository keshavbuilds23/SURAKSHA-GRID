import Database from 'better-sqlite3';
import { AppError } from '../types/index.js';
import { AuthUser } from '../middleware/authMiddleware.js';
import {
  VerificationDimension,
  AvailabilityStatus,
  FreshnessStatus,
  PublicNgoSummary,
  PublicNgoDetail,
  CoordinatorNgoDetail,
} from '../types/ngo.js';
import {
  QueryNgosInput,
  CreateNgoInput,
  PostVerificationInput,
  CreateOperatingAreaInput,
  SyncCapabilitiesInput,
  CreateEquipmentInput,
  PatchEquipmentInput,
  PostAvailabilityCheckinInput,
} from '../validators/ngoValidators.js';

export function createNgoService(db: Database.Database) {
  /**
   * Helper: verify NGO exists and is active (not soft deleted).
   */
  function ensureActiveNgo(id: string): { id: string; name: string; is_simulated: number } {
    const ngo = db
      .prepare('SELECT id, name, is_simulated FROM ngos WHERE id = ? AND deleted_at IS NULL')
      .get(id) as { id: string; name: string; is_simulated: number } | undefined;

    if (!ngo) {
      throw new AppError(`NGO with identifier '${id}' was not found.`, 404, 'NOT_FOUND');
    }
    return ngo;
  }

  /**
   * Computes availability freshness using server time.
   */
  function calculateFreshness(
    checkinTimestamp?: string | null,
    status?: AvailabilityStatus | null,
    validUntil?: string | null
  ): FreshnessStatus {
    if (!checkinTimestamp || status === 'INACTIVE_STALE') {
      return 'STALE';
    }

    const now = Date.now();
    const checkinTime = new Date(checkinTimestamp).getTime();
    if (isNaN(checkinTime)) return 'STALE';

    const hoursSince = (now - checkinTime) / (1000 * 60 * 60);

    if (validUntil) {
      const expiry = new Date(validUntil).getTime();
      if (!isNaN(expiry) && expiry < now) {
        return 'STALE';
      }
    }

    if (hoursSince <= 24) return 'FRESH';
    if (hoursSince <= 48) return 'AGING';
    return 'STALE';
  }

  /**
   * 1. Query NGO Directory with filtering and pagination.
   * Uses EXISTS subqueries to prevent row multiplication and corrupted pagination counts.
   */
  function getNgos(
    query: QueryNgosInput,
    isCoordinator: boolean
  ): { ngos: PublicNgoSummary[]; meta: Record<string, unknown> } {
    const { page, limit, district, revenue_circle, capability_id, filter_mode, search } = query;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['n.deleted_at IS NULL'];
    const params: Record<string, any> = { limit, offset };

    // Filter mode
    if (filter_mode === 'OPERATIONAL') {
      conditions.push('n.is_simulated = 0');
    } else if (filter_mode === 'SIMULATED') {
      conditions.push('n.is_simulated = 1');
    }

    // Search query
    if (search) {
      conditions.push('(n.name LIKE :search OR n.registration_reference LIKE :search OR n.legal_name LIKE :search)');
      params.search = `%${search}%`;
    }

    // Geographic coverage filtering via EXISTS
    if (district) {
      conditions.push(`
        EXISTS (
          SELECT 1 FROM ngo_operating_areas oa
          WHERE oa.ngo_id = n.id
            AND oa.district = :district
            ${revenue_circle ? 'AND oa.revenue_circle = :revenue_circle' : ''}
        )
      `);
      params.district = district;
      if (revenue_circle) params.revenue_circle = revenue_circle;
    }

    // Capability filtering via EXISTS
    if (capability_id) {
      conditions.push(`
        EXISTS (
          SELECT 1 FROM ngo_capabilities nc
          WHERE nc.ngo_id = n.id AND nc.capability_id = :capability_id
        )
      `);
      params.capability_id = capability_id;
    }

    const whereClause = conditions.join(' AND ');

    // Total count
    const totalRow = db
      .prepare(`SELECT COUNT(*) as total FROM ngos n WHERE ${whereClause}`)
      .get(params) as { total: number };
    const total = totalRow.total;

    // Fetch page items
    const rows = db
      .prepare(
        `SELECT n.id, n.name, n.legal_name, n.registration_reference, n.description,
                n.is_simulated, n.created_at,
                ${isCoordinator ? 'n.primary_contact_name, n.primary_contact_phone, n.primary_contact_email' : 'NULL as primary_contact_name, NULL as primary_contact_phone, NULL as primary_contact_email'}
         FROM ngos n
         WHERE ${whereClause}
         ORDER BY n.name ASC
         LIMIT :limit OFFSET :offset`
      )
      .all(params) as any[];

    // Fetch active verification dimensions and coverage for returned NGOs
    const getActiveDimensionsStmt = db.prepare(`
      SELECT dimension FROM ngo_verification_records
      WHERE ngo_id = ?
        AND is_current = 1
        AND is_verified = 1
        AND (valid_until IS NULL OR valid_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    `);

    const getCoverageStmt = db.prepare(`
      SELECT district, revenue_circle, depot_location_name as depot_name
      FROM ngo_operating_areas
      WHERE ngo_id = ?
      ORDER BY is_primary_depot DESC, id ASC
    `);

    const getLatestAvailabilityStmt = db.prepare(`
      SELECT status, checkin_timestamp, valid_until
      FROM ngo_availability_logs
      WHERE ngo_id = ?
      ORDER BY checkin_timestamp DESC, id DESC
      LIMIT 1
    `);

    const getCapabilitiesStmt = db.prepare(`
      SELECT c.name
      FROM ngo_capabilities nc
      JOIN capabilities c ON nc.capability_id = c.id
      WHERE nc.ngo_id = ?
      ORDER BY c.name ASC
    `);

    const ngos: PublicNgoSummary[] = rows.map(r => {
      const activeDims = (getActiveDimensionsStmt.all(r.id) as { dimension: VerificationDimension }[]).map(d => d.dimension);
      const coverage = getCoverageStmt.all(r.id) as any[];
      const caps = (getCapabilitiesStmt.all(r.id) as { name: string }[]).map(c => c.name);
      const latestAvail = getLatestAvailabilityStmt.get(r.id) as { status: AvailabilityStatus; checkin_timestamp: string; valid_until: string | null } | undefined;

      let availabilitySummary = null;
      if (latestAvail) {
        const freshness = calculateFreshness(latestAvail.checkin_timestamp, latestAvail.status, latestAvail.valid_until);
        const hoursSince = Math.max(0, (Date.now() - new Date(latestAvail.checkin_timestamp).getTime()) / (1000 * 60 * 60));
        availabilitySummary = {
          status: latestAvail.status,
          freshness,
          hours_since_checkin: Math.round(hoursSince * 10) / 10,
        };
      }

      return {
        id: r.id,
        name: r.name,
        legal_name: r.legal_name,
        registration_reference: r.registration_reference,
        description: r.description,
        primary_contact_name: isCoordinator ? r.primary_contact_name : null,
        primary_contact_phone: isCoordinator ? r.primary_contact_phone : null,
        primary_contact_email: isCoordinator ? r.primary_contact_email : null,
        capabilities: caps,
        active_verification_dimensions: activeDims,
        operating_coverage: coverage,
        availability_summary: availabilitySummary,
        is_simulated: r.is_simulated === 1,
        created_at: r.created_at,
      };
    });

    return {
      ngos,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
        filter_mode,
      },
    };
  }

  /**
   * 2. Get NGO Dossier by ID (Dual Projection).
   */
  function getNgoById(id: string, isCoordinator: boolean): PublicNgoDetail | CoordinatorNgoDetail {
    const ngo = db
      .prepare('SELECT * FROM ngos WHERE id = ? AND deleted_at IS NULL')
      .get(id) as any;

    if (!ngo) {
      throw new AppError(`NGO with identifier '${id}' was not found.`, 404, 'NOT_FOUND');
    }

    // Operating areas
    const depots = db
      .prepare('SELECT * FROM ngo_operating_areas WHERE ngo_id = ? ORDER BY is_primary_depot DESC, id ASC')
      .all(id) as any[];

    // Verifications
    const verifRows = db
      .prepare(`
        SELECT v.*, u.full_name as auditor_name
        FROM ngo_verification_records v
        LEFT JOIN users u ON v.verified_by = u.id
        WHERE v.ngo_id = ?
        ORDER BY v.created_at DESC
      `)
      .all(id) as any[];

    const now = Date.now();
    const verifications = verifRows.map(v => {
      const isExpired = v.valid_until && new Date(v.valid_until).getTime() < now;
      const isActive = v.is_current === 1 && v.is_verified === 1 && !isExpired;

      if (!isCoordinator) {
        return {
          id: v.id,
          dimension: v.dimension as VerificationDimension,
          is_verified: v.is_verified === 1,
          is_active: isActive,
          valid_until: v.valid_until,
        };
      }

      return {
        id: v.id,
        dimension: v.dimension as VerificationDimension,
        is_verified: v.is_verified === 1,
        is_active: isActive,
        verified_by: v.verified_by ? { id: v.verified_by, name: v.auditor_name || 'Coordinator' } : null,
        verified_at: v.verified_at,
        valid_until: v.valid_until,
        evidence_reference: v.evidence_reference,
        notes: v.notes,
      };
    });

    const activeDims = verifications.filter((v: any) => v.is_active).map((v: any) => v.dimension);

    // Capabilities
    const caps = db
      .prepare(`
        SELECT nc.*, c.name, c.category
        FROM ngo_capabilities nc
        JOIN capabilities c ON nc.capability_id = c.id
        WHERE nc.ngo_id = ?
        ORDER BY c.name ASC
      `)
      .all(id) as any[];

    // Equipment
    const eqRows = db
      .prepare(`
        SELECT eq.*, ec.name as equipment_name, ec.category, oa.depot_location_name as depot_name
        FROM ngo_equipment_inventory eq
        JOIN equipment_catalogue ec ON eq.equipment_type_id = ec.id
        LEFT JOIN ngo_operating_areas oa ON eq.operating_area_id = oa.id
        WHERE eq.ngo_id = ?
        ORDER BY ec.name ASC
      `)
      .all(id) as any[];

    // Latest availability
    const latestAvail = db
      .prepare(`
        SELECT * FROM ngo_availability_logs
        WHERE ngo_id = ?
        ORDER BY checkin_timestamp DESC, id DESC
        LIMIT 1
      `)
      .get(id) as any;

    let availabilitySummary = null;
    let latestAvailabilityFull = null;

    if (latestAvail) {
      const freshness = calculateFreshness(latestAvail.checkin_timestamp, latestAvail.status, latestAvail.valid_until);
      const hoursSince = Math.max(0, (now - new Date(latestAvail.checkin_timestamp).getTime()) / (1000 * 60 * 60));

      availabilitySummary = {
        status: latestAvail.status,
        freshness,
        hours_since_checkin: Math.round(hoursSince * 10) / 10,
      };

      if (isCoordinator) {
        latestAvailabilityFull = {
          ...latestAvail,
          freshness,
          hours_since_checkin: Math.round(hoursSince * 10) / 10,
        };
      }
    }

    if (!isCoordinator) {
      // Public Redacted View
      return {
        id: ngo.id,
        name: ngo.name,
        legal_name: ngo.legal_name,
        registration_reference: ngo.registration_reference,
        description: ngo.description,
        primary_contact_name: null,
        primary_contact_phone: null,
        primary_contact_email: null,
        active_verification_dimensions: activeDims,
        operating_coverage: depots.map(d => ({
          district: d.district,
          revenue_circle: d.revenue_circle,
          depot_name: d.depot_location_name,
        })),
        availability_summary: availabilitySummary,
        is_simulated: ngo.is_simulated === 1,
        created_at: ngo.created_at,
        verifications,
        depots: depots.map(d => ({
          id: d.id,
          district: d.district,
          revenue_circle: d.revenue_circle,
          sub_division: d.sub_division,
          administrative_scope: d.administrative_scope,
          depot_name: d.depot_location_name,
          depot_location_name: d.depot_location_name,
          is_primary_depot: d.is_primary_depot === 1,
          depot_latitude: null,
          depot_longitude: null,
        })),
        capabilities: caps.map(c => ({
          capability_id: c.capability_id,
          name: c.name,
          category: c.category,
        })),
        equipment: eqRows.map(e => ({
          id: e.id,
          equipment_name: e.equipment_name,
          category: e.category,
          total_quantity: e.total_quantity,
          available_quantity: e.available_quantity,
          operational_condition: e.operational_condition,
        })),
      };
    }

    // Full Coordinator Detail
    return {
      id: ngo.id,
      name: ngo.name,
      legal_name: ngo.legal_name,
      registration_reference: ngo.registration_reference,
      description: ngo.description,
      primary_contact_name: ngo.primary_contact_name,
      primary_contact_phone: ngo.primary_contact_phone,
      primary_contact_email: ngo.primary_contact_email,
      active_verification_dimensions: activeDims,
      operating_coverage: depots.map(d => ({
        district: d.district,
        revenue_circle: d.revenue_circle,
        depot_name: d.depot_location_name,
      })),
      availability_summary: availabilitySummary,
      is_simulated: ngo.is_simulated === 1,
      created_at: ngo.created_at,
      verifications,
      depots: depots.map(d => ({ ...d, is_primary_depot: d.is_primary_depot === 1 })),
      capabilities: caps.map(c => ({
        capability_id: c.capability_id,
        name: c.name,
        category: c.category,
        certification_level: c.certification_level,
        certified_by: c.certified_by,
        certified_at: c.certified_at,
        expires_at: c.expires_at,
        is_verified: c.is_verified === 1,
      })),
      equipment: eqRows.map(e => ({
        id: e.id,
        equipment_type_id: e.equipment_type_id,
        equipment_name: e.equipment_name,
        category: e.category,
        operating_area_id: e.operating_area_id,
        depot_name: e.depot_name,
        total_quantity: e.total_quantity,
        available_quantity: e.available_quantity,
        reserved_quantity: e.reserved_quantity,
        operational_condition: e.operational_condition,
        inspection_status: e.inspection_status,
        last_inspected_at: e.last_inspected_at,
        storage_location_name: e.storage_location_name,
        storage_latitude: e.storage_latitude,
        storage_longitude: e.storage_longitude,
      })),
      latest_availability: latestAvailabilityFull,
    };
  }

  /**
   * 3. Register New NGO.
   * Starts with 0 active verifications. Defaults to is_simulated = 1.
   */
  function createNgo(input: CreateNgoInput): Record<string, unknown> {
    const existing = db.prepare('SELECT id FROM ngos WHERE id = ?').get(input.id);
    if (existing) {
      throw new AppError(`NGO with identifier '${input.id}' already exists.`, 409, 'RESOURCE_CONFLICT');
    }

    const insertStmt = db.prepare(`
      INSERT INTO ngos (
        id, name, legal_name, registration_reference, description,
        primary_contact_name, primary_contact_phone, primary_contact_email,
        verification_status, is_simulated
      ) VALUES (
        :id, :name, :legal_name, :registration_reference, :description,
        :primary_contact_name, :primary_contact_phone, :primary_contact_email,
        'DOCUMENTED_IN_DDMP', 1
      )
    `);

    insertStmt.run({
      id: input.id,
      name: input.name,
      legal_name: input.legal_name || null,
      registration_reference: input.registration_reference || null,
      description: input.description || null,
      primary_contact_name: input.primary_contact_name,
      primary_contact_phone: input.primary_contact_phone,
      primary_contact_email: input.primary_contact_email || null,
    });

    const created = db.prepare('SELECT id, name, verification_status, is_simulated, created_at FROM ngos WHERE id = ?').get(input.id) as any;

    return {
      id: created.id,
      name: created.name,
      verification_status: created.verification_status,
      active_verifications_count: 0,
      is_simulated: true,
      created_at: created.created_at,
    };
  }

  /**
   * 4. Verification Ledger: Query verifications.
   */
  function getVerifications(ngoId: string, currentOnly: boolean, isCoordinator: boolean) {
    ensureActiveNgo(ngoId);

    const queryStr = `
      SELECT v.*, u.full_name as auditor_name
      FROM ngo_verification_records v
      LEFT JOIN users u ON v.verified_by = u.id
      WHERE v.ngo_id = :ngoId ${currentOnly ? 'AND v.is_current = 1' : ''}
      ORDER BY v.created_at DESC
    `;

    const rows = db.prepare(queryStr).all({ ngoId }) as any[];
    const now = Date.now();

    return rows.map(v => {
      const isExpired = v.valid_until && new Date(v.valid_until).getTime() < now;
      const isActive = v.is_current === 1 && v.is_verified === 1 && !isExpired;

      if (!isCoordinator) {
        return {
          id: v.id,
          dimension: v.dimension,
          is_verified: v.is_verified === 1,
          is_active: isActive,
          valid_until: v.valid_until,
        };
      }

      return {
        id: v.id,
        dimension: v.dimension,
        is_verified: v.is_verified === 1,
        is_active: isActive,
        is_current: v.is_current === 1,
        verified_by: v.verified_by ? { id: v.verified_by, name: v.auditor_name || 'Coordinator' } : null,
        verified_at: v.verified_at,
        valid_until: v.valid_until,
        evidence_reference: v.evidence_reference,
        notes: v.notes,
        created_at: v.created_at,
      };
    });
  }

  /**
   * 5. Add / Update Verification Record.
   * Transactional append-only history with active uniqueness.
   */
  function addVerification(ngoId: string, input: PostVerificationInput, actorId: number) {
    ensureActiveNgo(ngoId);

    const tx = db.transaction(() => {
      // Supersede current active record for this dimension
      db.prepare(`
        UPDATE ngo_verification_records
        SET is_current = 0
        WHERE ngo_id = ? AND dimension = ? AND is_current = 1
      `).run(ngoId, input.dimension);

      // Insert new active record
      const insertStmt = db.prepare(`
        INSERT INTO ngo_verification_records (
          ngo_id, dimension, is_verified, verified_by, valid_until, evidence_reference, notes, is_current
        ) VALUES (
          :ngo_id, :dimension, :is_verified, :verified_by, :valid_until, :evidence_reference, :notes, 1
        )
      `);

      const result = insertStmt.run({
        ngo_id: ngoId,
        dimension: input.dimension,
        is_verified: input.is_verified ? 1 : 0,
        verified_by: actorId,
        valid_until: input.valid_until || null,
        evidence_reference: input.evidence_reference,
        notes: input.notes || null,
      });

      // Update legacy verification_status on parent NGO
      db.prepare(`
        UPDATE ngos
        SET verification_status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?
      `).run(input.dimension, ngoId);

      return result.lastInsertRowid;
    });

    const newId = tx();
    return db.prepare('SELECT * FROM ngo_verification_records WHERE id = ?').get(newId);
  }

  /**
   * 6. Controlled Promotion to Operational Status (is_simulated = 0).
   * Strict rule: Requires all 5 verification dimensions to be active and non-expired.
   */
  function promoteToOperational(ngoId: string, _actorId: number) {
    ensureActiveNgo(ngoId);

    const REQUIRED_DIMENSIONS: VerificationDimension[] = [
      'DOCUMENTED_IN_DDMP',
      'IDENTITY_VERIFIED',
      'CURRENTLY_OPERATIONAL',
      'AVAILABILITY_CONFIRMED',
      'EQUIPMENT_INDEPENDENTLY_VERIFIED',
    ];

    const activeRows = db
      .prepare(`
        SELECT dimension FROM ngo_verification_records
        WHERE ngo_id = ?
          AND is_current = 1
          AND is_verified = 1
          AND (valid_until IS NULL OR valid_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      `)
      .all(ngoId) as { dimension: VerificationDimension }[];

    const activeSet = new Set(activeRows.map(r => r.dimension));
    const missing = REQUIRED_DIMENSIONS.filter(d => !activeSet.has(d));

    if (missing.length > 0) {
      throw new AppError(
        `NGO cannot be promoted to operational status. Missing or expired verification dimensions: ${missing.join(', ')}.`,
        422,
        'UNPROCESSABLE_ENTITY'
      );
    }

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE ngos
        SET is_simulated = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?
      `).run(ngoId);

      db.prepare('UPDATE ngo_equipment_inventory SET is_simulated = 0 WHERE ngo_id = ?').run(ngoId);
      db.prepare('UPDATE ngo_availability_logs SET is_simulated = 0 WHERE ngo_id = ?').run(ngoId);
    });

    tx();

    return {
      id: ngoId,
      is_simulated: false,
      promoted_at: new Date().toISOString(),
      active_dimensions: Array.from(activeSet),
    };
  }

  /**
   * 7. Operating Areas.
   */
  function getOperatingAreas(ngoId: string, isCoordinator: boolean) {
    ensureActiveNgo(ngoId);
    const rows = db.prepare('SELECT * FROM ngo_operating_areas WHERE ngo_id = ? ORDER BY is_primary_depot DESC, id ASC').all(ngoId) as any[];

    return rows.map(r => ({
      ...r,
      is_primary_depot: r.is_primary_depot === 1,
      depot_latitude: isCoordinator ? r.depot_latitude : null,
      depot_longitude: isCoordinator ? r.depot_longitude : null,
    }));
  }

  function createOperatingArea(ngoId: string, input: CreateOperatingAreaInput) {
    ensureActiveNgo(ngoId);

    try {
      const tx = db.transaction(() => {
        if (input.is_primary_depot) {
          db.prepare('UPDATE ngo_operating_areas SET is_primary_depot = 0 WHERE ngo_id = ?').run(ngoId);
        }

        const result = db.prepare(`
          INSERT INTO ngo_operating_areas (
            ngo_id, state, district, revenue_circle, administrative_scope,
            geographic_identifier, depot_location_name, depot_latitude, depot_longitude, is_primary_depot
          ) VALUES (
            :ngo_id, :state, :district, :revenue_circle, :administrative_scope,
            :geographic_identifier, :depot_location_name, :depot_latitude, :depot_longitude, :is_primary_depot
          )
        `).run({
          ngo_id: ngoId,
          state: input.state,
          district: input.district,
          revenue_circle: input.revenue_circle || null,
          administrative_scope: input.administrative_scope,
          geographic_identifier: input.geographic_identifier || null,
          depot_location_name: input.depot_location_name,
          depot_latitude: input.depot_latitude ?? null,
          depot_longitude: input.depot_longitude ?? null,
          is_primary_depot: input.is_primary_depot ? 1 : 0,
        });

        return result.lastInsertRowid;
      });

      const newId = tx();
      const row = db.prepare('SELECT * FROM ngo_operating_areas WHERE id = ?').get(newId) as any;
      return {
        ...row,
        is_primary_depot: row.is_primary_depot === 1,
      };
    } catch (err: any) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        throw new AppError(
          'An operating area with this scope already exists for this organization.',
          409,
          'RESOURCE_CONFLICT'
        );
      }
      throw err;
    }
  }

  function deleteOperatingArea(ngoId: string, areaId: number) {
    ensureActiveNgo(ngoId);

    const existing = db
      .prepare('SELECT id, ngo_id FROM ngo_operating_areas WHERE id = ? AND ngo_id = ?')
      .get(areaId, ngoId);

    if (!existing) {
      throw new AppError(`Operating area depot #${areaId} was not found for this NGO.`, 404, 'NOT_FOUND');
    }

    db.prepare('DELETE FROM ngo_operating_areas WHERE id = ? AND ngo_id = ?').run(areaId, ngoId);
    return { id: areaId, deleted: true, ngo_id: ngoId };
  }

  /**
   * 8. Capabilities: Full replacement semantics.
   */
  function getCapabilities(ngoId: string) {
    ensureActiveNgo(ngoId);
    const rows = db.prepare(`
      SELECT nc.*, c.name, c.category, c.description
      FROM ngo_capabilities nc
      JOIN capabilities c ON nc.capability_id = c.id
      WHERE nc.ngo_id = ?
      ORDER BY c.name ASC
    `).all(ngoId) as any[];

    return rows.map(r => ({
      ...r,
      is_verified: r.is_verified === 1,
    }));
  }

  function syncCapabilities(ngoId: string, input: SyncCapabilitiesInput) {
    ensureActiveNgo(ngoId);

    // Verify all capability_id exist in catalog
    if (input.capabilities.length > 0) {
      const getCapStmt = db.prepare('SELECT id FROM capabilities WHERE id = ?');
      for (const item of input.capabilities) {
        if (!getCapStmt.get(item.capability_id)) {
          throw new AppError(
            `Capability '${item.capability_id}' does not exist in standard catalogue.`,
            422,
            'UNPROCESSABLE_ENTITY'
          );
        }
      }
    }

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM ngo_capabilities WHERE ngo_id = ?').run(ngoId);

      const insertStmt = db.prepare(`
        INSERT INTO ngo_capabilities (
          ngo_id, capability_id, certification_level, certified_by, certified_at, expires_at, is_verified
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of input.capabilities) {
        insertStmt.run(
          ngoId,
          item.capability_id,
          item.certification_level,
          item.certified_by || null,
          item.certified_at || null,
          item.expires_at || null,
          item.is_verified ? 1 : 0
        );
      }
    });

    tx();
    return getCapabilities(ngoId);
  }

  /**
   * 9. Equipment Inventory.
   */
  function getEquipment(
    ngoId: string,
    filters: { operating_area_id?: number; operational_condition?: string },
    isCoordinator: boolean
  ) {
    ensureActiveNgo(ngoId);

    const conditions: string[] = ['eq.ngo_id = :ngoId'];
    const params: Record<string, any> = { ngoId };

    if (filters.operating_area_id !== undefined) {
      conditions.push('eq.operating_area_id = :operating_area_id');
      params.operating_area_id = filters.operating_area_id;
    }

    if (filters.operational_condition) {
      conditions.push('eq.operational_condition = :operational_condition');
      params.operational_condition = filters.operational_condition;
    }

    const rows = db.prepare(`
      SELECT eq.*, ec.name as equipment_name, ec.category, ec.unit_of_measure, ec.is_critical,
             oa.depot_location_name as depot_name
      FROM ngo_equipment_inventory eq
      JOIN equipment_catalogue ec ON eq.equipment_type_id = ec.id
      LEFT JOIN ngo_operating_areas oa ON eq.operating_area_id = oa.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ec.name ASC
    `).all(params) as any[];

    return rows.map(r => ({
      ...r,
      is_simulated: r.is_simulated === 1,
      is_critical: r.is_critical === 1,
      storage_latitude: isCoordinator ? r.storage_latitude : null,
      storage_longitude: isCoordinator ? r.storage_longitude : null,
    }));
  }

  function createEquipment(ngoId: string, input: CreateEquipmentInput, isCoordinator: boolean) {
    const parentNgo = ensureActiveNgo(ngoId);

    // Verify equipment catalogue type exists
    const eqType = db.prepare('SELECT id FROM equipment_catalogue WHERE id = ?').get(input.equipment_type_id);
    if (!eqType) {
      throw new AppError(`Equipment type '${input.equipment_type_id}' does not exist in catalogue.`, 422, 'UNPROCESSABLE_ENTITY');
    }

    // Cross-depot ownership validation
    if (input.operating_area_id) {
      const area = db.prepare('SELECT id, ngo_id FROM ngo_operating_areas WHERE id = ?').get(input.operating_area_id) as any;
      if (!area || area.ngo_id !== ngoId) {
        throw new AppError(
          `Operating area depot ID ${input.operating_area_id} does not belong to this organization.`,
          422,
          'UNPROCESSABLE_ENTITY'
        );
      }
    }

    try {
      const result = db.prepare(`
        INSERT INTO ngo_equipment_inventory (
          ngo_id, equipment_type_id, operating_area_id, total_quantity, available_quantity, reserved_quantity,
          operational_condition, inspection_status, storage_location_name, storage_latitude, storage_longitude,
          last_inspected_at, is_simulated
        ) VALUES (
          :ngo_id, :equipment_type_id, :operating_area_id, :total_quantity, :available_quantity, :reserved_quantity,
          :operational_condition, :inspection_status, :storage_location_name, :storage_latitude, :storage_longitude,
          :last_inspected_at, :is_simulated
        )
      `).run({
        ngo_id: ngoId,
        equipment_type_id: input.equipment_type_id,
        operating_area_id: input.operating_area_id ?? null,
        total_quantity: input.total_quantity,
        available_quantity: input.available_quantity,
        reserved_quantity: input.reserved_quantity,
        operational_condition: input.operational_condition,
        inspection_status: input.inspection_status,
        storage_location_name: input.storage_location_name || null,
        storage_latitude: input.storage_latitude ?? null,
        storage_longitude: input.storage_longitude ?? null,
        last_inspected_at: input.last_inspected_at || null,
        is_simulated: parentNgo.is_simulated,
      });

      const row = db.prepare('SELECT * FROM ngo_equipment_inventory WHERE id = ?').get(result.lastInsertRowid) as any;
      return {
        ...row,
        storage_latitude: isCoordinator ? row.storage_latitude : null,
        storage_longitude: isCoordinator ? row.storage_longitude : null,
      };
    } catch (err: any) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        throw new AppError('An inventory record for this equipment, depot, and condition already exists.', 409, 'RESOURCE_CONFLICT');
      }
      throw err;
    }
  }

  function patchEquipment(ngoId: string, equipmentId: number, patch: PatchEquipmentInput, isCoordinator: boolean) {
    ensureActiveNgo(ngoId);

    const existing = db
      .prepare('SELECT * FROM ngo_equipment_inventory WHERE id = ? AND ngo_id = ?')
      .get(equipmentId, ngoId) as any;

    if (!existing) {
      throw new AppError(`Equipment record #${equipmentId} was not found for this NGO.`, 404, 'NOT_FOUND');
    }

    // Merge existing values with patch
    const merged = {
      equipment_type_id: patch.equipment_type_id ?? existing.equipment_type_id,
      operating_area_id: patch.operating_area_id !== undefined ? patch.operating_area_id : existing.operating_area_id,
      total_quantity: patch.total_quantity ?? existing.total_quantity,
      available_quantity: patch.available_quantity ?? existing.available_quantity,
      reserved_quantity: patch.reserved_quantity ?? existing.reserved_quantity,
      operational_condition: patch.operational_condition ?? existing.operational_condition,
      inspection_status: patch.inspection_status ?? existing.inspection_status,
      storage_location_name: patch.storage_location_name !== undefined ? patch.storage_location_name : existing.storage_location_name,
      storage_latitude: patch.storage_latitude !== undefined ? patch.storage_latitude : existing.storage_latitude,
      storage_longitude: patch.storage_longitude !== undefined ? patch.storage_longitude : existing.storage_longitude,
      last_inspected_at: patch.last_inspected_at !== undefined ? patch.last_inspected_at : existing.last_inspected_at,
    };

    // Merged balance validation
    if (merged.available_quantity + merged.reserved_quantity > merged.total_quantity) {
      throw new AppError(
        `Quantity balance violation: available (${merged.available_quantity}) + reserved (${merged.reserved_quantity}) exceeds total (${merged.total_quantity}).`,
        400,
        'BAD_REQUEST'
      );
    }

    // Merged condition availability validation
    if (merged.operational_condition !== 'SERVICEABLE' && merged.available_quantity > 0) {
      throw new AppError(
        `Non-serviceable equipment with condition '${merged.operational_condition}' must have available_quantity equal to 0.`,
        400,
        'BAD_REQUEST'
      );
    }

    // Cross-depot ownership validation if changed
    if (merged.operating_area_id) {
      const area = db.prepare('SELECT id, ngo_id FROM ngo_operating_areas WHERE id = ?').get(merged.operating_area_id) as any;
      if (!area || area.ngo_id !== ngoId) {
        throw new AppError(`Operating area depot ID ${merged.operating_area_id} does not belong to this organization.`, 422, 'UNPROCESSABLE_ENTITY');
      }
    }

    try {
      db.prepare(`
        UPDATE ngo_equipment_inventory
        SET equipment_type_id = :equipment_type_id,
            operating_area_id = :operating_area_id,
            total_quantity = :total_quantity,
            available_quantity = :available_quantity,
            reserved_quantity = :reserved_quantity,
            operational_condition = :operational_condition,
            inspection_status = :inspection_status,
            storage_location_name = :storage_location_name,
            storage_latitude = :storage_latitude,
            storage_longitude = :storage_longitude,
            last_inspected_at = :last_inspected_at,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = :id AND ngo_id = :ngo_id
      `).run({
        id: equipmentId,
        ngo_id: ngoId,
        ...merged,
      });

      const updated = db.prepare('SELECT * FROM ngo_equipment_inventory WHERE id = ?').get(equipmentId) as any;
      return {
        ...updated,
        storage_latitude: isCoordinator ? updated.storage_latitude : null,
        storage_longitude: isCoordinator ? updated.storage_longitude : null,
      };
    } catch (err: any) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        throw new AppError('An inventory record for this equipment, depot, and condition already exists.', 409, 'RESOURCE_CONFLICT');
      }
      throw err;
    }
  }

  function deleteEquipment(ngoId: string, equipmentId: number) {
    ensureActiveNgo(ngoId);

    const existing = db
      .prepare('SELECT id, ngo_id FROM ngo_equipment_inventory WHERE id = ? AND ngo_id = ?')
      .get(equipmentId, ngoId);

    if (!existing) {
      throw new AppError(`Equipment record #${equipmentId} was not found for this NGO.`, 404, 'NOT_FOUND');
    }

    db.prepare('DELETE FROM ngo_equipment_inventory WHERE id = ? AND ngo_id = ?').run(equipmentId, ngoId);
    return { id: equipmentId, deleted: true, ngo_id: ngoId };
  }

  function getCapabilityCatalog() {
    return db
      .prepare('SELECT id, name, category, description FROM capabilities ORDER BY category, name ASC')
      .all();
  }

  function getEquipmentCatalog() {
    const rows = db
      .prepare('SELECT id, name, category, description, unit_of_measure, is_critical FROM equipment_catalogue ORDER BY category, name ASC')
      .all() as any[];
    return rows.map(r => ({
      ...r,
      is_critical: r.is_critical === 1,
    }));
  }

  /**
   * 10. Availability & Time-Sensitive Check-Ins.
   */
  function getAvailability(ngoId: string, isCoordinator: boolean) {
    ensureActiveNgo(ngoId);

    const logs = db.prepare(`
      SELECT * FROM ngo_availability_logs
      WHERE ngo_id = ?
      ORDER BY checkin_timestamp DESC, id DESC
      LIMIT 10
    `).all(ngoId) as any[];

    const latest = logs[0] || null;
    let freshness: FreshnessStatus = 'STALE';
    let hoursSince = 0;

    if (latest) {
      freshness = calculateFreshness(latest.checkin_timestamp, latest.status, latest.valid_until);
      hoursSince = Math.max(0, (Date.now() - new Date(latest.checkin_timestamp).getTime()) / (1000 * 60 * 60));
    }

    return {
      current_status: latest ? latest.status : 'INACTIVE_STALE',
      freshness,
      hours_since_checkin: Math.round(hoursSince * 10) / 10,
      available_personnel_count: latest ? latest.available_personnel_count : 0,
      certified_helmsmen_count: latest ? latest.certified_helmsmen_count : 0,
      reporting_person_name: isCoordinator && latest ? latest.reporting_person_name : null,
      reporting_person_phone: isCoordinator && latest ? latest.reporting_person_phone : null,
      operational_notes: isCoordinator && latest ? latest.operational_notes : null,
      checkin_timestamp: latest ? latest.checkin_timestamp : null,
      valid_until: latest ? latest.valid_until : null,
      history: logs.map(l => ({
        id: l.id,
        status: l.status,
        available_personnel_count: l.available_personnel_count,
        certified_helmsmen_count: l.certified_helmsmen_count,
        checkin_timestamp: l.checkin_timestamp,
        valid_until: l.valid_until,
        operational_notes: isCoordinator ? l.operational_notes : null,
      })),
    };
  }

  function postAvailabilityCheckin(
    ngoId: string,
    input: PostAvailabilityCheckinInput,
    actorUser: AuthUser
  ) {
    const parentNgo = ensureActiveNgo(ngoId);

    // Volunteer Arbitrary NGO Protection:
    // Only coordinators or admins can submit check-ins until user-to-NGO binding is implemented.
    if (actorUser.role !== 'coordinator' && actorUser.role !== 'admin') {
      throw new AppError(
        'Volunteer account is not verified as a designated representative of this organization.',
        403,
        'FORBIDDEN'
      );
    }

    const result = db.prepare(`
      INSERT INTO ngo_availability_logs (
        ngo_id, status, available_personnel_count, certified_helmsmen_count,
        reporting_person_name, reporting_person_phone, operational_notes, valid_until,
        recorded_by, is_simulated
      ) VALUES (
        :ngo_id, :status, :available_personnel_count, :certified_helmsmen_count,
        :reporting_person_name, :reporting_person_phone, :operational_notes, :valid_until,
        :recorded_by, :is_simulated
      )
    `).run({
      ngo_id: ngoId,
      status: input.status,
      available_personnel_count: input.available_personnel_count,
      certified_helmsmen_count: input.certified_helmsmen_count,
      reporting_person_name: input.reporting_person_name,
      reporting_person_phone: input.reporting_person_phone,
      operational_notes: input.operational_notes || null,
      valid_until: input.valid_until || null,
      recorded_by: actorUser.id,
      is_simulated: parentNgo.is_simulated,
    });

    const newLog = db.prepare('SELECT * FROM ngo_availability_logs WHERE id = ?').get(result.lastInsertRowid) as any;
    const freshness = calculateFreshness(newLog.checkin_timestamp, newLog.status, newLog.valid_until);

    return {
      ...newLog,
      freshness,
    };
  }

  /**
   * 11. Soft Delete NGO Profile.
   * Sets deleted_at = now(). Leaves child logs intact.
   */
  function softDeleteNgo(ngoId: string, _actorId: number) {
    ensureActiveNgo(ngoId);

    db.prepare(`
      UPDATE ngos
      SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND deleted_at IS NULL
    `).run(ngoId);

    return {
      id: ngoId,
      deleted_at: new Date().toISOString(),
      message: 'NGO profile successfully archived. Historical availability and equipment logs preserved.',
    };
  }

  return {
    getNgos,
    getNgoById,
    createNgo,
    getVerifications,
    addVerification,
    promoteToOperational,
    getOperatingAreas,
    createOperatingArea,
    deleteOperatingArea,
    getCapabilities,
    syncCapabilities,
    getCapabilityCatalog,
    getEquipment,
    createEquipment,
    patchEquipment,
    deleteEquipment,
    getEquipmentCatalog,
    getAvailability,
    postAvailabilityCheckin,
    softDeleteNgo,
  };
}

