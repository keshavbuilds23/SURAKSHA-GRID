# Explainable NGO Recommendation Engine — SURAKSHA GRID
### Deterministic Matching Algorithm for Pre-Disaster Preparedness & Response Operations
**Document Version:** 1.2.0 (Phase 4.0.3 Audit & Evidence Freeze)  
**Status:** Advisory Decision Support Only (Human-in-the-Loop)  

---

## 1. Algorithmic Purpose & Operating Philosophy

When flood emergencies erupt, coordinators are pressured to make life-critical deployment decisions in minutes. In the absence of structured decision-support tools, coordinators default to calling the largest or most familiar NGO repeatedly, leading to operational bottlenecks, volunteer burnout, and unattended disaster zones.

The **SURAKSHA GRID Recommendation Engine** is an objective, deterministic multi-criteria decision-support heuristic.

> [!CRITICAL]
> **Advisory-Only / Human Authority Invariant:**
> - The recommendation engine **NEVER executes autonomous dispatches**.
> - It **NEVER overrides human coordinator decisions**.
> - It outputs a ranked list of candidate organizations with an **explicit mathematical score breakdown and human-readable explanation**.
> - An NGO cannot be recommended unless its operational availability is confirmed and its verified profile is in an eligible operational state.
> - **Human Approval is Mandatory:** Every actual dispatch or mobilization order requires explicit review and approval by an authorized emergency coordinator.

---

## 2. Multi-Criteria Scoring Formulation

The NGO Preparedness / Response Suitability Recommendation Score ($S_{\text{NGO}} \in [0, 100]$) is computed as a weighted linear combination of five normalized sub-scores:

$$S_{\text{NGO}} = w_{\text{geo}} \cdot S_{\text{geo}} + w_{\text{cap}} \cdot S_{\text{cap}} + w_{\text{eqp}} \cdot S_{\text{eqp}} + w_{\text{avail}} \cdot S_{\text{avail}} + w_{\text{load}} \cdot S_{\text{load}}$$

### Default Calibration Weights (Prototype Parameters):
- $w_{\text{geo}} = 0.25$ (Geographic Proximity & Accessibility)
- $w_{\text{cap}} = 0.30$ (Capability & Specialization Match)
- $w_{\text{eqp}} = 0.20$ (Equipment Match & Physical Condition)
- $w_{\text{avail}} = 0.15$ (Live Verified Roster Availability)
- $w_{\text{load}} = 0.10$ (Active Workload & Anti-Overload Penalty)

*Note:* All weights are configurable prototype heuristics, not empirically validated disaster-science constants. Sum of weights strictly equals $1.00$.

---

## 3. Sub-Score Mathematical Definitions

### 3.1 Geographic Proximity Score ($S_{\text{geo}}$)
Evaluates physical distance between the NGO's verified staging depot and the target incident / vulnerable village:

$$d = \text{HaversineDistance}(\text{depot\_coords}, \text{incident\_coords}) \quad [\text{km}]$$

$$S_{\text{geo}} = \begin{cases} 
100 & \text{if } d \le 2\text{ km} \\
\max\left(0, 100 - 10 \cdot (d - 2)\right) & \text{if } 2 < d \le 12\text{ km} \\
0 & \text{if } d > 12\text{ km}
\end{cases}$$

*Heuristic Cutoff:* Maximum operational search radius is set to $d_{\max} = 50\text{ km}$. Any organization beyond 50 km receives $S_{\text{geo}} = 0$.

*Access Constraint Override:* If road access is flagged as `SUBMERGED / IMPASSABLE` and the NGO lacks verified watercraft, the organization is flagged as `INELIGIBLE_ACCESS` and excluded from scoring rather than silently assigned a low score.

### 3.2 Capability Match Score ($S_{\text{cap}}$)
Evaluates whether the NGO possesses certified skills required for the incident category:

$$S_{\text{cap}} = \frac{\sum_{c \in \text{RequiredCaps}} \mathbb{I}(c \in \text{NGO\_Caps}) \cdot \text{Weight}(c)}{\sum_{c \in \text{RequiredCaps}} \text{Weight}(c)} \times 100$$

### 3.3 Equipment Readiness Score ($S_{\text{eqp}}$)
Measures the ratio of available, inspected equipment to the requested emergency units:

$$S_{\text{eqp}} = \min\left(100, \frac{\text{Verified\_Available\_Quantity}}{\text{Required\_Quantity}} \times 100\right)$$

*Verification Filter:* Equipment marked `SELF_REPORTED` or lacking an inspection record within 90 days cannot be counted as verified equipment.

### 3.4 Live Availability Score ($S_{\text{avail}}$)
Rewards recent verified check-ins and detects stale rosters:

$$S_{\text{avail}} = \begin{cases} 
100 & \text{if last check-in } \le 6\text{ hours} \\
75 & \text{if last check-in } \le 24\text{ hours} \\
40 & \text{if last check-in } \le 48\text{ hours} \\
0 & \text{if last check-in } > 48\text{ hours (Status flagged as STALE\_DATA)}
\end{cases}$$

### 3.5 Workload Balance Score ($S_{\text{load}}$)
Protects organizations from concurrent overload and includes a strict division-by-zero guard:

$$S_{\text{load}} = \begin{cases}
0 & \text{if } N_{\text{capacity}} = 0 \quad \text{(Zero capacity guard)} \\
\max\left(0, 100 \times \left(1 - \frac{N_{\text{active}}}{N_{\text{capacity}}}\right)\right) & \text{if } N_{\text{capacity}} > 0
\end{cases}$$

---

## 4. Operational Eligibility & Missing-Information Policy

SURAKSHA GRID mandates non-punitive transparency. Missing or unverified data must **never** be treated as proof of poor organizational capability, nor should it result in a silent numerical score of zero.

The system explicitly categorizes candidate organizations into six distinct operational states:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        NGO CANDIDATE OPERATIONAL STATES                                │
├─────────────────────────┬──────────────────────────────────────────────────────────────┤
│ STATE                   │ OPERATIONAL DEFINITION & SYSTEM BEHAVIOR                     │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 1. VERIFIED_AVAILABLE   │ Legal standing verified, active Nagaon presence confirmed,   │
│                         │ equipment inspected, roster confirmed within 24–48 hours.    │
│                         │ Behavior: Scored and ranked normally.                        │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 2. VERIFIED_UNAVAILABLE │ Legal standing verified, but organization reports zero active│
│                         │ personnel or all equipment currently deployed.               │
│                         │ Behavior: Excluded from active ranking; flagged              │
│                         │ "VERIFIED_STANDBY: All assets committed".                    │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 3. STALE_INFORMATION    │ Organization profile exists, but last roster check-in        │
│                         │ exceeds 48 hours during an active alert.                     │
│                         │ Behavior: Flagged "STALE_DATA: Requires coordinator check-in"│
│                         │ Coordinator is given a direct contact action.                │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 4. UNVERIFIED_DATA      │ Assets or roster submitted but pending independent DDMA audit│
│                         │ Behavior: Displayed in dossier with "UNVERIFIED_DATA" banner │
│                         │ Unaudited items cannot be scored as verified assets.         │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 5. INSUFFICIENT_DATA    │ Critical required information (e.g. depot location,         │
│                         │ specialization profile, contact details) is missing.         │
│                         │ Behavior: NOT scored as zero. Excluded with explicit status  │
│                         │ "INSUFFICIENT_DATA: Missing [fields]".                       │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 6. EXPLICITLY_INELIGIBLE│ Organization lacks mandatory incident prerequisites (e.g.   │
│                         │ road submerged and zero watercraft, or lacking mandatory     │
│                         │ paramedic certifications for critical medical evacuations).   │
│                         │ Behavior: Excluded with explicit reason "INELIGIBLE_ACCESS"  │
│                         │ or "INELIGIBLE_CAPABILITY".                                  │
└─────────────────────────┴──────────────────────────────────────────────────────────────┘
```

---

## 5. Explainable Recommendation Dossier Example

When the recommendation engine outputs candidate organizations, it displays both eligible recommendations and explicit non-scoring justifications:

```json
{
  "recommendation_id": "rec-kampur-2024-06-03-01",
  "incident_id": 104,
  "incident_title": "18 people marooned on temple roof in Kamalabari",
  "category": "MAROONED_RESCUE",
  "coordinator_status": "PENDING_COORDINATOR_APPROVAL",
  "ranked_candidates": [
    {
      "rank": 1,
      "ngo_id": "ngo-kjv-01",
      "ngo_name": "Kampur Jal-Suraksha Vahini",
      "operational_state": "VERIFIED_AVAILABLE",
      "composite_score": 92.5,
      "sub_scores": {
        "proximity": 88.0,
        "capability": 100.0,
        "equipment": 95.0,
        "availability": 100.0,
        "workload": 75.0
      },
      "explainable_reason": "Kampur Jal-Suraksha Vahini is located 3.2 km from Kamalabari with active road/water access. They possess certified WATER_SEARCH_AND_RESCUE capabilities, 4 verified inflatable motorboats (inspected 14 days ago), 12 active helmsmen confirmed available 2 hours ago, and 1 active ongoing dispatch."
    }
  ],
  "excluded_candidates": [
    {
      "ngo_id": "ngo-mrc-02",
      "ngo_name": "Morigaon Rescue Circle",
      "operational_state": "INSUFFICIENT_DATA",
      "composite_score": null,
      "exclusion_reason": "INSUFFICIENT_DATA: Equipment physical inspection audit expired 120 days ago. Staging depot coordinates missing from profile."
    },
    {
      "ngo_id": "ngo-kcyb-04",
      "ngo_name": "Kampur Community Youth Brigade",
      "operational_state": "EXPLICITLY_INELIGIBLE",
      "composite_score": null,
      "exclusion_reason": "INELIGIBLE_ACCESS: Access route via Jamunamukh road is submerged (water depth > 1.2m); organization possesses 0 watercraft."
    }
  ]
}
```
