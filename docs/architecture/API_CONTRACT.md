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

## 2. Implemented Foundation Endpoints

### `GET /api/v1/health` & `HEAD /api/v1/health`
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

---

## 3. Preserved Response Coordination Endpoints

### 3.1 Incidents
- `GET /api/v1/incidents`: List incidents (Public sees `PublicIncidentDTO`; staff sees `CoordinatorIncidentDTO`).
- `POST /api/v1/incidents`: Ingest new report; generates server-calculated severity and checks for duplicates.
- `GET /api/v1/incidents/:id`: Detailed incident dossier.
- `PATCH /api/v1/incidents/:id/verify`: Verify/reject report (transitions status from `PENDING` to `VERIFIED` or `REJECTED`).
- `PATCH /api/v1/incidents/:id/severity`: Escalate/de-escalate severity with mandatory justification reason.
- `GET /api/v1/incidents/:id/events`: Chronological append-only audit trail.

### 3.2 Duplicate Candidates
- `GET /api/v1/incidents/:id/duplicate-candidates`: Fetch candidate duplicate pairs.
- `POST /api/v1/incidents/:id/duplicate-candidates/resolve`: Resolve duplicate pair (`DISMISS` or `MERGE`).

### 3.3 Resource Inventory & Lifecycle
- `GET /api/v1/resources`: Relief supplies catalog across staging depots.
- `GET /api/v1/assignments`: Active resource dispatches.
- `POST /api/v1/assignments`: Allocate resources atomically to a verified incident (`ON DELETE RESTRICT`).
- `PATCH /api/v1/assignments/:id/dispatch`: Status $\rightarrow$ `IN_TRANSIT`.
- `PATCH /api/v1/assignments/:id/deliver`: Status $\rightarrow$ `DELIVERED`.
- `PATCH /api/v1/assignments/:id/cancel`: Atomically cancel assignment. Restores stock if undispatched (`ASSIGNED`); keeps stock depleted if in-transit (`IN_TRANSIT`).
- `PATCH /api/v1/assignments/:id/return`: Atomically return reusable field assets to depot stock (`DELIVERED` or recalled `CANCELLED`). Blocks duplicate returns (`INVENTORY_ALREADY_RESTORED`).

### 3.4 Reconnection Synchronization
- `POST /api/v1/sync/batch`: Process itemized array of queued reports. Returns granular outcomes (`synced`, `already_synced`, `rejected`). Flags conflicting payloads with `IDEMPOTENCY_CONFLICT` without overwriting existing reports.

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
