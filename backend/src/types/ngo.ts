/**
 * NGO Network Module TypeScript Type Definitions
 * SURAKSHA GRID — Phase 4.3 Implementation
 */

export type VerificationDimension =
  | 'DOCUMENTED_IN_DDMP'
  | 'IDENTITY_VERIFIED'
  | 'CURRENTLY_OPERATIONAL'
  | 'AVAILABILITY_CONFIRMED'
  | 'EQUIPMENT_INDEPENDENTLY_VERIFIED';

export type OperationalCondition =
  | 'SERVICEABLE'
  | 'NEEDS_MAINTENANCE'
  | 'UNDER_REPAIR'
  | 'UNSERVICEABLE';

export type InspectionStatus =
  | 'SELF_REPORTED'
  | 'PHYSICALLY_INSPECTED'
  | 'AUDIT_EXPIRED';

export type AdministrativeScope =
  | 'STATE'
  | 'DISTRICT'
  | 'REVENUE_CIRCLE'
  | 'BLOCK'
  | 'GRAM_PANCHAYAT';

export type AvailabilityStatus =
  | 'ACTIVE_STANDBY'
  | 'DEPLOYED'
  | 'PARTIALLY_AVAILABLE'
  | 'UNAVAILABLE'
  | 'INACTIVE_STALE';

export type FreshnessStatus = 'FRESH' | 'AGING' | 'STALE';

export type CertificationLevel = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED' | 'SPECIALIST';

export interface NgoEntity {
  id: string;
  name: string;
  legal_name: string | null;
  registration_reference: string | null;
  description: string | null;
  primary_contact_name: string;
  primary_contact_phone: string;
  primary_contact_email: string | null;
  verification_status: VerificationDimension;
  is_simulated: number; // 0 or 1
  verified_by: number | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface NgoVerificationRecordEntity {
  id: number;
  ngo_id: string;
  dimension: VerificationDimension;
  is_verified: number; // 0 or 1
  verified_by: number | null;
  verified_at: string;
  valid_until: string | null;
  evidence_reference: string | null;
  notes: string | null;
  is_current: number; // 0 or 1
  created_at: string;
}

export interface NgoOperatingAreaEntity {
  id: number;
  ngo_id: string;
  state: string;
  district: string;
  revenue_circle: string | null;
  administrative_scope: AdministrativeScope;
  geographic_identifier: string | null;
  depot_location_name: string;
  depot_latitude: number | null;
  depot_longitude: number | null;
  is_primary_depot: number;
  created_at: string;
}

export interface NgoCapabilityEntity {
  id: number;
  ngo_id: string;
  capability_id: string;
  certification_level: CertificationLevel;
  certified_by: string | null;
  certified_at: string | null;
  expires_at: string | null;
  is_verified: number;
  created_at: string;
}

export interface NgoEquipmentInventoryEntity {
  id: number;
  ngo_id: string;
  equipment_type_id: string;
  operating_area_id: number | null;
  total_quantity: number;
  available_quantity: number;
  reserved_quantity: number;
  operational_condition: OperationalCondition;
  inspection_status: InspectionStatus;
  storage_location_name: string | null;
  storage_latitude: number | null;
  storage_longitude: number | null;
  last_inspected_at: string | null;
  inspected_by: number | null;
  is_simulated: number;
  created_at: string;
  updated_at: string;
}

export interface NgoAvailabilityLogEntity {
  id: number;
  ngo_id: string;
  status: AvailabilityStatus;
  available_personnel_count: number;
  certified_helmsmen_count: number;
  reporting_person_name: string;
  reporting_person_phone: string;
  operational_notes: string | null;
  checkin_timestamp: string;
  valid_until: string | null;
  recorded_by: number | null;
  is_simulated: number;
  created_at: string;
}

/** Public Redacted View */
export interface PublicNgoSummary {
  id: string;
  name: string;
  legal_name: string | null;
  registration_reference: string | null;
  description: string | null;
  primary_contact_name: null;
  primary_contact_phone: null;
  primary_contact_email: null;
  active_verification_dimensions: VerificationDimension[];
  operating_coverage: {
    district: string;
    revenue_circle: string | null;
    depot_name: string;
  }[];
  availability_summary: {
    status: AvailabilityStatus;
    freshness: FreshnessStatus;
    hours_since_checkin: number;
  } | null;
  is_simulated: boolean;
  created_at: string;
}

/** Authenticated Coordinator Full View */
export interface CoordinatorNgoDetail extends Omit<PublicNgoSummary, 'primary_contact_name' | 'primary_contact_phone' | 'primary_contact_email'> {
  primary_contact_name: string;
  primary_contact_phone: string;
  primary_contact_email: string | null;
  verifications: any[];
  depots: any[];
  capabilities: {
    capability_id: string;
    name: string;
    category: string;
    certification_level: CertificationLevel;
    certified_by: string | null;
    certified_at: string | null;
    expires_at: string | null;
    is_verified: boolean;
  }[];
  equipment: {
    id: number;
    equipment_type_id: string;
    equipment_name: string;
    category: string;
    operating_area_id: number | null;
    depot_name: string | null;
    total_quantity: number;
    available_quantity: number;
    reserved_quantity: number;
    operational_condition: OperationalCondition;
    inspection_status: InspectionStatus;
    last_inspected_at: string | null;
    storage_location_name: string | null;
    storage_latitude: number | null;
    storage_longitude: number | null;
  }[];
  latest_availability: (NgoAvailabilityLogEntity & {
    freshness: FreshnessStatus;
    hours_since_checkin: number;
  }) | null;
}

/** Public Redacted View for Single Dossier */
export interface PublicNgoDetail extends PublicNgoSummary {
  verifications: any[];
  depots: any[];
  capabilities: any[];
  equipment: any[];
}

