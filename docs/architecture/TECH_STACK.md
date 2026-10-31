# Technology Stack & Architectural Trade-Offs — SURAKSHA GRID
### Rationalizing the Engineering Choices for an NGO-Focused Preparedness & Response Platform

---

## 1. Technology Selection Matrix

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SURAKSHA GRID TECH STACK                        │
├───────────────────┬───────────────────────────────┬────────────────────┤
│ LAYER             │ CHOSEN TECHNOLOGY             │ PRIMARY ADVANTAGE  │
├───────────────────┼───────────────────────────────┼────────────────────┤
│ UI Framework      │ React 18 + Vite + TypeScript  │ Fast, Type-Safe UI │
│ Geospatial Engine │ MapLibre GL JS + GeoJSON      │ Dual Online/Offline│
│ Client Storage    │ IndexedDB (idb wrapper)       │ Structured Offline │
│ Backend Runtime   │ Node.js 22 + Express (ESM)    │ Modern REST Engine │
│ Database Engine   │ SQLite (better-sqlite3)       │ In-Process ACID    │
│ Data Validation   │ Zod                           │ Universal Schemas  │
│ Security & Crypto │ Helmet, bcryptjs, JWT         │ Lightweight Crypto │
│ Recommendation Alg│ Deterministic Multi-Criteria  │ 100% Explainable   │
│ Deployment Feas.  │ Local-First (Ports 5173/5000) │ Zero-Failure Demo  │
└───────────────────┴───────────────────────────────┴────────────────────┘
```

---

## 2. Detailed Architectural Rationales & Trade-Off Analyses

### 2.1 Geospatial Engine: MapLibre GL JS (Dual-Mode Operation)
- **Why Chosen:**
  - **Zero Commercial Token Risk:** Free from Google Maps / Mapbox proprietary token quotas that can suspend accounts during high-traffic hackathon evaluation.
  - **Vector Polygons & River Features:** Seamlessly renders bundled Assam administrative boundaries (Nagaon and Kampur Revenue Circle polygons) and CWC river stage markers (Kampur & Dharamtul on the Kopili River).
  - **Hardware-Accelerated WebGL:** Smooth 60 FPS panning across historical flood extent layers and active incident markers.
- **Trade-Offs & Mitigations:**
  - *Trade-off:* Satellite raster tiles require active internet connectivity.
  - *Mitigation:* In offline mode, MapLibre falls back to pre-bundled vector GeoJSON polygons on a neutral canvas grid.

### 2.2 In-Process ACID Engine: SQLite with `better-sqlite3`
- **Why Chosen:**
  - **Zero Network IPC Latency:** Runs directly in the C++ memory space of Node.js, delivering query execution in under 0.2ms.
  - **Write-Ahead Logging (WAL Mode):** Enabled via `PRAGMA journal_mode = WAL;`. Allows concurrent read queries (dashboard metrics, NGO availability lookups) while write transactions commit.
  - **Lock Contention Immunity:** Configured with `PRAGMA busy_timeout = 5000;`. Concurrent transactions wait up to 5 seconds rather than failing with `SQLITE_BUSY`.
  - **Atomic Inventory & Allocation:** Resource allocations and cancellations execute inside atomic `db.transaction()` blocks. `assignments.incident_id` uses `ON DELETE RESTRICT` to prevent phantom stock loss.
- **Trade-Offs & Mitigations:**
  - *Trade-off:* Does not natively cluster writes across multi-datacenter nodes.
  - *Mitigation:* For local-first disaster hubs, district EOCs, and hackathon evaluation, a single Node.js instance with WAL mode comfortably handles hundreds of transactions per second.

### 2.3 Client Storage: IndexedDB via `idb`
- **Why Chosen:**
  - **Asynchronous & High Capacity:** Unlike `localStorage` (capped at ~5MB and synchronously blocking), IndexedDB handles 50MB+ of queued reports, cached NGO profiles, and local GeoJSON layers without freezing the UI thread.
  - **Structured Status Querying:** Indexed stores enable rapid querying of items by status (`QUEUED`, `SYNCING`, `CONFLICT`, `FAILED`).
- **Trade-Offs & Mitigations:**
  - *Trade-off:* Native W3C IndexedDB API is event-callback heavy.
  - *Mitigation:* Jake Archibald's tiny `idb` library wraps IndexedDB in clean, type-safe Promises.

### 2.4 Recommendation Engine: Deterministic Multi-Criteria Scoring (vs. Black-Box AI)
- **Why Chosen:**
  - **Auditability & Explainability:** In emergency response, dispatch decisions must be mathematically explainable to coordinators and oversight bodies. The multi-criteria algorithm explicitly weights proximity ($25\%$), capability ($30\%$), equipment ($20\%$), availability ($15\%$), and workload balance ($10\%$).
  - **Zero Hallucination:** A generative LLM might invent available motorboats or claim an unverified NGO has divers. A deterministic algorithm strictly filters through verified database records.
- **Trade-Offs & Mitigations:**
  - *Trade-off:* Requires well-defined capability schemas and up-to-date availability check-ins.
  - *Mitigation:* Enforced active check-in tracking automatically flags organizations as `INACTIVE_STALE` if check-in is older than 48 hours during alert windows.

### 2.5 Local-First Orchestration (Ports 5173 / 5000)
- **Standardized Configuration:**
  - Frontend: `http://localhost:5173`
  - Backend API: `http://localhost:5000/api/v1`
  - Vite Proxy: Seamlessly proxies `/api/v1/*` to port 5000.
  - Port 8000 is strictly prohibited.
- **Hackathon Reliability:** Completely insulates live jury presentations from venue Wi-Fi dropouts, external API rate limits, and cloud cold starts.
