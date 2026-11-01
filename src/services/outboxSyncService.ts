import {
  saveQueuedReport,
  getAllQueuedReports,
  updateReportStatus,
  removeQueuedReport,
  generateClientReportId,
} from './outboxDb.ts';

export { getAllQueuedReports, clearAllQueuedReports } from './outboxDb.ts';
import type { QueuedOfflineReport, SyncBatchResponse } from '../types/sync.ts';
import type { Incident, CreateIncidentPayload } from '../types/incident.ts';
import { apiBatchSyncReports, apiGetIncidents } from './apiClient.ts';

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
 * Execute synchronization of pending outbox reports against the Express REST API.
 * 1. Online: sends batch payload to POST /api/v1/sync/batch.
 * 2. Unreachable/Offline: leaves reports safely buffered in IndexedDB without data loss.
 * 3. Confirmed server outcomes: removes successfully persisted items from IndexedDB.
 * 4. Idempotency conflicts: preserves draft in IndexedDB flagged with 'CONFLICT' status.
 * 5. Returns real persisted server incidents fetched from SQLite database.
 */
export async function processOutboxSync(
  _existingIncidents: Incident[],
  isOnline: boolean
): Promise<SyncExecutionResult> {
  if (!isOnline) {
    throw new Error('Network is offline. Cannot reach command EOC server on port 5000.');
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

  // 1. Mark pending reports as SYNCING in IndexedDB
  for (const report of pendingReports) {
    await updateReportStatus(report.client_report_id, 'SYNCING');
  }

  // 2. Transmit to real backend HTTP API
  const apiRes = await apiBatchSyncReports(pendingReports);

  // 3. Handle Network or Server Failure
  if (!apiRes.success || !apiRes.data) {
    const errorMsg =
      apiRes.error?.message || 'Server batch sync failed. Reports preserved in local outbox.';
    for (const report of pendingReports) {
      await updateReportStatus(report.client_report_id, 'FAILED', {
        last_error: errorMsg,
      });
    }
    throw new Error(errorMsg);
  }

  const batchResponse = apiRes.data;

  // 4. Update IndexedDB records based on server confirmed outcomes
  for (const outcome of batchResponse.items) {
    if (outcome.result === 'synced' || outcome.result === 'already_synced') {
      // Confirmed persisted in SQLite backend -> safe to delete from local outbox
      await removeQueuedReport(outcome.client_report_id);
    } else if (outcome.result === 'rejected') {
      // Conflicting payload under same UUID -> mark as CONFLICT for user recovery
      await updateReportStatus(outcome.client_report_id, 'CONFLICT', {
        server_incident_id: outcome.incident_id,
        last_error:
          outcome.error?.message ||
          'Sync rejected due to payload conflict with existing server incident.',
      });
    }
  }

  // 5. Fetch updated server incident list from SQLite database
  const serverIncidentsRes = await apiGetIncidents();
  const latestServerIncidents =
    serverIncidentsRes.success && serverIncidentsRes.data
      ? serverIncidentsRes.data
      : [];

  return {
    batchResponse,
    syncedIncidents: latestServerIncidents,
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
