export type IncidentEventType =
  | 'CREATED'
  | 'VERIFIED'
  | 'REJECTED'
  | 'SEVERITY_UPDATED'
  | 'RESOURCE_ASSIGNED'
  | 'RESOURCE_DISPATCHED'
  | 'RESOURCE_DELIVERED'
  | 'RESOURCE_RETURNED'
  | 'ASSIGNMENT_CANCELLED'
  | 'DUPLICATE_FLAGGED'
  | 'DUPLICATE_RESOLVED'
  | 'STATUS_RESOLVED'
  | 'INCIDENT_ARCHIVED';

export interface IncidentEvent {
  id: number;
  incident_id: number;
  actor_id: number | null;
  actor_name?: string;
  actor_role?: string;
  event_type: IncidentEventType;
  payload?: any;
  created_at: string;
}

