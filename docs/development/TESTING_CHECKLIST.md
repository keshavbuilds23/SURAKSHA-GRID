# Verification & Testing Checklist — SURAKSHA GRID
### Multi-Tiered Quality Assurance, Test Registry and Audit Protocol

---

## 1. Automated Test Execution Status

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AUTOMATED TEST STATUS SUMMARY                   │
├────────────────────────────┬─────────────┬──────────────┬──────────────┤
│ TEST SUITE                 │ ENGINE      │ PASS RATE    │ EXIT CODE    │
├────────────────────────────┼─────────────┼──────────────┼──────────────┤
│ Resource Lifecycle Service │ Node.js ESM │ 6/6 (100%)   │ 0 (PASS)     │
│ Sync & Conflict Engine     │ Node.js ESM │ 6/6 (100%)   │ 0 (PASS)     │
│ Chrome IndexedDB E2E       │ Chrome CDP  │ 9/9 (100%)   │ 0 (PASS)     │
│ Chrome UI User Journeys    │ Chrome CDP  │ 9/9 (100%)   │ 0 (PASS)     │
│ Backend Environment (Zod)  │ Node.js TS  │ 6/6 (100%)   │ 0 (PASS)     │
│ Backend DB & Schema Mig 001│ Node.js TS  │ 5/5 (100%)   │ 0 (PASS)     │
│ Backend Error Sanitization │ Supertest   │ 6/6 (100%)   │ 0 (PASS)     │
│ Backend Health Endpoint    │ Supertest   │ 4/4 (100%)   │ 0 (PASS)     │
│ Frontend TypeScript Build  │ tsc + Vite  │ 0 Errors     │ 0 (PASS)     │
│ Backend TypeScript Build   │ tsc         │ 0 Errors     │ 0 (PASS)     │
└────────────────────────────┴─────────────┴──────────────┴──────────────┘
```

---

## 2. Completed Verification Checkpoints

### 2.1 Backend Foundation & Resilience (Phase 3.1)
- [x] **SQLite Pragmas:** Enforces `foreign_keys = ON`, `journal_mode = WAL`, and `busy_timeout = 5000ms`.
- [x] **Schema Migration 001:** Creates 6 core tables; verified idempotent on repeated execution without data loss.
- [x] **Canonical Duplicate Constraint:** `CHECK (primary_incident_id < candidate_incident_id)` verified; rejects non-canonical pairs.
- [x] **Zod Startup Validation:** Rejects privileged ports (< 1024), invalid enums, and production `JWT_SECRET` with length < 32 characters.
- [x] **Information Sanitization:** Centralized error handler verified; raw SQL, table names, and stack traces are suppressed in production.
- [x] **Zero Credential Leakage:** Probed live `GET /api/v1/health`; verified zero exposure of secrets, credentials, or internal file paths.

### 2.2 Client-Side Offline Resilience & State Machines (Phase 2)
- [x] **Real IndexedDB Persistence:** Verified in live headless Chrome; distress reports persist across `Page.reload` and full browser process termination.
- [x] **Idempotency & Conflict Guard:** Resubmitting an identical payload acknowledges `already_synced`; resubmitting altered payload triggers `IDEMPOTENCY_CONFLICT`, preserving original drafts.
- [x] **Non-Destructive Forking:** Option A forks conflicting reports with a fresh UUIDv4 and sets `follow_up_to_incident_id`, maintaining zero data loss.
- [x] **Resource Lifecycle Machine:**
  - Undispatched cancellation (`ASSIGNED` $\rightarrow$ `CANCELLED`) atomically restores inventory (`inventory_restored = 1`).
  - Dispatched cancellation (`IN_TRANSIT` $\rightarrow$ `CANCELLED`) leaves inventory unrestored (`inventory_restored = 0`).
  - Physical depot return (`DELIVERED`/recalled $\rightarrow$ `RETURNED`) atomically restores inventory.
  - Transition guard strictly blocks duplicate restoration attempts (`INVENTORY_ALREADY_RESTORED`).

---

## 3. Test Specifications for Phase 4.1+ (NGO & Preparedness Modules)

The following test suites must be implemented and verified during Phase 4.1:

### 3.1 Database Migration 002 Tests
- [ ] Verify creation of `ngos`, `ngo_equipment`, `preparedness_tasks`, `ngo_task_assignments`, `historical_metrics`, and `river_observations`.
- [ ] Verify foreign key constraints (`ON DELETE CASCADE` on equipment and task assignments).
- [ ] Verify idempotency: running `initializeSchema()` multiple times applies migration 002 exactly once.

### 3.2 NGO Network & Check-in Tests
- [ ] Verify registration of NGO profiles with valid contact dossiers and operating circles.
- [ ] Verify `POST /api/v1/ngos/:id/checkin` updates `last_availability_checkin` timestamp.
- [ ] Verify staleness sentinel: query correctly identifies organizations with `last_availability_checkin` older than 48 hours during an active alert.
- [ ] Verify DDMA verification gate: only `VERIFIED_ACTIVE` organizations qualify for recommendation.

### 3.3 Preparedness & Task Lifecycle Tests
- [ ] Verify retrieval of 7-day preparedness programme schedule and tasks.
- [ ] Verify task assignment transitions (`ASSIGNED` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `COMPLETED`).
- [ ] Verify Kampur Circle Readiness Index calculation:
  $$\text{Score} = 0.35 \times (\text{Tasks}) + 0.30 \times (\text{Equipment}) + 0.20 \times (\text{Roster}) + 0.15 \times (\text{TTX})$$
- [ ] Verify non-intrusive notification rules: exactly 1 scheduled briefing; threshold alerts trigger only on CWC/IMD level crossings.

### 3.4 Explainable Recommendation Engine Tests
- [ ] Verify multi-criteria composite score formulation with normalized weights ($0.25, 0.30, 0.20, 0.15, 0.10$).
- [ ] Verify proximity calculation using Haversine formula from staging depot to incident coordinates.
- [ ] Verify access constraint filter: an NGO without verified boats receives $0$ proximity score if road access is impassable.
- [ ] Verify explainable output: recommendation dossier includes human-readable justification text alongside sub-scores.
- [ ] Verify human authority constraint: recommendation engine outputs advisory suggestions only and cannot execute dispatches.

### 3.5 Historical Provenance & Baseline Integrity Tests
- [ ] Verify retrieval of ASDMA 3 June 2024 Kampur dataset: 267,358 affected, 98 villages, 30 relief camps.
- [ ] Verify data tier tagging: all historical records carry explicit `data_tier = 'VERIFIED'`.
- [ ] Verify separation of CWC gauge stations: Kopili at Kampur (Nagaon) and Kopili at Dharamtul (Morigaon) maintain distinct records.
