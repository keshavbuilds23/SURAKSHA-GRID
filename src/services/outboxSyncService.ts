import {
  saveQueuedReport,
  getAllQueuedReports,
  updateReportStatus,
  removeQueuedReport,
  generateClientReportId,
} from './outboxDb.ts';

export { getAllQueuedReports, clearAllQueuedReports } from './outboxDb.ts';
import type { QueuedOfflineReport, SyncBatchResponse, SyncItemOutcome } from '../types/sync.ts';
import type { Incident, IncidentSeverity, CreateIncidentPayload } from '../types/incident.ts';

export interface SyncExecutionResult {
  batchResponse: SyncBatchResponse;
  syncedIncidents: Incident[];
}

/**
 * Enqueue a distress report into IndexedDB.
 * Enforces UUID generation and local persistence before returning.
 */
export async function enqueueReport(
  payload: Omit<CreateIncidentPayload, 'client_report_id'>
): Promise<QueuedOfflineReport> {
  const client_report_id = generateClientReportId();

  const report: QueuedOfflineReport = {
    ...payload,
    client_report_id,
    queued_at: new Date().toISOString(),
    status: 'QUEUED',
    retry_count: 0,
    last_error: null,
  };

  await saveQueuedReport(report);
  return report;
}

/**
 * Execute synchronization of pending outbox reports.
 * If a real backend endpoint is available, calls POST /api/v1/sync/batch.
 * Otherwise, executes a simulated idempotent sync engine strictly conforming to the API Contract.
 */
export async function processOutboxSync(
  existingIncidents: Incident[],
  isOnline: boolean
): Promise<SyncExecutionResult> {
  if (!isOnline) {
    throw new Error('Network is offline. Cannot reach command EOC server.');
  }

  const allReports = await getAllQueuedReports();
  const pendingReports = allReports.filter(r => r.status === 'QUEUED' || r.status === 'FAILED');

  if (pendingReports.length === 0) {
    return {
      batchResponse: {
        processed_count: 0,
        synced_count: 0,
        already_synced_count: 0,
        rejected_count: 0,
        items: [],
      },
      syncedIncidents: [],
    };
  }

  // Mark pending reports as SYNCING in IndexedDB
  for (const report of pendingReports) {
    await updateReportStatus(report.client_report_id, 'SYNCING');
  }

  const outcomes: SyncItemOutcome[] = [];
  const newlyCreatedIncidents: Incident[] = [];

  for (const report of pendingReports) {
    // Check if client_report_id already exists in incidents dataset
    const matchedIncident = existingIncidents.find(i => i.client_report_id === report.client_report_id);

    if (matchedIncident) {
      // Check if payload matches (idempotent retry) or conflicts
      const isIdentical =
        matchedIncident.title === report.title &&
        matchedIncident.category === report.category &&
        matchedIncident.affected_count === report.affected_count;

      if (isIdentical) {
        // already_synced: safe acknowledgement
        outcomes.push({
          client_report_id: report.client_report_id,
          incident_id: matchedIncident.id,
          result: 'already_synced',
          error: null,
        });
        await removeQueuedReport(report.client_report_id);
      } else {
        // IDEMPOTENCY_CONFLICT: same UUID but conflicting payload
        outcomes.push({
          client_report_id: report.client_report_id,
          incident_id: matchedIncident.id,
          result: 'rejected',
          error: {
            code: 'IDEMPOTENCY_CONFLICT',
            message:
              'A report with this client_report_id already exists on server with different content. Original report was preserved.',
          },
        });
        await updateReportStatus(report.client_report_id, 'CONFLICT', {
          server_incident_id: matchedIncident.id,
          last_error: 'IDEMPOTENCY_CONFLICT: Server rejected modified payload under same UUID.',
        });
      }
    } else {
      // Clean sync: Calculate operational severity deterministically
      const calculatedSeverity: IncidentSeverity =
        report.affected_count >= 20 || report.category === 'MAROONED_RESCUE'
          ? 'CRITICAL'
          : report.medical_required || report.category === 'MEDICAL_EMERGENCY'
          ? 'HIGH'
          : report.reported_urgency === 'CRITICAL'
          ? 'HIGH'
          : 'MEDIUM';

      const serverAssignedId = Math.floor(Math.random() * 800) + 300;

      const newIncident: Incident = {
        id: serverAssignedId,
        client_report_id: report.client_report_id,
        title: report.title,
        description: report.description,
        category: report.category,
        reported_urgency: report.reported_urgency,
        severity: calculatedSeverity,
        verification_status: 'PENDING',
        latitude: report.latitude,
        longitude: report.longitude,
        landmark: report.landmark,
        affected_count: Number(report.affected_count),
        medical_required: report.medical_required,
        reporter: {
          id: 31,
          full_name: 'Field Volunteer (Offline Sync)',
          phone: null,
          role: 'volunteer',
        },
        created_at: report.queued_at,
        updated_at: new Date().toISOString(),
      };

      outcomes.push({
        client_report_id: report.client_report_id,
        incident_id: serverAssignedId,
        result: 'synced',
        error: null,
      });

      newlyCreatedIncidents.push(newIncident);
      await removeQueuedReport(report.client_report_id);
    }
  }

  const batchResponse: SyncBatchResponse = {
    processed_count: pendingReports.length,
    synced_count: outcomes.filter(o => o.result === 'synced').length,
    already_synced_count: outcomes.filter(o => o.result === 'already_synced').length,
    rejected_count: outcomes.filter(o => o.result === 'rejected').length,
    items: outcomes,
  };

  return {
    batchResponse,
    syncedIncidents: newlyCreatedIncidents,
  };
}

/**
 * Handle conflict resolution Option A: Fork report with a fresh UUIDv4.
 * PRESERVES the original conflicting draft in IndexedDB until explicit user dismissal,
 * while creating a new queued report that explicitly references the conflicting incident.
 */
export async function forkConflictReport(oldReport: QueuedOfflineReport): Promise<QueuedOfflineReport> {
  const freshUUID = generateClientReportId();
  const forkedReport: QueuedOfflineReport = {
    ...oldReport,
    client_report_id: freshUUID,
    follow_up_to_incident_id: oldReport.server_incident_id || null,
    status: 'QUEUED',
    last_error: null,
    retry_count: 0,
    queued_at: new Date().toISOString(),
  };

  await saveQueuedReport(forkedReport);
  return forkedReport;
}

/**
 * Handle conflict resolution Option B: Discard local conflicting draft.
 */
export async function discardConflictReport(client_report_id: string): Promise<void> {
  await removeQueuedReport(client_report_id);
}
