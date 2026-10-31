export type IncidentCategory =
  | 'MAROONED_RESCUE'
  | 'MEDICAL_EMERGENCY'
  | 'FOOD_WATER_CRISIS'
  | 'INFRASTRUCTURE_BREACH'
  | 'GENERAL_RELIEF';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'RESOLVED';

export type ReportedUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ReporterSummary {
  id: number | null;
  full_name: string;
  phone: string | null;
  role: 'citizen' | 'volunteer' | 'coordinator' | 'admin';
}

export interface CoordinatorVerification {
  id: number;
  full_name: string;
}

export interface Incident {
  id: number;
  client_report_id: string;
  title: string;
  description: string;
  category: IncidentCategory;
  reported_urgency?: ReportedUrgency | null;
  severity: IncidentSeverity;
  verification_status: VerificationStatus;
  latitude: number | null;
  longitude: number | null;
  landmark: string;
  affected_count: number;
  reporter?: ReporterSummary | null;
  verified_by?: CoordinatorVerification | null;
  verified_at?: string | null;
  verification_notes?: string | null;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
  // UI helpers
  medical_required?: boolean;
  follow_up_to_incident_id?: number | null;
}

export interface CreateIncidentPayload {
  client_report_id: string;
  title: string;
  description: string;
  category: IncidentCategory;
  reported_urgency?: ReportedUrgency;
  latitude: number | null;
  longitude: number | null;
  landmark: string;
  affected_count: number;
  medical_required?: boolean;
  follow_up_to_incident_id?: number | null;
}

export interface PublicIncidentDTO {
  id: number;
  category: IncidentCategory;
  severity: IncidentSeverity;
  verification_status: VerificationStatus;
  approximate_latitude: number | null;
  approximate_longitude: number | null;
  general_area: string;
  affected_count: number;
  created_at: string;
}

