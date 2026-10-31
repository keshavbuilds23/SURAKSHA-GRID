# Task Assignment & Workstream Division — SURAKSHA GRID
### Roles, Responsibilities, and Interface Contracts for NGO-First Evolution

---

## 1. Division of Responsibilities Overview

To maintain high development velocity and prevent merge conflicts, work remains cleanly partitioned across two synchronized workstreams:

```
┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
│      DEVELOPER A: CORE & BACKEND     │  │     DEVELOPER B: FRONTEND & OFFLINE  │
├──────────────────────────────────────┤  ├──────────────────────────────────────┤
│ - Express REST API & Security Stack  │  │ - React 18 + Vite + TypeScript UI    │
│ - SQLite WAL & Migration Engine      │  │ - MapLibre Geospatial Cartography    │
│ - Migration 002 Schema Extensions    │  │ - IndexedDB (idb) Offline Queue      │
│ - Risk Intelligence Endpoints        │  │ - Risk Intelligence KPI & Water Level│
│ - NGO Network & Check-in API         │  │ - NGO Network Directory & Rosters    │
│ - 7-Day Preparedness & Alert Engine  │  │ - 7-Day Preparedness Checklist & TTX │
│ - Explainable Recommendation Engine  │  │ - Recommendation Modal (Score Cards) │
│ - Historical Metrics (ASDMA 2024)    │  │ - Historical Kampur Impact Dossier   │
│ - Backend Integration Test Suites    │  │ - Preserved Triage, Stock & Outbox   │
└──────────────────────────────────────┘  └──────────────────────────────────────┘
                   │                                         │
                   └────────────────────┬────────────────────┘
                                        ▼
                        SHARED INTEGRATION CONTRACTS
                        - API_CONTRACT.md (/api/v1)
                        - Shared Zod Validation & TypeScript DTOs
                        - Historical Data Provenance Contract
                        - Nagaon / Kampur Circle Boundary GeoJSON
```

---

## 2. Workstream Details by Phase

### Developer A: Backend, Data Engine & Recommendation Systems
- **Phase 3.1 (Completed):**
  - Built Express application structure, Helmet security headers, CORS origin filtering, 1MB JSON body limits.
  - Configured SQLite connection with `PRAGMA foreign_keys = ON;`, `PRAGMA journal_mode = WAL;`, and `PRAGMA busy_timeout = 5000;`.
  - Implemented Migration 001 with 6 core tables (`users`, `incidents`, `resources`, `assignments`, `incident_events`, `duplicate_candidates`).
  - Implemented `GET /api/v1/health` and `HEAD /api/v1/health`.
  - Authored 21/21 automated tests passing across connection, schema idempotency, Zod validation, and error sanitization.
- **Phase 4.1 (Next):**
  - Author Migration 002 adding `ngos`, `ngo_equipment`, `preparedness_tasks`, `ngo_task_assignments`, `historical_metrics`, and `river_observations`.
  - Implement Risk Intelligence routes (`GET /api/v1/risk/river-gauges`, `GET /api/v1/risk/alerts`).
  - Implement NGO Network routes (`GET /api/v1/ngos`, `POST /api/v1/ngos/:id/checkin`, `PATCH /api/v1/ngos/:id/verify`).
  - Implement 7-Day Preparedness routes (`GET /api/v1/preparedness/programme`, `PATCH /api/v1/preparedness/tasks/:id/status`).
  - Implement Explainable Recommendation service (`GET /api/v1/recommendations/incident/:id`) calculating multi-criteria scores and human-readable text justification.
  - Implement Historical Analysis route (`GET /api/v1/historical/kampur-2024`) returning ASDMA 3 June 2024 metrics with strict provenance metadata.

---

### Developer B: Frontend, Map, Offline Engine & UI/UX
- **Phase 2 (Completed):**
  - Built React 18 SPA with light enterprise design (`bg-slate-50`), crisp typography, and responsive grid.
  - Integrated MapLibre GL JS with dual online basemap tiles and offline boundary fallback.
  - Built IndexedDB persistence layer (`idb`) and Offline Outbox queue with idempotent sync triggers.
  - Built Operations Dashboard with Situation Overview KPI bar, dynamic chronological Trend Chart, and Severity Distribution.
  - Implemented Resource Logistics inventory table, dispatch modal, and cancellation state machine.
- **Phase 4.2 (Next):**
  - Integrate Risk Intelligence Bar into the dashboard header, showing CWC Kopili water level at Kampur (Warning: 59.50m, Danger: 60.50m) and Dharamtul gauge status.
  - Build NGO Network directory view displaying verified organizations, inspected equipment, certified helmsmen, and availability check-in freshness.
  - Build 7-Day Preparedness component displaying current day phase, interactive task checklist, and Kampur Circle Readiness Index ($0-100\%$).
  - Build Explainable Recommendation modal in the incident triage drawer, showing the top-ranked NGO with score breakdown and explainable text.
  - Build Historical 2024 Kampur Impact dossier tab displaying ASDMA 3 June 2024 metrics with explicit `VERIFIED` badges.
