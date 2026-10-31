# System Architecture & Data Flows — SURAKSHA GRID
### NGO-Focused Disaster Preparedness, Risk Intelligence and Response Coordination Architecture

---

## 1. High-Level Architectural Overview

SURAKSHA GRID employs a decoupled, offline-first client-server architecture built around the core principle:
**"Turn disaster intelligence into NGO preparedness and coordinated response."**

```mermaid
flowchart TD
    subgraph Client["Frontend Client (Port 5173 - React 18 + Vite)"]
        UI["React 18 SPA + TypeScript (Light Enterprise UI)"]
        
        subgraph Modules["Core Functional Modules"]
            RiskUI["Risk Intelligence\n(IMD Warnings, CWC Gauges, NRSC Sat)"]
            NgoUI["NGO Network\n(Verified Rosters, Equipment, Check-ins)"]
            PrepUI["Preparedness & Drills\n(7-Day Protocol, TTX, 1-Daily Alert)"]
            RecUI["Recommendation Engine\n(Multi-Criteria Explainable Matching)"]
            CoordUI["Response Coordination\n(MapLibre Map, Triage, Outbox, Stock)"]
            HistUI["Historical Analysis\n(2024 Kampur ASDMA, CWC Hydrographs)"]
        end

        MapEngine["MapLibre GL JS\n- Online: Basemap Vector/Raster Tiles\n- Offline: Bundled Assam GeoJSON & Markers"]
        SyncManager["SyncManager Engine (Online/Offline Reconnect)"]
        IDB[("Client IndexedDB (idb)\n- offline_reports queue\n- cached_incidents\n- cached_ngos\n- cached_preparedness")]
    end

    subgraph Network["Network Edge (Port 5173 -> 5000)"]
        ViteProxy["Vite Proxy (localhost:5173/api/v1 -> localhost:5000)"]
        REST["REST API /api/v1 (Port 5000)"]
    end

    subgraph Server["Backend API (Port 5000 - Node.js 22 + Express)"]
        Router["Express Router & Route Controllers"]
        Middlewares["Middlewares:\n- Helmet & Environment-Bound CORS\n- 1MB JSON Body Limit\n- Zod Schema Sanitization\n- Centralized Error Handler (PII/Path Suppression)"]
        
        subgraph Engines["Core Computational Engines"]
            RecEngine["Explainable Recommendation Engine"]
            PrepEngine["7-Day Preparedness Scheduler & Alert Dispatcher"]
            DedupeEngine["Canonical Duplicate Engine (primary_id < candidate)"]
            TxEngine["ACID Inventory Transaction Engine"]
        end

        SQLite[("Embedded SQLite (better-sqlite3)\n- WAL Mode + busy_timeout=5000ms\n- Foreign Keys ON (ON DELETE RESTRICT on Assignments)\n- 6 Core Tables + Proposed Preparedness Extensions")]
    end

    UI --> Modules
    Modules --> IDB
    Modules --> MapEngine
    SyncManager --> IDB
    SyncManager -.->|"Batch Sync via HTTPS"| ViteProxy
    ViteProxy --> REST
    REST --> Router
    Router --> Middlewares
    Middlewares --> Engines
    Engines --> SQLite
```

---

## 2. Client-Side Architecture

The frontend is a single-page application built on React 18, Vite, and TypeScript.

### 2.1 Storage Layer: IndexedDB via `idb`
1. **`offline_reports` Store:** Holds client-originated distress submissions stamped with client-generated UUIDv4 (`client_report_id`). Survives tab closure, power loss, and reboots.
2. **`cached_incidents` Store:** Read-only snapshot of verified incidents for offline map rendering.
3. **`cached_ngos` & `cached_preparedness` Stores:** Cached local copies of NGO rosters and 7-day checklists for field operations when cellular towers are down.

### 2.2 Network State & Reconnect Synchronization
The `SyncManager` service monitors connectivity:
- **Online Detection:** Detects `online` event and verifies network path with `HEAD /api/v1/health`.
- **Itemized Replay:** Ingests queued reports via `POST /api/v1/sync/batch`. Clears `synced` and `already_synced` items. Preserves `IDEMPOTENCY_CONFLICT` items in outbox for coordinator resolution without data loss.

### 2.3 Dual-Mode Cartography
- **Online Mode:** MapLibre GL JS streams public raster/vector tiles with interactive incident clusters and river gauge overlays.
- **Offline Fallback Mode:** When disconnected, MapLibre renders bundled local GeoJSON boundaries (Nagaon and Kampur circles) and cached markers over a clean neutral grid.

---

## 3. Server-Side Architecture & Network Standardization

- **Standardized Network Ports:** Backend REST API strictly listens on `http://localhost:5000/api/v1`. Frontend dev server strictly listens on `http://localhost:5173`. Port 8000 is prohibited.
- **Middleware Pipeline:**
  1. `helmet()` sets HTTP security headers.
  2. `cors()` enforces explicit origins (`CORS_ORIGIN=http://localhost:5173`).
  3. `express.json({ limit: '1mb' })` protects memory against denial-of-service surges.
  4. Zod request validation filters and strips unauthorized attributes.
  5. Centralized `errorHandler` suppresses internal paths, database queries, and stack traces.
- **Database Engine (`better-sqlite3`):**
  - `PRAGMA foreign_keys = ON;` enforces relational integrity.
  - `PRAGMA busy_timeout = 5000;` prevents `SQLITE_BUSY` errors under high concurrent write loads.
  - `PRAGMA journal_mode = WAL;` enables non-blocking concurrent reads during writes.

---

## 4. End-to-End Operational Flows

### 4.1 Flow 1: Risk Intelligence Trigger to 7-Day NGO Preparedness Drill

```mermaid
sequenceDiagram
    autonumber
    actor Coordinator as Disaster Coordinator / DDMA
    participant CWC as CWC / IMD Risk Monitor
    participant Server as Express API (:5000)
    participant DB as SQLite Database
    actor NGO as Opted-in NGO Lead (Kampur)

    CWC->>Server: Kopili gauge at Kampur exceeds Warning Level (59.50m)
    Server->>DB: Log River Observation & Elevate Circle Risk Tier to ORANGE
    Server->>Server: Trigger 7-Day Preparedness Protocol for Kampur Circle
    Server->>NGO: Dispatch Daily Briefing (1/day) + Day 1 Intelligence Alert
    
    NGO->>Server: Submits Day 2 Equipment Audit (4 boats tested, 60 lifejackets inspected)
    Server->>DB: Update NGO Equipment Inspection Timestamp (< 90 days)
    
    NGO->>Server: Submits Day 3 Volunteer Availability Check-in (12 helmsmen active)
    Server->>DB: Update NGO last_availability_checkin (< 48h active lock)
    Server-->>Coordinator: Dashboard displays Kampur Readiness Score: 88% (OPTIMAL)
```

---

### 4.2 Flow 2: Explainable NGO Recommendation for Ground Distress

```mermaid
sequenceDiagram
    autonumber
    actor Coord as Incident Coordinator
    participant UI as Operations Dashboard
    participant API as Express API (:5000)
    participant Rec as Recommendation Engine
    participant DB as SQLite Database

    Coord->>UI: Selects verified Incident #104 (18 people marooned in Kamalabari)
    UI->>API: GET /api/v1/recommendations/incident/104
    API->>DB: Query verified NGOs in Nagaon district with status == 'VERIFIED_ACTIVE'
    DB-->>API: Returns candidate list (Kampur Jal-Suraksha Vahini, Youth Brigade, etc.)
    
    API->>Rec: Compute multi-criteria score (Proximity, Capability, Equipment, Availability, Workload)
    Rec-->>API: Ranked results with sub-score breakdowns & explainable justification text
    API-->>UI: 200 OK with recommendation dossier
    
    Coord->>UI: Reviews why Kampur Jal-Suraksha Vahini is ranked #1 (92.5 score, 4 boats, 3.2km away)
    Coord->>UI: Authorizes dispatch (Human-in-the-Loop confirmation)
    UI->>API: POST /api/v1/assignments (Atomic transaction: decrements depot stock & logs event)
```

---

### 4.3 Flow 3: Preserved Offline Incident Submission & Idempotent Sync

```mermaid
sequenceDiagram
    autonumber
    actor Vol as Field Volunteer (Offline)
    participant Form as Report Form UI
    participant IDB as Client IndexedDB
    participant Sync as SyncManager
    participant API as Express API (:5000)
    participant DB as SQLite Database

    Vol->>Form: Submits distress report (14 marooned, landmark: Kamalabari Ghat)
    Form->>Form: Generate UUIDv4 (client_report_id)
    Form->>IDB: Write to 'offline_reports' (status: QUEUED)
    Form-->>Vol: Shows "Saved to Offline Outbox (UUID: ...)"

    Note over Vol,Sync: Boat moves into cell tower range (Uplink restored)
    Sync->>Sync: Detects 'online' event + verifies HEAD /api/v1/health
    Sync->>API: POST /api/v1/sync/batch [Array of queued reports]
    
    API->>DB: Check client_report_id existence
    alt New report
        API->>DB: INSERT INTO incidents (...) RETURNING id
        API-->>Sync: Item result: 'synced' (New Incident ID created)
    else Identical retried payload
        API-->>Sync: Item result: 'already_synced' (Zero mutation)
    else Conflicting payload with same UUID
        API-->>Sync: Item result: 'rejected' (code: 'IDEMPOTENCY_CONFLICT', server draft preserved)
    end

    Sync->>IDB: Delete 'synced' and 'already_synced' items; flag 'CONFLICT' for user resolution
```
