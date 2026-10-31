# 24-Hour Execution Schedule — SURAKSHA GRID
### Evolved Sprint Roadmap for NGO-Focused Disaster Preparedness, Risk Intelligence & Response

---

## 1. Sprint Overview & Revised Phase Allocation

```
┌────────────────────────────────────────────────────────────────────────┐
│                        24-HOUR SPRINT TIMELINE                         │
├─────────────┬─────────────────────────────────┬────────────────────────┤
│ HOURS       │ PHASE & FOCUS                   │ DELIVERABLE STATUS     │
├─────────────┼─────────────────────────────────┼────────────────────────┤
│ 00:00–04:00 │ Phase 1: Core Architecture      │ COMPLETED              │
│ 04:00–10:00 │ Phase 2: Frontend Core & Redesign│ COMPLETED (Light UI)   │
│ 10:00–14:00 │ Phase 3.1: Backend Foundation   │ COMPLETED (21/21 Tests)│
│ 14:00–17:00 │ Phase 4.0: NGO-First Reassessment│ CURRENT PHASE (Docs)   │
│ 17:00–20:00 │ Phase 4.1: Preparedness & NGO API│ Next Phase (Mig 002)   │
│ 20:00–22:00 │ Phase 4.2: Frontend Module Sync │ UI Views Integration   │
│ 22:00–24:00 │ Phase 4.3: E2E Verification     │ Pitch & Live Rehearsal │
└─────────────┴─────────────────────────────────┴────────────────────────┘
```

---

## 2. Phase-by-Phase Execution Progress & Roadmap

### Hours 00:00 – 04:00: Phase 1 — Core Architecture (Completed)
- Frozen architecture specifications, SQLite schema design, and local orchestration ports (5173/5000).

### Hours 04:00 – 10:00: Phase 2 — Frontend Foundation & Redirection (Completed)
- React 18 + Vite + TypeScript frontend implementation.
- Real IndexedDB persistence (`idb`), offline outbox queueing, and idempotency conflict handling.
- Visual redesign to clean enterprise light cartographic theme (`bg-slate-50`). All browser E2E tests passing.

### Hours 10:00 – 14:00: Phase 3.1 — Backend Foundation (Completed)
- Express + Node.js 22 + TypeScript foundation on port **5000**.
- SQLite connection layer with WAL mode, foreign keys, and `busy_timeout = 5000ms`.
- Migration 001 applying the 6 core normalized tables (`users`, `incidents`, `resources`, `assignments`, `incident_events`, `duplicate_candidates`).
- `GET /api/v1/health` and `HEAD /api/v1/health` with zero credential or file path leakage.
- 21/21 automated tests passing across connection, schema idempotency, Zod environment validation, and error sanitization.

### Hours 14:00 – 17:00: Phase 4.0 — NGO-First Reassessment (Current Phase)
- Product transformation: Evolving into an NGO-focused preparedness, risk intelligence, and response platform.
- Historical case study integration: **2024 Assam Floods (Kampur Revenue Circle)**:
  - ASDMA 3 June 2024 verified metrics (267,358 affected, 98 villages, 30 relief camps).
  - CWC river gauge baselines (Kopili at Kampur vs. Dharamtul).
  - IMD Cyclone Remal precipitation data.
- Establishing the 6 core modules:
  1. Risk Intelligence
  2. NGO Network
  3. Preparedness & Mock Drills
  4. Explainable NGO Recommendation
  5. Response Coordination
  6. Historical Impact Analysis
- Establishing strict data provenance tiers (`VERIFIED`, `DERIVED`, `SIMULATED`).
- Comprehensive documentation updates.

### Hours 17:00 – 20:00: Phase 4.1 — Preparedness & NGO Network Backend Implementation (Next)
- Implement Migration 002: `ngos`, `ngo_equipment`, `preparedness_tasks`, `ngo_task_assignments`, `historical_metrics`, `river_observations`.
- Implement endpoints for NGO directory, availability check-ins, 7-day preparedness tasks, and CWC river stage feeds.
- Implement explainable recommendation engine service with multi-criteria scoring.
- Seed verified ASDMA 3 June 2024 Kampur historical baseline data and Nagaon NGO capability archetypes.
- Automated tests verifying recommendation math, check-in staleness guards, and task transitions.

### Hours 20:00 – 22:00: Phase 4.2 — Frontend Module Integration & Risk Visuals
- Add Risk Intelligence Bar (IMD warnings, Kopili gauge water levels at Kampur & Dharamtul).
- Add NGO Network Directory panel (viewing verified equipment, helmsmen count, check-in recency).
- Add 7-Day Preparedness Protocol checklist & Readiness Index widget.
- Add Explainable NGO Recommendation modal linked to verified incidents.
- Add Historical Impact tab displaying the ASDMA 3 June 2024 Kampur dossier and flood hydrographs.

### Hours 22:00 – 24:00: Phase 4.3 — Final Verification, Local Orchestration & Pitch
- End-to-end integration tests (simulated offline report $\rightarrow$ sync $\rightarrow$ verification $\rightarrow$ recommendation $\rightarrow$ allocation).
- TypeScript zero-warning check across frontend and backend.
- Rehearsal of the 3-minute pitch and failure-resilient live demo.
