import Database from 'better-sqlite3';
import {
  CreateIncidentInput,
  QueryIncidentsInput,
  VerifyIncidentInput,
} from '../validators/incidentValidators.js';
import { AppError } from '../types/index.js';
import { AuthUser } from '../middleware/authMiddleware.js';

export interface IncidentRecord {
  id: number;
  client_report_id: string;
  title: string;
  description: string;
  category: string;
  reported_urgency: string | null;
  severity: string;
  verification_status: string;
  latitude: number | null;
  longitude: number | null;
  landmark: string;
  affected_count: number;
  reporter?: {
    id: number | null;
    full_name: string;
    phone: string | null;
    role: string;
  } | null;
  verified_by?: {
    id: number;
    full_name: string;
  } | null;
  verified_at?: string | null;
  verification_notes?: string | null;
  created_at: string;
  updated_at: string;
  events?: Array<{
    id: number;
    incident_id: number;
    actor_id: number | null;
    event_type: string;
    payload: string | null;
    created_at: string;
  }>;
}

export interface SyncItemOutcome {
  client_report_id: string;
  incident_id: number | null;
  result: 'synced' | 'already_synced' | 'rejected';
  error?: {
    code: string;
    message: string;
  } | null;
}

export interface SyncBatchResponse {
  processed_count: number;
  synced_count: number;
  already_synced_count: number;
  rejected_count: number;
  items: SyncItemOutcome[];
}

/**
 * Deterministically calculates severity based on flood rescue rules.
 */
export function calculateSeverity(payload: {
  category: string;
  affected_count: number;
  medical_required?: boolean;
  reported_urgency?: string | null;
}): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (payload.affected_count >= 20 || payload.category === 'MAROONED_RESCUE') {
    return 'CRITICAL';
  }
  if (payload.medical_required || payload.category === 'MEDICAL_EMERGENCY') {
    return 'HIGH';
  }
  if (payload.reported_urgency === 'CRITICAL' || payload.reported_urgency === 'HIGH') {
    return 'HIGH';
  }
  if (payload.reported_urgency === 'LOW') {
    return 'LOW';
  }
  return 'MEDIUM';
}

/**
 * Checks if incoming report matches existing report under the same UUID.
 */
function isPayloadIdentical(existing: any, incoming: CreateIncidentInput): boolean {
  return (
    existing.title === incoming.title &&
    existing.category === incoming.category &&
    existing.landmark === incoming.landmark &&
    Number(existing.affected_count) === Number(incoming.affected_count)
  );
}

/**
 * Formats a raw SQLite incident row into a clean IncidentRecord.
 * Implements field-level data privacy: masks private personal contact phone
 * numbers for unauthenticated public viewers while preserving operational details for staff.
 */
function formatIncidentRow(
  row: any,
  db?: Database.Database,
  isStaff: boolean = false
): IncidentRecord {
  let verificationNotes: string | null = null;
  if (row.verified_at && db) {
    try {
      const latestVerifyEvent = db
        .prepare(
          `SELECT payload FROM incident_events WHERE incident_id = ? AND event_type IN ('VERIFIED', 'REJECTED') ORDER BY created_at DESC LIMIT 1`
        )
        .get(row.id) as { payload?: string } | undefined;
      if (latestVerifyEvent?.payload) {
        try {
          const parsed = JSON.parse(latestVerifyEvent.payload);
          verificationNotes = parsed.notes || latestVerifyEvent.payload;
        } catch {
          verificationNotes = latestVerifyEvent.payload;
        }
      }
    } catch {
      // Ignore event lookup failure
    }
  }

  return {
    id: row.id,
    client_report_id: row.client_report_id,
    title: row.title,
    description: row.description,
    category: row.category,
    reported_urgency: row.reported_urgency || null,
    severity: row.severity,
    verification_status: row.verification_status,
    latitude: row.latitude !== null ? Number(row.latitude) : null,
    longitude: row.longitude !== null ? Number(row.longitude) : null,
    landmark: row.landmark,
    affected_count: Number(row.affected_count),
    reporter: row.reporter_id
      ? {
          id: row.reporter_id,
          full_name: row.reporter_name || 'Field Reporter',
          // Mask private phone number for public viewers to prevent contact harvesting
          phone: isStaff ? (row.reporter_phone || null) : null,
          role: row.reporter_role || 'volunteer',
        }
      : null,
    verified_by: row.verified_by
      ? {
          id: row.verified_by,
          full_name: row.verified_by_name || 'EOC Coordinator',
        }
      : null,
    verified_at: row.verified_at || null,
    verification_notes: verificationNotes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Ingests a new single incident with strict idempotency and audit trail creation.
 */
export function createIncident(
  db: Database.Database,
  input: CreateIncidentInput,
  reporterId: number | null = null
): { incident: IncidentRecord; isExisting: boolean } {
  // 1. Idempotency check: see if client_report_id already exists
  const existing = db
    .prepare(
      `SELECT i.*, u.full_name as reporter_name, u.phone as reporter_phone, u.role as reporter_role,
              v.full_name as verified_by_name
       FROM incidents i
       LEFT JOIN users u ON i.reporter_id = u.id
       LEFT JOIN users v ON i.verified_by = v.id
       WHERE i.client_report_id = ?`
    )
    .get(input.client_report_id) as any;

  if (existing) {
    if (isPayloadIdentical(existing, input)) {
      return {
        incident: formatIncidentRow(existing, db),
        isExisting: true,
      };
    }
    throw new AppError(
      `A report with client_report_id "${input.client_report_id}" already exists with different content. Idempotency conflict.`,
      409,
      'IDEMPOTENCY_CONFLICT'
    );
  }

  // 2. Insert new incident in a transaction
  const severity = calculateSeverity({
    category: input.category,
    affected_count: input.affected_count,
    medical_required: input.medical_required,
    reported_urgency: input.reported_urgency,
  });

  const now = new Date().toISOString();

  const insertTransaction = db.transaction(() => {
    const insertIncident = db.prepare(`
      INSERT INTO incidents (
        client_report_id,
        reporter_id,
        title,
        description,
        category,
        reported_urgency,
        severity,
        verification_status,
        latitude,
        longitude,
        landmark,
        affected_count,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?)
    `);

    const result = insertIncident.run(
      input.client_report_id,
      reporterId,
      input.title,
      input.description,
      input.category,
      input.reported_urgency || null,
      severity,
      input.latitude ?? null,
      input.longitude ?? null,
      input.landmark,
      input.affected_count,
      now,
      now
    );

    const newIncidentId = Number(result.lastInsertRowid);

    // Record audit event in incident_events
    const insertEvent = db.prepare(`
      INSERT INTO incident_events (
        incident_id,
        actor_id,
        event_type,
        payload,
        created_at
      ) VALUES (?, ?, 'CREATED', ?, ?)
    `);

    insertEvent.run(
      newIncidentId,
      reporterId,
      JSON.stringify({
        source: 'http_api',
        client_report_id: input.client_report_id,
        medical_required: input.medical_required ?? false,
      }),
      now
    );

    return newIncidentId;
  });

  const newId = insertTransaction();

  const createdRow = db
    .prepare(
      `SELECT i.*, u.full_name as reporter_name, u.phone as reporter_phone, u.role as reporter_role,
              v.full_name as verified_by_name
       FROM incidents i
       LEFT JOIN users u ON i.reporter_id = u.id
       LEFT JOIN users v ON i.verified_by = v.id
       WHERE i.id = ?`
    )
    .get(newId) as any;

  return {
    incident: formatIncidentRow(createdRow, db),
    isExisting: false,
  };
}

/**
 * Lists incidents with filtering, pagination, and role-based data redaction.
 */
export function getIncidents(
  db: Database.Database,
  query: QueryIncidentsInput,
  isStaff: boolean = false
): {
  incidents: IncidentRecord[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
} {
  const whereClauses: string[] = ['i.deleted_at IS NULL'];
  const params: any[] = [];

  if (query.category) {
    whereClauses.push('i.category = ?');
    params.push(query.category);
  }

  if (query.severity) {
    whereClauses.push('i.severity = ?');
    params.push(query.severity);
  }

  if (query.verification_status) {
    whereClauses.push('i.verification_status = ?');
    params.push(query.verification_status);
  }

  if (query.search) {
    whereClauses.push('(i.title LIKE ? OR i.landmark LIKE ? OR i.description LIKE ?)');
    const searchTerm = `%${query.search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Count total records matching filter
  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM incidents i ${whereSql}`)
    .get(...params) as { count: number };
  const total = countRow ? countRow.count : 0;

  const offset = (query.page - 1) * query.limit;
  const listParams = [...params, query.limit, offset];

  const rows = db
    .prepare(
      `SELECT i.*, u.full_name as reporter_name, u.phone as reporter_phone, u.role as reporter_role,
              v.full_name as verified_by_name
       FROM incidents i
       LEFT JOIN users u ON i.reporter_id = u.id
       LEFT JOIN users v ON i.verified_by = v.id
       ${whereSql}
       ORDER BY i.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...listParams) as any[];

  const incidents = rows.map(r => formatIncidentRow(r, db, isStaff));

  return {
    incidents,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      total_pages: total === 0 ? 1 : Math.ceil(total / query.limit),
    },
  };
}

/**
 * Retrieves a single incident by ID with its chronological event history and role-based data redaction.
 */
export function getIncidentById(
  db: Database.Database,
  id: number,
  isStaff: boolean = false
): IncidentRecord {
  const row = db
    .prepare(
      `SELECT i.*, u.full_name as reporter_name, u.phone as reporter_phone, u.role as reporter_role,
              v.full_name as verified_by_name
       FROM incidents i
       LEFT JOIN users u ON i.reporter_id = u.id
       LEFT JOIN users v ON i.verified_by = v.id
       WHERE i.id = ? AND i.deleted_at IS NULL`
    )
    .get(id) as any;

  if (!row) {
    throw new AppError(`Incident with ID ${id} not found.`, 404, 'NOT_FOUND');
  }

  const events = db
    .prepare(
      `SELECT id, incident_id, actor_id, event_type, payload, created_at
       FROM incident_events
       WHERE incident_id = ?
       ORDER BY created_at ASC`
    )
    .all(id) as any[];

  const incident = formatIncidentRow(row, db, isStaff);
  incident.events = events;
  return incident;
}

/**
 * Verifies or rejects an incident under authorized coordinator actor.
 */
export function verifyIncident(
  db: Database.Database,
  id: number,
  verificationData: VerifyIncidentInput,
  actor: AuthUser
): IncidentRecord {
  const existing = db
    .prepare(`SELECT * FROM incidents WHERE id = ? AND deleted_at IS NULL`)
    .get(id) as any;

  if (!existing) {
    throw new AppError(`Incident with ID ${id} not found.`, 404, 'NOT_FOUND');
  }

  const now = new Date().toISOString();
  const newStatus = verificationData.verification_status;
  const eventType = newStatus === 'REJECTED' ? 'REJECTED' : 'VERIFIED';

  const verifyTransaction = db.transaction(() => {
    db.prepare(`
      UPDATE incidents
      SET verification_status = ?,
          verified_by = ?,
          verified_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(newStatus, actor.id, now, now, id);

    db.prepare(`
      INSERT INTO incident_events (
        incident_id,
        actor_id,
        event_type,
        payload,
        created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      id,
      actor.id,
      eventType,
      JSON.stringify({
        notes: verificationData.verification_notes,
        actor_name: actor.full_name,
        actor_role: actor.role,
      }),
      now
    );
  });

  verifyTransaction();

  const updated = db
    .prepare(
      `SELECT i.*, u.full_name as reporter_name, u.phone as reporter_phone, u.role as reporter_role,
              v.full_name as verified_by_name
       FROM incidents i
       LEFT JOIN users u ON i.reporter_id = u.id
       LEFT JOIN users v ON i.verified_by = v.id
       WHERE i.id = ?`
    )
    .get(id) as any;

  return formatIncidentRow(updated, db);
}

/**
 * Processes an array of queued offline reports with strict idempotency and per-item status.
 */
export function batchSync(
  db: Database.Database,
  reports: CreateIncidentInput[]
): SyncBatchResponse {
  const outcomes: SyncItemOutcome[] = [];

  for (const report of reports) {
    // 1. Check if client_report_id already exists in incidents table
    const existing = db
      .prepare(
        `SELECT id, title, category, landmark, affected_count, description
         FROM incidents
         WHERE client_report_id = ?`
      )
      .get(report.client_report_id) as any;

    if (existing) {
      if (isPayloadIdentical(existing, report)) {
        outcomes.push({
          client_report_id: report.client_report_id,
          incident_id: existing.id,
          result: 'already_synced',
          error: null,
        });
      } else {
        outcomes.push({
          client_report_id: report.client_report_id,
          incident_id: existing.id,
          result: 'rejected',
          error: {
            code: 'IDEMPOTENCY_CONFLICT',
            message:
              'A report with this client_report_id already exists on server with conflicting content. Existing report was preserved.',
          },
        });
      }
      continue;
    }

    // 2. Insert new incident in a transaction
    try {
      const severity = calculateSeverity({
        category: report.category,
        affected_count: report.affected_count,
        medical_required: report.medical_required,
        reported_urgency: report.reported_urgency,
      });

      const now = new Date().toISOString();

      const insertTx = db.transaction(() => {
        const res = db
          .prepare(
            `INSERT INTO incidents (
              client_report_id,
              reporter_id,
              title,
              description,
              category,
              reported_urgency,
              severity,
              verification_status,
              latitude,
              longitude,
              landmark,
              affected_count,
              created_at,
              updated_at
            ) VALUES (?, NULL, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?)`
          )
          .run(
            report.client_report_id,
            report.title,
            report.description,
            report.category,
            report.reported_urgency || null,
            severity,
            report.latitude ?? null,
            report.longitude ?? null,
            report.landmark,
            report.affected_count,
            now,
            now
          );

        const newId = Number(res.lastInsertRowid);

        db.prepare(
          `INSERT INTO incident_events (
            incident_id,
            actor_id,
            event_type,
            payload,
            created_at
          ) VALUES (?, NULL, 'CREATED', ?, ?)`
        ).run(
          newId,
          JSON.stringify({
            source: 'sync_batch',
            client_report_id: report.client_report_id,
            medical_required: report.medical_required ?? false,
          }),
          now
        );

        return newId;
      });

      const insertedId = insertTx();

      outcomes.push({
        client_report_id: report.client_report_id,
        incident_id: insertedId,
        result: 'synced',
        error: null,
      });
    } catch (err: any) {
      outcomes.push({
        client_report_id: report.client_report_id,
        incident_id: null,
        result: 'rejected',
        error: {
          code: 'PERSISTENCE_FAILED',
          message: err.message || 'Failed to persist report into SQLite database.',
        },
      });
    }
  }

  return {
    processed_count: reports.length,
    synced_count: outcomes.filter(o => o.result === 'synced').length,
    already_synced_count: outcomes.filter(o => o.result === 'already_synced').length,
    rejected_count: outcomes.filter(o => o.result === 'rejected').length,
    items: outcomes,
  };
}

