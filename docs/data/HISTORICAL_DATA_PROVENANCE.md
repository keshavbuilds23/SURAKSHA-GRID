# Historical Disaster Data Provenance & Source Registry — SURAKSHA GRID
### Authoritative Case Study: 2024 Assam Floods (Kampur Revenue Circle Pilot)
**Document Version:** 1.3.0 (Phase 4.0.3 Audit & Terminology Alignment)  
**Audit Status:** Rigorously Audited & Reconciled Against CWC/ASDMA Primary Sources  
**Last Verified Date:** 2026-10-31  

---

## 1. Data Integrity & Provenance Classification Model

SURAKSHA GRID mandates absolute transparency, evidentiary traceability, and mathematical honesty across all datasets. In high-stakes disaster risk intelligence and humanitarian operations, conflating synthetic test scenarios with ground truth can lead to dangerous operational miscalculations.

Every dataset, layer, metric, and record in SURAKSHA GRID is categorized into one of four mutually exclusive, standardized tiers:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              STANDARDIZED DATA PROVENANCE TIERS                        │
├─────────────┬──────────────────────────────────────────┬───────────────────────────────┤
│ TIER        │ RIGOROUS DEFINITION                      │ ENFORCED METADATA CONTRACT    │
├─────────────┼──────────────────────────────────────────┼───────────────────────────────┤
│ VERIFIED    │ Directly supported by authoritative      │ Source Document, Issuing Org, │
│             │ official documentation from recognized   │ Pub Date, Exact Page/Table,   │
│             │ state authorities (ASDMA, CWC, IMD).     │ Scope, Source URL, Unit.      │
├─────────────┼──────────────────────────────────────────┼───────────────────────────────┤
│ DERIVED     │ Reproducibly calculated, joined, or      │ Methodology Equation, Input   │
│             │ transformed from identified, verified    │ Datasets, Transformation Code,│
│             │ source data.                             │ Confidence Rating, Limits.    │
├─────────────┼──────────────────────────────────────────┼───────────────────────────────┤
│ SIMULATED   │ Invented demonstration data, synthetic   │ Explicit Demo Warning, Bounds,│
│             │ scenarios, mock geometries, and mock     │ Archetype Classification, No  │
│             │ volunteer/equipment profiles.            │ Claim of Real-World Identity. │
├─────────────┼──────────────────────────────────────────┼───────────────────────────────┤
│ UNVERIFIED  │ A claim or dataset whose primary source, │ Verification Blocker Reason,  │
│             │ geographic scope, or empirical accuracy  │ Provisional Flag, Scope Note. │
│             │ cannot currently be established.         │                               │
└─────────────┴──────────────────────────────────────────┴───────────────────────────────┘
```

> [!CRITICAL]
> **Prohibition Against Data Pollution:**
> - Never classify invented or synthetic mock geometries as `DERIVED`; all synthetic assets must be classified as `SIMULATED`.
> - Never mix simulated data with verified historical data without unambiguous visual labels and demo watermarks.
> - Never present simulated forecasts or mock drill tasks as active real-world alerts.
> - Never estimate casualties or injuries from satellite inundation polygons.
> - Never claim live automated integration with government emergency services unless formally certified.

---

## 2. Historical Pilot Geography: 2024 Assam Floods

### 2.1 Geographic Hierarchy & Administrative Boundary Rules
- **State:** Assam
- **District:** Nagaon (Central Brahmaputra Valley)
- **Primary Operational Pilot Area:** **Kampur Revenue Circle**
  - Traversed by the **Kopili** and **Borpani** rivers.
  - High vulnerability due to low-lying alluvial floodplains and rapid flash-flood pulses following intense rainfall in the upstream Karbi Anglong and Dima Hasao hills.
- **Reference Monitoring Station (Autonomous Downstream):** **Dharamtul**
  - Geographically situated downstream on the Kopili River in the neighboring **Morigaon district** (approximately 38 km downstream by river channel from Kampur).
  - Maintained as an autonomous downstream river-monitoring gauge.
  - **Explicit Architectural Rule:** Dharamtul is located in Morigaon District and must **NEVER** be conflated with or represented as part of Kampur Revenue Circle or Nagaon District.

---

## 3. Authoritative Historical Baseline: ASDMA 3 June 2024 Report

The initial historical pilot benchmark derives directly from the official Daily Flood Situation Report issued by the **Assam State Disaster Management Authority (ASDMA)** on **3 June 2024 (17:00 IST)**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│             ASDMA DAILY FLOOD REPORT — CIRCLE & DISTRICT BREAKDOWN (03-06-2024)        │
├───────────────────────────────┬───────────────────────────────┬────────────────────────┤
│ METRIC                        │ KAMPUR REVENUE CIRCLE         │ NAGAON DISTRICT TOTAL  │
├───────────────────────────────┼───────────────────────────────┼────────────────────────┤
│ Reporting Date & Time         │ 2024-06-03 17:00 IST          │ 2024-06-03 17:00 IST   │
│ Reporting Authority           │ SEOC, ASDMA, Govt. of Assam   │ SEOC, ASDMA            │
│ Affected Population           │ 267,358 persons (VERIFIED)    │ 291,489 persons        │
│ Affected Revenue Villages     │ 98 villages (VERIFIED)        │ 112 villages           │
│ Operational Relief Camps      │ 27 camps (VERIFIED)           │ 30 camps (VERIFIED)    │
│                               │ (Kampur circle)               │ (27 Kampur + 3 Raha)   │
│ Relief Camp Inmates           │ 6,432 residents (VERIFIED)    │ 7,120 inmates (VERIFIED│
│ Relief Distribution Centers   │ 18 centers (VERIFIED)         │ 22 centers             │
│ Inundated Crop Land           │ 3,214.50 ha (UNVERIFIED       │ 3,842.00 ha            │
│                               │ AT CIRCLE SCOPE)              │ (District reported)    │
│ Infrastructure Breaches       │ 4 washouts, 2 culvert breaks  │ 7 road breaches        │
│                               │ (UNVERIFIED AT CIRCLE SCOPE)  │ (District reported)    │
│ River Status at Kampur        │ Kopili flowing ABOVE DL       │ Kopili ABOVE DL        │
├───────────────────────────────┴───────────────────────────────┴────────────────────────┤
│ PRIMARY SOURCE: ASDMA Daily Flood Situation Report, State Emergency Operations Centre │
│ Date: 03-06-2024, 17:00 IST. Annexure I (Population & Villages), Annexure II (Relief)  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Geographic Scope Discrepancy Resolution (27 vs 30 Relief Camps)
- **Kampur Revenue Circle:** Officially operated **27 Relief Camps** sheltering **6,432 inmates** (ASDMA Annexure II).
- **Raha Revenue Circle:** Officially operated **3 Relief Camps** sheltering **688 inmates** (ASDMA Annexure II).
- **Nagaon District Total:** Officially operated **30 Relief Camps** ($27 + 3 = 30$) sheltering **7,120 inmates** ($6,432 + 688 = 7,120$) across the entire district.
- **Relief Distribution Centres (RDCs):** Kampur operated **18 operational RDCs** for non-camp rural families stranded on elevated road verges.
- **Scope Integrity:** All system layers and database tables must record figures with explicit administrative scope (`scope: 'REVENUE_CIRCLE'` vs `scope: 'DISTRICT'`).

### 3.2 Audit of Crop Land and Infrastructure Damage Claims
- **Crop Land Submergence:** While ASDMA Annexure I reports `3,842.00 hectares` of affected crop area for Nagaon District as a whole, the circle-level figure of `3,214.50 hectares` was not separately broken down in the published SEOC state bulletin. Therefore, `3,214.50 ha` is classified as **UNVERIFIED AT CIRCLE SCOPE** to prevent presenting district or sub-divisional estimates as circle ground truth.
- **Infrastructure Breaches:** ASDMA Annexure V lists district-level road breaches (7 locations across Nagaon). The attribution of exactly "4 PWD road washouts and 2 culvert breaches" to Kampur circle is not separately gazetted in the state bulletin and is classified as **UNVERIFIED AT CIRCLE SCOPE**.

---

## 4. Hydrological Monitoring Registry: CWC River Gauges

Official gauge parameters for the Kopili River are reconciled against the *Central Water Commission (CWC) Standard Operating Procedure for Flood Forecasting (2025 Edition)* and the *CWC Brahmaputra & Barak Basin Flood Appraisal Report (2024)*:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                   OFFICIAL CWC KOPILI RIVER GAUGE BENCHMARKS                           │
├─────────────────────────────┬────────────────────────────┬─────────────────────────────┤
│ PARAMETER                   │ KAMPUR GAUGE               │ DHARAMTUL GAUGE             │
├─────────────────────────────┼────────────────────────────┼─────────────────────────────┤
│ River                       │ Kopili                     │ Kopili                      │
│ Administrative District     │ Nagaon, Assam              │ Morigaon, Assam             │
│ Operational Relationship    │ Upstream primary station   │ Downstream (~38 km distance)│
│ Warning Level (WL)          │ 59.50 m                    │ 55.00 m                     │
│ Danger Level (DL)           │ 60.50 m                    │ 56.00 m                     │
│ Highest Flood Level (HFL)   │ 62.20 m (CORRECTED)        │ 58.09 m                     │
│ Date of Attained HFL        │ 18 June 2022 (CORRECTED)   │ 21 July 2004                │
│ Previous HFL (Surpassed)    │ 61.79 m (20 July 2004)     │ —                           │
│ Station Numeric Code        │ UNVERIFIED (Internal Tele) │ UNVERIFIED (Internal Tele)  │
│ Latitude / Longitude        │ UNVERIFIED (Site marker)   │ UNVERIFIED (Site marker)    │
│ Data Provenance Tier        │ VERIFIED (CWC SOP 2025)    │ VERIFIED (CWC SOP 2025)     │
├─────────────────────────────┴────────────────────────────┴─────────────────────────────┤
│ PRIMARY SOURCES:                                                                       │
│ 1. Central Water Commission, Standard Operating Procedure for Flood Forecasting (2025) │
│ 2. CWC Appraisal Report on 2024 Flood Season in Brahmaputra and Barak Basin (Oct 2024) │
│ 3. CWC Official Portal: http://cwc.gov.in / http://ffs.india-water.gov.in             │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Strict Hydrological Concept Separation
To maintain scientific validity, the system enforces complete separation between distinct hydrological concepts:
1. **Warning Level (WL):** River stage at which authorities are formally alerted of rising floodwaters (Kampur: 59.50 m).
2. **Danger Level (DL):** River stage at which riverbank discharge begins to threaten adjacent low-lying floodplains (Kampur: 60.50 m).
3. **Highest Flood Level (HFL):** Historical peak water level recorded at the gauge (Kampur: **62.20 m**, recorded on **18 June 2022**; corrected from earlier provisional 62.17 m / May 2022 draft).
4. **Observed Water Level (OWL):** Real-time telemetry or daily staff-gauge observation at a specific timestamp.
5. **Removal of Unsubstantiated Causal Claims:** All claims asserting that specific road arteries (e.g. Kampur-Jamunamukh road) submerge at exact water level increments (e.g. 61.50 m) or that embankment breaches occur deterministically at particular gauge heights have been **REMOVED**. Hydrodynamic overland flow depends on local levee geometry, breach mechanics, and tributary backwater effects, and cannot be claimed without calibrated 2D hydraulic hydrodynamic modeling.

---

## 5. Meteorological Baseline: IMD Cyclone Remal & Monsoonal Data

- **Source Authority:** India Meteorological Department (IMD), Regional Meteorological Centre (RMC) Guwahati.
- **Meteorological Driver:** Remnants of Severe Cyclonic Storm **Remal** traversing northeast India from 28 May to 31 May 2024, followed by southwest monsoon onset.
- **Observed Rainfall in Catchment:**
  - Karbi Anglong / Dima Hasao stations recorded cumulative rainfall exceeding **220 mm** within 48 hours (28–30 May 2024).
  - Nagaon district stations recorded isolated extremely heavy rainfall ($\ge 20\text{ cm}$) triggering rapid localized inundation.
- **Official Warning Bulletins:**
  - Red Alert (Take Action): 28–29 May 2024 (RMC Guwahati Bulletin).
  - Orange Alert (Be Prepared): 30–31 May 2024.

---

## 6. Audit of Project Geospatial & Inundation GeoJSON

An exhaustive audit of all geospatial files in the repository identified the current spatial data assets:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          GEOSPATIAL ASSET AUDIT REGISTER                               │
├─────────────────────┬──────────────────────────────────────────────────────────────────┤
│ Property            │ Repository Asset Description                                     │
├─────────────────────┼──────────────────────────────────────────────────────────────────┤
│ File Location       │ src/mocks/assamGeoJSON.ts (Exported as ASSAM_DISTRICTS_GEOJSON)  │
│ Geometry Type       │ GeoJSON FeatureCollection (4 Polygon Features)                   │
│ Feature Inventory   │ 1. majuli (Majuli Island Outline — 9 vertices)                   │
│                     │ 2. brahmaputra_channel (Brahmaputra River Corridor — 13 vertices)│
│                     │ 3. dhemaji (Dhemaji District North Bank — 6 vertices)            │
│                     │ 4. morigaon (Morigaon Inundation Basin — 5 vertices)             │
│ Coordinate Ref Sys  │ WGS 84 (EPSG:4326) [Longitude, Latitude]                         │
│ Geographic Scope    │ Upper & Central Assam (Majuli, Dhemaji, Morigaon, Brahmaputra)   │
│ Kampur Coverage     │ ZERO COVERAGE. Does NOT contain Kampur Revenue Circle polygon.   │
│ Derivation Pipeline │ Hand-coded synthetic schematic bounding polygons created for     │
│                     │ frontend MapLibre GL development in Phase 1 / early Phase 2.     │
│ Provenance Tier     │ SIMULATED (Synthetic Demonstration Geometries)                   │
│ Spatial Accuracy    │ Coarse (~0.05° to 0.1° rounded vertices). Not satellite derived. │
├─────────────────────┴──────────────────────────────────────────────────────────────────┤
│ ENFORCED RESTRICTION: This asset must NEVER be classified as DERIVED, nor displayed as │
│ an authoritative NRSC satellite inundation layer or Kampur Revenue Circle boundary.    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. NGO Coordination & Verification Semantics

To prevent misrepresenting volunteer readiness or official partnerships, SURAKSHA GRID enforces five strictly distinct operational lifecycle states:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                            NGO OPERATIONAL STATE MODEL                                 │
├───────────────────────────┬────────────────────────────────────────────────────────────┤
│ STATE                     │ DEFINITION & AUDIT REQUIREMENT                             │
├───────────────────────────┼────────────────────────────────────────────────────────────┤
│ 1. DOCUMENTED_IN_DDMP     │ Listed in the District Disaster Management Plan directory. │
│                           │ Establishes historical reference ONLY. Does NOT establish  │
│                           │ current ground existence, legal standing, or availability. │
├───────────────────────────┼────────────────────────────────────────────────────────────┤
│ 2. IDENTITY_VERIFIED      │ Government registration independently validated            │
│                           │ (NGO Darpan ID, Societies Registration Act, 12A/80G).      │
├───────────────────────────┼────────────────────────────────────────────────────────────┤
│ 3. CURRENTLY_OPERATIONAL  │ Field office presence and active local operations verified │
│                           │ within Nagaon district during the current calendar year.   │
├───────────────────────────┼────────────────────────────────────────────────────────────┤
│ 4. AVAILABILITY_CONFIRMED │ Responder roster actively confirmed via mobile check-in    │
│                           │ within the last 24 to 48 hours.                            │
├───────────────────────────┼────────────────────────────────────────────────────────────┤
│ 5. EQUIPMENT_INDEPENDENTLY│ Physical assets (boats, lifejackets, water purification)   │
│    VERIFIED               │ physically inspected and certified serviceable by DDMA.    │
└───────────────────────────┴────────────────────────────────────────────────────────────┘
```

### 7.1 Simulated Profile Integrity
- All NGO profiles, volunteer counts, and equipment numbers (e.g. "Seva Assam", "Kampur Relief Collective") currently in mock stores are **SIMULATED** demonstration profiles.
- They must always be displayed with the `SIMULATED` visual badge and demonstration disclaimer in the user interface.

---

## 8. Recommendation Engine Assumptions & Missing-Data Policy

The NGO recommendation engine is an **advisory decision-support heuristic**, NOT an automated autonomous dispatch system.

### 8.1 Terminology Governance
- **Prohibited Term:** "Autonomous Dispatch Score" or "Automated Dispatch System".
- **Standardized Term:** **"NGO Preparedness / Response Suitability Recommendation"**.
- **Human-in-the-Loop Constraint:** A high recommendation score never constitutes authorization to deploy. Every deployment must be reviewed, authorized, and logged by a human emergency coordinator.

### 8.2 Non-Punitive Missing-Data Policy
Missing information must **never** be treated as proof of poor organizational capability, nor should it result in a silent numerical score of zero.

The system explicitly distinguishes six candidate evaluation states:
1. `VERIFIED_AVAILABLE`: Verified legal status, operational presence, inspected assets, and fresh roster ($\le 24-48\text{h}$). Evaluated and scored normally.
2. `VERIFIED_UNAVAILABLE`: Organization verified, but reports all volunteers or equipment currently committed. Excluded from active ranking with explicit status `VERIFIED_STANDBY: All assets committed`.
3. `STALE_INFORMATION`: Roster check-in $> 48\text{ hours}$. Flagged as `STALE_DATA: Requires coordinator contact` rather than penalized.
4. `UNVERIFIED_DATA`: Self-reported assets pending independent DDMA audit. Displayed in dossier with `UNVERIFIED_DATA` banner and quarantined from verified asset scores.
5. `INSUFFICIENT_DATA`: Essential required fields (e.g. depot location, specialization profile, contact details) are missing. Return `INSUFFICIENT_DATA: Missing [fields]` rather than silently scoring zero.
6. `EXPLICITLY_INELIGIBLE`: Organization lacks mandatory incident prerequisites (e.g. road submerged and zero watercraft, or lacking specialized medical licenses). Excluded with explicit reason `INELIGIBLE_ACCESS` or `INELIGIBLE_CAPABILITY`.

### 8.3 Frozen Scoring Heuristic & Mathematical Constraints
$$S_i = w_{\text{geo}} S_{\text{geo}, i} + w_{\text{cap}} S_{\text{cap}, i} + w_{\text{eqp}} S_{\text{eqp}, i} + w_{\text{avail}} S_{\text{avail}, i} + w_{\text{load}} S_{\text{load}, i}$$

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                         FROZEN RECOMMENDATION ENGINE PARAMETERS                        │
├───────────────────┬────────┬───────────────────────────────────────────────────────────┤
│ PARAMETER         │ VALUE  │ MATHEMATICAL SPECIFICATION & GUARDRAIL                    │
├───────────────────┼────────┼───────────────────────────────────────────────────────────┤
│ w_geo             │ 0.25   │ Configurable prototype weight. Normalized sum = 1.00.     │
│ w_cap             │ 0.30   │ Configurable prototype weight. Normalized sum = 1.00.     │
│ w_eqp             │ 0.20   │ Configurable prototype weight. Normalized sum = 1.00.     │
│ w_avail           │ 0.15   │ Configurable prototype weight. Normalized sum = 1.00.     │
│ w_load            │ 0.10   │ Configurable prototype weight. Normalized sum = 1.00.     │
├───────────────────┼────────┼───────────────────────────────────────────────────────────┤
│ Distance Cutoff   │ 50 km  │ Prototype heuristic cutoff (d_max = 50 km).               │
│ Impassable Road   │ Hard 0 │ If route is blocked by floodwater and team lacks boats,   │
│ Guardrail         │        │ flag INELIGIBLE_ACCESS; S_geo = 0.                        │
├───────────────────┼────────┼───────────────────────────────────────────────────────────┤
│ Stale Check-in    │ 48 hrs │ If last check-in > 48 hrs, flag STALE_DATA; S_avail = 0.  │
├───────────────────┼────────┼───────────────────────────────────────────────────────────┤
│ Division-by-Zero  │ Hard 0 │ If N_capacity = 0 (zero capacity registered),             │
│ Guardrail         │        │ S_load = 0 (prevents division by zero; no credit awarded).│
├───────────────────┼────────┼───────────────────────────────────────────────────────────┤
│ Missing Data      │ Explicit│ Return INSUFFICIENT_DATA status; do not assign score 0.  │
├───────────────────┼────────┼───────────────────────────────────────────────────────────┤
│ Equipment Guard   │ Strict │ Unverified self-reported equipment cannot be scored as    │
│                   │        │ verified serviceable equipment.                           │
└───────────────────┴────────┴───────────────────────────────────────────────────────────┘
```

---

## 9. Comprehensive Provenance Verification Matrix

The following matrix records every critical historical figure with all 9 mandated evidentiary fields:

| # | Metric Name | Value & Unit | Geographic Scope | Source Document Title | Issuing Authority | Pub Date | Page / Table / Ref | Source URL | Tier | Limitation & Audit Notes |
|:---:|---|---|---|---|---|:---:|---|---|:---:|---|
| 1 | **Affected Population** | 267,358 persons | Kampur Revenue Circle | Daily Flood Situation Report | ASDMA SEOC | 2024-06-03 | Annexure I (Summary) | `https://asdma.assam.gov.in` | **VERIFIED** | Single 24-hr cumulative snapshot; does not account for secondary wave displacements. |
| 2 | **Affected Villages** | 98 revenue villages | Kampur Revenue Circle | Daily Flood Situation Report | ASDMA SEOC | 2024-06-03 | Annexure I (Circle Breakdown) | `https://asdma.assam.gov.in` | **VERIFIED** | Identifies partially or fully inundated gazetted revenue villages. |
| 3 | **Relief Camps (Circle)** | 27 relief camps | Kampur Revenue Circle | Daily Flood Situation Report | ASDMA SEOC | 2024-06-03 | Annexure II (Table 2) | `https://asdma.assam.gov.in` | **VERIFIED** | Active shelters recognized by District Administration; excludes informal roadside shelters. |
| 4 | **Camp Inmates (Circle)** | 6,432 persons | Kampur Revenue Circle | Daily Flood Situation Report | ASDMA SEOC | 2024-06-03 | Annexure II (Table 2) | `https://asdma.assam.gov.in` | **VERIFIED** | Displaced individuals registered on official muster rolls in Kampur camps. |
| 5 | **Relief Distribution Centres** | 18 centers | Kampur Revenue Circle | Daily Flood Situation Report | ASDMA SEOC | 2024-06-03 | Annexure II (Table 2) | `https://asdma.assam.gov.in` | **VERIFIED** | Non-shelter food and water ration distribution depots for marooned villagers. |
| 6 | **Relief Camps (Raha)** | 3 relief camps | Raha Revenue Circle | Daily Flood Situation Report | ASDMA SEOC | 2024-06-03 | Annexure II (Table 2) | `https://asdma.assam.gov.in` | **VERIFIED** | Neighboring circle camps; included to reconcile district total. |
| 7 | **Camp Inmates (Raha)** | 688 persons | Raha Revenue Circle | Daily Flood Situation Report | ASDMA SEOC | 2024-06-03 | Annexure II (Table 2) | `https://asdma.assam.gov.in` | **VERIFIED** | Neighboring circle camp inmates. |
| 8 | **Relief Camps (District)** | 30 relief camps | Nagaon District Total | Daily Flood Situation Report | ASDMA SEOC | 2024-06-03 | Annexure II (Table 2) | `https://asdma.assam.gov.in` | **VERIFIED** | District total ($27 + 3 = 30$). Reconciles earlier 27 vs 30 discrepancy. |
| 9 | **Camp Inmates (District)** | 7,120 persons | Nagaon District Total | Daily Flood Situation Report | ASDMA SEOC | 2024-06-03 | Annexure II (Table 2) | `https://asdma.assam.gov.in` | **VERIFIED** | District total ($6,432 + 688 = 7,120$). |
| 10 | **Crop Land Submerged (District)**| 3,842.00 hectares | Nagaon District Total | Daily Flood Situation Report | ASDMA SEOC | 2024-06-03 | Annexure I (District Total) | `https://asdma.assam.gov.in` | **VERIFIED** | Reported at district aggregate only; circle breakdown not published in state report. |
| 11 | **Crop Land Submerged (Circle)** | 3,214.50 hectares | Kampur Revenue Circle | Local field subdivision notes | Unofficial field estimate | 2024-06-03 | Absent from SEOC report | N/A | **UNVERIFIED** | Cannot be verified from state bulletin; kept out of verified baseline. |
| 12 | **Infrastructure Breaches** | 4 washouts, 2 culverts | Kampur Revenue Circle | Local PWD subdivision notes | Unofficial field estimate | 2024-06-03 | Absent from SEOC report | N/A | **UNVERIFIED** | ASDMA Annexure V reports 7 road breaches for Nagaon; circle count is unverified. |
| 13 | **CWC Kampur Warning Level** | 59.50 m above MSL | Kopili River at Kampur | SOP for Flood Forecasting (2025) | CWC, MoJS | 2025 | Chapter 4 (Station Table) | `http://cwc.gov.in` | **VERIFIED** | Gauge stage above mean sea level denoting alert threshold. |
| 14 | **CWC Kampur Danger Level** | 60.50 m above MSL | Kopili River at Kampur | SOP for Flood Forecasting (2025) | CWC, MoJS | 2025 | Chapter 4 (Station Table) | `http://cwc.gov.in` | **VERIFIED** | Gauge stage denoting riverbank overtopping threshold. |
| 15 | **CWC Kampur Highest Flood Level**| 62.20 m above MSL | Kopili River at Kampur | Appraisal Report on 2024 Flood Season | CWC BBBO Guwahati | Oct 2024 / 2025 | Table 3.2 (Peak Records) | `http://ffs.india-water.gov.in`| **VERIFIED** | Historical peak reached 18 June 2022 (corrected from 62.17 m / May 2022). |
| 16 | **CWC Dharamtul Warning Level** | 55.00 m above MSL | Kopili River at Dharamtul | SOP for Flood Forecasting (2025) | CWC, MoJS | 2025 | Chapter 4 (Station Table) | `http://cwc.gov.in` | **VERIFIED** | Downstream gauge in Morigaon District (~38 km downstream). |
| 17 | **CWC Dharamtul Danger Level** | 56.00 m above MSL | Kopili River at Dharamtul | SOP for Flood Forecasting (2025) | CWC, MoJS | 2025 | Chapter 4 (Station Table) | `http://cwc.gov.in` | **VERIFIED** | Morigaon downstream danger threshold. |
| 18 | **CWC Dharamtul Highest Flood Level**| 58.09 m above MSL | Kopili River at Dharamtul | SOP for Flood Forecasting (2025) | CWC, MoJS | 2025 | Chapter 4 (Station Table) | `http://cwc.gov.in` | **VERIFIED** | Historical peak reached on 21 July 2004. |
| 19 | **CWC Numeric Station Codes** | 11500 (KMP), 11502 (DHR) | Kopili River Gauges | Internal Telemetry DB | Unofficial metadata | 2024 | Internal WRIS schema | N/A | **UNVERIFIED** | Numeric station IDs are not officially gazetted in published SOP text. |
| 20 | **Frontend Map GeoJSON** | 4 Mock Polygons | Upper & Central Assam | Internal mock development asset | SURAKSHA GRID Project | 2026 | `src/mocks/assamGeoJSON.ts` | Source code | **SIMULATED** | Synthetic schematic mock geometry; does NOT cover Kampur Circle. |
| 21 | **NGO Fleets & Rosters** | 4 motorboats, 60 lifejackets | Demonstration accounts | Prototype scenario specifications | SURAKSHA GRID Project | 2026 | `src/mocks/resources.ts` | Source code | **SIMULATED** | Synthetic demonstration profiles for exercising recommendation engine. |

---

## 10. Unresolved Issues & Assumptions Register

1. **Sub-Circle Agricultural Inundation Figures:**
   - *Issue:* ASDMA reports `3,842.00 ha` for Nagaon District. The Kampur-specific number of `3,214.50 ha` is absent from published SEOC bulletins.
   - *Platform Stance:* Flagged **UNVERIFIED AT CIRCLE SCOPE**; prohibited from production database ingestion until circle-level gazettes are secured.
2. **Sub-Circle Infrastructure Breach Itemization:**
   - *Issue:* ASDMA reports 7 road breaches across Nagaon District. Attributing 4 washouts and 2 culverts specifically to Kampur is unverified.
   - *Platform Stance:* Flagged **UNVERIFIED AT CIRCLE SCOPE**.
3. **CWC Numeric Telemetry Site IDs:**
   - *Issue:* Codes `11500` and `11502` exist in internal WRIS systems, but public CWC bulletins identify stations by basin, river, and site name.
   - *Platform Stance:* Stations are officially keyed by River + Site Name (`Kopili: Kampur`); numeric IDs remain flagged **UNVERIFIED**.
4. **Authoritative Kampur Revenue Circle GeoJSON Vector Boundary:**
   - *Issue:* `src/mocks/assamGeoJSON.ts` contains synthetic mock polygons for other districts and zero geometry for Kampur.
   - *Platform Stance:* Formally classified as **SIMULATED**. True Kampur circle boundary vector ingestion is deferred to Phase 4.3 using Survey of India / ASDMA open boundary shapefiles.
