import { Incident, CreateIncidentPayload } from '../types/incident';
import { Resource, Assignment, CreateAssignmentPayload } from '../types/resource';
import { SyncBatchResponse, QueuedOfflineReport } from '../types/sync';
import {
  NgoSummary,
  NgoDetail,
  QueryNgosParams,
  CreateNgoPayload,
  CapabilityCatalogueItem,
  EquipmentCatalogueItem,
  NgoCapabilityDetail,
  NgoDepotDetail,
  NgoEquipmentDetail,
  CreateOperatingAreaPayload,
  CreateEquipmentPayload,
  PatchEquipmentPayload,
  SyncCapabilitiesPayload,
} from '../types/ngo';
import { RecommendationQueryInput, RecommendationResult } from '../types/recommendation';
import { LoginCredentials, LoginResponse, AuthUser } from '../types/auth';

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  total_pages?: number;
  filter_mode?: string;
  [key: string]: any;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  meta?: ApiMeta;
  error?: ApiError;
  status: number;
}

const PRODUCTION_API_BASE_URL = 'https://suraksha-grid-sbri.onrender.com/api/v1';

const API_BASE_URL = (() => {
  const metaEnv = (import.meta as { env?: Record<string, any> }).env;
  const configured = metaEnv?.VITE_API_BASE_URL?.trim();

  // 1. Explicit VITE_API_BASE_URL environment variable takes highest priority
  if (configured) {
    const clean = configured.replace(/\/+$/, '');
    return clean.endsWith('/api/v1') ? clean : `${clean}/api/v1`;
  }

  // 2. In local Vite development mode, use relative /api/v1 for localhost:5000 proxy
  if (metaEnv?.DEV) {
    return '/api/v1';
  }

  // 3. In production mode (e.g. Vercel deployment), fall back to deployed Render backend
  return PRODUCTION_API_BASE_URL;
})();

/**
 * Standard HTTP fetch wrapper with complete error code transformation
 * matching docs/architecture/API_CONTRACT.md.
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const status = response.status;
    let json: any = null;

    try {
      json = await response.json();
    } catch {
      // Non-JSON response (e.g. 502/503 HTML gateway error)
      return {
        success: false,
        status,
        error: {
          code: 'INVALID_SERVER_RESPONSE',
          message: `Server returned HTTP ${status} with invalid non-JSON body.`,
        },
      };
    }

    if (!response.ok) {
      // Standardize error envelope matching API Contract Table 2.2
      const errorCode = json?.error?.code || mapHttpCodeToErrorCode(status);
      const errorMessage =
        json?.error?.message || `Request failed with HTTP status ${status}`;

      return {
        success: false,
        status,
        error: {
          code: errorCode,
          message: errorMessage,
          details: json?.error?.details || null,
        },
      };
    }

    return {
      success: true,
      status,
      data: json.data as T,
      meta: json?.meta,
    };
  } catch (error: any) {
    // Network disconnection, DNS failure, or connection refused
    const isNetworkError =
      error instanceof TypeError ||
      error.message?.includes('fetch') ||
      error.message?.includes('NetworkError');

    return {
      success: false,
      status: 0,
      error: {
        code: isNetworkError ? 'NETWORK_UNAVAILABLE' : 'CLIENT_REQUEST_ERROR',
        message: isNetworkError
          ? 'Network is offline or command EOC backend is unreachable on port 5000.'
          : error.message || 'Unknown client request exception.',
      },
    };
  }
}

function mapHttpCodeToErrorCode(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'RESOURCE_CONFLICT';
    case 422:
      return 'VALIDATION_ERROR';
    case 429:
      return 'RATE_LIMIT_EXCEEDED';
    case 500:
    default:
      return 'INTERNAL_SERVER_ERROR';
  }
}

// -------------------------------------------------------------
// INCIDENTS API (Section 4.2 of API Contract)
// -------------------------------------------------------------

export async function apiCreateIncident(
  payload: CreateIncidentPayload
): Promise<ApiResponse<Incident>> {
  return request<Incident>('/incidents', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiGetIncidents(): Promise<ApiResponse<Incident[]>> {
  return request<Incident[]>('/incidents', {
    method: 'GET',
  });
}

let coordinatorAuthToken: string | null = null;

export function setCoordinatorAuthToken(token: string | null): void {
  coordinatorAuthToken = token ? token.replace(/^Bearer\s+/i, '').trim() : null;
}

export function getCoordinatorAuthToken(): string | null {
  return coordinatorAuthToken;
}

export function formatAuthHeaders(token?: string | null): HeadersInit {
  const active = token || coordinatorAuthToken;
  if (!active) return {};
  const clean = active.replace(/^Bearer\s+/i, '').trim();
  return clean ? { Authorization: `Bearer ${clean}` } : {};
}

export async function apiVerifyIncident(
  id: number,
  notes: string = 'Verified by coordinator',
  token?: string
): Promise<ApiResponse<Incident>> {
  return request<Incident>(`/incidents/${id}/verify`, {
    method: 'PATCH',
    headers: formatAuthHeaders(token),
    body: JSON.stringify({ verification_notes: notes }),
  });
}

// -------------------------------------------------------------
// BATCH SYNC API (Section 4.6 of API Contract)
// -------------------------------------------------------------

export async function apiBatchSyncReports(
  reports: QueuedOfflineReport[]
): Promise<ApiResponse<SyncBatchResponse>> {
  // Strip client internal outbox metadata and match API Contract schema
  const payloadReports = reports.map(r => ({
    client_report_id: r.client_report_id,
    title: r.title,
    description: r.description,
    category: r.category,
    reported_urgency: r.reported_urgency || 'HIGH',
    latitude: r.latitude,
    longitude: r.longitude,
    landmark: r.landmark,
    affected_count: r.affected_count,
    medical_required: r.medical_required || false,
    follow_up_to_incident_id: r.follow_up_to_incident_id || null,
    created_at: r.queued_at,
  }));

  return request<SyncBatchResponse>('/sync/batch', {
    method: 'POST',
    body: JSON.stringify({ reports: payloadReports }),
  });
}

// -------------------------------------------------------------
// RESOURCES & ASSIGNMENTS API (Section 4.4 & 4.5 of API Contract)
// -------------------------------------------------------------

export async function apiGetResources(): Promise<ApiResponse<Resource[]>> {
  return request<Resource[]>('/resources', {
    method: 'GET',
  });
}

export async function apiCreateAssignment(
  payload: CreateAssignmentPayload
): Promise<ApiResponse<Assignment>> {
  return request<Assignment>('/assignments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiDispatchAssignment(
  id: number
): Promise<ApiResponse<Assignment>> {
  return request<Assignment>(`/assignments/${id}/dispatch`, {
    method: 'PATCH',
  });
}

export async function apiDeliverAssignment(
  id: number
): Promise<ApiResponse<Assignment>> {
  return request<Assignment>(`/assignments/${id}/deliver`, {
    method: 'PATCH',
  });
}

export async function apiCancelAssignment(
  id: number,
  reason: string = 'Operational mission cancelled'
): Promise<ApiResponse<Assignment>> {
  return request<Assignment>(`/assignments/${id}/cancel`, {
    method: 'PATCH',
    body: JSON.stringify({ cancellation_reason: reason }),
  });
}

export async function apiReturnAssignment(
  id: number,
  notes: string = 'Asset checked back into depot'
): Promise<ApiResponse<Assignment>> {
  return request<Assignment>(`/assignments/${id}/return`, {
    method: 'PATCH',
    body: JSON.stringify({ return_notes: notes }),
  });
}

// -------------------------------------------------------------
// NGO NETWORK API (Section 4.3 of API Contract)
// -------------------------------------------------------------

export async function apiGetNgos(
  params: QueryNgosParams = {},
  token?: string
): Promise<ApiResponse<NgoSummary[]>> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', params.page.toString());
  if (params.limit) query.set('limit', params.limit.toString());
  if (params.district) query.set('district', params.district);
  if (params.revenue_circle) query.set('revenue_circle', params.revenue_circle);
  if (params.capability_id) query.set('capability_id', params.capability_id);
  if (params.filter_mode) query.set('filter_mode', params.filter_mode);
  if (params.search) query.set('search', params.search);

  const qs = query.toString();
  const endpoint = qs ? `/ngos?${qs}` : '/ngos';

  return request<NgoSummary[]>(endpoint, {
    method: 'GET',
    headers: formatAuthHeaders(token),
  });
}

export async function apiRegisterNgo(
  payload: CreateNgoPayload,
  token?: string
): Promise<ApiResponse<any>> {
  return request<any>('/ngos', {
    method: 'POST',
    headers: formatAuthHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function apiGetNgoById(
  id: string,
  token?: string
): Promise<ApiResponse<NgoDetail>> {
  return request<NgoDetail>(`/ngos/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: formatAuthHeaders(token),
  });
}

export async function apiVerifyNgoDimension(
  id: string,
  payload: {
    dimension: string;
    is_verified: boolean;
    evidence_reference?: string;
    notes?: string;
    valid_until?: string;
  },
  token?: string
): Promise<ApiResponse<any>> {
  return request<any>(`/ngos/${encodeURIComponent(id)}/verifications`, {
    method: 'POST',
    headers: formatAuthHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function apiPromoteNgoToOperational(
  id: string,
  token?: string
): Promise<ApiResponse<any>> {
  return request<any>(`/ngos/${encodeURIComponent(id)}/operational-status`, {
    method: 'PATCH',
    headers: formatAuthHeaders(token),
  });
}

export async function apiCheckinNgoAvailability(
  id: string,
  payload: {
    status: string;
    available_personnel_count: number;
    certified_helmsmen_count?: number;
    reporting_person_name: string;
    reporting_person_phone: string;
    operational_notes?: string;
    valid_until?: string;
  },
  token?: string
): Promise<ApiResponse<any>> {
  return request<any>(`/ngos/${encodeURIComponent(id)}/availability`, {
    method: 'POST',
    headers: formatAuthHeaders(token),
    body: JSON.stringify(payload),
  });
}

// Contract alias for checkin
export const apiCheckinNgo = apiCheckinNgoAvailability;

// -----------------------------------------------------------
// Phase 4.4: Catalogues, Operating Areas, Capabilities & Equipment
// -----------------------------------------------------------

export async function apiGetCapabilityCatalog(token?: string): Promise<ApiResponse<CapabilityCatalogueItem[]>> {
  return request<CapabilityCatalogueItem[]>('/capabilities', {
    method: 'GET',
    headers: formatAuthHeaders(token),
  });
}

export async function apiGetEquipmentCatalog(token?: string): Promise<ApiResponse<EquipmentCatalogueItem[]>> {
  return request<EquipmentCatalogueItem[]>('/equipment-catalogue', {
    method: 'GET',
    headers: formatAuthHeaders(token),
  });
}

export async function apiGetNgoCapabilities(
  ngoId: string,
  token?: string
): Promise<ApiResponse<NgoCapabilityDetail[]>> {
  return request<NgoCapabilityDetail[]>(`/ngos/${encodeURIComponent(ngoId)}/capabilities`, {
    method: 'GET',
    headers: formatAuthHeaders(token),
  });
}

export async function apiSyncNgoCapabilities(
  ngoId: string,
  payload: SyncCapabilitiesPayload,
  token?: string
): Promise<ApiResponse<NgoCapabilityDetail[]>> {
  return request<NgoCapabilityDetail[]>(`/ngos/${encodeURIComponent(ngoId)}/capabilities`, {
    method: 'PUT',
    headers: formatAuthHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function apiGetNgoOperatingAreas(
  ngoId: string,
  token?: string
): Promise<ApiResponse<NgoDepotDetail[]>> {
  return request<NgoDepotDetail[]>(`/ngos/${encodeURIComponent(ngoId)}/operating-areas`, {
    method: 'GET',
    headers: formatAuthHeaders(token),
  });
}

export async function apiCreateNgoOperatingArea(
  ngoId: string,
  payload: CreateOperatingAreaPayload,
  token?: string
): Promise<ApiResponse<NgoDepotDetail>> {
  return request<NgoDepotDetail>(`/ngos/${encodeURIComponent(ngoId)}/operating-areas`, {
    method: 'POST',
    headers: formatAuthHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function apiDeleteNgoOperatingArea(
  ngoId: string,
  areaId: number,
  token?: string
): Promise<ApiResponse<any>> {
  return request<any>(`/ngos/${encodeURIComponent(ngoId)}/operating-areas/${encodeURIComponent(areaId.toString())}`, {
    method: 'DELETE',
    headers: formatAuthHeaders(token),
  });
}

export async function apiGetNgoEquipment(
  ngoId: string,
  token?: string
): Promise<ApiResponse<NgoEquipmentDetail[]>> {
  return request<NgoEquipmentDetail[]>(`/ngos/${encodeURIComponent(ngoId)}/equipment`, {
    method: 'GET',
    headers: formatAuthHeaders(token),
  });
}

export async function apiCreateNgoEquipment(
  ngoId: string,
  payload: CreateEquipmentPayload,
  token?: string
): Promise<ApiResponse<NgoEquipmentDetail>> {
  return request<NgoEquipmentDetail>(`/ngos/${encodeURIComponent(ngoId)}/equipment`, {
    method: 'POST',
    headers: formatAuthHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function apiPatchNgoEquipment(
  ngoId: string,
  equipmentId: number,
  payload: PatchEquipmentPayload,
  token?: string
): Promise<ApiResponse<NgoEquipmentDetail>> {
  return request<NgoEquipmentDetail>(`/ngos/${encodeURIComponent(ngoId)}/equipment/${encodeURIComponent(equipmentId.toString())}`, {
    method: 'PATCH',
    headers: formatAuthHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function apiDeleteNgoEquipment(
  ngoId: string,
  equipmentId: number,
  token?: string
): Promise<ApiResponse<any>> {
  return request<any>(`/ngos/${encodeURIComponent(ngoId)}/equipment/${encodeURIComponent(equipmentId.toString())}`, {
    method: 'DELETE',
    headers: formatAuthHeaders(token),
  });
}

// -------------------------------------------------------------
// Recommendation Engine API Endpoints
// -------------------------------------------------------------

export async function apiGetRecommendations(
  query: RecommendationQueryInput,
  token?: string
): Promise<ApiResponse<RecommendationResult>> {
  return request<RecommendationResult>('/recommendations/ngos', {
    method: 'POST',
    headers: formatAuthHeaders(token),
    body: JSON.stringify(query),
  });
}

export async function apiGetIncidentRecommendations(
  incidentId: number,
  overrides?: Partial<RecommendationQueryInput>,
  token?: string
): Promise<ApiResponse<RecommendationResult>> {
  return request<RecommendationResult>(`/incidents/${encodeURIComponent(incidentId.toString())}/recommendations`, {
    method: 'POST',
    headers: formatAuthHeaders(token),
    body: JSON.stringify(overrides || {}),
  });
}

// -------------------------------------------------------------
// Authentication API Endpoints
// -------------------------------------------------------------

export async function apiLogin(
  credentials: LoginCredentials
): Promise<ApiResponse<LoginResponse>> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function apiGetMe(
  token?: string
): Promise<ApiResponse<{ user: AuthUser }>> {
  return request<{ user: AuthUser }>('/auth/me', {
    method: 'GET',
    headers: formatAuthHeaders(token),
  });
}

