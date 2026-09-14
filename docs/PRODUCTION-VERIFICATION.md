# Production Auth / Session and Read-Only Verification Plan (AUR-M10-003)

## 1. Scope

This document defines the exact minimum evidence required for Production Auth, Session, and Read-Only core verification (AUR-M10-003) for Aureole. It uses the strict Public Contract SSOT (`0a37894173d1db0bbc57576c640652878f8f623d`) and the active TanStack Router definitions.

## 2. Safety Boundary

**Current Status:**

AUR-M10-003 GATE 1:
PLAN ACCEPTED

AUR-M10-003 GATE 2:
COMPLETE / PRIMARY REVIEW PASS / INDEPENDENT SECURITY REVIEW PASS

Independent Pages Adapter Security Review:
PASS — PAGES ADAPTER SECURITY REVIEW

Required Fixes:
NONE

Gate 3:
NOT STARTED / PRIMARY AUTHORIZATION PENDING

Gate 4:
NOT AUTHORIZED

No L3 evidence obtained yet.

Cloudflare Pages deployment has NOT occurred yet.

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

No production or production-equivalent Aureole deployment is currently documented and verified in repository evidence.

The plan supports BOTH:
A. The user already has a suitable deployment
B. A new deployment must be created

The Primary/User will determine which case applies. M10-003 execution depends entirely on the completion of **AUR-M10-002 Production Deployment Contract and Artifact Readiness** and cannot begin until an authenticated deployment is established and explicitly authorized by the Primary.

## 5. M10-003 Minimum Acceptance Evidence

The minimum required evidence to pass M10-003 is:

- **Infrastructure readiness:** deployment candidate exact SHA, `release.json` exact match, HTTPS, static routing, `/api/v1` routing, cache, security headers, rollback defined.
- **Auth/session evidence:** authorized test account login, `/me` resolution, session restoration, logout, credential clearing.
- **Read-only product evidence:** page-driven authenticated GET flows across core v1 pages. (Artificial detail GETs are not required when no safe ID exists. POST/PATCH/DELETE must not be exercised.)

## 6. Required Owner Inputs

### OWNER INPUT — REQUIRED BEFORE DEPLOYMENT PREPARATION

- Frontend hostname
- Hosting/CDN/provider
- Deployment mechanism
- Same-origin `/api/v1` routing mechanism
- solution Gateway upstream hostname
- Deployment owner
- Rollback mechanism / rollback target
- Production restrictions / change-window constraints
- Existing deployment: YES / NO / UNKNOWN

### OWNER INPUT — REQUIRED BEFORE AUTHENTICATED EXECUTION

- Dedicated test-account availability
- Test-account subscription state
- Account safety confirmation:
  - no valuable balance
  - no valuable commission
  - no pending withdrawal
  - no important orders/tickets
  - ordinary user role

### SAFELY DISCOVERABLE DURING AUTHORIZED STATIC/UNAUTHENTICATED VERIFICATION

- DNS result
- TLS validity
- `release.json` SHA
- security headers / CSP
- cache behavior
- SPA fallback
- missing-asset 404
- public onboarding capability / anti-bot mode
- `/api/v1` public routing behavior where explicitly authorized

_(These must PASS before Gate 4 login, but the user should not be required to manually supply them if they are discoverable.)_

## 7. Test Account Recommendation

M10-003 minimum requires **ONE** safe dedicated test account.

**Preferred minimum:**

- One ordinary dedicated account with an active low-value/test subscription.
- NO valuable balance.
- NO valuable commission.
- NO pending withdrawal.
- NO important orders/tickets.

**Optional for broader coverage:**

- A second account with no active plan is OPTIONAL for empty-state coverage, but not required to pass minimum M10-003.

## 8. Corrected solution GET Matrix

Based strictly on the Public Contract SSOT. Execution is page-driven.

**PUBLIC:**

- `GET /api/v1/config/onboarding` (Required for minimum M10-003 L3)

**AUTHENTICATED:**

_Minimum / Core M10-003:_

- `GET /api/v1/config/account`
- `GET /api/v1/me`
- `GET /api/v1/me/preferences`
- `GET /api/v1/me/stats`
- `GET /api/v1/wallet`
- `GET /api/v1/products`
- `GET /api/v1/orders`
- `GET /api/v1/subscription`
- `GET /api/v1/subscription/overview`
- `GET /api/v1/resources`
- `GET /api/v1/tickets`
- `GET /api/v1/notices`
- `GET /api/v1/traffic/logs`
- `GET /api/v1/referrals`
- `GET /api/v1/referrals/commissions`
- `GET /api/v1/referrals/withdrawal-options`

_Conditional Safe Detail Reads:_

- `GET /api/v1/orders/{id}`
- `GET /api/v1/tickets/{id}`
- `GET /api/v1/notices/{id}`

_DEFER FROM M10-003 MINIMUM:_

- `GET /api/v1/billing/methods` (Defer to Payment/Financial runtime phase)
- `GET /api/v1/orders/{id}/status` (Defer to Payment/Financial runtime phase)
- `GET /api/v1/products/{id}` (Defer to Commerce verification phase unless naturally required by normal `/plans` browsing)

_SPECIAL EXCLUDED:_

- `GET /api/v1/access/subscription` (Excluded to protect subscription credentials in evidence)

## 9. Corrected Aureole Page-to-API Matrix

Based strictly on the current TanStack Router implementation and actual source code bindings.

| Frontend Route / Context                                     | Actual GET Endpoint(s)                                                                           | Required/Conditional |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | -------------------- |
| **Global Auth Bootstrap**                                    | `/api/v1/me`                                                                                     | Required             |
| **Public Pages** (`/login`, `/register`, `/forgot-password`) | `/api/v1/config/onboarding`                                                                      | Required             |
| `/dashboard`                                                 | `/api/v1/subscription/overview`<br>`/api/v1/notices`                                             | Required             |
| `/notices`                                                   | `/api/v1/notices`<br>`/api/v1/notices/{id}` (conditional)                                        | Required             |
| `/orders`                                                    | `/api/v1/orders`<br>`/api/v1/orders/{id}` (conditional)                                          | Required             |
| `/plans`                                                     | `/api/v1/products`<br>`/api/v1/config/account`                                                   | Required             |
| `/referrals`                                                 | `/api/v1/referrals`<br>`/api/v1/referrals/commissions`<br>`/api/v1/referrals/withdrawal-options` | Required             |
| `/resources`                                                 | `/api/v1/resources`                                                                              | Required             |
| `/settings`                                                  | `/api/v1/me/preferences`<br>`/api/v1/me/stats`<br>`/api/v1/config/account`                       | Required             |
| `/subscription`                                              | `/api/v1/subscription`<br>`/api/v1/subscription/overview`<br>`/api/v1/traffic/logs`              | Required             |
| `/support`                                                   | `/api/v1/tickets`<br>`/api/v1/tickets/{id}` (conditional)                                        | Required             |
| `/wallet`                                                    | `/api/v1/wallet`                                                                                 | Required             |

_Note:_ The `/` (index) route is a root redirector component. It is not a standalone page.

## 10. Anti-Bot / reCAPTCHA Capability

- Uses: `GET /api/v1/config/onboarding` as the SSOT for capabilities.
- Current codebase mapping supports only `provider: recaptcha` and `mode: v2-checkbox`.
- Unknown provider/mode fails closed.
- The deployment CSP must be derived from the actual enabled integration.
- No challenge is solved during this planning phase.

## 11. Auth Negative-Test Evidence

Local/mock 401 tests establish **L1/L2 regression evidence**, but must **NOT** be presented as production L3 verification.
For eventual production negative-auth behavior, a safe test must not mutate server state.

- **Concept:** A controlled client-local invalid credential/session test where an authenticated GET fails, resulting in the client invalidating the local session.
- Do NOT revoke or change production account credentials merely for this test.
- This is **DEFERRED** unless explicitly required for M10-003 minimum acceptance.

## 12. Token Storage Architecture

The plan verifies the expected implementation behavior without recording the token value. The exact architecture is:

- **Zustand/in-memory** authenticated state.
- Access token mirrored into browser `sessionStorage` under the key `aureole.auth.access-token`.
- `sessionStorage` supports same-tab session restoration.
- NO credential persistence in `localStorage`.
- NO token in the URL.
- NO token in logs.
- NO token in analytics.

## 13. Authorization Gates

Future actions require explicit staged authorization:

1. **Gate 1:** COMPLETE / PASS
2. **Gate 2:** COMPLETE / PRIMARY REVIEW PASS / INDEPENDENT SECURITY REVIEW PASS
3. **Gate 3A:** PASS
4. **Gate 3B:** REPOSITORY HARDENING IN PROGRESS
5. **Gate 4:** NOT AUTHORIZED

No gate is automatically implied by the previous gate.

## 14. Selected Gate 2 Staging Architecture

Gate 2 preparation is currently **COMPLETE / PRIMARY REVIEW PASS / INDEPENDENT SECURITY REVIEW PASS** for the following staging architecture:

- **Provider:** Cloudflare Pages
- **Hostname:** `*.pages.dev`
- **Proxy Adapter:** Pages Function same-origin `/api/v1/*`
- **Upstream:** solution staging upstream
- **Configuration:** `SOLUTION_GATEWAY_ORIGIN` deployment configuration
- **API Namespace:** API Function strictly confined to `/api/v1` and `/api/v1/*`.
- **SPA Routing:** Explicit SPA rewrites prepared (no wildcard HTML rewrites).
- **404 Behavior:** Top-level `404.html` prepared in deployment artifact; expected missing-static-asset behavior is HTTP 404.
- **Runtime Disclaimer:** Actual Cloudflare runtime behavior remains NOT VERIFIED until Gate 3.

_Gate 3 actual deployment verification remains NOT AUTHORIZED._
_Gate 4 login remains NOT AUTHORIZED._
_No L3 evidence has been obtained yet._

## 15. Gate 2 Technical Checkpoints

- **Initial Pages adapter:** `460e32873b1eebadd46d83b6b9054169825a0f03`
- **Primary-required adapter fix checkpoint:** `581af7c47a7e494098414eaebd0444d45c8958d2`
- **Evidence-complete independent-review HEAD:** `ddf9322cf3577475e73e455fb587fcbfee48e014`
- **Independent review verdict:** PASS — PAGES ADAPTER SECURITY REVIEW

_(Note: `ddf9322cf3577475e73e455fb587fcbfee48e014` is the independent-review HEAD, not necessarily the final deployment candidate. The final deployment candidate will be frozen by the Primary after the completion of this task.)_

## 16. Gate 3A Runtime Evidence

- **Gate 3A Status:** PASS
- **Deployed Candidate:** `3dc60910b0d58a11bfff1ac77389def6f9c98455`
- **Project Name:** `aureole-cc-staging-3dc609`
- **Staging URL:** `https://aureole-cc-staging-3dc609.pages.dev`

**Gate 3A Runtime Findings (PASS):**

- exact release identity
- TLS
- SPA routing
- missing asset 404
- Pages Function boundary
- public onboarding
- antiBot disabled

**Gate 3B Required Configurations:**

- immutable hashed-asset cache
- Content-Security-Policy (CSP)
- Strict-Transport-Security (HSTS)
- Permissions-Policy

_(Note: The new Gate 3B headers are repository hardening in progress and have not been deployed or runtime-verified yet.)_
