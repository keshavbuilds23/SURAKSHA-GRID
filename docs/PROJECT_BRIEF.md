# Project Brief — SURAKSHA GRID
### NGO-Focused Disaster Preparedness, Risk Intelligence and Response Coordination Platform
**Event:** WHYCODE4U HACKATHON 2026 | **Track:** Disaster Management & Humanitarian Tech

---

## 1. Executive Summary

During major river basin floods—such as the recurring monsoonal surges in the Brahmaputra and Kopili valleys of Assam—disaster management suffers from an acute operational disconnect. Hydrometeorological warnings issued by scientific agencies (IMD, CWC) often fail to trigger organized pre-disaster ground action. Frontline non-governmental organizations (NGOs) and community volunteer brigades want to help, but operate without verified intelligence, clear jurisdictional assignments, or audited equipment readiness. When catastrophic flood pulses strike, responders scramble reactively in an information vacuum.

**SURAKSHA GRID** is an **NGO-focused disaster preparedness, risk intelligence, and response coordination platform**.

### The Central Product Principle:
> *"Turn disaster intelligence into NGO preparedness and coordinated response."*

Built around a six-stage operational loop:
```
[ MONITOR ] ────► [ IDENTIFY ] ────► [ MATCH & ENGAGE ] ────► [ DRILL & PREPARE ] ────► [ COORDINATE ] ────► [ ANALYSE ]
River Gauges      Vulnerable         Recommend Verified      7-Day Mobilization &      Atomic Resource        Historical Gaps
& Weather         Communities        NGOs by Capability      Mock Drills               Dispatches & Sync      & Lessons
```

1. **Monitor:** Aggregates real-time/historical weather alerts (IMD), river gauge levels (CWC), and satellite inundation maps (NRSC/ISRO).
2. **Identify:** Maps vulnerable villages, raised high-ground shelters, and infrastructure breach points in riverine circles.
3. **Match & Engage:** Recommends verified local NGOs based on verified operational capabilities, inspected equipment, and live volunteer rosters.
4. **Drill & Prepare:** Guides opted-in NGOs through a structured 7-day preparedness programme with tabletop exercises (TTX) and equipment checks under non-intrusive notification rules (1 daily briefing).
5. **Coordinate:** Orchestrates atomic resource allocation, offline incident intake (IndexedDB), and human verification gates when disaster strikes.
6. **Analyse:** Visualizes historical flood impacts, river flood level thresholds, and preparedness gaps to enhance future community resilience.

---

## 2. Historical Pilot Case Study: 2024 Assam Floods

To ensure maximum realism, historical fidelity, and mathematical honesty, SURAKSHA GRID anchors its pilot demonstration in the **2024 Assam Floods**:
- **State:** Assam
- **District:** Nagaon (Central Assam)
- **Primary Operational Pilot Focus:** **Kampur Revenue Circle**
  - High riverine vulnerability along the Kopili and Borpani rivers.
  - Historical benchmark: **ASDMA Daily Flood Report of 3 June 2024**, documenting **267,358 affected people**, **98 submerged villages**, and **30 operational relief camps** in Kampur circle following Cyclone Remal remnants.
- **Autonomous Downstream River Reference:** **Dharamtul Gauge**
  - Situated on the Kopili River in neighboring Morigaon district.
  - Kept strictly as a separate hydrological monitoring reference station; **never** conflated with Kampur Revenue Circle.

---

## 3. The Six Core Product Modules

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SURAKSHA GRID CORE MODULES                      │
├──────────────────────────┬─────────────────────────────────────────────┤
│ MODULE                   │ PRIMARY CAPABILITIES                        │
├──────────────────────────┼─────────────────────────────────────────────┤
│ 1. Risk Intelligence     │ Weather warnings (IMD), river gauges (CWC), │
│                          │ satellite inundation (NRSC/ISRO), freshness.│
├──────────────────────────┼─────────────────────────────────────────────┤
│ 2. NGO Network           │ Verified rosters, audited equipment, active │
│                          │ check-ins, DDMA certification status.       │
├──────────────────────────┼─────────────────────────────────────────────┤
│ 3. Preparedness & Drills │ 7-day preparedness protocol, tabletop drills│
│                          │ 1-per-day non-intrusive notification policy.│
├──────────────────────────┼─────────────────────────────────────────────┤
│ 4. NGO Recommendation    │ Explainable multi-criteria scoring matching │
│                          │ proximity, capability, equipment & workload.│
├──────────────────────────┼─────────────────────────────────────────────┤
│ 5. Response Coordination │ Offline incident intake, human verification,│
│                          │ idempotent batch sync, atomic stock ledger. │
├──────────────────────────┼─────────────────────────────────────────────┤
│ 6. Historical Impact     │ Provenance-backed historical metrics, flood │
│    Analysis              │ duration curves, and preparedness gap review│
└──────────────────────────┴─────────────────────────────────────────────┘
```

---

## 4. Strict Data Provenance Model

All metrics and layers adhere to three unambiguous tiers ([`docs/data/HISTORICAL_DATA_PROVENANCE.md`](file:///c:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/docs/data/HISTORICAL_DATA_PROVENANCE.md)):
- **`VERIFIED`:** Documented government records (ASDMA daily flood reports, CWC danger level marks, IMD bulletins).
- **`DERIVED`:** Calculated geospatial proximity, risk indices, and multi-criteria recommendation scores.
- **`SIMULATED`:** Demonstration mock drill tasks, hypothetical NGO availability check-ins, and synthetic offline reports.

---

## 5. Technical Stack Continuity

SURAKSHA GRID preserves its established, resilient local-first architecture:
- **Frontend:** React 18, Vite, TypeScript, MapLibre GL JS, Tailwind CSS on port **5173**.
- **Offline Storage:** Browser IndexedDB via `idb` for persistent offline queueing.
- **Backend:** Node.js 22, Express, TypeScript, REST API (`/api/v1`) on port **5000**.
- **Database:** In-process SQLite via `better-sqlite3` with `WAL` mode, `PRAGMA foreign_keys = ON;`, and `PRAGMA busy_timeout = 5000;`.
- **Validation:** Zod schemas across client and server boundaries.
