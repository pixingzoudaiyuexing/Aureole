# Production Auth / Session and Read-Only Verification Plan (AUR-M10-003)

## 1. Scope

This document plans the precise eventual verification of Production Auth, Session, and Read-Only core functionalities for Aureole.
It establishes the prerequisites, evidence matrix, stop conditions, and explicit authorization gates required for Phase M10-003 execution.

## 2. Safety Boundary

**Current Status:** PLANNING ONLY.

- PRODUCTION DEPLOYMENT IS **NOT AUTHORIZED**.
- PRODUCTION ACCESS / LOGIN IS **NOT AUTHORIZED**.
- PRODUCTION READ VERIFICATION IS **NOT AUTHORIZED**.
- PRODUCTION MUTATIONS ARE **NOT AUTHORIZED**.
- FINANCIAL OPERATIONS ARE **NOT AUTHORIZED**.

Actual login constitutes a state-changing boundary and is prohibited during this planning phase.

## 3. Environment Prerequisites (Phase A)

Before browser verification can begin, the following environment requirements must be satisfied:

- Production or production-equivalent Aureole frontend hostname must be provisioned.
- DNS readiness and resolution confirmed.
- HTTPS/TLS termination strictly verified.
- Static hosting / CDN / provider assigned.
- Exact deployed release SHA matches the expected build (`8890ba0e8325828e27d2234a3f8b242561fbe801` baseline).
- Presence and correctness of `release.json`.
- `/api/v1/*` routing properly proxied to the solution Gateway.
- SPA fallback (unknown routes return `index.html`).
- Static asset 404 behavior (must return 404, not fallback to index.html).
- Cache rules explicitly set (HTML no-cache, assets immutable).
- CSP / Security headers properly injected.
- Defined rollback target and mechanism.
- Deployment owner acknowledged.

## 4. Required Owner Inputs

The following information must be provided by the Primary/User before execution can be authorized.
Do NOT commit credentials into the repository.

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

## 5. Test Account Requirements (Phase B)

The safest dedicated test-account characteristics include:

- Must be a dedicated verification account.
- Must have **NO** valuable balance.
- Must have **NO** important active orders.
- Must have **NO** important support state.
- Must have **NO** valuable commission.
- Must have **NO** pending withdrawals.
- Must have **NO** sensitive production role (ordinary user permissions only).

**Recommendation to Primary:**
Two test accounts are required:

1. Account A: No active plan (to verify fallback states and upgrade prompts).
2. Account B: Active low-value/test plan (to verify dashboard, traffic resources, and active subscription states).

## 6. Auth / Session Verification Plan (Phase C)

The eventual checks must follow this progression:

1. **Login page load:** Check for proper rendering, correct static asset loading, and TLS.
2. **Anti-bot capability / challenge mode:** Observe presence and un-obstructed rendering if enabled.
3. **Login:** Submit credentials.
4. **Bearer acquisition:** Ensure token is acquired, persisted securely (not in local storage if not permitted), and omitted from telemetry.
5. **Authenticated bootstrap:** Ensure Auth Context is populated and UI transitions.
6. **`/api/v1/me`:** Successful resolution and hydration of Account Profile.
7. **Refresh/session restoration behavior:** Hard reload the SPA and verify smooth restoration of the authenticated state.
8. **Auth Invalidation:** Trigger a 401 locally or mock a 401 response and confirm automatic logout.
9. **Logout / token clearing:** Click logout, ensure network requests stop sending the Bearer, and all caches (QueryClient, storage) are fully cleared.

## 7. Read-Only API Matrix

The following exact `/api/v1/*` routes will be executed and observed (GET only):

- `GET /api/v1/me`
- `GET /api/v1/subscriptions/overview`
- `GET /api/v1/subscriptions/resources`
- `GET /api/v1/products/plans`
- `GET /api/v1/orders`
- `GET /api/v1/tickets`
- `GET /api/v1/referrals/overview`
- `GET /api/v1/wallet`
- `GET /api/v1/notices`
- `GET /api/v1/site/config`

## 8. Aureole Page Matrix

The following exact frontend routes will be visited to observe data hydration:

- `/` (Home)
- `/login`
- `/dashboard`
- `/plans`
- `/orders`
- `/wallet`
- `/support`
- `/referrals`
- `/profile`

## 9. Anti-Bot / reCAPTCHA Plan

- Verify if V2Board/solution upstream requires reCAPTCHA for the `/api/v1/auth/login` endpoint.
- Observe CSP compliance for external scripts (e.g., `www.recaptcha.net` or `www.google.com/recaptcha`).
- Confirm challenge renders successfully within the login flow layout on both Desktop and Mobile viewports without breaking UI containment.

## 10. Evidence / Redaction Plan (Phase D)

**Authorized Evidence Collection:**

- Browser type and version
- Exact page URL visited
- TLS certificate issuer / validity
- HTTP status codes (no sensitive bodies)
- Method and Path (e.g., `GET /api/v1/me`)
- Operation duration
- `requestId` (if available in headers)
- UI rendering result (Pass/Fail)
- Console errors / warnings
- CSP / security-header observations
- Cache rule observations

**Strict Redaction Policy (NEVER RECORD):**

- Bearer tokens
- Subscription access URLs
- Gift Card codes
- Withdrawal account details
- Payment secrets
- Raw sensitive payloads or full request/response bodies
- User passwords

## 11. Browser Scope

Minimum justified browser set required for production Auth/read evidence:

1. **Chrome (Desktop):** Primary verification.
2. **Mobile Viewport (Chrome Mobile Emulation or Safari iOS):** Primary responsive verification for Auth flows.

Safari/Firefox full coverage is deferred to M10-006 unless an Auth-specific anomaly justifies earlier execution.

## 12. Stop Conditions

Execution MUST abort immediately if any of the following occur:

- Wrong release SHA is detected in `release.json` or HTML footprint.
- Unexpected production host is observed.
- TLS error or certificate mismatch.
- API routes returning SPA HTML (indicates broken Gateway routing).
- Raw V2Board exposure in headers or payloads.
- Unexpected cross-origin target for API calls.
- CORS wildcard (`*`) detected on authenticated routes.
- CSP materially broken or causing site functionality failure.
- Unexpected mutation request (POST/PATCH/DELETE) fires without user action.
- Auth token appearing in console logs, error boundaries, or analytics.
- Sensitive credential exposure.
- Provided production test account has valuable funds, commission, or state.
- Unexpected account mutation occurs during read verification.

## 13. Deployment Prerequisite Decision

**Can M10-003 begin against an already-existing deployed environment?**
No known production environment exists matching the verified Aureole baseline architecture yet.
**Minimal prerequisite:** The deployment environment MUST be fully provisioned, populated with the frozen SHA, and the exact `Frontend hostname` and routing configurations MUST be returned to the Primary before M10-003 execution can commence.
Actual execution cannot begin until the infrastructure is proven deployed.

## 14. Authorization Gates

1. **Planning Gate:** [x] Produce this plan and await Primary approval.
2. **Infrastructure Gate:** [ ] Primary provides environment inputs and confirms deployment readiness.
3. **Execution Gate:** [ ] Primary explicitly authorizes actual browser execution of M10-003.
