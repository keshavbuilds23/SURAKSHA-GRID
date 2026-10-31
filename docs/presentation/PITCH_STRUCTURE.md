# 5-Minute Pitch Deck Structure — SURAKSHA GRID
### Slide-by-Slide Presentation Guide for WHYCODE4U Hackathon 2026

---

## 1. Pitch Overview

- **Format:** 8 Slides | Total Time: 5 Minutes (300 Seconds) + 2 Minutes Q&A.
- **Tone:** Technical, grounded, mission-driven, and intellectually honest.
- **Core Message:** Turn disaster intelligence into NGO preparedness and coordinated ground response.

---

## 2. Slide-by-Slide Breakdown

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   SLIDE 1    │  │   SLIDE 2    │  │   SLIDE 3    │  │   SLIDE 4    │
│ Title & Team │  │ The Problem: │  │ The Insight: │  │ Core Modules │
│ NGO Platform │  │ Warning Gap  │  │ Preparedness │  │ Architecture │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
       │                 │                 │                 │
       ▼                 ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   SLIDE 5    │  │   SLIDE 6    │  │   SLIDE 7    │  │   SLIDE 8    │
│ Live Demo &  │  │ Tech Depth:  │  │ Data Integrity│ │ Roadmap &    │
│ Rec Engine   │  │ WAL & Offline│  │ & Ethics     │  │ Prototype    │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

---

### Slide 1: Title & Vision (30 Seconds)
- **Visual:** Light enterprise aesthetic; project title **SURAKSHA GRID (सुरक्षा ग्रिड)**; subtitle: *NGO-Focused Disaster Preparedness, Risk Intelligence and Response Coordination Platform*.
- **Presenter:**
  - Introduce team and track: WHYCODE4U Hackathon 2026.
  - State the core principle: *"Turn disaster intelligence into NGO preparedness and coordinated response."*

---

### Slide 2: The Real Disaster: The Warning-to-Action Chasm (45 Seconds)
- **Visual:** Map graphic of the 2024 Assam Floods in Kampur Revenue Circle, Nagaon. ASDMA metrics: 267,358 affected, 98 submerged villages, Kopili River overtopping.
- **Presenter:**
  - Early warnings exist: IMD and CWC predict heavy rainfall and river surges days in advance.
  - The fatal breakdown: warnings fail to trigger organized ground preparedness. When water breaks embankments, response is reactive, chaotic, and uncoordinated.
  - Relief agencies rely on static, outdated directories with unverified claims and inactive volunteers.

---

### Slide 3: The Architectural Insight: Active Roster Preparedness (40 Seconds)
- **Visual:** Comparison chart: *Static Directory (Stale & Broken Equipment)* vs. *SURAKSHA GRID (7-Day Active Readiness Protocol)*.
- **Presenter:**
  - Disaster readiness is not a phone book; it is a live operational state machine.
  - By structuring a 7-day pre-disaster programme (equipment testing, volunteer check-ins, tabletop drills) under disciplined 1-daily notifications, we turn raw risk intelligence into community readiness before the first embankment breaches.

---

### Slide 4: System Architecture & The Six Core Modules (45 Seconds)
- **Visual:** Architecture diagram illustrating the six interconnected modules:
  1. Risk Intelligence (IMD, CWC Kopili Gauges, NRSC Satellite)
  2. NGO Network (Active Check-ins, Verified Equipment)
  3. Preparedness & Drills (7-Day Protocol, Tabletop Exercises)
  4. Explainable Recommendation Engine (Multi-Criteria Scoring)
  5. Response Coordination (Offline IndexedDB, Verification Gate, ACID Ledger)
  6. Historical Impact Analysis (ASDMA 3 June 2024 Kampur Baseline)
- **Presenter:**
  - React 18 + MapLibre client on port 5173; Node.js 22 + Express API on port 5000.
  - In-process SQLite engine with WAL mode and `busy_timeout = 5000ms`.

---

### Slide 5: Live Demonstration & Workflow (60 Seconds)
- **Visual:** Live screen demonstration of the 3-minute workflow.
- **Presenter:**
  - Show CWC river gauge trigger at Kampur (exceeding 60.50m Danger Level).
  - Open explainable recommendation modal: show why *Kampur Jal-Suraksha Vahini* is recommended (proximity, 4 inspected motorboats, 12 active helmsmen).
  - Cut connection: file report completely offline into browser IndexedDB.
  - Reconnect: show idempotent batch sync, human verification, and atomic boat dispatch with zero over-allocation.

---

### Slide 6: Technical Depth, Concurrency & Resilience (40 Seconds)
- **Visual:** Multi-criteria recommendation formula ($S = 0.25 S_{\text{geo}} + 0.30 S_{\text{cap}} + 0.20 S_{\text{eqp}} + 0.15 S_{\text{avail}} + 0.10 S_{\text{load}}$), SQLite ACID constraints, and IndexedDB outbox.
- **Presenter:**
  - Recommendation engine is 100% deterministic and explainable: zero black-box hallucinations.
  - SQLite WAL mode and `ON DELETE RESTRICT` eliminate inventory race conditions.
  - Offline sync handles itemized partial batches and preserves conflicting drafts via `IDEMPOTENCY_CONFLICT`.

---

### Slide 7: Ethical AI, Data Provenance & Scope Discipline (30 Seconds)
- **Visual:** The Three Data Provenance Tiers: `VERIFIED` (Official ASDMA/CWC), `DERIVED` (Scores/Proximity), `SIMULATED` (Drill scenarios).
- **Presenter:**
  - Strict human authority: AI/algorithms never execute autonomous dispatches.
  - Absolute data honesty: we never estimate casualties from satellite imagery, never invent NGO partnerships, and never claim unvalidated flood prediction.
  - All metrics carry explicit provenance badges.

---

### Slide 8: Future Roadmap & Prototype Conclusion (20 Seconds)
- **Visual:** Summary slide and local-first architecture highlights.
- **Presenter:**
  - Built as a robust, local-first engineering prototype (ports 5173 / 5000) with zero external cloud fragility.
  - Future vision: Expanding offline sync over local peer-to-peer Wi-Fi Direct and community VHF packet radios for frontline flood brigades.
  - Thank the judges and open the floor for technical Q&A.
