import { CreateIncidentPayload } from './incident';

export type OfflineQueueStatus = 'QUEUED' | 'SYNCING' | 'CONFLICT' | 'FAILED';

export interface QueuedOfflineReport extends CreateIncidentPayload {
  queued_at: string;
  status: OfflineQueueStatus;
  retry_count: number;
  last_error?: string | null;
  server_incident_id?: number | null;
}

export type SyncItemResult = 'synced' | 'already_synced' | 'rejected';

export interface SyncItemOutcome {
  client_report_id: string;
  incident_id: number | null;
  result: SyncItemResult;
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

