import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { QueuedOfflineReport, OfflineQueueStatus } from '../types/sync.ts';

export interface SurakshaDB extends DBSchema {
  offline_reports: {
    key: string;
    value: QueuedOfflineReport;
    indexes: {
      by_status: OfflineQueueStatus;
      by_queued_at: string;
    };
  };
}

const DB_NAME = 'suraksha_grid_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'offline_reports';

let dbPromise: Promise<IDBPDatabase<SurakshaDB>> | null = null;

/**
 * Initialize or get singleton connection to the Suraksha Grid IndexedDB database.
 */
export async function getOutboxDB(): Promise<IDBPDatabase<SurakshaDB>> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    throw new Error('IndexedDB is not available in the current runtime environment.');
  }

  if (!dbPromise) {
    dbPromise = openDB<SurakshaDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'client_report_id',
          });
          store.createIndex('by_status', 'status');
          store.createIndex('by_queued_at', 'queued_at');
        }
      },
    });
  }

  return dbPromise;
}

/**
 * Standard RFC 4122 version 4 UUID generator.
 * Uses cryptographically secure random values when available.
 */
export function generateClientReportId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Persist an offline distress report to IndexedDB.
 * Prevents unintentional overwrites if an item with the same client_report_id already exists.
 */
export async function saveQueuedReport(report: QueuedOfflineReport): Promise<void> {
  const db = await getOutboxDB();
  const existing = await db.get(STORE_NAME, report.client_report_id);

  if (existing && existing.status !== 'CONFLICT') {
    // If it exists and status is already queued/syncing, verify idempotency
    const existingStr = JSON.stringify({
      title: existing.title,
      description: existing.description,
      landmark: existing.landmark,
      affected_count: existing.affected_count,
    });
    const newStr = JSON.stringify({
      title: report.title,
      description: report.description,
      landmark: report.landmark,
      affected_count: report.affected_count,
    });

    if (existingStr !== newStr) {
      // Idempotency conflict: mark conflict rather than overwriting original draft
      await db.put(STORE_NAME, {
        ...report,
        status: 'CONFLICT',
        last_error: 'IDEMPOTENCY_CONFLICT: Local payload differs from existing record for this UUID.',
      });
      return;
    }
  }

  await db.put(STORE_NAME, report);
}

/**
 * Fetch all queued offline reports from IndexedDB, ordered by queued_at.
 */
export async function getAllQueuedReports(): Promise<QueuedOfflineReport[]> {
  try {
    const db = await getOutboxDB();
    const reports = await db.getAllFromIndex(STORE_NAME, 'by_queued_at');
    return reports;
  } catch (error) {
    console.error('Failed to load queued reports from IndexedDB:', error);
    return [];
  }
}

/**
 * Retrieve a specific report by client_report_id.
 */
export async function getQueuedReport(client_report_id: string): Promise<QueuedOfflineReport | undefined> {
  const db = await getOutboxDB();
  return db.get(STORE_NAME, client_report_id);
}

/**
 * Update the status, error message, or retry details of an existing report.
 */
export async function updateReportStatus(
  client_report_id: string,
  status: OfflineQueueStatus,
  details?: Partial<QueuedOfflineReport>
): Promise<void> {
  const db = await getOutboxDB();
  const existing = await db.get(STORE_NAME, client_report_id);
  if (!existing) return;

  const updated: QueuedOfflineReport = {
    ...existing,
    ...details,
    status,
  };

  await db.put(STORE_NAME, updated);
}

/**
 * Remove an acknowledged or discarded report from IndexedDB.
 */
export async function removeQueuedReport(client_report_id: string): Promise<void> {
  const db = await getOutboxDB();
  await db.delete(STORE_NAME, client_report_id);
}

/**
 * Clear all outbox reports (e.g. for testing or factory reset).
 */
export async function clearAllQueuedReports(): Promise<void> {
  const db = await getOutboxDB();
  await db.clear(STORE_NAME);
}

