import { DuplicateCandidate } from '../types/duplicate';

/**
 * Canonical Duplicate Candidate Pairs (primary_incident_id < candidate_incident_id)
 */
export const MOCK_DUPLICATES: DuplicateCandidate[] = [
  {
    duplicate_pair_id: 1,
    primary_incident_id: 101,
    candidate_incident_id: 108,
    candidate_title: 'Water rising near Kamalabari School ground',
    candidate_description: 'Water has reached boundary wall of Kamalabari School. Students and teachers on 2nd floor.',
    candidate_severity: 'HIGH',
    candidate_category: 'MAROONED_RESCUE',
    candidate_affected_count: 15,
    candidate_landmark: 'Behind Kamalabari High School Playground, Majuli',
    distance_meters: 114.2,
    time_delta_seconds: 1200, // 20 minutes apart
    status: 'SUGGESTED',
    created_at: '2026-10-31T08:50:00.000Z',
  },
];

