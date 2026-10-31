import { Incident, CreateIncidentPayload } from '../types/incident';
import { Resource, Assignment, CreateAssignmentPayload } from '../types/resource';
import { SyncBatchResponse, QueuedOfflineReport } from '../types/sync';

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  status: number;
}

const API_BASE_URL = '/api/v1';

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

export async function apiVerifyIncident(
  id: number,
  notes: string = 'Verified by coordinator'
): Promise<ApiResponse<Incident>> {
  return request<Incident>(`/incidents/${id}/verify`, {
    method: 'PATCH',
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

