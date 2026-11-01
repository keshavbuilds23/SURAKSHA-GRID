# SURAKSHA GRID (सुरक्षा ग्रिड)
### NGO-Focused Disaster Preparedness, Risk Intelligence and Response Coordination Platform
**Project for WHYCODE4U HACKATHON 2026**

---

> [!IMPORTANT]
> **HACKATHON PROTOTYPE NOTICE & SIMULATION DISCLAIMER**
> SURAKSHA GRID is an engineering prototype developed exclusively for the **WHYCODE4U Hackathon 2026**. 
> - All disaster scenarios, geographic coordinates, incident descriptions, and flood operational datasets used in this repository are **STRICTLY SIMULATED** (modeled around representative scenarios in the Brahmaputra River Basin, Assam).
> - This project does **NOT** claim active integration with government emergency authorities (e.g., NDRF, SDRF, ASDMA), does not provide real-time automated dispatch of emergency services, does not provide satellite-derived hydrological flood prediction, does not bundle offline street-level raster tile packages, and must **never** be used as a primary life-safety or evacuation system in a live disaster.

---

## 1. Project Overview

During major monsoon floods, communication networks (cellular towers, fiber backhauls, and electrical grids) suffer widespread failures. Vulnerable citizens and field volunteers on the ground are cut off from district emergency operations centers. When sporadic connectivity flickers back, dispatch centers face an avalanche of unverified rumors, stale requests, and duplicate calls that overwhelm rescue coordinators.

**SURAKSHA GRID** is an offline-first disaster response coordination system built to solve this critical last-mile breakdown. Designed with a strict **"Human-in-the-Loop"** philosophy, it empowers local volunteers and citizens to log geolocated or landmark-referenced distress reports without internet access. When a device momentarily regains connectivity, reports safely synchronize to an operational dashboard where human coordinators verify claims, resolve duplicate candidate suggestions, and atomically allocate rescue resources.

---

## 2. Core Operational Workflow

SURAKSHA GRID enforces a resilient five-stage coordination loop:

```
[ REPORT ] ──────► [ VERIFY ] ──────► [ PRIORITIZE ] ──────► [ ALLOCATE ] ──────► [ TRACK ]
Citizen/Volunteer   Human Dispatcher    Server Severity       Atomic Ledger       Status & Event
Logs Incident       Validates Ground    & Canonical Dedupe    Dispatches / Cancels Timeline Updated
(Online or Offline) Reality             Grouping              Kits & Boats        to Resolution
```

1. **REPORT:** Citizens or field volunteers capture incident details (hazard type, landmark, coordinates, affected people, optional subjective urgency) in an offline-capable Progressive Web Application (PWA) backed by browser IndexedDB.
2. **VERIFY:** Reports entering the system arrive with `PENDING` verification status. Human coordinators must inspect and transition them to `VERIFIED` or `REJECTED` via a dedicated verification endpoint. Resources cannot be dispatched to unverified incidents.
3. **PRIORITIZE:** Operational `severity` (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) is calculated on the server using deterministic rules upon ingest, and can be manually escalated by coordinators via a dedicated `/severity` endpoint with mandatory justification logging. Canonical duplicate candidates (`primary_id < candidate_id`) alert coordinators without automatic merges. Idempotency guarantees safe replays, while conflicting payloads trigger an explicit `IDEMPOTENCY_CONFLICT` so original reports are never overwritten.
4. **ALLOCATE & CANCEL:** Coordinators view live inventory (rescue boats, medical rations, water purification kits) and commit allocations via atomic database transactions (`ON DELETE RESTRICT`). Undispatched cancellations restore stock immediately; in-transit cancellations require physical depot check-in via `/return`, preventing double-restoration or inventory drift.
5. **TRACK:** Every status change, verification decision, severity adjustment, and resource assignment/cancellation/return is written to an immutable audit event timeline (`incident_events`) for total operational transparency.

---

## 3. System Architecture & Tech Stack

SURAKSHA GRID is engineered with lightweight, resilient, and deterministic technologies optimized for rapid deployment and high reliability under degraded conditions:

| Layer | Technology | Key Responsibility |
|---|---|---|
| **Frontend UI** | React 18, Vite, TypeScript | Fast, type-safe, reactive interface on port `5173` with responsive disaster dashboard |
| **Interactive Map** | MapLibre GL JS + GeoJSON | Dual-mode: Streams public tiles online; falls back to bundled GeoJSON boundaries on neutral grid offline |
| **Offline Engine** | IndexedDB (`idb`) & Service Worker | Persistent client queueing, offline caching, and fault-tolerant partial batch sync |
| **Backend API** | Node.js, Express | Modular REST service on port **`5000`** (`/api/v1`) with role middleware, rate limits, and DTO redaction |
| **Data Validation** | Zod | Strict schema validation sharing contracts across client and server boundaries |
| **Database Engine** | SQLite (`better-sqlite3`) | In-process ACID engine with `WAL` mode, `PRAGMA busy_timeout = 5000`, and `ON DELETE RESTRICT` constraints |
| **Security & Auth** | JWT (`jsonwebtoken`) & `bcryptjs` | Role-based authorization (`citizen`, `volunteer`, `coordinator`, `admin`) and salt hashing |
| **Deployment Target** | Local-First Orchestration (Ports 5173 / 5000) | Guaranteed zero-failure local demo on `localhost:5173` and `localhost:5000`; cloud hosting secondary |

---

## 4. Architectural Boundaries & Project Scope

### What SURAKSHA GRID IS:
- A targeted, lightweight incident intake, triage, and resource allocation coordination console.
- A functional demonstration of resilient offline data queuing and fault-tolerant partial batch synchronization.
- A deterministic decision-support tool ensuring coordinators retain full oversight, server-calculated severity, and human verification.
- A privacy-respecting platform enforcing backend DTO redaction for public views.
- A standardized local-first system configured strictly on port 5000 (backend) and port 5173 (frontend).

### What SURAKSHA GRID IS NOT (Explicit Exclusions):
- ❌ **Not a satellite imagery analyzer:** No raw radar (SAR) or optical satellite water-masking computations.
- ❌ **Not a predictive hydrological model:** No runoff forecasting, dam-break simulations, or predictive flood depth modeling.
- ❌ **Not an automated routing engine:** No guaranteed safe-evacuation turn-by-turn road navigation.
- ❌ **Not an offline street-tile repository:** Offline map uses bundled district vector boundaries, not multi-gigabyte street map tile caches.
- ❌ **Not a live fleet telemetry tracker:** No real-time GPS beacon hardware tracking on physical rescue boats or ambulances.
- ❌ **Not an official government integration:** No real-time wire into 112, NDRF, or state disaster portals.
- ❌ **Not an autonomous AI dispatcher:** AI is strictly auxiliary (if used at all) and never takes independent operational actions.

---

## 5. Role of Artificial Intelligence (Gemini Integration Policy)

1. **Optional & Non-Blocking:** The core application operates 100% deterministically without requiring Gemini or external AI APIs.
2. **Strictly Advisory:** If enabled during stretch time, Gemini is restricted to non-critical text parsing (e.g., standardizing verbose descriptions or suggesting report categories).
3. **No Autonomous Decision-Making:** AI is strictly forbidden from independently changing incident verification status, adjusting severity, dismissing duplicates, or triggering resource allocation.
4. **Zero Hallucination Tolerance:** The system will never ask an AI model to invent emergency numbers, survivor names, or casualty estimates.

---

## 6. Quick Start & Judge Evaluation Guide

Follow these steps to run the complete stack locally and evaluate all coordinator workflows.

### 6.1 Prerequisites
- **Node.js**: v18.0.0 or higher
- **Package Manager**: `npm`

---

### 6.2 Installation & Server Startup

#### Step 1: Start Backend (Port 5000)
```bash
cd backend
cp .env.example .env            # Sets NODE_ENV=development and dev configuration
npm install
npm run provision:coordinator   # Provisions local SQLite db and evaluation coordinator
npm run seed:demo               # Seeds demo NGO dossier (assam_relief_demo)
npm run dev                     # Starts Express REST API at http://localhost:5000
```

#### Step 2: Start Frontend (Port 5173) in a second terminal
```bash
# In repository root:
npm install
npm run dev                     # Starts Vite React client at http://localhost:5173
```

---

### 6.3 Local Evaluation Coordinator Credentials

> [!NOTE]
> **LOCAL DEMO CREDENTIALS ONLY**: These credentials are provided strictly for local hackathon judging and evaluation. In production deployments, coordinator accounts are provisioned exclusively through authorized command procedures and hashed using bcrypt.

| Field | Evaluation Value | Notes |
|---|---|---|
| **Role** | `coordinator` | Full administrative verification and dispatch authority |
| **Username** | `coord_assam_dev` | Case-insensitive identifier |
| **Password** | `SurakshaDev@2026` | Configurable via `DEV_COORDINATOR_PASSWORD` env var |

---

### 6.4 How to Sign In & Test Privileged Features

1. Open **`http://localhost:5173`** in your browser.
2. The UI starts in **Public Mode** (`Role: Public`) with read-only access and privacy-redacted citizen/contact data.
3. Click **"Coordinator Sign In"** in the top navigation bar (or in the **NGO Network** tab).
4. Enter `coord_assam_dev` and `SurakshaDev@2026`.
5. Click **"Sign In as Coordinator"**. The top bar updates to **`Coordinator Active`**, unlocking:
   - **Incident Triage (`/details` tab)**: Review ground truth and confirm incidents via the coordinator verification gate.
   - **NGO Network (`/ngos` tab)**:
     - Register new partner NGOs.
     - Inspect partner dossiers and manage staging depots, equipment inventory, and certified capabilities.
     - Conduct 5-D audit verifications (`DOCUMENTED_IN_DDMP`, `IDENTITY_VERIFIED`, `CURRENTLY_OPERATIONAL`, `AVAILABILITY_CONFIRMED`, `EQUIPMENT_INDEPENDENTLY_VERIFIED`).
     - Promote verified NGOs from simulated to operational status.
   - **Recommendation Engine (Phase 4.5)**:
     - In Incident Triage, click **"Match Partner NGOs"** to run explainable multi-criteria matching.
     - Toggle between **Live Operational Match** and **Demo Simulation Match**.
     - Inspect composite scores $(0-100)$, distance to nearest depots, and full justification audit bullets.
6. To sign out, click the **"Logout"** button in the header bar.

---

### 6.5 Running Test Suites

```bash
# Run complete backend integration test suite (86 tests covering auth, RBAC, NGOs, recommendations):
cd backend
npm test

# Run backend typecheck:
npm run typecheck

# Build frontend production bundle:
cd ..
npm run build
```

---

## 7. Project Documentation Index

Detailed specifications are maintained in the [`docs/`](file:///C:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/docs) directory:

- **AI Policy & Developer Guidelines:** [`AGENTS.md`](file:///C:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/AGENTS.md)
- **Project Brief:** [`docs/PROJECT_BRIEF.md`](file:///C:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/docs/PROJECT_BRIEF.md)
- **Problem Analysis & Disaster Context:** [`docs/PROBLEM_ANALYSIS.md`](file:///C:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/docs/PROBLEM_ANALYSIS.md)
- **Feature Scope (In-Scope vs. Exclusions):** [`docs/FEATURE_SCOPE.md`](file:///C:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/docs/FEATURE_SCOPE.md)
- **Historical Data & Provenance Registry:** [`docs/data/HISTORICAL_DATA_PROVENANCE.md`](file:///C:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/docs/data/HISTORICAL_DATA_PROVENANCE.md)
- **NGO Network & Capability Model:** [`docs/ngo/NGO_NETWORK_MODEL.md`](file:///C:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/docs/ngo/NGO_NETWORK_MODEL.md)
- **7-Day Preparedness Protocol:** [`docs/preparedness/PREPAREDNESS_PROGRAMME.md`](file:///C:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/docs/preparedness/PREPAREDNESS_PROGRAMME.md)
- **Explainable Recommendation Methodology:** [`docs/recommendations/RECOMMENDATION_ENGINE.md`](file:///C:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/docs/recommendations/RECOMMENDATION_ENGINE.md)
- **Architecture Documentation:**
  - System Architecture & Data Flows: [`docs/architecture/SYSTEM_ARCHITECTURE.md`](file:///C:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/docs/architecture/SYSTEM_ARCHITECTURE.md)
  - SQLite Database Schema & DDL: [`docs/architecture/DATABASE_SCHEMA.md`](file:///C:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/docs/architecture/DATABASE_SCHEMA.md)
  - REST API Contract (`/api/v1`): [`docs/architecture/API_CONTRACT.md`](file:///C:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/docs/architecture/API_CONTRACT.md)
  - Technology Stack & Trade-Off Analysis: [`docs/architecture/TECH_STACK.md`](file:///C:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/docs/architecture/TECH_STACK.md)
- **Development & Execution:**
  - 24-Hour Execution Schedule: [`docs/development/24_HOUR_EXECUTION_PLAN.md`](file:///C:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/docs/development/24_HOUR_EXECUTION_PLAN.md)
  - Two-Developer Task Assignment: [`docs/development/TASK_ASSIGNMENT.md`](file:///C:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/docs/development/TASK_ASSIGNMENT.md)
  - Testing & Offline Validation Protocol: [`docs/development/TESTING_CHECKLIST.md`](file:///C:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/docs/development/TESTING_CHECKLIST.md)
- **Security & Privacy:**
  - Security, Threat Model & RBAC: [`docs/security/SECURITY_CHECKLIST.md`](file:///C:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/docs/security/SECURITY_CHECKLIST.md)
- **Presentation & Pitch:**
  - 3-Minute Live Demonstration Script: [`docs/presentation/DEMO_SCRIPT.md`](file:///C:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/docs/presentation/DEMO_SCRIPT.md)
  - 5-Minute Pitch Deck Structure: [`docs/presentation/PITCH_STRUCTURE.md`](file:///C:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/docs/presentation/PITCH_STRUCTURE.md)

---

## 8. License & Compliance

This project is licensed under the terms of the [MIT License](file:///C:/Users/Keshav/OneDrive/Desktop/Timepass(Hackathon)/SURAKSHA-GRID/LICENSE).
Developed for academic and competitive evaluation at the WHYCODE4U Hackathon 2026.
