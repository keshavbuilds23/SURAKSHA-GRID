export type DuplicateStatus = 'SUGGESTED' | 'DISMISSED' | 'MERGED';

export interface DuplicateCandidate {
  duplicate_pair_id: number;
  primary_incident_id: number;
  candidate_incident_id: number;
  candidate_title: string;
  candidate_description?: string;
  candidate_severity?: string;
  candidate_category?: string;
  candidate_affected_count?: number;
  candidate_landmark?: string;
  distance_meters: number;
  time_delta_seconds: number;
  status: DuplicateStatus;
  reviewed_by?: number | null;
  reviewed_at?: string | null;
  created_at: string;
}

