# Production Auth / Session and Read-Only Verification Evidence (AUR-M10-003)

## 1. Scope

This document records the completed Production Auth, Session, and Read-Only core verification (AUR-M10-003) for Aureole together with its original execution plan and historical evidence. It uses the strict Public Contract SSOT (`0a37894173d1db0bbc57576c640652878f8f623d`) and the active TanStack Router definitions.

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
COMPLETE / PASS

Gate 3A Deployed Candidate:
`3dc60910b0d58a11bfff1ac77389def6f9c98455`

Cloudflare Pages Staging Project:
`aureole-cc-staging-3dc609`

Staging URL:
`https://aureole-cc-staging-3dc609.pages.dev`

Gate 3B:
COMPLETE / PASS

Gate 3:
COMPLETE / PASS

Final Verified Gate 3 Deployment SHA:
`1cd18e6a57e775b21d89b951074a44a687ececfc`

Active Cloudflare Pages Deployment ID:
`7f379046-49ab-454d-b7ed-dd2ba8abf9df`

Current Active Staging Deployment:
`1cd18e6a57e775b21d89b951074a44a687ececfc` (`7f379046-49ab-454d-b7ed-dd2ba8abf9df`)

Gate 4:
COMPLETE / PASS

Authenticated Login:
COMPLETE / PASS

Authenticated L3 Read Verification:
COMPLETE / PASS

AUR-M10-003:
COMPLETE / PASS

- FINAL PRODUCTION LAUNCH HAS **NOT OCCURRED**.
- GATE 3 IS **COMPLETE / PASS**.
- GATE 4 IS **COMPLETE / PASS**.
- AUTHENTICATED ACCESS / LOGIN VERIFICATION IS **COMPLETE / PASS**.
- AUTHENTICATED READ VERIFICATION IS **COMPLETE / PASS**.
- BUSINESS MUTATIONS BEYOND THE COMPLETED AUTHORIZED GATE 4 LOGIN ARE **NOT AUTHORIZED**.
- FINANCIAL OPERATIONS ARE **NOT AUTHORIZED**.

## 3. Release SHA and Deployment Semantics

The Primary froze and approved the corrected Gate 3B deployment candidate before the final unauthenticated runtime verification.

- **Code/Config Freeze Checkpoint:** `8890ba0e8325828e27d2234a3f8b242561fbe801` (from AUR-M10-002).
- **Gate 3A Deployed Candidate:** `3dc60910b0d58a11bfff1ac77389def6f9c98455`.
- **Initial Gate 3B Runtime Attempt Candidate:** `ce79eef9c99f23faf7f1e1054dc7e2454557e4b8`.
- **Initial Gate 3B Runtime Attempt Deployment ID:** `7ec2bc89-8253-4c9d-a4e2-a6967a557aee`.
- **Final Verified Gate 3 Deployment SHA:** `1cd18e6a57e775b21d89b951074a44a687ececfc`.
- **Active Cloudflare Pages Deployment ID:** `7f379046-49ab-454d-b7ed-dd2ba8abf9df`.
- **`release.json` SHA:** Must equal the exact Git HEAD from which `npm run build:release` generates the artifacts.

## 4. Deployment State Model

- A Gate 3A Cloudflare Pages staging deployment exists and is verified for its authorized unauthenticated scope.
- The initial Gate 3B runtime attempt at `ce79eef9c99f23faf7f1e1054dc7e2454557e4b8` exposed the SPA deep-link routing defect recorded below.
- The corrected candidate `1cd18e6a57e775b21d89b951074a44a687ececfc` was deployed as `7f379046-49ab-454d-b7ed-dd2ba8abf9df` and passed final Gate 3 runtime verification.
- Gate 3A, Gate 3B, and aggregate Gate 3 are **COMPLETE / PASS**.
- Final production launch has not occurred.
- Gate 4 completed with an explicitly authorized disposable staging test account. Login, `/me`, session restoration, page-driven authenticated reads, logout, and post-logout credential clearing passed.
- AUR-M10-003 is **COMPLETE / PASS**.

AUR-M10-003 completion does not authorize AUR-M10-004, AUR-M10-005, or AUR-M10-006. Business mutations and financial operations require separate explicit Primary authorization.

## 5. M10-003 Minimum Acceptance Evidence

The minimum required evidence for M10-003 was completed:

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
3. **Gate 3A:** COMPLETE / PASS
4. **Gate 3B:** COMPLETE / PASS
5. **Gate 3:** COMPLETE / PASS
6. **Gate 4:** COMPLETE / PASS
7. **AUR-M10-003:** COMPLETE / PASS

No gate is automatically implied by the previous gate.

## 14. Selected Gate 2 Staging Architecture

Gate 2 preparation is currently **COMPLETE / PRIMARY REVIEW PASS / INDEPENDENT SECURITY REVIEW PASS** for the following staging architecture:

- **Provider:** Cloudflare Pages
- **Hostname:** `*.pages.dev`
- **Proxy Adapter:** Pages Function same-origin `/api/v1/*`
- **Upstream:** solution staging upstream
- **Configuration:** `SOLUTION_GATEWAY_ORIGIN` deployment configuration
- **API Namespace:** API Function strictly confined to `/api/v1` and `/api/v1/*`.
- **SPA Routing:** Explicit known-route SPA proxies only (no wildcard HTML rewrites); canonical deep links passed final Gate 3 runtime verification.
- **404 Behavior:** Top-level `404.html` prepared in deployment artifact; expected missing-static-asset behavior is HTTP 404.
- **Runtime Evidence Boundary:** Gate 3 covers the named unauthenticated static, security, public onboarding, OPTIONS, Pages Function, browser-network, and TLS checks. It does not cover authenticated Gate 4 behavior.

_Gate 3A is COMPLETE / PASS._
_Gate 3B is COMPLETE / PASS._
_Aggregate Gate 3 is COMPLETE / PASS._
_Gate 4 is COMPLETE / PASS._
_Authenticated L3 evidence was obtained through the explicitly authorized staging verification._

## 15. Gate 2 Technical Checkpoints

- **Initial Pages adapter:** `460e32873b1eebadd46d83b6b9054169825a0f03`
- **Primary-required adapter fix checkpoint:** `581af7c47a7e494098414eaebd0444d45c8958d2`
- **Evidence-complete independent-review HEAD:** `ddf9322cf3577475e73e455fb587fcbfee48e014`
- **Independent review verdict:** PASS — PAGES ADAPTER SECURITY REVIEW

_(Note: `ddf9322cf3577475e73e455fb587fcbfee48e014` remains the historical independent-review HEAD. The final verified Gate 3 deployment SHA is recorded separately.)_

## 16. Gate 3A Runtime Evidence

- **Gate 3A Status:** COMPLETE / PASS
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

_(Note: These requirements passed during Gate 3B verification. The initial routing defect and the corrected final PASS are recorded separately below.)_

## 17. Initial Gate 3B Runtime Attempt Evidence (Historical)

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

- **Historical Failed Staging SHA:** `ce79eef9c99f23faf7f1e1054dc7e2454557e4b8`
- **Historical Failed Staging Deployment:** `7ec2bc89-8253-4c9d-a4e2-a6967a557aee`
- **Known Rollback Deployment:** `a93a03e9-7bd4-4a5d-ab65-54341b5cf764`
- **Known Rollback SHA:** `3dc60910b0d58a11bfff1ac77389def6f9c98455`
- **Gate 4:** NOT AUTHORIZED

## 18. Final Gate 3 Runtime Closure

- **Gate 1:** COMPLETE / PASS
- **Gate 2:** COMPLETE / PRIMARY REVIEW PASS / INDEPENDENT SECURITY REVIEW PASS
- **Gate 3A:** COMPLETE / PASS
- **Gate 3B:** COMPLETE / PASS
- **Gate 3:** COMPLETE / PASS
- **Final Verified Deployment SHA:** `1cd18e6a57e775b21d89b951074a44a687ececfc`
- **Active Cloudflare Pages Deployment ID:** `7f379046-49ab-454d-b7ed-dd2ba8abf9df`
- **Project:** `aureole-cc-staging-3dc609`
- **Staging URL:** `https://aureole-cc-staging-3dc609.pages.dev`

**Final Runtime Findings (PASS):**

- exact `release.json` SHA
- HTTPS and valid TLS
- canonical SPA deep links, including direct `/login`, `/register`, and `/forgot-password` navigation
- Content-Security-Policy, HSTS, Permissions-Policy, X-Content-Type-Options, and Referrer-Policy
- immutable hashed JavaScript and CSS cache behavior
- non-immutable/revalidated HTML and revalidated `release.json`
- missing asset and unknown route 404 behavior
- `/api/v1` Pages Function confinement
- public onboarding and OPTIONS method policy
- no direct browser request to the solution upstream
- no login, test-account use, authenticated request, mutation, or financial operation

**Non-Blocking Trailing-Slash Observation:**

`/login/`, `/register/`, and `/forgot-password/` currently return 404. The supported canonical contracts `/login`, `/register`, and `/forgot-password` passed and this trailing-slash behavior is not a Gate 3 defect.

**Rollback Evidence:**

- Initial failed Gate 3B deployment: `7ec2bc89-8253-4c9d-a4e2-a6967a557aee` at SHA `ce79eef9c99f23faf7f1e1054dc7e2454557e4b8`.
- Older Gate 3A deployment: `a93a03e9-7bd4-4a5d-ab65-54341b5cf764` at SHA `3dc60910b0d58a11bfff1ac77389def6f9c98455`.
- No rollback was performed during Gate 3 closure.

**Gate 4 State at Gate 3 Closure (Historical):**

- **Gate 4:** NOT AUTHORIZED
- **Login:** NOT PERFORMED
- **Test Account:** NOT USED
- **Authenticated L3:** NOT OBTAINED YET
- **Mutations:** NOT AUTHORIZED
- **Financial Operations:** NOT AUTHORIZED

Gate 3 PASS does not automatically authorize Gate 4.

## 19. Final AUR-M10-003 Gate 4 Closure

- **Gate 4:** COMPLETE / PASS
- **AUR-M10-003:** COMPLETE / PASS
- **Verified Deployed Application SHA:** `1cd18e6a57e775b21d89b951074a44a687ececfc`
- **Active Cloudflare Pages Deployment ID:** `7f379046-49ab-454d-b7ed-dd2ba8abf9df`
- **Project:** `aureole-cc-staging-3dc609`
- **Staging URL:** `https://aureole-cc-staging-3dc609.pages.dev`

**Gate 4 Runtime Findings (PASS):**

- an explicitly authorized disposable test account was used
- real browser `POST /api/v1/auth/login` returned HTTP 200 through the same-origin API boundary
- a non-empty opaque Bearer credential was returned and stored only in `sessionStorage` under `aureole.auth.access-token`
- no credential appeared in `localStorage`, cookies, URL, DOM, or console
- `GET /api/v1/me` returned HTTP 200 and authenticated bootstrap completed
- hard-refresh session restoration passed on `/dashboard` and `/subscription`
- a separate new tab did not inherit sessionStorage and correctly returned to login
- all authenticated application pages rendered without read errors or crashes
- 16 naturally page-driven authenticated GET categories returned HTTP 200
- Bearer credentials were confined to authenticated same-origin `/api/v1/*` requests
- no browser request directly contacted solution or V2Board
- client-side logout cleared the sessionStorage credential and produced no network mutation
- protected navigation after logout returned to login without reusing the old Bearer
- no unexpected business mutation occurred
- `/api/v1/access/subscription` was never fetched
- no raw token or credential-bearing subscription URL was disclosed

**Authenticated GET Matrix (HTTP 200):**

- `/api/v1/me`
- `/api/v1/me/preferences`
- `/api/v1/me/stats`
- `/api/v1/wallet`
- `/api/v1/products`
- `/api/v1/orders`
- `/api/v1/subscription`
- `/api/v1/subscription/overview`
- `/api/v1/resources`
- `/api/v1/notices`
- `/api/v1/tickets`
- `/api/v1/traffic/logs`
- `/api/v1/referrals`
- `/api/v1/referrals/commissions`
- `/api/v1/referrals/withdrawal-options`
- `/api/v1/config/account`

Conditional detail GETs were not forced because no safe natural ID was required by the page-driven verification.

**Non-Blocking Subscription Coverage Limitation:**

The disposable account reported `status = expired`, subscription eligibility was false, and `accessUrl` was absent. Active-subscription and accessUrl-present states were not exercised and are not claimed as production-verified. This did not block the defined minimum AUR-M10-003 acceptance.

**Mutation Boundary:**

The only authorized mutation during Gate 4 was `POST /api/v1/auth/login`. Logout was client-side and produced no network mutation. No business mutation or financial operation was performed.

- **AUR-M10-004:** NOT STARTED / NOT AUTHORIZED
- **AUR-M10-005:** NOT STARTED / NOT AUTHORIZED
- **AUR-M10-006:** NOT STARTED / NOT AUTHORIZED

The current repository documentation HEAD is newer than the verified deployed application SHA because subsequent commits are documentation-only. The documentation HEAD must not be described as the deployed application SHA.
