# Launch Readiness

## Status and scope

- Task: `AUR-M10-001`
- Status: `COMPLETE / PASS`
- Milestone 10: `COMPLETE / PASS`
- AUR-M10-001R1: `COMPLETE`
- AUR-M10-002: `COMPLETE / PRIMARY REVIEW PASS / INDEPENDENT REVIEW PASS / FROZEN` (Code/config freeze SHA: `8890ba0e8325828e27d2234a3f8b242561fbe801`. Pre-independent-review code checkpoint: `bdaf39f4bbf462ab6729d86b83ea9afbf8421233` remains only as historical evidence.)
- AUR-M10-003: `COMPLETE / PASS`
- AUR-M10-004: `COMPLETE / PASS`
- AUR-M10-005: `COMPLETE / PASS`
- AUR-M10-006: `COMPLETE / PASS`
- Aureole v1: `LAUNCH READY / NOT PRODUCTION DEPLOYED`
- Current evidence update: `2026-09-16`
- Independent targeted review: `PASS`
- Audit date: 2026-09-14
- Aureole audit base: `a2366ea08bc579e1368d52aaf8b5b5ee72aac195`
- Frozen M9 production code: `e408f83311c3557706ac9fc09ac06fe754ea71b8`
- Pinned solution Contract: `1530acf1903d28480c66d85562392f63db5298d4` (`PASS / CLOSED / RE-FROZEN`)
- Reviewed Aureole payment-context application ancestor: `9294fc6baea1dca6483c17f20086b2258a53b1de`

This document is the Launch Readiness evidence inventory for the Aureole hosted
SPA. It records current evidence, missing evidence, safety boundaries and future
validation plans. AUR-M10-003 production staging Auth/Session and read-only L3
verification is complete, but this does not declare Aureole fully launch-ready or
authorize later mutation, financial, or final launch gates.

No production API, account, payment provider, deployment, DNS, Cloudflare or
server was accessed during the original AUR-M10-001 audit. Later authorized
AUR-M10-003 execution established the deployment and Auth/read-only evidence
recorded below. The solution repository and Contract remained read-only.

## Executive summary

Aureole v1 is code-complete through Milestone 9. The repository contains all
documented public and protected routes, feature-owned API clients, strict DTO
parsers, local recovery UX and 47 automated test files. The AUR-M10-001 SAFE-A
baseline passes with 1074 tests and a production build within the documented
bundle budgets.

The highest Aureole runtime evidence now includes L5 functional payment completion through Owner manual verification,
plus Codex-observed deployed Order/Checkout/QR/redirect/polling evidence and Owner-confirmed positive Gift Card,
Commission Transfer and Withdrawal accepted paths. Evidence provenance remains explicit: Owner manual evidence is not
represented as Codex browser automation, CI or callback telemetry.

Payment/financial verification is closed by AUR-M10-005. The remaining launch-gate work is the broader deployed browser
matrix, cache/artifact verification, staging rollback drill, observability/request-ID procedure, final blocker review and
release checklist.

### Current Application/Artifact Contract (AUR-M10-002):

- same-origin `/api/v1` is the frozen DEFAULT.
- cross-origin is an explicit EXCEPTION.
- `VITE_API_BASE_URL` is optional in normal same-origin mode.
- vendor-neutral static artifact contract exists.
- routing precedence, cache policy, and rollback contracts are defined.
- security-header/CSP baseline contract is established.
- artifact verification and deterministic source SHA release identity exist.
- Tailwind docs scanning isolation is rigorously proven.
- verified Cloudflare Pages staging application SHA: `71f24b88aab2d9ae569936494d3392ad9a5e4db7`.
- verified active deployment ID: `4a17f147-192e-45c2-a23f-bc84d0f50ae5`.
- staging project: `aureole-cc-staging-3dc609`.
- staging URL: `https://aureole-cc-staging-3dc609.pages.dev`.

### Accepted Residual State After AUR-M10-006:

- active-subscription and accessUrl-present states were not available on the disposable account
- conditional detail reads were not forced without a naturally safe ID
- remaining state-constrained non-financial flows outside the completed AUR-M10-004 minimum
- exact provider callback payload/trace was not directly captured by Codex, although functional real payment is Owner manual PASS
- mobile EPayQrcode provider behavior remains unverified unless covered by an actual owner-device run
- actual Safari, Firefox and physical-mobile device spot checks
- continuous uptime synthetic monitoring and automated bundle-budget enforcement

The production Auth/Session and read-only gate is closed by AUR-M10-003. A
complete v1 launch must still make explicit validation decisions for exposed
business mutations and payment/financial flows. Real financial testing is not
automatically required if a provider sandbox or isolated test environment can
prove the same integration. If those features remain exposed without such
evidence, they remain a launch blocker.

## Evidence-level model

| Level | Meaning                        | Qualification                                                                      |
| ----- | ------------------------------ | ---------------------------------------------------------------------------------- |
| L0    | IMPLEMENTED ONLY               | Code exists, but adequate test evidence is absent.                                 |
| L1    | AUTOMATED TESTED               | Unit, integration or CI evidence passes.                                           |
| L2    | CONTROLLED BROWSER VERIFIED    | A local or controlled mock browser exercised the user flow.                        |
| L3    | PRODUCTION READ VERIFIED       | The real deployed Aureole and production API completed read-only behavior.         |
| L4    | PRODUCTION MUTATION VERIFIED   | A real production state-changing flow was verified.                                |
| L5    | PRODUCTION END-TO-END VERIFIED | Browser, provider/callback and final authoritative state were verified end to end. |

Rules:

- CI PASS alone never means production verified.
- Historical browser notes count as L2 only when they name the controlled
  environment and expected behavior.
- Upstream solution/V2Board evidence does not raise Aureole above L2 unless the
  deployed Aureole browser path was part of that evidence.
- `NOT VERIFIED` is not automatically a blocker; severity depends on exposure,
  reversibility and business impact.

## Safety-class model

| Class       | Meaning                                                                                         | AUR-M10-001 audit execution                          |
| ----------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| SAFE-A      | Local tests, source analysis, builds, dependency and mock-browser work with no production state | Allowed and executed where listed below              |
| SAFE-B      | Production read-only requests that do not create, update or delete business state               | Planned only; not executed                           |
| STATE-C     | Production operations that change account or business state without directly moving money       | Planned only; explicit future authorization required |
| FINANCIAL-D | Orders, payment, wallet, Gift Card, commission, withdrawal or other money-related mutations     | Planned only; explicit user authorization required   |

Login is classified as STATE-C because it can create an upstream session and
update account login metadata. Promotion validation is SAFE-B despite using POST
because the pinned Contract defines it as a non-reserving preview.

Later AUR-M10-003 execution separately authorized one disposable-account login and
the SAFE-B authenticated read matrix. No other STATE-C operation and no
FINANCIAL-D operation was authorized or performed.

## AUR-M10-001 Audit Feature Evidence Matrix (Historical)

This matrix preserves the evidence state at the 2026-09-14 AUR-M10-001 audit
checkpoint. `VERIFIED` means only the evidence column in which it appears. Current
AUR-M10-003 production staging evidence is recorded after the matrix and supersedes
the historical `NOT VERIFIED` values only for its exact authorized scope.

| Feature                                       | Aureole route                                  | Public API route(s)                                                     | Read or mutation                  | Current level  | Automated tests                                                     | Controlled browser evidence                                                | Production runtime evidence  | Safety                                             | Launch blocker and required action                                                      | Notes                                                                            |
| --------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------- | -------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Root redirect, protected shell and navigation | `/`, all protected routes                      | `GET /api/v1/me` during session bootstrap                               | Read/local UI                     | L2             | VERIFIED: `auth-flow`, theme and route/page tests                   | VERIFIED: desktop/mobile Auth shell, drawer, refresh and logout            | NOT VERIFIED                 | SAFE-B after an existing session; login is STATE-C | BLOCKER as part of production Auth/deployment smoke; run M10-003                        | Thin route entries and centralized Auth guard are present.                       |
| Application 404                               | unknown SPA route                              | NOT APPLICABLE                                                          | Local UI                          | L0             | NOT VERIFIED as a dedicated test                                    | NOT VERIFIED                                                               | NOT VERIFIED                 | SAFE-A                                             | LOW; include in deployed history-fallback smoke                                         | Component exists, but server fallback must deliver `index.html` first.           |
| Login and session bootstrap                   | `/login`                                       | `POST /api/v1/auth/login`, `GET /api/v1/me`                             | Mutation + read                   | L2             | VERIFIED: `auth-api`, `auth-flow`, `api-client`, credential storage | VERIFIED: controlled login, refresh bootstrap, errors and local logout     | NOT VERIFIED                 | STATE-C                                            | BLOCKER; verify deployed login, refresh, invalid session and logout in M10-003          | Logout is local because the Contract has no logout endpoint.                     |
| Registration requirements                     | `/register`                                    | `GET /api/v1/config/onboarding`                                         | Read                              | L2             | VERIFIED: `public-account-api`, registration and challenge tests    | VERIFIED: controlled requirements, unsupported capability and error states | NOT VERIFIED                 | SAFE-B                                             | HIGH if registration is enabled; verify actual production requirements first            | Real Google reCAPTCHA is historically NOT VERIFIED.                              |
| Email verification code                       | `/register`, `/forgot-password`                | `POST /api/v1/auth/email-code`                                          | Mutation                          | L2             | VERIFIED: public account and registration/recovery tests            | VERIFIED with controlled challenge boundary                                | NOT VERIFIED                 | STATE-C                                            | HIGH if email verification is enabled; use a test mailbox in M10-004                    | Sends email and can consume rate limits.                                         |
| Registration                                  | `/register`                                    | `POST /api/v1/auth/register`, then `GET /api/v1/me`                     | Mutation + read                   | L2             | VERIFIED: registration flow, concurrency and Auth tests             | VERIFIED in controlled browser                                             | NOT VERIFIED                 | STATE-C                                            | HIGH if public registration is enabled; use an isolated test identity                   | Creates an account and session; cleanup capability is not in Public Contract.    |
| Password recovery                             | `/forgot-password`                             | onboarding GET, email-code POST, `POST /api/v1/auth/password/reset`     | Read + mutation                   | L2             | VERIFIED: password recovery and public account tests                | VERIFIED in controlled browser                                             | NOT VERIFIED                 | STATE-C                                            | HIGH; verify only with a disposable test account                                        | Changes password and invalidates prior session state.                            |
| Current account, stats and currency config    | `/dashboard`, `/settings` and dependent routes | `GET /api/v1/me`, `/me/stats`, `/config/account`                        | Read                              | L2             | VERIFIED: account API/page, Auth and read-only core tests           | VERIFIED in controlled desktop/mobile states                               | NOT VERIFIED                 | SAFE-B                                             | BLOCKER for `/me`; other reads HIGH; execute M10-003                                    | Currency config is required for safe money presentation.                         |
| Preferences                                   | `/settings`                                    | `GET/PATCH /api/v1/me/preferences`                                      | Read + mutation                   | L2             | VERIFIED: account API/page tests                                    | VERIFIED including save/error/retry                                        | NOT VERIFIED                 | SAFE-B for GET; STATE-C for PATCH                  | MEDIUM; M10-004 must snapshot and restore original values                               | PATCH result is reconciled with authoritative GET.                               |
| Password change                               | `/settings`                                    | `POST /api/v1/me/password`                                              | Mutation                          | L2             | VERIFIED: account lifecycle and account page tests                  | VERIFIED including successful session exit                                 | NOT VERIFIED                 | STATE-C                                            | HIGH; dedicated account and re-login validation required                                | Successful or uncertain result exits the local session.                          |
| Subscription overview                         | `/dashboard`, `/subscription`                  | `GET /api/v1/subscription/overview`                                     | Read                              | L2             | VERIFIED: subscription API/pages                                    | VERIFIED: desktop/mobile states, errors and Auth invalidation              | NOT VERIFIED                 | SAFE-B                                             | HIGH; include in M10-003 read matrix                                                    | No derived eligibility, remaining traffic or expiry calculation.                 |
| Subscription access URL                       | `/subscription`                                | `GET /api/v1/subscription`                                              | Read of sensitive credential      | L2             | VERIFIED: subscription API/pages                                    | VERIFIED: masked/reveal/copy/error states                                  | NOT VERIFIED                 | SAFE-B with sensitive handling                     | HIGH; verify production URL origin and masking without fetching its content             | Aureole intentionally never calls `/api/v1/access/subscription`.                 |
| Rotate subscription access                    | `/subscription`                                | `POST /api/v1/subscription/rotate-access`, recovery GET `/subscription` | Non-idempotent mutation           | L2             | VERIFIED: rotation and subscription tests                           | VERIFIED: confirmation, UNKNOWN and recovery against mocks                 | NOT VERIFIED                 | STATE-C                                            | HIGH; dedicated account, explicit authorization and irreversible-impact plan in M10-004 | Old URL and node UUID may become invalid; no rollback to the old credential.     |
| Advance subscription period                   | `/subscription`                                | `POST /api/v1/subscription/advance-period`, recovery GET `/overview`    | Non-idempotent mutation           | L2             | VERIFIED: advance and shared-lock tests                             | VERIFIED: confirmation, errors, UNKNOWN and recovery                       | NOT VERIFIED                 | STATE-C                                            | HIGH; dedicated eligible account and explicit authorization                             | Can reduce expiry and reset traffic; no Public rollback.                         |
| Products list                                 | `/plans`                                       | `GET /api/v1/products`                                                  | Read                              | L2             | VERIFIED: read-only API and catalog page tests                      | VERIFIED: multi-product, pricing and error states                          | NOT VERIFIED                 | SAFE-B                                             | MEDIUM; verify in M10-002/M10-003 read pass                                             | Server order and Public DTO only.                                                |
| Product detail and plan selection             | `/plans` dialog                                | `GET /api/v1/products/{id}`                                             | Read                              | L2             | VERIFIED: commerce API and order-create page tests                  | VERIFIED: lazy detail and long content                                     | NOT VERIFIED                 | SAFE-B                                             | MEDIUM; verify selected production products before order testing                        | Detail success does not prove purchase eligibility.                              |
| Order list                                    | `/orders`                                      | `GET /api/v1/orders`                                                    | Read                              | L2             | VERIFIED: orders API/page tests                                     | VERIFIED: statuses, empty/error and long IDs                               | NOT VERIFIED                 | SAFE-B                                             | HIGH because it is the recovery authority for commerce mutations                        | Must be verified before any production order mutation.                           |
| Order detail                                  | `/orders` dialog                               | `GET /api/v1/orders/{id}`                                               | Read                              | L2             | VERIFIED: orders API/page tests                                     | VERIFIED: lazy detail, null dates, errors and focus                        | NOT VERIFIED                 | SAFE-B                                             | HIGH; verify before Cancel/Checkout                                                     | Does not expose upstream payment or plan internals.                              |
| Order status                                  | payment flow in `/orders`                      | `GET /api/v1/orders/{id}/status`                                        | Read                              | L2             | VERIFIED: payment and order API tests                               | VERIFIED: polling, pending/processing and manual refresh                   | NOT VERIFIED                 | SAFE-B                                             | BLOCKER for commerce launch; must prove authoritative final state                       | Provider callback remains outside Aureole and solution.                          |
| Order create                                  | `/plans` dialog                                | `POST /api/v1/orders`, recovery GET `/orders`                           | Financial mutation                | L2             | VERIFIED: commerce API and order-create tests                       | VERIFIED: confirmation, errors and UNKNOWN recovery                        | NOT VERIFIED                 | FINANCIAL-D                                        | BLOCKER for full commerce launch unless capability is withheld; M10-005                 | Creates a financial/order record even before payment.                            |
| Promotion validation                          | `/plans` dialog                                | `POST /api/v1/promotions/validate`                                      | Non-reserving preview             | L2             | VERIFIED: commerce API and order-create tests                       | VERIFIED: fixed/percentage and stale preview behavior                      | NOT VERIFIED                 | SAFE-B                                             | MEDIUM; safe production validation can precede order mutation                           | Success is not final price or order eligibility.                                 |
| Order cancel                                  | `/orders` detail                               | `POST /api/v1/orders/{id}/cancel`, recovery GETs                        | Financial/order mutation          | L2             | VERIFIED: cancel and commerce tests                                 | VERIFIED: pending-only confirmation and reconciliation                     | NOT VERIFIED                 | FINANCIAL-D                                        | HIGH; validate on a dedicated pending test order in M10-005                             | May restore balance/coupon state; server remains authoritative.                  |
| Billing methods                               | `/orders` payment flow                         | `GET /api/v1/billing/methods`                                           | Read                              | L2             | VERIFIED: payment API/checkout tests                                | VERIFIED: empty/multiple methods, icons and fee metadata                   | NOT VERIFIED                 | SAFE-B                                             | BLOCKER for commerce launch; identify actual methods/provider environment               | Provider sandbox/merchant information is UNKNOWN in this repo.                   |
| Checkout, QR and redirect                     | `/orders` payment flow                         | `POST /api/v1/orders/{id}/checkout`, status/detail/list GETs            | Financial mutation                | L2             | VERIFIED: payment API/checkout tests                                | VERIFIED: QR, HTTPS redirect, finished, errors and UNKNOWN recovery        | NOT VERIFIED                 | FINANCIAL-D                                        | BLOCKER for commerce launch; perform controlled provider E2E in M10-005                 | Mobile custom-scheme provider behavior remains upstream evidence gap.            |
| Wallet balance                                | `/wallet`                                      | `GET /api/v1/wallet`                                                    | Read                              | L2             | VERIFIED: wallet API/page                                           | VERIFIED: currency, zero/max and error states                              | NOT VERIFIED                 | SAFE-B                                             | HIGH; verify before any wallet-affecting mutation                                       | Wallet is the final balance authority.                                           |
| Wallet deposit creation                       | `/wallet`                                      | `POST /api/v1/wallet/deposits`, recovery GET `/orders`                  | Financial mutation                | L2             | VERIFIED: wallet deposit and money input tests                      | VERIFIED: confirmation, errors and UNKNOWN recovery                        | NOT VERIFIED                 | FINANCIAL-D                                        | BLOCKER if deposit is exposed; use controlled provider environment                      | Deposit order creation does not mean wallet credit.                              |
| Gift Card redeem                              | `/wallet`                                      | `POST /api/v1/gift-cards/redeem`, account recovery GETs                 | Financial/account mutation        | L2             | VERIFIED: Gift Card API/page and shared wallet lock tests           | VERIFIED: privacy, effects, errors and UNKNOWN recovery                    | NOT VERIFIED                 | FINANCIAL-D                                        | BLOCKER if enabled; requires a one-use controlled card and explicit authorization       | Redemption is irreversible through the Public Contract.                          |
| Resources                                     | `/resources`                                   | `GET /api/v1/resources`                                                 | Read                              | L2             | VERIFIED: read-only API and catalog/resources page tests            | VERIFIED: online/offline, errors and private-field absence                 | NOT VERIFIED                 | SAFE-B                                             | LOW; include in read-only verification                                                  | Public DTO intentionally excludes connection details.                            |
| Traffic logs                                  | `/subscription`                                | `GET /api/v1/traffic/logs`                                              | Read                              | L2             | VERIFIED: read-only API and subscription/catalog tests              | VERIFIED: ordered/empty/error states                                       | NOT VERIFIED                 | SAFE-B                                             | MEDIUM; include in read-only verification                                               | No aggregation, cost or arbitrary date range.                                    |
| Notice list                                   | `/dashboard`, `/notices`                       | `GET /api/v1/notices`                                                   | Read                              | L2             | VERIFIED: notice API/security/page tests                            | VERIFIED: list, pagination, empty/error and Dashboard summary              | NOT VERIFIED                 | SAFE-B                                             | MEDIUM; include in read-only verification                                               | Dashboard requests summary only.                                                 |
| Notice detail                                 | `/notices` dialog                              | `GET /api/v1/notices/{id}`                                              | Read of untrusted HTML            | L2             | VERIFIED: sanitizer/security and page tests                         | VERIFIED: hostile HTML, links, 404 and focus                               | NOT VERIFIED                 | SAFE-B                                             | HIGH; verify representative real HTML before launch                                     | DOMPurify is the only HTML rendering boundary.                                   |
| Ticket list                                   | `/support`                                     | `GET /api/v1/tickets`                                                   | Read                              | L2             | VERIFIED: Ticket API/page tests                                     | VERIFIED: list states, long/XSS-like text and errors                       | NOT VERIFIED                 | SAFE-B                                             | HIGH; required authority before Ticket mutations                                        | Preserves server order and renders plain text.                                   |
| Ticket detail                                 | `/support` dialog                              | `GET /api/v1/tickets/{id}`                                              | Read                              | L2             | VERIFIED: Ticket API/page tests                                     | VERIFIED: messages, switching, errors and focus                            | NOT VERIFIED                 | SAFE-B                                             | HIGH; verify dedicated test ticket before Reply/Close                                   | Ticket content may include sensitive user text.                                  |
| Ticket create                                 | `/support`                                     | `POST /api/v1/tickets`, recovery GET list                               | Non-idempotent mutation           | L2             | VERIFIED: create API/page and authority-gate regressions            | VERIFIED: raw text, errors, UNKNOWN and remount gate                       | NOT VERIFIED                 | STATE-C                                            | HIGH; dedicated support account and cleanup by closing the created ticket               | Public success has no Ticket ID; no causal list inference.                       |
| Ticket reply                                  | `/support` detail                              | `POST /api/v1/tickets/{id}/reply`, recovery GETs                        | Non-idempotent mutation           | L2             | VERIFIED: Ticket mutation/API tests                                 | VERIFIED: raw multiline text, UNKNOWN and authority gates                  | NOT VERIFIED                 | STATE-C                                            | HIGH; use a known test Ticket and benign content                                        | Reply cannot be deleted through Public Contract.                                 |
| Ticket close                                  | `/support` detail                              | `POST /api/v1/tickets/{id}/close`, recovery GETs                        | Mutation                          | L2             | VERIFIED: Ticket mutation/API tests                                 | VERIFIED: confirmation, UNKNOWN and closed-state behavior                  | NOT VERIFIED                 | STATE-C                                            | MEDIUM; close the dedicated test Ticket as cleanup                                      | No reopen route exists.                                                          |
| Referral overview                             | `/referrals`                                   | `GET /api/v1/referrals`                                                 | Read                              | L2             | VERIFIED: referral API/page tests                                   | VERIFIED: codes/stats, empty/errors and privacy                            | NOT VERIFIED                 | SAFE-B                                             | HIGH before referral/commission mutations                                               | Code copy activation after SPA navigation was not controlled-browser verified.   |
| Create referral code                          | `/referrals`                                   | `POST /api/v1/referrals/codes`, recovery GET overview                   | Non-idempotent mutation           | L2             | VERIFIED: referral create/API/remount tests                         | VERIFIED: confirmation, UNKNOWN and SPA remount                            | NOT VERIFIED                 | STATE-C                                            | MEDIUM; dedicated account below code limit                                              | Public Contract has no code deletion or identity in success.                     |
| Commission history                            | `/referrals`                                   | `GET /api/v1/referrals/commissions`                                     | Read                              | L2             | VERIFIED: referral API/page tests                                   | VERIFIED: ordered rows, pagination and errors                              | NOT VERIFIED                 | SAFE-B                                             | HIGH before Commission Transfer verification                                            | Does not expose invited user or order identity.                                  |
| Commission transfer                           | `/referrals`                                   | `POST /api/v1/referrals/commissions/transfer`, overview/wallet GETs     | Non-idempotent financial mutation | L2             | VERIFIED: transfer, reload, concurrency and cross-session tests     | VERIFIED: confirmation, UNKNOWN, F5, SPA and session isolation             | NOT VERIFIED                 | FINANCIAL-D                                        | BLOCKER if exposed; dedicated funded account and explicit authorization                 | Public rollback is unavailable; recovered balance deltas do not prove causality. |
| Withdrawal options                            | `/referrals`                                   | `GET /api/v1/referrals/withdrawal-options`                              | Read                              | L2             | VERIFIED: referral API/page and withdrawal tests                    | VERIFIED: enabled/disabled/method states                                   | NOT VERIFIED                 | SAFE-B                                             | HIGH before Withdrawal Request                                                          | Public Contract intentionally omits minimum amount.                              |
| Withdrawal request                            | `/referrals`                                   | `POST /api/v1/referrals/withdrawal-requests`, recovery GET options      | Non-idempotent financial request  | L2             | VERIFIED: withdrawal, reload, concurrency and cross-session tests   | VERIFIED: account privacy, UNKNOWN, F5 and session isolation               | NOT VERIFIED                 | FINANCIAL-D                                        | BLOCKER if exposed; dedicated account and explicit authorization                        | Creates a request Ticket; no Public cancellation or payout status route.         |
| Subscription content download                 | NOT APPLICABLE                                 | `GET /api/v1/access/subscription`                                       | Credential-bearing content read   | NOT APPLICABLE | VERIFIED absence in production source                               | VERIFIED historical absence of raw subscription fetch                      | NOT APPLICABLE to Aureole UI | NOT APPLICABLE                                     | Not a launch action for Aureole                                                         | Subscription clients, not the SPA, consume this route.                           |

## Current Production Staging Runtime Evidence

AUR-M10-003 is `COMPLETE / PASS`. The following real deployed Aureole evidence is
L3 within the exact authorized staging scope:

- deployed SHA, HTTPS/TLS, canonical SPA routing, security headers, cache behavior,
  404 behavior, `/api/v1` Pages Function confinement, onboarding, and OPTIONS policy
- real browser login and `GET /api/v1/me`
- sessionStorage-only credential persistence and hard-refresh restoration
- page-driven HTTP 200 reads for Account, Products, Subscription, Resources,
  Traffic, Notices, Orders, Wallet, Tickets, Referrals, and Withdrawal Options
- same-origin Bearer confinement, client-side logout, and post-logout protection

The remaining runtime gaps are outside the completed AUR-M10-003 and AUR-M10-004 scopes:

- Production Order Create, Promotion Validation and Cancel.
- Production billing methods, Checkout provider QR/redirect behavior, provider
  callback and final Order Status.
- Production Rotate Access and Advance Period.
- Production Wallet Deposit and Gift Card redemption.
- Production Ticket Create, Reply, and Close runtime passed in AUR-M10-004 after
  the expected consecutive-user Reply rejection exposed and drove correction of
  the frontend eligibility defect.
- Production Commission Transfer and Withdrawal Request; Referral Code Create
  runtime passed in AUR-M10-004, and Referral Overview, Commission History, and
  Withdrawal Options GETs are verified.
- Real Google reCAPTCHA behavior if production onboarding enables it.

### AUR-M10-004 Runtime Finding and R1/R2 Corrections

The authorized controlled mutation run established runtime PASS evidence for
Preferences update/restore, Ticket Create and Close, Referral Code Create,
Password Change/re-login/restore, and Registration. Subscription Rotate Access
and Advance Period were not executable because the authoritative account state
was ineligible. Email-code delivery and Password Recovery were not executed
without a real mailbox/code.

An immediate Reply to the newly created Ticket returned HTTP 409. Primary
confirmed this as expected V2Board behavior: a user cannot send two consecutive
Ticket messages, and Solution already maps the upstream waiting-for-support
response to `TICKET_REPLY_FAILED`. The Aureole defect was that Reply remained
actionable when the V2Board-authoritative latest message belonged to the user.

AUR-M10-004R1 added sender-based Reply eligibility. Primary R2 review identified
that the upstream message array has no guaranteed order, while V2Board enforces
Reply using the message with the greatest numeric TicketMessage ID. R2 now uses
that same highest-ID rule in both the UI and execution boundary, without reordering
the rendered message array. Empty history still fails closed, Close eligibility is
unchanged, and successful Reply reconciliation derives the next state only from
the authoritative GET.

Primary and Independent Review passed with no remaining required finding. R4
deployed final SHA `cd6bf73b1f0c76c50d81971c1c0dc88408b5bbef` as Cloudflare
Pages deployment `dd7ff78c-efbd-4503-957e-619a9bb45433`. Dedicated Ticket 19
verified user-latest blocking at greatest ID 34, support-latest Reply availability
at greatest ID 35, one HTTP 200 user Reply, authoritative return to user-latest at
greatest ID 36, consecutive Reply prevention, and one authoritative Close cleanup.
AUR-M10-004 is `COMPLETE / PASS`.

For the AUR-M10-003 disposable account, `status = expired`, subscription
eligibility was false, and `accessUrl` was absent. Active-subscription and
accessUrl-present states remain non-blocking residual evidence and are not claimed
as production-verified. Conditional detail GETs were not forced without a safe
natural ID. `/api/v1/access/subscription` was never fetched.

The pinned solution Contract includes selected upstream runtime acceptance for
official V2Board compatibility, simulated payment callback, order state,
subscription access and subscription byte parity. That is useful upstream evidence,
but it does not by itself prove the Aureole production host, environment, browser,
CORS or current provider configuration.

## AUR-M10-001 Deployment Readiness Snapshot (Historical)

The table below preserves the 2026-09-14 audit checkpoint. Gate 3 later verified
Cloudflare Pages hosting, HTTPS/TLS, explicit SPA routing, same-origin `/api/v1`,
cache/security headers, 404 behavior, deployment identity, and release metadata.

| Requirement                                 | Status                          | Evidence and action                                                                                                              |
| ------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Production build command                    | VERIFIED                        | `npm run build` runs TypeScript and Vite production build.                                                                       |
| Reproducible dependency install             | VERIFIED                        | `npm ci` succeeds from `package-lock.json`; Node requirement is `>=22.12.0`.                                                     |
| Hosting provider                            | NOT VERIFIED                    | No provider is selected or configured. `DEPLOYMENT INFO REQUIRED`.                                                               |
| HTTPS                                       | NOT VERIFIED                    | Required for credentials, redirects and reCAPTCHA; no deployment config is present.                                              |
| SPA history fallback                        | DOCUMENTED / NOT VERIFIED       | README and Architecture require unknown routes to serve `index.html`; no host rule exists.                                       |
| API base URL                                | RESOLVED / NOT VERIFIED         | `VITE_API_BASE_URL` requirement removed for same-origin default. Production URL routing remains NOT VERIFIED.                    |
| Same-origin `/api/v1` routing               | NOT VERIFIED                    | No proxy/routing configuration exists. Preferred mode and solution origin are undecided.                                         |
| Cross-origin CORS                           | NOT VERIFIED                    | If a separate Gateway origin is used, exact production Origin compatibility must be proven.                                      |
| Asset caching                               | BUILD READY / HOST NOT VERIFIED | Vite emits hashed JS/CSS assets suitable for immutable long cache.                                                               |
| `index.html` caching                        | NOT VERIFIED                    | Host must avoid long stale caching and support timely revalidation/purge.                                                        |
| 404/error behavior                          | PARTIAL                         | Client 404 exists; SPA-host fallback and outage error page are not configured.                                                   |
| Source maps                                 | VERIFIED for current build      | No `.map` files were emitted by the audited production build.                                                                    |
| Production debug logging                    | APPLICATION PASS                | No application `console.*`, analytics or error-reporting integration exists in production source.                                |
| Security headers/CSP                        | NOT VERIFIED                    | No host headers configuration exists. A CSP must account for the inline theme bootstrap and conditional Google reCAPTCHA script. |
| Deployment command and artifact publication | NOT VERIFIED                    | No workflow or provider configuration deploys `dist`.                                                                            |

Vite embeds `VITE_API_BASE_URL` at build time. A production artifact must therefore
be built with the correct public origin, or the application must deliberately use
an absolute same-origin value matching the deployed host. A leading `/api/v1` path
is resolved at that origin. Building without the value is not a usable production
artifact even though TypeScript and Vite succeed.

## Static SPA hosting requirements

Production hosting must provide all of the following:

1. HTTPS for every application route and API request.
2. Unknown application paths such as `/orders/123` must return the current
   `index.html`, while real missing hosted assets must still return 404.
3. A defined `/api/v1` architecture:
   - preferred same-origin reverse proxy/route to solution; or
   - a separately hosted solution origin permitted by CSP `connect-src`.
   - the re-frozen solution Public API uses wildcard non-credentialed CORS;
     frontend domains are replaceable clients and changing the Aureole domain
     requires no solution origin allowlist or deployment.
   - Bearer authentication remains explicit. Origin is neither identity nor
     authorization and is used by Checkout only as payment return-URL protocol
     metadata.
   - the same-origin Pages Function derives the outbound HTTPS `Origin` from
     the actual frontend request URL and preserves the browser `User-Agent` as
     transient payment context; it does not trust an incoming client-supplied
     `Origin` or expand the request-header allowlist beyond the documented
     context.
4. `dist/assets/*-[hash].js` and `*.css` may use long-lived immutable caching.
5. `index.html` must use revalidation or short/no cache so it cannot remain pinned
   to stale chunk names after deployment or rollback.
6. Deploy `index.html` and its matching hashed assets atomically. Keep prior hashed
   assets available until old HTML/CDN/browser caches can no longer reference them.
7. Do not expose build-time secrets. `VITE_*` values are public browser content;
   only the public solution origin is allowed.
8. Do not expose the V2Board origin, V2Board credentials, Authorization bearer,
   subscription `accessUrl`, Gift Card code, Withdrawal account or payment payload
   in host logs, analytics or client error metadata.
9. Define CSP, frame, MIME, referrer and other security headers compatible with the
   inline theme script and the conditional reCAPTCHA client.

The current application build satisfies hashed-asset generation and emits no source
maps. All routing, cache, proxy and header requirements remain deployment-layer
configuration.

## API boundary and security audit

| Check                                  | Result         | Evidence                                                                                                            |
| -------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Raw V2Board route in production source | PASS           | No production-source hit; API client rejects paths outside `/api/v1/`.                                              |
| Direct backend/V2Board hostname        | PASS           | No business backend hostname is hardcoded.                                                                          |
| Axios or second HTTP client            | PASS           | Native `fetch` is centralized in `src/lib/api/client.ts`.                                                           |
| Hardcoded API hostname                 | PASS           | Only `VITE_API_BASE_URL` is used; `.env.example` contains an example placeholder.                                   |
| External fixed URL                     | PASS WITH NOTE | Only Google reCAPTCHA client script is fixed and lazy-loaded for supported capability.                              |
| Manual Authorization injection         | PASS           | API client rejects caller-provided Authorization and adds bearer only at the authenticated boundary.                |
| Redirect following                     | PASS           | API requests use `redirect: 'error'`; payment navigation accepts parsed credential-free HTTPS targets only.         |
| Sensitive application console logging  | PASS           | No production-source application `console.*` call was found.                                                        |
| Raw request/response logging           | PASS           | No logging pipeline exists; API client does not log body, header or raw response.                                   |
| Raw public error display               | PASS           | UI branches on stable codes and shows safe local copy plus optional request ID.                                     |
| Notice HTML                            | PASS           | DOMPurify allowlist forbids scripts, media, forms, SVG, style and unsafe attributes/URIs.                           |
| Query/mutation keys                    | PASS           | Reviewed keys contain route IDs where needed, but no bearer, Gift Card code, payment payload or Withdrawal account. |
| Subscription content fetch             | PASS           | No production source uses `/api/v1/access/subscription`.                                                            |

The built DOMPurify dependency contains its own generic Trusted Types policy warning
path. It does not contain application credentials or payload logging. Application
production source contains no console logging.

## Credential and sensitive-data audit

| Data                                | Storage/runtime result                                                                       | Status |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | ------ |
| Auth bearer                         | Zustand memory plus `sessionStorage` under `aureole.auth.access-token`; never `localStorage` | PASS   |
| Theme preference                    | Non-sensitive `localStorage` only                                                            | PASS   |
| Query server state                  | In-memory TanStack Query; no persistent Query cache                                          | PASS   |
| Session generation                  | Memory-only integer                                                                          | PASS   |
| Commission/Withdrawal safety marker | `active`/`acknowledged` only in `sessionStorage`; no identity, amount, method or account     | PASS   |
| Gift Card code                      | React/mutation memory, masked UI, cleared after settle, no persistent storage                | PASS   |
| Withdrawal account                  | React/request memory, masked by default, removed from mutation cache after settle            | PASS   |
| Subscription access URL             | Query/render memory, masked by default, clipboard only on command                            | PASS   |
| Payment QR/redirect payload         | Transient component state; no fetch, persistence, iframe or automatic navigation             | PASS   |
| Committed secret scan               | No suspected production credential found                                                     | PASS   |

The only secret-pattern match was a test fixture in `src/test/api-client.test.ts`.
No secret value was printed or used. No production token, private key, V2Board
credential or production API address was found in tracked application/config files.

## Build and dependency audit

Environment used by AUR-M10-001:

- Node.js `v24.13.0`
- npm `11.6.2`
- Vite `8.3.0`
- TypeScript resolved by lockfile: `6.0.3`

| Check                                   | Result                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm ci`                                | PASS; 322 packages installed, 323 audited, 0 vulnerabilities                                   |
| `npm run format:check`                  | PASS                                                                                           |
| `npm run typecheck`                     | PASS                                                                                           |
| `npm run lint`                          | PASS with zero warnings                                                                        |
| `npm test`                              | PASS; 47 files, 1074 tests                                                                     |
| `npm run build`                         | PASS; 2325 modules transformed                                                                 |
| `npm ls --all`                          | PASS; platform and integration packages shown as optional are not required dependency failures |
| `git diff --check` before documentation | PASS                                                                                           |

No dependency was upgraded. No warning was suppressed. The current test count is
unchanged from the recorded M9 baseline.

## Bundle and performance

Vite-reported production output:

| Artifact           |       Raw |      Gzip | Budget result                                 |
| ------------------ | --------: | --------: | --------------------------------------------- |
| Main JS            | 472.98 kB | 148.75 kB | PASS against 200 kB target and 250 kB ceiling |
| CSS                |  37.87 kB |   7.52 kB | PASS against 60 kB                            |
| Orders route       |  41.63 kB |  13.16 kB | PASS against normal route 100 kB              |
| Notices route      |  32.26 kB |  12.80 kB | PASS                                          |
| Referrals route    |  50.30 kB |  12.18 kB | PASS                                          |
| Wallet route       |  22.81 kB |   6.84 kB | PASS                                          |
| Subscription route |  19.89 kB |   5.68 kB | PASS                                          |
| Plans route        |  15.09 kB |   5.16 kB | PASS                                          |
| Account route      |  13.11 kB |   4.44 kB | PASS                                          |

`dist/index.html` explicitly preloads the main JS, shared error chunk and router
chunk. Their Vite-reported gzip total is approximately 162.65 kB before a route
chunk is requested. This declared composition remains below the initial JS target.

`EVIDENCE GAP`: the repository has no runtime initial-route analyzer, coverage of
browser caching behavior or automated budget gate. Dynamic route names must not be
added to the initial total merely because they exist in `dist`. A future analyzer
may be added only if Primary authorizes that scope.

At the AUR-M10-001 audit checkpoint, Tailwind automatic candidate scanning included repository documentation. During that audit, documentation prose generated an unintended CSS utility rule, proving that documentation-only changes could alter the production CSS bundle.

RESOLVED BY AUR-M10-002R1: automatic candidate detection is disabled with `source(none)`, production scanning is explicitly limited to root `index.html` and `src`, and controlled documentation-isolation testing proved that documentation changes no longer affect generated Tailwind CSS.

## Browser and Accessibility Evidence

| Area                  | Current evidence                                                       | Gap                                                                    |
| --------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Desktop               | VERIFIED by final deployed Chrome matrix across every protected route  | Actual Safari/Firefox remain owner-device spot checks                  |
| Mobile                | VERIFIED by deployed Chrome at 390 x 844 across every protected route  | Physical mobile device evidence remains an owner-device spot check     |
| Light/Dark            | VERIFIED in final deployed Chrome launch smoke                         | None for the defined v1 gate                                           |
| System theme          | VERIFIED for later feature flows and theme infrastructure              | Not every historical flow explicitly repeated in System                |
| Keyboard/focus        | VERIFIED for navigation, Retry, dialogs, Escape and key mutation flows | No committed browser E2E suite                                         |
| Loading/empty/error   | Valid deployed empty states verified in AUR-M10-003                    | Production API latency/outage behavior not verified                    |
| Auth refresh          | VERIFIED in deployed staging with `/me` restoration                    | Invalid-session production path was not deliberately induced           |
| SPA navigation        | VERIFIED for canonical deep links and authenticated page navigation    | Trailing-slash public routes are a documented non-blocking 404         |
| Financial full reload | VERIFIED for Commission Transfer and Withdrawal against local mocks    | Real network/provider continuation not verified                        |
| Reduced motion        | CSS baseline and code evidence VERIFIED                                | Dedicated controlled-browser reduced-motion behavior is NOT VERIFIED   |
| Cross-browser         | ACCEPTED RESIDUAL                                                      | Actual Safari/Firefox were unavailable in the instrumented environment |
| Long text/overflow    | VERIFIED extensively at desktop/mobile                                 | Production localized/provider values may differ                        |

There is no committed browser E2E runner. M10-006 nevertheless completed a real deployed Desktop Chrome and responsive
390 x 844 Chrome matrix across the ten protected routes, session restoration, themes, navigation, logout and payment-free
network boundaries. Actual Safari/Firefox/physical-mobile checks remain explicit owner-device residuals and are not
misrepresented as Chromium evidence.

## CI maintenance

The CI workflow uses `actions/checkout@v4`, `actions/setup-node@v4` and explicit
Node 24. GitHub's action runtime metadata transition currently makes these action
versions a maintenance item even though the audited base exact-SHA CI run
`34833388791` passed.

Classification: `LOW / CI MAINTENANCE`, not a launch blocker by itself. Do not
upgrade actions inside AUR-M10-001. Upgrade in a dedicated maintenance task with an
exact-SHA CI comparison.

## Observability

Application-level strengths:

- `x-request-id` and public envelope request IDs are captured.
- User-facing error components can display the request ID without raw upstream
  content.
- Stable public error codes drive recovery UX.
- No sensitive application logging, analytics or persistent error metadata exists.

Gaps:

- No production uptime monitor, synthetic login/read check or release health gate
  is defined.
- No client error-reporting integration or documented privacy-safe console policy
  exists beyond absence of application logging.
- ARTIFACT SOURCE IDENTITY: IMPLEMENTED via `dist/release.json`.
- ACTUAL STAGING DEPLOYED SHA: VERIFIED as `71f24b88aab2d9ae569936494d3392ad9a5e4db7`.
- ACTIVE CLOUDFLARE PAGES DEPLOYMENT: `4a17f147-192e-45c2-a23f-bc84d0f50ae5`.
- Runtime public errors expose a request ID; `ApiError`, read errors, Login and mutation feedback preserve/display it as a
  privacy-safe support correlation key. The Solution derives it from Cloudflare request metadata where available.

Classification: request-ID correlation is resolved for v1. Continuous synthetic monitoring remains an accepted
post-launch operational recommendation and does not justify adding analytics or a new monitoring stack in this gate.

## Rollback and recovery readiness

Known source checkpoints exist:

- M9 production code freeze: `e408f83311c3557706ac9fc09ac06fe754ea71b8`
- M9 documentation closure and M10 audit base:
  `a2366ea08bc579e1368d52aaf8b5b5ee72aac195`

At AUR-M10-001 audit time, rollback readiness was entirely unverified.

**Current Rollback State:**

- vendor-neutral rollback contract: DEFINED in `DEPLOYMENT.md`.
- known provider rollback targets: RECORDED from Cloudflare Pages deployment history.
- staging rollback drill: VERIFIED on 2026-09-16.
- artifact registry/provider release history: VERIFIED for the three recorded Gate 3 deployments.

The drill promoted `dd7ff78c-efbd-4503-957e-619a9bb45433` / `cd6bf73...`, verified release identity, HTTPS,
root/application routes, same-origin onboarding API, missing-asset 404 and referenced assets, then restored
`4a17f147-192e-45c2-a23f-bc84d0f50ae5` / `71f24b8...`. Post-restore Login and `/me` passed. Status:
`STAGING ROLLBACK / RESTORE PASS`.

## Production read-only verification plan

No step in this section was executed by AUR-M10-001.

AUR-M10-003 later executed the authorized hosting, onboarding, Auth/session,
account/config, and core page-driven read scope. The active-subscription,
accessUrl-present, conditional detail, representative Notice HTML, and
deliberately induced invalid-session states were not forced and remain bounded
residual evidence.

| Plan                   | Prerequisites and account state                                                         | API/UI path                                                                                                       | Expected and authoritative verification                                                                                                               | Cleanup/side effects                                                          | Safety and approval                                           |
| ---------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Hosting smoke          | Deployed immutable artifact, HTTPS hostname, known SHA, API routing and cache policy    | Directly open `/`, `/login`, `/orders`, unknown route and a missing asset                                         | SPA routes return current `index.html`; missing assets are real 404; no mixed content; deployed SHA/artifact recorded                                 | None                                                                          | SAFE-B; separate M10 authorization required                   |
| Public onboarding read | Production origin confirmed; no credential                                              | `/register`, `/forgot-password`; `GET /config/onboarding`                                                         | UI exactly reflects requirements; unsupported capability fails closed; request ID available on failure                                                | No business mutation                                                          | SAFE-B; separate authorization required                       |
| Auth/session read gate | Dedicated active test account; credentials supplied out of logs                         | Login -> `/me` -> refresh -> protected navigation -> local logout -> invalid-token behavior                       | Current user is authoritative; refresh restores same tab session; invalid auth clears credential/cache; local logout makes no server-revocation claim | Login may create session/update login metadata                                | STATE-C; explicit account authorization required              |
| Account/config reads   | Auth gate passed; known account                                                         | Dashboard/Account/Plans/Orders/Wallet/Referrals                                                                   | `/me`, preferences, stats and currency config render only Public DTO; compare API response to UI without logging bearer/body                          | None beyond authenticated reads                                               | SAFE-B after authorized login                                 |
| Core reads             | Seeded test account with known subscription, products, orders, wallet and referral data | `/dashboard`, `/subscription`, `/plans`, `/resources`, `/orders`, `/wallet`, `/notices`, `/support`, `/referrals` | Each GET succeeds or shows expected public error; ordering, empty states, amounts, dates and request IDs match authoritative response                 | None                                                                          | SAFE-B; separate authorization required                       |
| Sensitive reads        | Account with subscription URL, Ticket text and Withdrawal methods                       | Subscription Access, Ticket Detail, Withdrawal Options                                                            | URL/account-sensitive data remains masked or scoped; no console/storage/URL leakage; no subscription content request                                  | Clipboard may contain access URL if copy is tested; clear clipboard afterward | SAFE-B with sensitive handling; explicit approval recommended |
| Notice HTML            | A known production notice with representative safe/unsafe markup                        | Open Notice Detail                                                                                                | DOM contains only allowed sanitized elements; no external resource load or script execution                                                           | None                                                                          | SAFE-B; separate authorization required                       |

## Non-financial mutation verification plan

No step in this section was executed by AUR-M10-001.

| Operation                 | Prerequisites and test state                                                          | Expected authoritative verification                                                                           | Rollback/cleanup                                                                 | Side effects                                                      | Approval                                            |
| ------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| Preferences update        | Snapshot current booleans on a test account                                           | PATCH once, GET reflects exact change, unknown-result path does not auto-retry                                | PATCH original snapshot back and GET verify                                      | Changes account preferences                                       | Explicit M10-004 authorization                      |
| Password change           | Disposable account with known old/new credentials                                     | One POST, local session exits, old credential behavior and new login are verified                             | Change back only after successful new login; old sessions remain invalidated     | Password and all upstream sessions change                         | Explicit authorization and credential owner present |
| Registration/email code   | Disposable mailbox and approved identity policy                                       | Requirements, email delivery, one registration and `/me` session establishment                                | Public Contract has no account deletion; document residual account               | Sends email, consumes rate limits, creates account/session        | Explicit authorization                              |
| Password recovery         | Disposable account and mailbox                                                        | Email-code and reset succeed once; old password rejected; new login works                                     | Restore password if permitted and document invalidated sessions                  | Changes password/session state                                    | Explicit authorization                              |
| Rotate Access             | Dedicated subscription account; current URL recorded securely; client impact accepted | One POST, old URL invalidation/current URL change verified only through authoritative GET; no blind retry     | No rollback to old credential; distribute/store new URL through approved channel | Invalidates subscription credential and possibly client node UUID | Explicit high-risk authorization                    |
| Advance Period            | Dedicated eligible account with known traffic/expiry/reset policy                     | One POST and authoritative Overview read; no local calculation or repeated POST                               | No Public rollback; preserve before/after authoritative snapshots                | Resets traffic and can reduce expiry                              | Explicit high-risk authorization                    |
| Ticket Create/Reply/Close | Dedicated account with no conflicting open Ticket; benign text                        | Create once; locate only by human-authoritative review; Reply/Close against known ID; GET Detail/List confirm | Close created Ticket; Reply remains in history                                   | Creates and modifies support records/notifications                | Explicit authorization                              |
| Referral Code Create      | Dedicated account below creation limit                                                | One POST and Overview refresh; do not infer identity from diff automatically                                  | No Public delete; document residual code                                         | Permanently consumes code quota                                   | Explicit authorization                              |

## Payment and financial verification plan

All operations below are `EXPLICIT USER AUTHORIZATION REQUIRED`. No amount, card,
Gift Card, commission transfer or withdrawal target may be selected by the audit
agent. Provider sandbox and controlled test merchant information are `UNKNOWN` in
this repository.

Preferred environment order:

1. Provider sandbox with isolated V2Board/solution/Aureole deployment.
2. Controlled test merchant and dedicated test accounts.
3. Real small-value production payment only after the user explicitly approves the
   exact provider, account, amount and cleanup limitations.

| Flow                | Prerequisites                                                                                    | UI/API path and expected result                                                      | Authoritative verification                                                                | Rollback/cleanup and residual risk                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Order create/cancel | Dedicated Product, account and promotion; known starting Orders                                  | Plans -> preview -> Create; verify one order; cancel only a known pending test order | Order List/Detail status and amount from server                                           | Cancel if allowed; order record remains; balance/coupon side effects require server verification |
| Payment E2E         | Sandbox/test merchant, callback URL, test method and dedicated pending order                     | Order -> Checkout -> QR/redirect -> provider -> callback -> status polling           | Final Order Status plus final Subscription or Wallet state, never `finished` action alone | Provider cleanup per environment; real payment may not be reversible                             |
| Wallet deposit      | Dedicated account and authorized exact amount; payment environment ready                         | Deposit Create -> existing Order/Checkout flow -> callback                           | Completed Order and final `GET /wallet` balance                                           | Public Contract has no reversal; credit/bonus/fees can remain                                    |
| Gift Card           | One controlled card with known expected effect and dedicated account                             | Enter exact code -> confirm -> one Redeem POST                                       | Wallet, `/me`, Subscription Overview and Access invalidation as applicable                | Redemption is one-use and not reversible; card/account state remains changed                     |
| Commission transfer | Dedicated account with known available commission and wallet balance; exact user-approved amount | Confirm -> one Transfer POST -> Overview + Wallet reads                              | Both authoritative reads; never infer causality from matching deltas after UNKNOWN        | No Public rollback; creates money movement/deposit-order effects                                 |
| Withdrawal request  | Dedicated account, server-provided method and user-approved account identifier                   | Confirm -> one Withdrawal Request POST -> Options read                               | Accepted request only; later admin/payout status is outside Public Contract               | No Public cancellation; creates Ticket/notification and may require manual admin cleanup         |

Payment E2E must explicitly record:

```text
Order
-> Checkout
-> QR or HTTPS redirect
-> payment provider
-> provider callback to V2Board
-> authoritative Order Status
-> final Wallet or Subscription state
```

Sandbox availability, callback observability and supported mobile custom schemes
must remain `UNKNOWN` until the deployment owner supplies evidence.

## Findings

### BLOCKER

1. RESOLVED BY AUR-M10-003/AUR-M10-006: Cloudflare Pages staging host, HTTPS/TLS, SPA routing, `/api/v1` confinement,
   cache/security headers, deployment identity and provider rollback/restore drill are verified.
2. RESOLVED BY AUR-M10-002: Same-origin `/api/v1` default implemented. Artifact verification command implemented.
3. RESOLVED BY AUR-M10-003 GATE 4: deployed browser login, `/me`, refresh
   restoration, protected navigation, credential confinement, and logout passed.
4. RESOLVED BY AUR-M10-005: deployed Order/Create/Cancel, Checkout, QR/redirect, polling and financial safety evidence passed;
   Owner manually confirmed real payment, Gift Card redemption, Commission Transfer and Withdrawal accepted paths on
   2026-09-16. Exact callback payload/trace was not directly captured and remains an accepted observability residual.

### HIGH

1. RESOLVED BY AUR-M10-002: Same-origin `/api/v1` is the DEFAULT. Cross-origin is an explicit exception.
2. RESOLVED BY AUR-M10-004/AUR-M10-005: baseline authorities, controlled mutation recovery and the exposed financial
   positive paths now have combined automated, Codex runtime and Owner manual evidence.
3. Non-financial destructive flows such as password change, Rotate Access and
   Advance Period have no production runtime evidence and limited/no rollback.
4. Notice HTML has strong local sanitizer evidence but no representative production
   content verification.
5. RESOLVED BY AUR-M10-003 GATE 3: deployed CSP and required static security headers passed.

### RESOLVED BY AUR-M10-001R1

1. M9 financial-safety documentation drift in `docs/API-MAPPING.md` and the
   malformed M9-004 SHA in `docs/ROADMAP.md` were reconciled. The final M9-003 and
   M9-004 code freeze is `e408f83311c3557706ac9fc09ac06fe754ea71b8`, and the
   authenticated Session boundary is documented as `active -> active`,
   `acknowledged -> active`, `absent -> absent`.

### MEDIUM

1. **At the AUR-M10-001 audit checkpoint**, Tailwind automatic candidate scanning included repository documentation and documentation prose could alter generated CSS.

   **RESOLVED BY AUR-M10-002R1** because:
   - automatic scanning is disabled with `source(none)`
   - explicit production sources are root `index.html` and `src`
   - controlled documentation-isolation proof passed
   - documentation-only changes no longer participate in Tailwind candidate scanning.

2. RESOLVED FOR THE V1 GATE by the final deployed Desktop/responsive Chrome matrix. Safari/Firefox/physical-mobile remain
   documented owner-device residual checks because the instrumented environment did not provide them.
3. There is no real initial-route analyzer or automated bundle budget gate.
4. Deployed SHA visibility and request-ID support correlation are verified. Recurring synthetic uptime checks remain an
   accepted operational recommendation.
5. Real reCAPTCHA remains unverified; it is non-blocking only while production
   onboarding does not enable that capability.

### LOW

1. `actions/checkout@v4` and `actions/setup-node@v4` require a dedicated CI runtime
   maintenance upgrade, but current Node 24 CI passes.
2. Historical controlled browser runs observed a missing local favicon; the repo
   still contains no favicon asset.

### INFO

1. API boundary, native fetch centralization, Public DTO parsing and feature-first
   ownership match the documented architecture.
2. No production-source V2Board route, hardcoded business backend, axios client,
   sensitive application logging or committed production credential was found.
3. Auth bearer, financial safety markers, Gift Card code, Withdrawal account,
   subscription URL and payment payload follow their documented storage/privacy
   boundaries in the reviewed implementation.
4. Current SAFE-A quality and bundle budgets pass with no regression from M9.

## Proposed M10 task breakdown

The audit findings justify this order rather than starting with production reads
before a deployment contract exists:

1. `AUR-M10-002 - Production Deployment Contract and Artifact Readiness`
   - COMPLETE / PRIMARY REVIEW PASS / INDEPENDENT REVIEW PASS / FROZEN.
2. `AUR-M10-003 - Production Auth, Session and Read-Only Verification`
   - COMPLETE / PASS.
   - verified deployment/runtime Gate 3 plus explicitly authorized login,
     sessionStorage, `/me`, page-driven reads, logout, and network boundaries.
3. `AUR-M10-004 - Controlled Non-Financial Mutation Verification`
   - COMPLETE / PASS.
   - Preferences, Ticket Create/Close, Referral Code, Password lifecycle, and
     Registration runtime evidence passed.
   - Ticket Reply greatest-ID authority passed Primary/Independent review and R4
     staging runtime re-verification.
4. `AUR-M10-005 - Payment, Wallet and Financial Runtime Verification`
   - COMPLETE / PASS.
   - C1 payment browser-context propagation passed Primary and Independent Review.
   - C3 exact-SHA staging deployment and no-payment Alipay/WxPay EPayQrcode verification passed.
   - Owner manual verification dated 2026-09-16 passed real payment, Gift Card, Commission Transfer and Withdrawal accepted paths.
   - exact callback payload/trace was not directly captured by Codex.
5. `AUR-M10-006 - Final Browser, Rollback and Launch Gate`
   - COMPLETE / PASS, staging only.
   - deployed Desktop/responsive Chrome matrix: PASS.
   - cache/artifact/history fallback/API confinement: PASS.
   - Cloudflare Pages staging rollback and restore drill: PASS.
   - request-ID observability and final blocker review: PASS.
   - Aureole v1: LAUNCH READY / NOT PRODUCTION DEPLOYED.

Production deployment, DNS changes and Post-v1 work remain separately authorized operations. The named Post-v1 scope is
Public Resource / Node Status.

## AUR-M10-001 scope confirmation

- NO PRODUCTION ACCESS PERFORMED
- NO PRODUCTION MUTATIONS PERFORMED
- NO REAL FINANCIAL OPERATIONS PERFORMED
- NO DEPLOYMENT PERFORMED
- NO BUSINESS CODE CHANGES PERFORMED
- solution remained READ ONLY

Status: `COMPLETE / PASS`.

## Final v1 Release Checklist (AUR-M10-006)

- Aureole application ancestor reviewed: `9294fc6baea1dca6483c17f20086b2258a53b1de`
- active staging release: `71f24b88aab2d9ae569936494d3392ad9a5e4db7`
- active staging deployment: `4a17f147-192e-45c2-a23f-bc84d0f50ae5`
- solution frozen baseline: `1530acf1903d28480c66d85562392f63db5298d4`
- exact-SHA CI, format, typecheck, lint, 1154 tests and production build: PASS
- deployed Desktop Chrome and 390 x 844 responsive matrix: PASS
- session restoration, themes, responsive navigation, logout and protected redirect: PASS
- cache contract, release identity, route fallback, real 404 and `/api/v1` confinement: PASS
- CSP, HSTS, Permissions-Policy, Referrer-Policy and nosniff: PASS
- same-origin Bearer confinement, no Cookie dependency and no backend-origin leakage: PASS
- M10-005 payment/financial evidence: COMPLETE / PASS with explicit Owner manual evidence classification
- staging rollback target: `dd7ff78c-efbd-4503-957e-619a9bb45433` / `cd6bf73b1f0c76c50d81971c1c0dc88408b5bbef`
- staging rollback and restoration to intended release: PASS
- support correlation: request ID from Public error envelope, preserved by `ApiError` and shown by error UI
- accepted manual residuals: actual Safari/Firefox/physical-mobile spot checks, mobile provider behavior and exact callback trace
- production deployment and DNS: NOT PERFORMED / REQUIRE SEPARATE AUTHORIZATION
- Post-v1 exclusion: Public Resource / Node Status

**Final state:** `AUREOLE V1 LAUNCH READY / NOT PRODUCTION DEPLOYED`.
