# AGENTS.md — AI & Autonomous Systems Policy

This document establishes the binding architectural constraints, operational rules, and ethical boundaries for Artificial Intelligence (AI) and autonomous agents within the **SURAKSHA GRID** project.

---

## 1. Principles of AI Deployment in Life-Safety Contexts

Disaster management technology operates in high-stress, low-margin-for-error environments. Hallucinations, false confidences, or unverified autonomous actions in a disaster coordination platform can lead directly to misdirected supplies, wasted rescue hours, or unattended life-threatening crises.

Therefore, SURAKSHA GRID adopts a **Zero-Autonomy / Strict Human-in-the-Loop** model.

### Absolute Negative Constraints (What AI MUST NEVER Do)
1. **Never Verify Incidents Independently:** An AI model or background worker must never transition an incident from `PENDING` to `VERIFIED` or `REJECTED`. Only authenticated human coordinators have authority to verify reports.
2. **Never Authorize or Trigger Resource Dispatch:** An AI agent must never decrement inventory or assign boats, rations, or medical teams to an incident.
3. **Never Adjust Severity Autonomously:** Operational `severity` is computed on the backend using deterministic rules and can only be manually modified by authenticated human coordinators with logged justification. AI models cannot override severity levels.
4. **Never Dismiss or Merge Duplicate Reports Automatically:** An algorithm or LLM may flag duplicate candidates and compute similarity heuristics, but only a human coordinator can approve a merge or mark a report as redundant.
5. **Never Synthesize or Hallucinate Ground Facts:** An AI model must never invent casualty counts, water depths, emergency contact numbers, or rescue status details.
6. **Never Block or Impair Offline Operation:** The entire application must function smoothly when completely offline or when external AI API keys are missing, rate-limited, or unresponsive.
7. **Never Automatically Dispatch an NGO or Volunteer Brigade:** The NGO recommendation engine generates explainable advisory candidate rankings only. Operational deployment authorization resides exclusively with authenticated human coordinators.

---

## 2. Permitted AI Capabilities (Advisory Only)

If time permits during the hackathon, Gemini (or an equivalent LLM) may be engaged for strictly auxiliary, non-critical advisory assistance:

| Permitted Task | Scope & Constraints | Failure Handling |
|---|---|---|
| **Incident Categorization Suggestion** | Parse unstructured user description (e.g., "water reached 1st floor, elderly person needs medicine") and suggest appropriate categories (`RESCUE`, `MEDICAL`, `FOOD_WATER`) | If LLM fails or is offline, fallback to user's selected category or `GENERAL_RELIEF` without throwing an error. |
| **Brief Executive Summarization** | Generate a 1-sentence synopsis for the coordinator incident board to aid rapid visual scanning | If LLM fails, display the first 120 characters of the raw user description. |
| **Duplicate Candidate Similarity Explanation** | Provide an explanatory snippet comparing two close incidents (e.g., "Both reports mention school roof near Majuli ferry ghat") | If LLM fails, display raw spatial distance and time gap metrics only. |

---

## 3. Technical Guardrails for LLM Integration

When invoking external LLM APIs (e.g., Google Gemini API):

1. **Structured JSON Output Enforced:** Every prompt must mandate structured JSON adhering to a strict Zod schema. Free-form text responses that require fuzzy regex parsing are prohibited.
2. **Deterministic Temperature:** Use `temperature: 0.0` or `0.1` to maximize determinism and eliminate creative variance.
3. **Strict Fallback Timeout:** LLM API calls must carry an aggressive timeout (e.g., 2500ms max). If the call fails or times out, the backend must immediately return the deterministic fallback response without degrading API latency.
4. **Clear Visual Tagging in UI:** Any field suggested or augmented by an AI model must be visually marked in the UI with an `[AI Suggestion - Review Required]` badge to prevent coordinators from mistaking synthetic text for direct ground reports.

---

## 4. Coding Assistant & Agent Guidelines for Repository Development

When autonomous or semi-autonomous development agents (such as Antigravity, Gemini Code Assist, or Cursor) operate within this repository:

1. **Phase Discipline:** Strictly observe project phases. If a phase specifies `DOCUMENTATION ONLY` or `ARCHITECTURE FREEZE`, no application source code, npm dependencies, or database migrations may be written.
2. **Explicit User Approval:**
   - Do not install third-party packages without prior confirmation.
   - Do not commit or push to Git branches without user instruction.
   - Do not mutate global system or Git configurations.
3. **Preservation of Existing State:** Always inspect directories before creating files. Never delete, rename, or overwrite user files without explicit authorization.
4. **Honesty on Simulated Data:** Ensure all test fixtures, seed scripts, mock coordinates, and presentation materials are unambiguously labeled as **SIMULATED TEST DATA**.
5. **Document Assumptions:** If a functional requirement is ambiguous, explicitly document the assumption in documentation rather than making silent design compromises.
