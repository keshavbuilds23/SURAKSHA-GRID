/**
 * SURAKSHA GRID — Phase 4.5 Recommendation Engine Type Definitions
 */

export interface RecommendationScoreBreakdown {
  proximity_score: number;    // 0 - 30
  capability_score: number;   // 0 - 25
  equipment_score: number;    // 0 - 20
  personnel_score: number;    // 0 - 15
  freshness_score: number;    // 0 - 10
  total_score: number;        // 0 - 100
}

export interface RecommendedDepot {
  id?: number;
  name: string;
  district: string;
  revenue_circle?: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_km: number | null;
  is_primary: boolean;
}

export interface MatchedCapability {
  capability_id: string;
  name: string;
  category: string;
  certification_level: string;
  is_verified: boolean;
}

export interface MatchedEquipment {
  equipment_type_id: string;
  name: string;
  category: string;
  available_quantity: number;
  requested_quantity: number;
  is_satisfied: boolean;
}

export interface RecommendedNgo {
  ngo_id: string;
  name: string;
  legal_name: string | null;
  registration_reference: string | null;
  is_simulated: boolean;
  simulated_watermark: string | null;
  composite_score: number;
  scores: RecommendationScoreBreakdown;
  closest_depot: RecommendedDepot | null;
  matched_capabilities: MatchedCapability[];
  matched_equipment: MatchedEquipment[];
  personnel_metrics: {
    available_personnel: number;
    certified_helmsmen: number;
    requested_personnel: number;
    is_satisfied: boolean;
  };
  readiness: {
    status: string;
    freshness: 'FRESH' | 'AGING' | 'STALE';
    checkin_timestamp: string;
    reporting_person_name: string | null;
    operational_notes: string | null;
  };
  verification: {
    is_fully_verified: boolean;
    verified_count: number;
    total_dimensions: number;
    verified_dimensions: string[];
    missing_dimensions: string[];
  };
  contact: {
    primary_contact_name: string | null;
    primary_contact_phone: string | null;
    primary_contact_email: string | null;
  };
  justification_reasons: string[];
}

export interface ExcludedNgo {
  ngo_id: string;
  name: string;
  is_simulated: boolean;
  reasons: string[];
  exclusion_codes: string[];
}

export interface RecommendationResult {
  query: {
    latitude: number | null;
    longitude: number | null;
    district?: string;
    severity: string;
    required_capabilities: string[];
    personnel_required: number;
    equipment_required: Array<{ equipment_type_id: string; min_quantity: number }>;
    demo_mode: boolean;
  };
  is_demo_mode: boolean;
  is_advisory_only: true;
  coordinator_approval_required: true;
  disclaimer: string;
  total_evaluated: number;
  recommended_count: number;
  excluded_count: number;
  recommendations: RecommendedNgo[];
  excluded_ngos: ExcludedNgo[];
}

