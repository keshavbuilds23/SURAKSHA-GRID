# Feature Scope & Operational Boundaries — SURAKSHA GRID
### NGO-Focused Preparedness, Risk Intelligence and Response Coordination

---

## 1. Feature Classification Matrix

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CORE IN-SCOPE MODULES (MVP)                     │
├────────────────────────────────────────────────────────────────────────┤
│ 1. RISK INTELLIGENCE                                                   │
│    - IMD weather warnings & rainfall observations                      │
│    - CWC river gauge stages (Kopili at Kampur & Dharamtul)             │
│    - NRSC/ISRO satellite inundation layers & freshness indicators      │
│ 2. NGO NETWORK MANAGEMENT                                              │
│    - Verified NGO rosters, contact dossiers & operating circles        │
│    - Audited equipment catalog (boats, water purification, trauma kits)│
│    - Roster check-in tracking & staleness guard (>48h flag)            │
│ 3. PREPAREDNESS & MOCK DRILL MANAGEMENT                                │
│    - Structured 7-day preparedness programme with daily tasks          │
│    - Tabletop exercises (TTX) & readiness reporting                    │
│    - 1-daily notification rule with CWC/IMD threshold exception alerts │
│ 4. NGO RECOMMENDATION ENGINE                                           │
│    - Multi-criteria explainable matching (proximity, capacity, load)   │
│    - Advisory-only ranking with score breakdown (no auto-dispatch)     │
│ 5. RESPONSE COORDINATION (Preserved Core Capabilities)                 │
│    - Offline incident intake (IndexedDB + UUIDv4)                      │
│    - Idempotent batch sync & IDEMPOTENCY_CONFLICT preservation         │
│    - Human verification gate & server-calculated severity              │
│    - Canonical duplicate candidate detection (primary_id < candidate)  │
│    - Atomic inventory allocation & cancellation state machine          │
│    - Immutable incident event audit ledger                             │
│ 6. HISTORICAL IMPACT ANALYSIS                                          │
│    - 2024 Assam floods case study (ASDMA 3 June 2024 Kampur metrics)   │
│    - CWC historical flood level comparisons (Danger vs HFL)            │
│    - Preparedness gap analysis & data provenance tiers (VERIFIED/SIM)  │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   EXPLICIT EXCLUSIONS (Do NOT Build)                   │
├────────────────────────────────────────────────────────────────────────┤
│ - Autonomous AI Dispatch (AI never independently deploys boats/teams)  │
│ - Unverified Static Directories (No uninspected NGO profiles)          │
│ - Satellite Runoff Prediction (No custom hydrological DEM simulations) │
│ - Street-Tile Offline Caches (Offline map uses bundled boundary GeoJSON)│
│ - Live GPS Hardware Telemetry (No IoT black-box trackers on boats)     │
│ - Official Government Wire (No real-time ASDMA/NDRF integration claim) │
│ - Casualty Estimation from Space (Never estimate deaths from imagery)  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. In-Scope Module Specifications

### 2.1 Module A: Risk Intelligence
- **Hydrological Ingestion:** Displays real-time or historical river gauge stages for CWC stations on the Kopili River:
  - **Kampur Station (Nagaon):** Warning: 59.50m, Danger: 60.50m, HFL: 62.17m.
  - **Dharamtul Station (Morigaon):** Warning: 55.00m, Danger: 56.00m, HFL: 58.09m (Autonomous downstream reference).
- **Meteorological Tracking:** IMD warning alerts (Green, Yellow, Orange, Red) and 24h precipitation forecasts.
- **Geospatial Inundation:** Displays NRSC/ISRO Bhuvan satellite inundation vectors.
- **Data Quality & Freshness:** Every metric displays source agency, observation timestamp, and data tier (`VERIFIED` vs `SIMULATED`).

### 2.2 Module B: NGO Network Roster
- **Profile Dossier:** Name, registration, legal status, primary/secondary contact numbers, operating circles (Kampur, Jamunamukh, Raha).
- **Capability Schema:** Standardized specializations (`WATER_SEARCH_AND_RESCUE`, `MOBILE_MEDICAL_TRIAGE`, `WATER_SANITATION_WASH`, `RELIEF_CAMP_LOGISTICS`, `COMMUNITY_MOCK_DRILL`).
- **Audited Equipment:** Verified count and condition of inflatable motorized boats, lifejackets, water purification kits, trauma packs.
- **Availability Sentinel:** Enforces active check-in tracking. Failure to check in within 48 hours during an alert window flags the organization as `INACTIVE_STALE`.

### 2.3 Module C: Preparedness & Mock Drill Management
- **7-Day Protocol Engine:** Guides participating organizations through sequential daily readiness phases:
  - Day 1: Hydrometeorological Intelligence Briefing.
  - Day 2: Equipment Inspection & Motor Test.
  - Day 3: Volunteer Roster Confirmation.
  - Day 4: Community Warning & Evacuation Route Mapping.
  - Day 5: Virtual Tabletop Exercise (TTX).
  - Day 6: Inter-NGO Sector Harmonization Drill.
  - Day 7: Operational Standby & Asset Pre-Positioning.
- **Notification Discipline:**
  - One scheduled daily morning briefing at 07:00 IST.
  - Out-of-cycle alerts triggered strictly by CWC/IMD threshold crossings.
  - Full support for alert updates, downgrades, and cancellations.

### 2.4 Module D: Explainable NGO Recommendation Engine
- **Deterministic Multi-Criteria Scoring:**
  $$S = 0.25 S_{\text{geo}} + 0.30 S_{\text{cap}} + 0.20 S_{\text{eqp}} + 0.15 S_{\text{avail}} + 0.10 S_{\text{load}}$$
- **Human-in-the-Loop Decision Support:** Outputs a ranked list of candidate organizations with explicit sub-scores and human-readable explanation text.
- **No Autonomous Dispatch:** Coordinators review and authorize deployments manually.

### 2.5 Module E: Response Coordination (Preserved Core)
- **Offline Intake:** Progressive Web App with IndexedDB outbox via `idb` and UUIDv4 `client_report_id`.
- **Idempotent Batch Sync:** `/api/v1/sync/batch` handles partial-batch itemized outcomes (`synced`, `already_synced`, `rejected`), flagging payload conflicts with `IDEMPOTENCY_CONFLICT` without overwriting earlier drafts.
- **Human Verification Gate:** Ingested reports arrive in `PENDING` status. Verification (`PATCH /incidents/:id/verify`) is a hard prerequisite for resource allocation.
- **Server Severity Calculation:** Initial severity (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) is calculated deterministically on the server; coordinator escalation requires a mandatory justification reason.
- **Canonical Duplicate Detection:** `duplicate_candidates` table enforces canonical ordering (`primary_id < candidate_id`), preventing duplicate pairs while preserving coordinator review authority.
- **ACID Resource Ledger:** Atomic SQLite transactions enforce `available_quantity` balance, with assignment state machine distinguishing undispatched cancellation (restoring stock) from in-field cancellation (requiring depot return).
- **Audit Timeline:** Append-only event history logged to `incident_events`.

### 2.6 Module F: Historical Impact Analysis
- **Authoritative 2024 Baseline:** Incorporates ASDMA 3 June 2024 Kampur Revenue Circle dataset:
  - 267,358 affected persons, 98 submerged villages, 30 relief camps, 6,432 inmates.
- **Threshold Analysis:** Interactive comparison of Kopili flood stages against historical flood levels (2004 vs 2022 HFL).
- **Gap & Lessons Learned:** Visualizes response delays, supply bottlenecks, and areas where 7-day preparedness would optimize resource prepositioning.
- **Source Labeling:** Every historical metric displays source organization, publication date, and data tier.
