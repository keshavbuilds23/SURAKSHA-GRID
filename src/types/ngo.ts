export const ASSAM_DISTRICTS = [
  'Baksa', 'Barpeta', 'Biswanath', 'Bongaigaon', 'Cachar', 'Charaideo', 'Chirang',
  'Darrang', 'Dhemaji', 'Dhubri', 'Dibrugarh', 'Dima Hasao', 'Goalpara', 'Golaghat',
  'Hailakandi', 'Hojai', 'Jorhat', 'Kamrup', 'Kamrup Metropolitan', 'Karbi Anglong',
  'Karimganj', 'Kokrajhar', 'Lakhimpur', 'Majuli', 'Morigaon', 'Nagaon', 'Nalbari',
  'Sivasagar', 'Sonitpur', 'South Salmara-Mankachar', 'Tamulpur', 'Tinsukia',
  'Udalguri', 'West Karbi Anglong', 'Bajali'
] as const;

export type NgoDistrict = (typeof ASSAM_DISTRICTS)[number];

export type VerificationDimension =
  | 'DOCUMENTED_IN_DDMP'
  | 'IDENTITY_VERIFIED'
  | 'CURRENTLY_OPERATIONAL'
  | 'AVAILABILITY_CONFIRMED'
  | 'EQUIPMENT_INDEPENDENTLY_VERIFIED';

export const VERIFICATION_DIMENSIONS: {
  key: VerificationDimension;
  label: string;
  description: string;
}[] = [
  {
    key: 'DOCUMENTED_IN_DDMP',
    label: 'Documented in DDMP',
    description: 'Officially listed in the District Disaster Management Plan',
  },
  {
    key: 'IDENTITY_VERIFIED',
    label: 'Legal Identity Verified',
    description: 'Registration, 12A/80G, or Darpan portal credentials validated',
  },
  {
    key: 'CURRENTLY_OPERATIONAL',
    label: 'Currently Operational',
    description: 'Active field office and deployed teams in the disaster zone',
  },
  {
    key: 'AVAILABILITY_CONFIRMED',
    label: 'Availability Confirmed',
    description: 'Fresh check-in and standby readiness logged within 24 hours',
  },
  {
    key: 'EQUIPMENT_INDEPENDENTLY_VERIFIED',
    label: 'Equipment Inspected',
    description: 'Critical rescue boats, dewatering pumps, and gear verified on-site',
  },
];

export interface NgoOperatingCoverage {
  district: string;
  revenue_circle?: string;
  depot_name?: string;
}

export interface NgoAvailabilitySummary {
  status: string;
  freshness: 'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN';
  hours_since_checkin: number;
}

export interface NgoSummary {
  id: string;
  name: string;
  legal_name?: string | null;
  registration_reference?: string | null;
  description?: string | null;
  primary_contact_name?: string | null;
  primary_contact_phone?: string | null;
  primary_contact_email?: string | null;
  capabilities: string[];
  active_verification_dimensions: VerificationDimension[];
  operating_coverage: NgoOperatingCoverage[];
  availability_summary?: NgoAvailabilitySummary | null;
  is_simulated: boolean;
  created_at: string;
}

export interface NgoDepotDetail {
  id: number;
  district: string;
  revenue_circle?: string;
  sub_division?: string;
  administrative_scope: string;
  depot_name?: string;
  depot_location_name?: string;
  is_primary_depot: boolean;
  depot_latitude?: number | null;
  depot_longitude?: number | null;
  staging_capacity_desc?: string;
}

export interface NgoCapabilityDetail {
  capability_id: string;
  name: string;
  category: string;
  certification_level?: string;
  certified_by?: string;
  certified_at?: string;
  expires_at?: string;
  is_verified?: boolean;
}

export interface NgoEquipmentDetail {
  id: number;
  equipment_type_id?: string;
  equipment_name: string;
  category: string;
  operating_area_id?: number;
  depot_name?: string;
  total_quantity: number;
  available_quantity: number;
  reserved_quantity?: number;
  operational_condition: 'SERVICEABLE' | 'NEEDS_MAINTENANCE' | 'UNDER_REPAIR' | 'UNSERVICEABLE';
  inspection_status?: string;
  last_inspected_at?: string;
  storage_location_name?: string;
  storage_latitude?: number | null;
  storage_longitude?: number | null;
  is_simulated?: boolean;
  is_critical?: boolean;
}

export interface CapabilityCatalogueItem {
  id: string;
  name: string;
  category: string;
  description?: string;
}

export interface EquipmentCatalogueItem {
  id: string;
  name: string;
  category: string;
  description?: string;
  unit_of_measure: string;
  is_critical: boolean;
}

export interface CreateOperatingAreaPayload {
  state?: string;
  district: string;
  revenue_circle?: string;
  administrative_scope: 'STATE' | 'DISTRICT' | 'REVENUE_CIRCLE' | 'BLOCK' | 'GRAM_PANCHAYAT';
  geographic_identifier?: string;
  depot_location_name: string;
  depot_latitude?: number | null;
  depot_longitude?: number | null;
  is_primary_depot?: boolean;
}

export interface CreateEquipmentPayload {
  equipment_type_id: string;
  operating_area_id?: number | null;
  total_quantity: number;
  available_quantity: number;
  reserved_quantity?: number;
  operational_condition?: 'SERVICEABLE' | 'NEEDS_MAINTENANCE' | 'UNDER_REPAIR' | 'UNSERVICEABLE';
  inspection_status?: 'SELF_REPORTED' | 'PHYSICALLY_INSPECTED' | 'AUDIT_EXPIRED';
  storage_location_name?: string | null;
  storage_latitude?: number | null;
  storage_longitude?: number | null;
  last_inspected_at?: string | null;
}

export interface PatchEquipmentPayload {
  equipment_type_id?: string;
  operating_area_id?: number | null;
  total_quantity?: number;
  available_quantity?: number;
  reserved_quantity?: number;
  operational_condition?: 'SERVICEABLE' | 'NEEDS_MAINTENANCE' | 'UNDER_REPAIR' | 'UNSERVICEABLE';
  inspection_status?: 'SELF_REPORTED' | 'PHYSICALLY_INSPECTED' | 'AUDIT_EXPIRED';
  storage_location_name?: string | null;
  storage_latitude?: number | null;
  storage_longitude?: number | null;
  last_inspected_at?: string | null;
}

export interface SyncCapabilitiesPayload {
  capabilities: {
    capability_id: string;
    certification_level?: 'BASIC' | 'INTERMEDIATE' | 'ADVANCED' | 'SPECIALIST';
    certified_by?: string | null;
    certified_at?: string | null;
    expires_at?: string | null;
    is_verified?: boolean;
  }[];
}

export interface NgoVerificationDetail {
  id: number;
  dimension: VerificationDimension;
  is_verified: boolean;
  is_active: boolean;
  verified_by?: { id: number; name: string } | null;
  verified_at?: string;
  valid_until?: string | null;
  evidence_reference?: string | null;
  notes?: string | null;
}

export interface NgoDetail extends NgoSummary {
  pan_or_fcra?: string | null;
  verifications?: NgoVerificationDetail[];
  depots?: NgoDepotDetail[];
  capabilities_detail?: NgoCapabilityDetail[];
  equipment?: NgoEquipmentDetail[];
  latest_availability?: {
    status: string;
    freshness: 'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN';
    available_personnel_count?: number;
    certified_helmsmen_count?: number;
    reporting_person_name?: string | null;
    reporting_person_phone?: string | null;
    operational_notes?: string | null;
    checkin_timestamp?: string;
    valid_until?: string | null;
    recorded_by?: number;
    is_simulated?: number | boolean;
  } | null;
}

export interface CreateNgoPayload {
  id: string;
  name: string;
  legal_name?: string;
  registration_reference?: string;
  description?: string;
  primary_contact_name: string;
  primary_contact_phone: string;
  primary_contact_email?: string;
  is_simulated?: boolean;
}

export interface QueryNgosParams {
  page?: number;
  limit?: number;
  district?: string;
  revenue_circle?: string;
  capability_id?: string;
  filter_mode?: 'ALL' | 'OPERATIONAL' | 'SIMULATED';
  search?: string;
}

export interface NgoListMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  filter_mode: string;
}

export type NgoListResponse = NgoSummary[];

export interface NgoListEnvelope {
  ngos: NgoSummary[];
  meta: NgoListMeta;
}
