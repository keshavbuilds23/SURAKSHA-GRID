# Security Checklist & Threat Model — SURAKSHA GRID
### Hardening Disaster Response Infrastructure Under Adversarial & Degraded Conditions

---

## 1. Security Architecture & Threat Model

Disaster coordination platforms face unique security challenges: panic-induced flood of bad data, malicious rumor injection, denial-of-service surges, and exposure of vulnerable citizens' personal identifiable information (PII).

```
┌────────────────────────────────────────────────────────────────────────┐
│                      THREAT & MITIGATION MATRIX                        │
├───────────────────────┬───────────────────────────────┬────────────────┤
│ THREAT / ATTACK       │ POTENTIAL IMPACT              │ DEFENSE LAYER  │
├───────────────────────┼───────────────────────────────┼────────────────┤
│ SQL Injection         │ Database compromise/exfiltration│ Parameterized SQL│
│ Malicious Severity Jam│ False alarm priority elevation│ Server-Set Severity│
│ PII Harassment        │ Stalking stranded flood victims│ Backend Public DTO│
│ Brute-Force Auth      │ Account takeover of coordinators│ bcryptjs + Limits│
│ Replay Storms         │ Duplicate phantom incidents   │ client_report_id │
│ Idempotency Hijack    │ Overwriting original incident │ IDEMPOTENCY_CONFLICT│
│ Over-Dispatch Race    │ Stock exhaustion / double-book │ ACID Transactions│
│ Inventory Drift       │ Lost boats via deletion/double│ ON DELETE RESTRICT│
│ Phantom Stock Surge   │ Restoring in-field asset stock│ Dispatched Guard│
│ Lock Contention Panic │ Server crashes on concurrency │ PRAGMA busy_timeout│
└───────────────────────┴───────────────────────────────┴────────────────┘
```

---

## 2. Security Engineering Checklist

### 2.1 Authentication & Credential Storage
- [x] **Salted Password Hashing:** User passwords hashed using `bcryptjs` with a cost factor of at least 12 rounds. Plaintext passwords never logged or stored.
- [x] **Cryptographic JWT Tokens:** Signed using HMAC-SHA256 with high-entropy secret (`JWT_SECRET`) stored strictly in environment variables.
- [x] **Sensible Token Expiration:** Access tokens set to expire within 24 hours to limit exposure if client devices are lost in flood zones.

### 2.2 Server-Side Role-Based Access Control (RBAC)
- [x] **Strict Privilege Separation:**
  - `citizen`: Can create reports (cannot set severity), view public map (`PublicIncidentDTO`).
  - `volunteer`: Can submit batch reports, view operational incident details in their sector, mark assignments as delivered (`/deliver`).
  - `coordinator`: Can verify/reject reports, adjust severity (with logged reason), resolve duplicate candidates, dispatch (`/dispatch`), cancel (`/cancel`), and return (`/return`) resource assignments.
  - `admin`: Full system oversight, depot inventory adjustments, user management.
- [x] **Defense-in-Depth Authorization:** Role checks enforced at the router middleware layer on every protected endpoint, independent of frontend UI state.
- [x] **Segregated Verification & Severity Routes:** Verification (`/verify`) and severity adjustments (`/severity`) are distinct endpoints with mandatory audit logging.

### 2.3 Injection Prevention & Parameterized Queries
- [x] **Zero Dynamic SQL String Concatenation:** All SQLite queries execute through `better-sqlite3` prepared statements using named or positional parameters:
  ```typescript
  // SECURE
  const stmt = db.prepare('SELECT * FROM incidents WHERE id = ?');
  const incident = stmt.get(incidentId);

  // PROHIBITED
  // const incident = db.prepare(`SELECT * FROM incidents WHERE id = ${incidentId}`).get();
  ```
- [x] **Zod Input Sanitization:** All incoming JSON bodies validated against strict Zod schemas with `.strip()` to discard unrecognized properties. Coordinates bounded to valid geographic ranges (-90 to 90 lat, -180 to 180 lng).

### 2.4 Protection of Vulnerable Citizen Data (Backend DTO Redaction)
- [x] **Backend-Enforced Public DTO:** The public-facing endpoint (`GET /api/v1/incidents` without coordinator auth) transforms outputs into `PublicIncidentDTO`:
  - Reporter full name and telephone number are completely stripped.
  - Coordinates are coarsened (rounded to 2 decimal places, ~1.1km radius).
  - Exact house/building identifiers are replaced with general landmark/village names.
- [x] **Rationale:** Stranded families, particularly women and unaccompanied minors, must not have their precise distress locations and phone numbers exposed to unauthenticated internet crawlers.

### 2.5 Concurrency & Lock Contention Protection
- [x] **SQLite Busy Timeout:** `PRAGMA busy_timeout = 5000;` applied to all database connections. Concurrently executing write transactions wait up to 5000ms rather than failing with `SQLITE_BUSY`.
- [x] **Write-Ahead Logging (WAL):** Prevents read queries from blocking incoming sync writes.
- [x] **Standardized Network Port:** Backend Express server strictly configured on port `5000` (`http://localhost:5000`). Frontend proxies via port `5173`. Port `8000` is strictly avoided to prevent cross-port connection failures.

### 2.6 Inventory Integrity & Anti-Drift Architecture
- [x] **Relational Restrict Constraint:** `assignments.incident_id` uses `ON DELETE RESTRICT` so that incidents with active resource allocations cannot be deleted, eliminating phantom stock depletion.
- [x] **Dispatched vs. Undispatched Cancellation Distinction:**
  - Cancelling an undispatched assignment (`status == 'ASSIGNED'`) atomically increments depot stock (`inventory_restored = 1`).
  - Cancelling an in-transit assignment (`status == 'IN_TRANSIT'`) sets `status = 'CANCELLED'` but does NOT restore stock (`inventory_restored = 0`), because assets are still physically in the field.
- [x] **Controlled Return Protocol:** Only assets physically checked back into the depot via `PATCH /api/v1/assignments/:id/return` restore inventory. Calling return on an already-restored assignment throws HTTP 400 (`INVENTORY_ALREADY_RESTORED`), eliminating double restoration.

### 2.7 Idempotency Protection & Payload Immutability
- [x] **Conflict Detection:** Submitting an existing `client_report_id` with differing payload content triggers an explicit `IDEMPOTENCY_CONFLICT` (HTTP 409).
- [x] **Anti-Tampering Immutability:** The server preserves the original incident record unchanged, preventing malicious or accidental overwrites of earlier ground reports.

### 2.8 Denial of Service & Rate Limiting
- [x] **Global Rate Limiter:** `express-rate-limit` enforces a maximum of 100 requests per minute per IP for general endpoints.
- [x] **Auth Endpoint Limiter:** `/api/v1/auth/login` restricted to 10 attempts per 15 minutes per IP to prevent dictionary and brute-force attacks.
- [x] **Payload Size Caps:** `express.json({ limit: '1mb' })` prevents memory exhaustion attacks via oversized JSON payloads.

### 2.9 Immutable Audit Logging
- [x] **Append-Only Event Ledger:** The `incident_events` table logs the timestamp, actor ID, and payload delta for every critical action (`VERIFIED`, `REJECTED`, `SEVERITY_UPDATED`, `RESOURCE_ASSIGNED`, `RESOURCE_DISPATCHED`, `RESOURCE_DELIVERED`, `RESOURCE_RETURNED`, `ASSIGNMENT_CANCELLED`).
- [x] **No Mutating Endpoints:** No `UPDATE` or `DELETE` HTTP endpoints exist for `incident_events`.

### 2.10 Safe Error Handling & Information Disclosure
- [x] **Stack Trace Suppression:** In production mode (`NODE_ENV === 'production'`), error middleware returns generic, structured error messages without exposing filesystem paths, database queries, or stack traces.
- [x] **Environment Variable Hygiene:** All secrets (`JWT_SECRET`, port numbers, API keys) managed through `.env` files; `.env` is explicitly ignored in `.gitignore`.

### 2.11 Data Provenance, Authenticity & NGO Integrity
- [x] **Data Provenance Segregation:** All system data layers strictly maintain provenance tiers (`VERIFIED`, `DERIVED`, `SIMULATED`). Synthetic scenarios or mock drill tasks are never disguised as official government flood warnings.
- [x] **NGO Verification Sentinel:** The recommendation engine strictly excludes organizations that are not `VERIFIED_ACTIVE` or whose availability check-in exceeds 48 hours during an active river level alert.
- [x] **Advisory Recommendation Guard:** The recommendation engine outputs explainable candidate rankings only. Automated autonomous dispatch is strictly blocked.
