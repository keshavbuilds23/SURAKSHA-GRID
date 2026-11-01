# REST API Contract — SURAKSHA GRID
### API Specification Version: `v1` | Base URL: `http://localhost:5000/api/v1`

---

## 1. Global Standards & Conventions

### 1.1 Network Architecture & Port Standardization
- **Backend Express Server:** Runs on port **`5000`** (`http://localhost:5000/api/v1`).
- **Frontend Development Server:** Runs on port **`5173`** (`http://localhost:5173`).
- **Development Proxy:** Vite dev server proxies `/api/v1` requests from `http://localhost:5173/api/v1` directly to `http://localhost:5000/api/v1`.
- **Prohibited Port:** Port 8000 is strictly prohibited and not configured anywhere in the project.

### 1.2 Standard Response Envelopes
All successful responses return a standard envelope:
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "timestamp": "2026-10-31T12:00:00.000Z"
  }
}
```

All client (4xx) and server (5xx) errors adhere to this format:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid latitude coordinate value.",
    "details": [
      {
        "field": "latitude",
        "issue": "Expected number between -90 and 90, received 145.2"
      }
    ],
    "timestamp": "2026-10-31T12:00:00.000Z"
  }
}
```

---

## 2. Implemented Core & Incident Endpoints (Phase 4.1.2)

### 2.1 Health Check: `GET /api/v1/health` & `HEAD /api/v1/health`
Checks application operational status and SQLite database connectivity without exposing secrets, credentials, or internal filesystem paths.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "service": "suraksha-grid-api",
    "version": "1.0.0",
    "timestamp": "2026-10-31T12:00:00.000Z",
    "database": {
      "status": "connected",
      "journal_mode": "wal"
    },
    "uptime": 142.5
  }
}
```

### 2.2 Ingest Incident: `POST /api/v1/incidents`
Ingests a single field distress report. Validates payload via Zod, computes operational severity deterministically, records an append-only audit event in `incident_events`, and enforces strict idempotency on `client_report_id`.

**Request Body:**
```json
{
  "client_report_id": "a0000000-0000-4000-8000-000000000001",
  "title": "Family of 8 marooned on roof in Kampur",
  "description": "Floodwaters rose 5 feet overnight following bund breach near railway bridge.",
  "category": "MAROONED_RESCUE",
  "reported_urgency": "HIGH",
  "latitude": 26.1523,
  "longitude": 92.8341,
  "landmark": "Near Kampur Railway Station School",
  "affected_count": 8,
  "medical_required": true
}
```

**Responses:**
- `201 Created`: Fresh report ingested successfully. Returns persisted incident record.
- `200 OK`: Idempotent duplicate replay. Returns existing incident record with `meta: { idempotent_replay: true }`.
- `400 Bad Request`: Payload validation failed (`VALIDATION_ERROR`).
- `409 Conflict`: A report with this `client_report_id` exists with conflicting content (`IDEMPOTENCY_CONFLICT`).

### 2.3 List Incidents: `GET /api/v1/incidents`
Lists persisted incidents ordered by `created_at DESC` with optional filtering, full-text search across titles/landmarks/descriptions, and offset pagination.

**Query Parameters:**
- `page` (optional integer, default `1`)
- `limit` (optional integer, min `1`, max `100`, default `20`)
- `category` (optional enum)
- `severity` (optional enum)
- `verification_status` (optional enum)
- `search` (optional string)

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "client_report_id": "a0000000-0000-4000-8000-000000000001",
      "title": "Family of 8 marooned on roof in Kampur",
      "description": "Floodwaters rose 5 feet overnight...",
      "category": "MAROONED_RESCUE",
      "reported_urgency": "HIGH",
      "severity": "CRITICAL",
      "verification_status": "PENDING",
      "latitude": 26.1523,
      "longitude": 92.8341,
      "landmark": "Near Kampur Railway Station School",
      "affected_count": 8,
      "reporter": null,
      "verified_by": null,
      "verified_at": null,
      "created_at": "2026-10-31T12:00:00.000Z",
      "updated_at": "2026-10-31T12:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "total_pages": 1,
    "timestamp": "2026-10-31T12:00:00.000Z"
  }
}
```

### 2.4 Incident Dossier: `GET /api/v1/incidents/:id`
Retrieves detailed dossier of an incident including chronological event audit history from `incident_events`.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "client_report_id": "a0000000-0000-4000-8000-000000000001",
    "title": "Family of 8 marooned on roof in Kampur",
    "description": "Floodwaters rose 5 feet overnight...",
    "category": "MAROONED_RESCUE",
    "severity": "CRITICAL",
    "verification_status": "PENDING",
    "latitude": 26.1523,
    "longitude": 92.8341,
    "landmark": "Near Kampur Railway Station School",
    "affected_count": 8,
    "events": [
      {
        "id": 1,
        "incident_id": 1,
        "actor_id": null,
        "event_type": "CREATED",
        "payload": "{\"source\":\"http_api\",\"client_report_id\":\"...\"}",
        "created_at": "2026-10-31T12:00:00.000Z"
      }
    ]
  }
}
```

### 2.5 Verify Incident: `PATCH /api/v1/incidents/:id/verify`
Updates verification status (`VERIFIED` or `REJECTED`). **Strict Authorization Boundary:** Requires coordinator credentials (`Authorization: Bearer <jwt>` or coordinator actor headers `x-actor-role: coordinator`). Unauthenticated or citizen/volunteer requests are rejected with `401 UNAUTHORIZED` or `403 FORBIDDEN`.

**Request Body:**
```json
{
  "verification_status": "VERIFIED",
  "verification_notes": "Ground truth confirmed via VHF radio contact with Circle Officer."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "verification_status": "VERIFIED",
    "verified_by": {
      "id": 1,
      "full_name": "Dr. N. Sarma"
    },
    "verified_at": "2026-10-31T12:15:00.000Z",
    "verification_notes": "Ground truth confirmed via VHF radio contact with Circle Officer."
  }
}
```

### 2.6 Batch Reconnection Synchronization: `POST /api/v1/sync/batch`
Synchronizes an array of queued offline reports buffered in browser IndexedDB. Atomic per-item processing with granular outcomes. Ensures that client retries after network hiccups never duplicate records.

**Request Body:**
```json
{
  "reports": [
    {
      "client_report_id": "a0000000-0000-4000-8000-000000000001",
      "title": "Family of 8 marooned on roof in Kampur",
      "description": "Floodwaters rose 5 feet overnight...",
      "category": "MAROONED_RESCUE",
      "landmark": "Near Kampur Railway Station School",
      "affected_count": 8
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "processed_count": 1,
    "synced_count": 1,
    "already_synced_count": 0,
    "rejected_count": 0,
    "items": [
      {
        "client_report_id": "a0000000-0000-4000-8000-000000000001",
        "incident_id": 1,
        "result": "synced",
        "error": null
      }
    ]
  }
}
```

---

## 3. Preserved Response Coordination Endpoints (Planned)

### 3.1 Duplicate Candidates
- `GET /api/v1/incidents/:id/duplicate-candidates`: Fetch candidate duplicate pairs.
- `POST /api/v1/incidents/:id/duplicate-candidates/resolve`: Resolve duplicate pair (`DISMISS` or `MERGE`).

### 3.2 Resource Inventory & Lifecycle
- `GET /api/v1/resources`: Relief supplies catalog across staging depots.
- `GET /api/v1/assignments`: Active resource dispatches.
- `POST /api/v1/assignments`: Allocate resources atomically to a verified incident (`ON DELETE RESTRICT`).
- `PATCH /api/v1/assignments/:id/dispatch`: Status $\rightarrow$ `IN_TRANSIT`.
- `PATCH /api/v1/assignments/:id/deliver`: Status $\rightarrow$ `DELIVERED`.
- `PATCH /api/v1/assignments/:id/cancel`: Atomically cancel assignment. Restores stock if undispatched (`ASSIGNED`); keeps stock depleted if in-transit (`IN_TRANSIT`).
- `PATCH /api/v1/assignments/:id/return`: Atomically return reusable field assets to depot stock (`DELIVERED` or recalled `CANCELLED`). Blocks duplicate returns (`INVENTORY_ALREADY_RESTORED`).

---

## 4. Proposed Preparedness, NGO Network & Risk Intelligence Endpoints (Phase 4.1+)

### 4.1 Risk Intelligence Module
- `GET /api/v1/risk/alerts`: Fetch active hydrometeorological alerts (IMD rainfall forecasts, flood warnings) with explicit data tier (`VERIFIED` vs `SIMULATED`).
- `GET /api/v1/risk/river-gauges`: Fetch CWC river stages for Kopili River:
  - Kampur Station (Warning: 59.50m, Danger: 60.50m, HFL: 62.17m)
  - Dharamtul Station (Warning: 55.00m, Danger: 56.00m, HFL: 58.09m)
- `GET /api/v1/risk/inundation-layers`: Fetch NRSC/ISRO Bhuvan satellite inundation layer GeoJSON metadata and observation timestamps.

### 4.2 NGO Network Module
- `GET /api/v1/ngos`: List registered NGOs with filters for `operating_circle`, `specialization`, and `verification_status`.
- `GET /api/v1/ngos/:id`: Detailed NGO profile including inspected equipment catalog and contact numbers.
- `POST /api/v1/ngos/:id/checkin`: Submit roster availability check-in (active volunteers, helmsmen count, lead time). Refreshes `last_availability_checkin`.
- `PATCH /api/v1/ngos/:id/verify`: Coordinator/DDMA verification endpoint (`PENDING_VERIFICATION` $\rightarrow$ `VERIFIED_ACTIVE` or `SUSPENDED`).

### 4.3 Preparedness & Mock Drill Management Module
- `GET /api/v1/preparedness/programme`: Fetch the standard 7-day preparedness schedule and daily tasks.
- `GET /api/v1/preparedness/tasks`: List tasks filtered by `day_number` and NGO.
- `PATCH /api/v1/preparedness/tasks/:id/status`: Report task completion (e.g. Day 2 Equipment Audit, Day 3 Roster Lock) with optional proof URL.
- `GET /api/v1/preparedness/readiness-summary`: Aggregate circle readiness scores (Kampur Revenue Circle).

### 4.4 Explainable NGO Recommendation Engine
- `GET /api/v1/recommendations/incident/:id`:
  Computes multi-criteria match for an incident:
  - **Query Parameters:** `max_results=5`
  - **Output Envelope:**
    ```json
    {
      "success": true,
      "data": {
        "incident_id": 104,
        "recommendations": [
          {
            "ngo_id": 1,
            "name": "Kampur Jal-Suraksha Vahini",
            "composite_score": 92.5,
            "sub_scores": {
              "proximity": 88.0,
              "capability": 100.0,
              "equipment": 95.0,
              "availability": 100.0,
              "workload": 75.0
            },
            "explainable_reason": "Located 3.2km away with active water access. Verified motorized rescue boats and certified helmsmen on duty with 0 active overload."
          }
        ]
      }
    }
    ```

### 4.5 Historical Impact Analysis Module
- `GET /api/v1/historical/kampur-2024`:
  Retrieves authoritative ASDMA 3 June 2024 flood baseline metrics:
  - 267,358 affected persons, 98 submerged villages, 30 relief camps, 6,432 inmates.
  - CWC flood level timeline (Danger vs HFL).
  - Preparedness gap analysis comparing actual historical response against the 7-day preparedness protocol.
