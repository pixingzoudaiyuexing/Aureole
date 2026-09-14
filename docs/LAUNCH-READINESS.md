# Launch Readiness

## Status and scope

- Task: `AUR-M10-001`
- Status: `COMPLETE / PRIMARY REVIEW PASS`
- Milestone 10: `IN PROGRESS`
- Audit date: 2026-09-14
- Aureole audit base: `a2366ea08bc579e1368d52aaf8b5b5ee72aac195`
- Frozen M9 production code: `e408f83311c3557706ac9fc09ac06fe754ea71b8`
- Pinned solution Contract: `0a37894173d1db0bbc57576c640652878f8f623d`

This document is the Launch Readiness evidence inventory for the Aureole hosted
SPA. It records current evidence, missing evidence, safety boundaries and future
validation plans. It does not declare Aureole launch-ready or production-verified.

No production API, account, payment provider, deployment, DNS, Cloudflare or
server was accessed during this audit. The solution repository and Contract were
read-only.

## Executive summary

Aureole v1 is code-complete through Milestone 9. The repository contains all
documented public and protected routes, feature-owned API clients, strict DTO
parsers, local recovery UX and 47 automated test files. The AUR-M10-001 SAFE-A
baseline passes with 1074 tests and a production build within the documented
bundle budgets.

The highest Aureole runtime evidence for business features is currently L2:
controlled browser verification against local `/api/v1` mocks. The repository
contains no evidence that the Aureole production deployment itself has completed
Auth, read, mutation or financial flows. The pinned solution Contract records
separate upstream runtime acceptance for selected Gateway/V2Board behavior, but
that evidence does not prove the Aureole deployment, browser integration, CORS,
production environment or real provider path.

The principal launch blockers are deployment readiness and production integration
evidence. No hosting provider, production build environment, API routing mode,
cache policy, security headers, deployment procedure or rollback procedure is
defined in this repository. CI can build without `VITE_API_BASE_URL`; that artifact
passes compilation but fails its first API request with `API_BASE_URL_MISSING`.

A complete v1 launch must also close the production Auth/Session gate and make an
explicit validation decision for exposed payment and financial mutations. Real
financial testing is not automatically required if a provider sandbox or isolated
test environment can prove the same integration. If those features remain exposed
without such evidence, they remain a launch blocker.

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

| Class       | Meaning                                                                                         | AUR-M10-001 execution                                |
| ----------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| SAFE-A      | Local tests, source analysis, builds, dependency and mock-browser work with no production state | Allowed and executed where listed below              |
| SAFE-B      | Production read-only requests that do not create, update or delete business state               | Planned only; not executed                           |
| STATE-C     | Production operations that change account or business state without directly moving money       | Planned only; explicit future authorization required |
| FINANCIAL-D | Orders, payment, wallet, Gift Card, commission, withdrawal or other money-related mutations     | Planned only; explicit user authorization required   |

Login is classified as STATE-C because it can create an upstream session and
update account login metadata. Promotion validation is SAFE-B despite using POST
because the pinned Contract defines it as a non-reserving preview.

## Complete feature evidence matrix

`VERIFIED` below means only the evidence column in which it appears. All production
entries refer to the deployed Aureole browser path, not only upstream Gateway code.

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

## Production runtime evidence gaps

No Aureole feature currently has repository evidence at L3, L4 or L5. The following
historical gaps remain real after checking current code, tests and the pinned
Contract:

- Production Aureole deployment, HTTPS, SPA navigation and `/api/v1` routing.
- Production onboarding config, login, `/me`, refresh bootstrap, invalid-session
  handling and local logout.
- Production Products, Account Config, Subscription, Resources, Traffic, Notices,
  Orders, Wallet, Tickets and Referrals reads.
- Production Order Create, Promotion Validation and Cancel.
- Production billing methods, Checkout provider QR/redirect behavior, provider
  callback and final Order Status.
- Production Rotate Access and Advance Period.
- Production Wallet Deposit and Gift Card redemption.
- Production Ticket List/Detail/Create/Reply/Close.
- Production Referral Overview, Commission History, Withdrawal Options, Referral
  Code Create, Commission Transfer and Withdrawal Request.
- Real Google reCAPTCHA behavior if production onboarding enables it.

The pinned solution Contract includes selected upstream runtime acceptance for
official V2Board compatibility, simulated payment callback, order state,
subscription access and subscription byte parity. That is useful upstream evidence,
but it does not prove the Aureole production host, environment, browser, CORS or
current provider configuration.

## Deployment readiness

| Requirement                                 | Status                          | Evidence and action                                                                                                              |
| ------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Production build command                    | VERIFIED                        | `npm run build` runs TypeScript and Vite production build.                                                                       |
| Reproducible dependency install             | VERIFIED                        | `npm ci` succeeds from `package-lock.json`; Node requirement is `>=22.12.0`.                                                     |
| Hosting provider                            | NOT VERIFIED                    | No provider is selected or configured. `DEPLOYMENT INFO REQUIRED`.                                                               |
| HTTPS                                       | NOT VERIFIED                    | Required for credentials, redirects and reCAPTCHA; no deployment config is present.                                              |
| SPA history fallback                        | DOCUMENTED / NOT VERIFIED       | README and Architecture require unknown routes to serve `index.html`; no host rule exists.                                       |
| API base URL                                | BLOCKER / NOT VERIFIED          | `VITE_API_BASE_URL` is referenced and public, but CI builds without it. Production value is unknown.                             |
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
   - a separately hosted solution origin with verified exact CORS policy.
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

Tailwind's automatic candidate scan currently includes repository documentation.
During this audit, a CSS position utility word in the new document generated an
extra rule until the prose was rephrased. An independent candidate compilation now
shows no CSS difference from the audit base, but the scan boundary remains a
maintenance risk for future documentation-only commits.

## Browser and accessibility evidence

| Area                  | Current evidence                                                       | Gap                                                                     |
| --------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Desktop               | VERIFIED at 1280 x 720 across documented milestones                    | Historical controlled evidence, not current deployed production         |
| Mobile                | VERIFIED at 390 x 844 across documented milestones                     | No smaller general matrix and no production device evidence             |
| Light/Dark            | VERIFIED broadly                                                       | Production host not verified                                            |
| System theme          | VERIFIED for later feature flows and theme infrastructure              | Not every historical flow explicitly repeated in System                 |
| Keyboard/focus        | VERIFIED for navigation, Retry, dialogs, Escape and key mutation flows | No committed browser E2E suite                                          |
| Loading/empty/error   | VERIFIED across feature page tests and controlled browser notes        | Production API latency/outage behavior not verified                     |
| Auth refresh          | VERIFIED in controlled browser and automated tests                     | Production session/cookie/CORS environment not verified                 |
| SPA navigation        | VERIFIED in controlled browser, including M9 pending mutation remounts | Static-host history fallback not verified                               |
| Financial full reload | VERIFIED for Commission Transfer and Withdrawal against local mocks    | Real network/provider continuation not verified                         |
| Reduced motion        | CSS baseline and code evidence VERIFIED                                | Dedicated controlled-browser reduced-motion behavior is NOT VERIFIED    |
| Cross-browser         | NOT VERIFIED                                                           | Evidence names Chrome/controlled browser; Safari and Firefox are absent |
| Long text/overflow    | VERIFIED extensively at desktop/mobile                                 | Production localized/provider values may differ                         |

There is no Playwright, Cypress, WebDriver or other committed browser automation
configuration. The L2 evidence is documented historical controlled-browser work,
not a reproducible repository command. This is a MEDIUM launch-evidence gap and
should be addressed by targeted deployed smoke tests at minimum.

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
- No deployed SHA/version indicator is exposed in the app or deployment metadata.
- No production request-ID correlation procedure is documented.

Classification: monitoring and SHA correlation are `MEDIUM` recommended before or
immediately after launch. They do not justify adding analytics in this audit.

## Rollback and recovery readiness

Known source checkpoints exist:

- M9 production code freeze: `e408f83311c3557706ac9fc09ac06fe754ea71b8`
- M9 documentation closure and M10 audit base:
  `a2366ea08bc579e1368d52aaf8b5b5ee72aac195`

Repository deployment rollback readiness is `NOT VERIFIED`:

- Actual production provider and deployed SHA are unknown.
- No artifact registry, deployment command, environment snapshot or rollback
  command is documented.
- No proof exists that solution Contract baseline and deployed solution SHA match.
- No CDN purge/cache rollback procedure is documented.

An SPA rollback must restore `index.html` and its matching hashed assets as one
release, preserve old hashed assets during cache propagation and ensure the
rollback build contains the correct `VITE_API_BASE_URL`. Rolling back HTML alone
can break chunk references; rolling back assets alone can leave new HTML pointing
to missing files.

Status: `DEPLOYMENT INFO REQUIRED`. This is part of the deployment BLOCKER.

## Production read-only verification plan

No step in this section was executed by AUR-M10-001.

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

1. Production hosting and runtime configuration are undefined. There is no host,
   HTTPS/fallback/proxy/cache/header configuration, deployment command, deployed
   SHA or rollback procedure.
2. CI builds without `VITE_API_BASE_URL`; a green artifact can be unusable at
   runtime. The final production artifact and its public API origin must be fixed
   and verified.
3. No deployed Aureole Auth/Session evidence exists. Login, `/me`, refresh,
   invalid-session handling and protected route behavior must pass before launch.
4. Full v1 exposes payment and financial mutations, but none has deployed Aureole
   runtime evidence. Payment callback/final Order Status and each exposed
   irreversible financial path must be validated in an approved environment or
   explicitly withheld from launch.

### HIGH

1. Same-origin `/api/v1` versus cross-origin CORS architecture is undecided.
2. Production read authorities required for mutation recovery are unverified:
   Orders, Wallet, Subscription, Tickets, Referrals and Withdrawal Options.
3. Non-financial destructive flows such as password change, Rotate Access and
   Advance Period have no production runtime evidence and limited/no rollback.
4. Notice HTML has strong local sanitizer evidence but no representative production
   content verification.
5. Security headers and CSP are not defined at the deployment layer.

### RESOLVED BY AUR-M10-001R1

1. M9 financial-safety documentation drift in `docs/API-MAPPING.md` and the
   malformed M9-004 SHA in `docs/ROADMAP.md` were reconciled. The final M9-003 and
   M9-004 code freeze is `e408f83311c3557706ac9fc09ac06fe754ea71b8`, and the
   authenticated Session boundary is documented as `active -> active`,
   `acknowledged -> active`, `absent -> absent`.

### MEDIUM

1. Tailwind scans repository documentation for utility candidates, so future
   documentation-only changes can alter the production CSS bundle unless source
   scope is constrained or artifact drift is gated.
2. Historical L2 browser evidence is extensive but no committed/reproducible
   browser E2E suite exists; Safari/Firefox evidence is absent.
3. There is no real initial-route analyzer or automated bundle budget gate.
4. Production uptime, synthetic checks, deployed SHA visibility and request-ID
   correlation procedure are absent.
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
   - select hosting/routing mode;
   - define `VITE_API_BASE_URL`, HTTPS, SPA fallback, cache/security headers;
   - define build/publish/rollback and deployed-SHA evidence;
   - perform only non-mutating deployment validation or dry-run as separately
     authorized.
2. `AUR-M10-003 - Production Auth, Session and Read-Only Verification`
   - execute the SAFE-B matrix plus explicitly authorized login/session checks;
   - verify request IDs, CORS/same-origin behavior and sensitive reads.
3. `AUR-M10-004 - Controlled Non-Financial Mutation Verification`
   - preferences, password, onboarding lifecycle, Rotate, Advance, Tickets and
     Referral Code with dedicated accounts and stated rollback limitations.
4. `AUR-M10-005 - Payment, Wallet and Financial Runtime Verification`
   - provider environment decision;
   - Order/Checkout/callback/final status;
   - Deposit, Gift Card, Commission Transfer and Withdrawal under explicit
     per-operation authorization.
5. `AUR-M10-006 - Final Browser, Rollback and Launch Gate`
   - deployed desktop/mobile/browser matrix;
   - cache/rollback drill and observability check;
   - final BLOCKER closure and release checklist.

No follow-up task is authorized by this document. Primary must review and approve
scope, accounts, environment and mutation permissions separately.

## AUR-M10-001 scope confirmation

- NO PRODUCTION ACCESS PERFORMED
- NO PRODUCTION MUTATIONS PERFORMED
- NO REAL FINANCIAL OPERATIONS PERFORMED
- NO DEPLOYMENT PERFORMED
- NO BUSINESS CODE CHANGES PERFORMED
- solution remained READ ONLY

Status: `COMPLETE / PRIMARY REVIEW PASS`.
