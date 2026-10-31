export type ResourceCategory =
  | 'WATER_PURIFICATION'
  | 'FOOD_RATIONS'
  | 'RESCUE_BOAT'
  | 'MEDICAL_KIT'
  | 'SHELTER_EQUIPMENT';

export type AssignmentStatus =
  | 'ASSIGNED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'RETURNED'
  | 'CANCELLED';

export interface Resource {
  id: number;
  name: string;
  category: ResourceCategory;
  total_quantity: number;
  available_quantity: number;
  unit: string;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

export interface Assignment {
  id: number;
  incident_id: number;
  incident_title?: string;
  resource_id: number;
  resource_name?: string;
  assigned_quantity: number;
  status: AssignmentStatus;
  inventory_restored: number; // 0 or 1
  assigned_by: number;
  assigned_by_name?: string;
  notes?: string | null;
  dispatched_at?: string | null;
  returned_at?: string | null;
  assigned_at: string;
  updated_at: string;
}

export interface CreateAssignmentPayload {
  incident_id: number;
  resource_id: number;
  assigned_quantity: number;
  notes?: string;
}

