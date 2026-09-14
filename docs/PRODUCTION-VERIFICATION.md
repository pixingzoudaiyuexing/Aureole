# Production Auth / Session and Read-Only Verification Plan (AUR-M10-003)

## 1. Scope

This document defines the exact minimum evidence required for Production Auth, Session, and Read-Only core verification (AUR-M10-003) for Aureole. It uses the strict Public Contract SSOT (`0a37894173d1db0bbc57576c640652878f8f623d`) and the active TanStack Router definitions.

## 2. Safety Boundary

**Current Status:** PLANNING CORRECTIONS APPLIED. PENDING REVIEW.

- PRODUCTION DEPLOYMENT IS **NOT AUTHORIZED**.
- PRODUCTION ACCESS / LOGIN IS **NOT AUTHORIZED**.
- PRODUCTION READ VERIFICATION IS **NOT AUTHORIZED**.
- PRODUCTION MUTATIONS ARE **NOT AUTHORIZED**.
- FINANCIAL OPERATIONS ARE **NOT AUTHORIZED**.

## 3. Release SHA and Deployment Semantics

Before deployment, the Primary will freeze one exact source commit as the **deployment candidate SHA**.

- **Code/Config Freeze Checkpoint:** `8890ba0e8325828e27d2234a3f8b242561fbe801` (from AUR-M10-002).
- **Deployment candidate SHA:** NOT YET SELECTED.
- **`release.json` SHA:** Must equal the exact Git HEAD from which `npm run build:release` generates the artifacts.

## 4. Existing-vs-New Deployment Decision Model

No active production deployment of Aureole exists yet.
The execution of M10-003 depends entirely on the completion of **AUR-M10-002 Production Deployment Contract and Artifact Readiness**.
M10-003 cannot begin until an authenticated deployment is fully established and authorized by the Primary.

## 5. M10-003 Minimum Acceptance Evidence

The minimum required evidence to pass M10-003 is:

- **Infrastructure readiness:** deployment candidate exact SHA, `release.json` exact match, HTTPS, static routing, `/api/v1` routing, cache, security headers, rollback defined.
- **Auth/session evidence:** authorized test account login, `/me` resolution, session restoration, logout, credential clearing.
- **Read-only product evidence:** page-driven authenticated GET flows across core v1 pages. (Artificial detail GETs are not required when no safe ID exists. POST/PATCH/DELETE must not be exercised.)

## 6. Required Owner Inputs

The following information must be provided by the Primary/User before respective gates can be authorized:

| Input Item                              | Requirement                |
| --------------------------------------- | -------------------------- |
| Frontend hostname                       | REQUIRED BEFORE DEPLOYMENT |
| Hosting/CDN/provider                    | REQUIRED BEFORE DEPLOYMENT |
| Deployment mechanism                    | REQUIRED BEFORE DEPLOYMENT |
| Same-origin `/api/v1` routing mechanism | REQUIRED BEFORE DEPLOYMENT |
| solution Gateway upstream hostname      | REQUIRED BEFORE DEPLOYMENT |
| TLS status                              | REQUIRED BEFORE LOGIN      |
| Current deployed release SHA            | REQUIRED BEFORE LOGIN      |
| Rollback mechanism                      | REQUIRED BEFORE LOGIN      |
| Dedicated test-account availability     | REQUIRED BEFORE LOGIN      |
| Test-account subscription state         | REQUIRED BEFORE LOGIN      |
| Anti-bot/reCAPTCHA mode                 | OPTIONAL                   |
| Any production restrictions             | DISCOVERABLE SAFELY        |

## 7. Test Account Recommendation

We recommend **two dedicated verification accounts** to properly test both empty states and active states. This is RECOMMENDED / OPTIONAL FOR BROADER COVERAGE, not mandatory.

- **Account A:** No active plan.
- **Account B:** Active low-value/test plan.

**Strict characteristics for both:**

- NO valuable balance.
- NO valuable commission.
- NO pending withdrawal.
- NO important orders/tickets.
- Ordinary user permissions only.

## 8. Corrected solution GET Matrix

Based strictly on the Public Contract SSOT. Execution is page-driven; detail endpoints (`{id}`) are conditional detail reads and are not artificially called if suitable IDs do not exist.

**PUBLIC:**

- `GET /api/v1/config/onboarding` (Required for M10-003 L3)

**AUTHENTICATED:**

- `GET /api/v1/config/account` (Required for M10-003 L3)
- `GET /api/v1/me` (Required for M10-003 L3)
- `GET /api/v1/me/preferences` (Required for M10-003 L3)
- `GET /api/v1/me/stats` (Required for M10-003 L3)
- `GET /api/v1/wallet` (Required for M10-003 L3)
- `GET /api/v1/products` (Required for M10-003 L3)
- `GET /api/v1/products/{id}` (Conditional detail read)
- `GET /api/v1/orders` (Required for M10-003 L3)
- `GET /api/v1/orders/{id}` (Conditional detail read)
- `GET /api/v1/orders/{id}/status` (Conditional detail read)
- `GET /api/v1/billing/methods` (Required for M10-003 L3)
- `GET /api/v1/subscription` (Required for M10-003 L3)
- `GET /api/v1/subscription/overview` (Required for M10-003 L3)
- `GET /api/v1/resources` (Required for M10-003 L3)
- `GET /api/v1/tickets` (Required for M10-003 L3)
- `GET /api/v1/tickets/{id}` (Conditional detail read)
- `GET /api/v1/notices` (Required for M10-003 L3)
- `GET /api/v1/notices/{id}` (Conditional detail read)
- `GET /api/v1/traffic/logs` (Required for M10-003 L3)
- `GET /api/v1/referrals` (Required for M10-003 L3)
- `GET /api/v1/referrals/commissions` (Required for M10-003 L3)
- `GET /api/v1/referrals/withdrawal-options` (Required for M10-003 L3)

**SPECIAL SENSITIVE CREDENTIAL ROUTE:**

- `GET /api/v1/access/subscription`
  _Decision:_ **EXCLUDE** from M10-003 browser L3 verification unless a later task has a specific justified requirement. Do not expose subscription credentials in evidence.

## 9. Corrected Aureole Page-to-API Matrix

Based strictly on the current TanStack Router implementation and actual source code bindings.

| Frontend Route     | Actual GET Endpoint(s)                                                                           | Required/Conditional |
| ------------------ | ------------------------------------------------------------------------------------------------ | -------------------- |
| `/login`           | `/api/v1/config/onboarding`                                                                      | Required             |
| `/register`        | `/api/v1/config/onboarding`                                                                      | Required             |
| `/forgot-password` | `/api/v1/config/onboarding`                                                                      | Required             |
| `/dashboard`       | `/api/v1/me`<br>`/api/v1/subscription/overview`<br>`/api/v1/notices`                             | Required             |
| `/notices`         | `/api/v1/notices`                                                                                | Required             |
| `/orders`          | `/api/v1/orders`<br>`/api/v1/orders/{id}` (conditional)                                          | Required             |
| `/plans`           | `/api/v1/products`<br>`/api/v1/config/account`                                                   | Required             |
| `/referrals`       | `/api/v1/referrals`<br>`/api/v1/referrals/commissions`<br>`/api/v1/referrals/withdrawal-options` | Required             |
| `/resources`       | `/api/v1/resources`<br>`/api/v1/traffic/logs`                                                    | Required             |
| `/settings`        | `/api/v1/me/preferences`<br>`/api/v1/me/stats`<br>`/api/v1/config/account`                       | Required             |
| `/subscription`    | `/api/v1/subscription`<br>`/api/v1/subscription/overview`                                        | Required             |
| `/support`         | `/api/v1/tickets`<br>`/api/v1/tickets/{id}` (conditional)                                        | Required             |
| `/wallet`          | `/api/v1/wallet`                                                                                 | Required             |

_Note:_ The `/` (index) route is a root redirector component (`AuthBootstrapScreen`, `AuthRecoveryScreen`, or `Navigate`) to `/dashboard` or `/login`. It is not a standalone page.

## 10. Anti-Bot / reCAPTCHA Capability

- Uses: `GET /api/v1/config/onboarding` as the SSOT for capabilities.
- Current codebase mapping supports only `provider: recaptcha` and `mode: v2-checkbox`.
- Unknown provider/mode fails closed.
- The deployment CSP must be derived from the actual enabled integration (no assumptions on `www.recaptcha.net` unless strictly required by official integration rules).
- No challenge is solved during this planning phase.

## 11. Auth Negative-Test Evidence

Local/mock 401 tests establish **L1/L2 regression evidence**, but must **NOT** be presented as production L3 verification.
For eventual production negative-auth behavior, a safe test must not mutate server state.

- **Concept:** A controlled client-local invalid credential/session test where an authenticated GET fails, resulting in the client invalidating the local session.
- Do NOT revoke or change production account credentials merely for this test.
- This is **DEFERRED** unless explicitly required for M10-003 minimum acceptance.

## 12. Token Storage Expectations

- In-memory auth state is used.
- Where session-scoped browser storage is implemented, it must not leak.
- **Verification Rule:** Explicitly verify there is NO `localStorage` credential persistence, NO token in logs, NO token in URLs, and NO token in analytics. Browser storage must not be overclaimed as inherently "secure."

## 13. Authorization Gates

Future actions require explicit staged authorization:

1. **Gate 1:** PLAN ACCEPTED (Currently pending)
2. **Gate 2:** DEPLOYMENT PREPARATION AUTHORIZED
3. **Gate 3:** STATIC / UNAUTHENTICATED DEPLOYMENT VERIFICATION AUTHORIZED (DNS, TLS, `release.json`, static assets, SPA fallback, missing asset 404, security headers, cache, `/api/v1/config/onboarding`, routing plumbing)
4. **Gate 4:** PRODUCTION LOGIN + AUTHENTICATED READ L3 AUTHORIZED (Test account login, authenticated endpoints, page matrix)

A deployment authorization (Gate 3) does **NOT** automatically authorize login (Gate 4).
