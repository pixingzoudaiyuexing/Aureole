# Production Auth / Session and Read-Only Verification Plan (AUR-M10-003)

## 1. Scope

This document defines the exact minimum evidence required for Production Auth, Session, and Read-Only core verification (AUR-M10-003) for Aureole. It uses the strict Public Contract SSOT (`0a37894173d1db0bbc57576c640652878f8f623d`) and the active TanStack Router definitions.

## 2. Safety Boundary

**Current Status:**

AUR-M10-003 GATE 1:
COMPLETE / PASS

AUR-M10-003 GATE 2:
COMPLETE / PRIMARY REVIEW PASS / INDEPENDENT SECURITY REVIEW PASS

Independent Pages Adapter Security Review:
PASS — PAGES ADAPTER SECURITY REVIEW

Pages Adapter Required Fixes:
NONE

Gate 3A:
PASS

Gate 3A Deployed Candidate:
`3dc60910b0d58a11bfff1ac77389def6f9c98455`

Cloudflare Pages Staging Project:
`aureole-cc-staging-3dc609`

Staging URL:
`https://aureole-cc-staging-3dc609.pages.dev`

Gate 3B:
RUNTIME REQUIRED FIXES

Gate 3B Repository / Security Hardening:
PASS

Gate 3B Runtime Attempt Candidate:
`ce79eef9c99f23faf7f1e1054dc7e2454557e4b8`

Gate 3B Runtime Attempt Deployment ID:
`7ec2bc89-8253-4c9d-a4e2-a6967a557aee`

Current Active Staging Deployment:
`ce79eef9c99f23faf7f1e1054dc7e2454557e4b8` (`7ec2bc89-8253-4c9d-a4e2-a6967a557aee`)

New Corrected Gate 3B Deployment Candidate:
NOT YET FROZEN BY PRIMARY

Gate 4:
NOT AUTHORIZED

Authenticated Login:
NOT PERFORMED

Authenticated L3 Read Verification:
NOT OBTAINED YET

- FINAL PRODUCTION LAUNCH HAS **NOT OCCURRED**.
- FURTHER GATE 3B DEPLOYMENT IS **NOT AUTHORIZED**.
- AUTHENTICATED ACCESS / LOGIN IS **NOT AUTHORIZED**.
- AUTHENTICATED READ VERIFICATION IS **NOT AUTHORIZED**.
- MUTATIONS ARE **NOT AUTHORIZED**.
- FINANCIAL OPERATIONS ARE **NOT AUTHORIZED**.

## 3. Release SHA and Deployment Semantics

Before a corrected Gate 3B deployment, the Primary will freeze one exact source commit as the **corrected Gate 3B deployment candidate SHA** after implementation, tests, exact-SHA CI, and Primary review.

- **Code/Config Freeze Checkpoint:** `8890ba0e8325828e27d2234a3f8b242561fbe801` (from AUR-M10-002).
- **Gate 3A Deployed Candidate:** `3dc60910b0d58a11bfff1ac77389def6f9c98455`.
- **Gate 3B Runtime Attempt Candidate:** `ce79eef9c99f23faf7f1e1054dc7e2454557e4b8`.
- **Gate 3B Runtime Attempt Deployment ID:** `7ec2bc89-8253-4c9d-a4e2-a6967a557aee`.
- **Corrected Gate 3B Deployment Candidate SHA:** NOT YET FROZEN BY PRIMARY.
- **`release.json` SHA:** Must equal the exact Git HEAD from which `npm run build:release` generates the artifacts.

## 4. Deployment State Model

- A Gate 3A Cloudflare Pages staging deployment exists and is verified for its authorized unauthenticated scope.
- A Gate 3B runtime attempt deployed `ce79eef9c99f23faf7f1e1054dc7e2454557e4b8` as deployment `7ec2bc89-8253-4c9d-a4e2-a6967a557aee` to `https://aureole-cc-staging-3dc609.pages.dev`.
- The Gate 3B runtime attempt passed release identity, TLS, security headers, cache behavior, missing-asset 404, Pages Function boundary, public onboarding, and OPTIONS policy checks.
- Gate 3B remains **REQUIRED FIXES** because known SPA deep links returned `308 Location: /`, and trailing-slash forms returned 404.
- The corrected Gate 3B deployment candidate is not yet frozen by the Primary.
- Final production launch has not occurred.
- Authenticated Gate 4 verification has not occurred; no login or authenticated L3 read evidence has been obtained.

Further deployment or authenticated execution requires explicit Primary authorization and the applicable gate to pass. The Gate 3B runtime attempt does not authorize another deployment or Gate 4 login.

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
4. **Gate 3B:** RUNTIME REQUIRED FIXES
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
- **SPA Routing:** Explicit known-route SPA proxies only (no wildcard HTML rewrites); the runtime-attempt routing defect is corrected in the repository but awaits Primary review and a later authorized deployment.
- **404 Behavior:** Top-level `404.html` prepared in deployment artifact; expected missing-static-asset behavior is HTTP 404.
- **Runtime Evidence Boundary:** Gate 3B runtime evidence covers only the named static, security, public onboarding, OPTIONS, and Pages Function checks. The routing patch has not been deployed or runtime-verified.

_Gate 3A staging deployment exists and passed its authorized runtime scope._
_Gate 3B runtime attempt completed with REQUIRED FIXES; another deployment remains NOT AUTHORIZED._
_Gate 4 login remains NOT AUTHORIZED._
_No authenticated L3 evidence has been obtained yet._

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

_(Note: These requirements passed during the Gate 3B runtime attempt described below. Gate 3B remains REQUIRED FIXES solely because the SPA deep-link proxy target caused redirects.)_

## 17. Gate 3B Runtime Attempt Evidence

- **Gate 3B Repository / Security Hardening:** PASS
- **Runtime Attempt Candidate:** `ce79eef9c99f23faf7f1e1054dc7e2454557e4b8`
- **Deployment ID:** `7ec2bc89-8253-4c9d-a4e2-a6967a557aee`
- **Project Name:** `aureole-cc-staging-3dc609`
- **Staging URL:** `https://aureole-cc-staging-3dc609.pages.dev`
- **Gate 3B Runtime:** REQUIRED FIXES

**Runtime Findings (PASS):**

- exact release identity
- TLS
- CSP and security headers
- hashed JavaScript and CSS immutable cache behavior
- HTML and `release.json` revalidation safety
- missing asset 404
- Pages Function boundary
- public onboarding
- OPTIONS policy
- no CSP console errors

**Runtime Failure:**

Direct requests to `/login`, `/register`, `/forgot-password`, `/dashboard`, and `/subscription` returned `308` with `Location: /`. Their trailing-slash forms returned 404. The deployed `public/_redirects` rules proxied each known SPA route to `/index.html`; Cloudflare Pages HTML canonicalization redirected that target to the canonical root path instead of serving the SPA document at the requested route.

The repository correction changes only the 13 explicit known-route proxy destinations from `/index.html` to `/`. It does not add a wildcard, remove `public/404.html`, or change the `/api/v1` Pages Function boundary.

- **Current Active Staging SHA:** `ce79eef9c99f23faf7f1e1054dc7e2454557e4b8`
- **Current Active Staging Deployment:** `7ec2bc89-8253-4c9d-a4e2-a6967a557aee`
- **Known Rollback Deployment:** `a93a03e9-7bd4-4a5d-ab65-54341b5cf764`
- **Known Rollback SHA:** `3dc60910b0d58a11bfff1ac77389def6f9c98455`
- **New Corrected Gate 3B Deployment Candidate:** NOT YET FROZEN BY PRIMARY
- **Gate 4:** NOT AUTHORIZED
