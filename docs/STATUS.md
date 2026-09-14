# Status

## Current milestone

Milestone 9 - Referral / Commission / Withdrawal (`AUR-M9-004` Withdrawal Request)

## Contract baseline

Active solution baseline:
`0a37894173d1db0bbc57576c640652878f8f623d` (`feat: expose anti-bot challenge
mode`). P-09 freezes `recaptcha` + `v2-checkbox`, provider-neutral
`challengeToken`, V2Board authoritative verification and unsupported capability
fail-closed behavior.

## Foundation status

Milestone 2 is COMPLETE. Repository bootstrap, frontend foundation, app shell,
route/query/API boundaries, theme infrastructure, Git SSOT, tests and CI
baseline are present. Remote Foundation CI completed successfully for
`6283ecab829b7207ef5fccf609a957de9ef9f54e` in workflow run `34701065472`.

## Milestone status

M3-001 Auth Session Core and its R1 review fixes are COMPLETE. M3-002 Registration
/ Recovery is COMPLETE. M3-002R1 mutation race hardening is COMPLETE and its
focused independent review passed with no required fixes. M3-003 Account
Self-Service implementation and independent review are COMPLETE with no required
fixes. Milestone 3 is COMPLETE.

M4-001 Subscription Read Model + Dashboard Core implementation and independent
Subscription/Security review are COMPLETE with no required fixes. Its accepted
production runtime gap remains non-blocking.

M4-002 Plans + Resources + Traffic implementation and independent review are
COMPLETE with no required fixes. Products and Account Config compose the Plans
read model with safe minor-unit formatting; Resources exposes only Public DTO
fields; ordered Traffic History extends the Subscription page without aggregation.

M4-003 Notices + Dashboard Completion implementation and independent
Security/Notice review are COMPLETE with no Blocker, High, Medium or Low findings
and no required fixes. The global DOMPurify hook NIT is non-blocking. Its accepted
production runtime gap remains NOT TESTED and non-blocking. Milestone 4 is COMPLETE.

Milestone 5 is COMPLETE and FROZEN. AUR-M5-001 Orders Read Model implementation and
independent review are COMPLETE with no required fixes. Its production Orders
runtime gap remains NOT TESTED and non-blocking. AUR-M5-002 Order Create +
Promotion + Cancel implementation and independent review are COMPLETE.
AUR-M5-003 Payment Methods + Checkout implementation is COMPLETE and its
independent Payment review passed.

Milestone 6 is COMPLETE and FROZEN. AUR-M6-001 Rotate Subscription Access is
COMPLETE and its Independent Security Review passed. AUR-M6-002 Advance Period is
COMPLETE and its Independent Subscription Mutation Review passed. Production
Subscription Rotation and Advance Period runtime remain NOT TESTED.

Milestone 7 is COMPLETE and FROZEN. AUR-M7-001 Wallet Balance Read Model is COMPLETE and its
Independent Wallet/Auth Review passed. AUR-M7-002 Wallet Deposit Create + Payment
Handoff is COMPLETE and its Independent Financial Mutation Review passed. AUR-M7-003
Gift Card Redeem is COMPLETE and its Independent Gift Card/Account Mutation Review
passed. Production solution/V2Board Wallet, Deposit, Payment and Gift Card runtime is
NOT TESTED and remains a Launch Readiness evidence gap.

Milestone 8 is COMPLETE and FROZEN at
`9736f3740f27d8b492d3affec4488c8cd59ebf0c`. AUR-M8-001 Support Ticket Read Model is COMPLETE and its
Independent Support Read Review passed. AUR-M8-002 Create Support Ticket is COMPLETE
and its Independent Create Ticket Mutation Review passed. AUR-M8-003 Reply + Close
Ticket is COMPLETE and its Independent Support Mutation Review passed. It adds only strict
raw-text Reply and bodyless Close, shared synchronous locking, authoritative Detail/List
reconciliation, fail-closed Detail authority and guarded UNKNOWN resubmission. No local
message/status mutation or causal inference is used. Production solution/V2Board Ticket
Read/Create/Reply/Close runtime is NOT TESTED.

Milestone 9 is CURRENT. AUR-M9-001 Referral / Commission Read Model is COMPLETE and its
Independent Referral Read Review passed; it is frozen at
`445ffac542d89977f2db5b631516b6c3bbdc955f`. AUR-M9-002 Create Referral Code is COMPLETE,
its Independent Referral Code Mutation Review passed, and it is frozen at
`ba106d1c7d7b69fbc9b5b52837c3abee939ef218`.

AUR-M9-003 Commission Transfer is COMPLETE with INDEPENDENT FINANCIAL MUTATION REVIEW PASS and
PRIMARY HARDENING PASS; it is frozen at `e8e83622abf38960ed41fd222a978f02323592df`. It adds only strict
`POST /api/v1/referrals/commissions/transfer`, fresh Overview/Wallet/Account Config authority,
exact money parsing, financial confirmation, execution-time QueryClient rechecks, same-tick
locking and Overview + Wallet reconciliation. Its content-free uncertainty state now uses both
QueryClient and a session-scoped reload-persistent marker, synchronously pre-armed before every
POST. This closes handled-UNKNOWN and in-flight full-reload duplicate windows without persisting
financial data. It never predicts balances or infers mutation outcome from recovered deltas.

AUR-M9-004 Withdrawal Request is IMPLEMENTATION COMPLETE with INDEPENDENT WITHDRAWAL FINANCIAL
MUTATION REVIEW PENDING. It adds only strict `POST /api/v1/referrals/withdrawal-requests`, exact
server-provided method selection, raw masked account handling, fresh Withdrawal Options authority,
financial confirmation, execution-time QueryClient recheck, same-tick locking, synchronous persistent
pre-arm and Options-only reconciliation. It never accepts or calculates a withdrawal amount and never
infers request outcome from Options, commission, Wallet or Support Ticket state. Production
solution/V2Board Referral Read, Create, Commission Transfer and Withdrawal Request runtime is NOT TESTED.

## Current commit

This file records the latest checkpoint state. A commit cannot embed its own SHA
without changing that SHA; Git HEAD and the implementation report are the
operational source of truth.

## Validation summary

- Node.js 24.13.0 / npm 11.6.2
- `npm run format:check`: PASS
- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm test`: PASS (44 files, 1047 tests)
- `npm run build`: PASS
- `npm ls`: PASS
- `git diff --check`: PASS
- Build evidence: main JS 472.49 kB raw / 148.62 kB gzip; CSS 37.84 kB raw /
  7.51 kB gzip; Referrals route 47.37 kB raw / 11.31 kB gzip; Support route
  31.19 kB raw / 8.29 kB gzip; Wallet route 22.81 kB raw / 6.84 kB gzip;
  Subscription route 19.89 kB raw / 5.68 kB gzip; Plans route 5.15 kB gzip;
  Orders route 13.17 kB gzip. Assets remain within budget; initial-route
  composition has not been measured by a dedicated analyzer.
- Browser verification: PASS at 1280 x 720 and 390 x 844 for Login Light/Dark,
  keyboard validation, visible error, loading, controlled login, refresh
  bootstrap, authenticated App Shell, mobile Drawer and local logout. No
  horizontal overflow or browser console error was observed.
- M3-001 implementation CI: PASS for
  `d3b2896d97681b9a816fafa0254122e97a82f2cc` in workflow run `34702858678`.
- M3-001R1 remote GitHub Actions is tracked by exact final SHA in the
  implementation report.
- M3-002 remote GitHub Actions is tracked by exact final SHA in the
  implementation report.
- M3-002R1 CI: PASS for `5e66f12d20790c1c7e96cea4257bd1fe8f244a44`
  in workflow run `34712395937`.
- M3-003 remote GitHub Actions is tracked by exact final SHA in the
  implementation report.
- M3-003 CI: PASS for `8f09bbb3b8c0b99292c8b0a028efe637db12d767`
  in workflow run `34715266168`.
- M4-001 remote GitHub Actions is tracked by exact final SHA in the
  implementation report.
- M4-001 CI: PASS for `fff36a332c4727cb3f1e407ba15c23fc5cd62998`
  in workflow run `34717477883`.
- M4-002 remote GitHub Actions is tracked by exact final SHA in the
  implementation report.
- M4-003 CI: PASS for `fd6ac4db4f093b6022063355ff004873ba4aac71`
  in workflow run `34735646641`.
- M5-002 remote GitHub Actions is tracked by exact final SHA in the
  implementation report.

## Runtime verification

- Desktop and Chrome 390 x 844 controlled browser flows cover basic/required
  Registration, suffix guidance, Email Code, invite, terms, unsupported
  challenge fail-closed, Session establishment, Recovery success/error and
  horizontal overflow.
- Google reCAPTCHA wrapper lifecycle remains tested against a controlled mocked
  `grecaptcha` browser boundary.
- Real Google reCAPTCHA runtime: NOT TESTED. Status: DEFERRED - provider not used
  in current production. Blocking: NO. The existing `recaptcha` + `v2-checkbox`
  implementation remains intact.
- Special real-Google 320 px verification: NOT REQUIRED for M3-002R1. Existing
  responsive browser evidence remains the applicable mobile baseline because the
  race patch does not change layout.
- Account controlled-browser verification: PASS at desktop and 390 x 844 in
  Light/Dark for identity, status, expiry, stats, preferences save/error,
  Password Change validation/business error/successful session exit, section
  retry, keyboard focus and horizontal overflow. Production API is NOT TESTED.
- M4-001 controlled-browser verification: PASS at 1280 x 720 and 390 x 844 in
  Light/Dark for Dashboard, active/null product, eligible/ineligible Access,
  Reveal/Hide, clipboard success/failure, independent read errors and Auth
  invalidation. No horizontal overflow or raw subscription fetch was observed.
  The only console error was the existing local `/favicon.ico` 404; no
  application page error was observed. Production solution/V2Board is NOT TESTED.
- M4-002 controlled-browser verification: PASS at 1280 x 720 and 390 x 844 in
  Light/Dark for multi-product/multi-price Plans, unavailable capacity, long
  content, online/offline Resources, ordered Traffic entries, all empty states,
  config/catalog/resource/traffic errors and Auth invalidation. No horizontal
  overflow, raw subscription fetch, private Resource field or mutation CTA was
  observed. The only active-flow console error was the existing local
  `/favicon.ico` 404. Production solution/V2Board is NOT TESTED.
- M4-003 controlled-browser verification: PASS at exact 1280 x 720 and 390 x 844
  in Light/Dark for Notice List, empty/pagination/long-title/many-tag states,
  Detail safe formatting, hostile HTML, safe/unsafe links, 404, ordinary error
  and Retry, close/focus restoration, Dashboard latest/empty/error isolation and
  Notice list/detail Auth invalidation. No horizontal overflow, application
  console/page error or external HTML resource request was observed. Production
  solution/V2Board is NOT TESTED.
- M5-001 controlled-browser verification: PASS at exact 1280 x 720 and 390 x 844
  in Light/Dark for ordered multiple Orders, all five statuses, empty state,
  36-character ID, zero/large CNY amounts, JPY, unsupported currency, Config
  error isolation/Retry, List error/Retry, lazy Detail, null dates, 404, Detail
  error/Retry and List/Detail/Config Auth invalidation. No horizontal overflow,
  private DTO field, mutation UI, non-GET Order request, status request or
  checkout request was observed. Application page errors were zero; the only
  normal-flow console error was the existing local `/favicon.ico` 404.
  Production solution/V2Board is NOT TESTED.
- M5-002 controlled-browser verification: PASS at exact 1280 x 720 and 390 x 844
  in Light/Dark for lazy Product Detail, month/year selection, fixed Promotion
  preview, explicit Create, success state, pending-only Cancel, confirmation,
  authoritative cancelled Detail/List recovery, close/focus restoration, System
  theme selection and long Product/255-character Promotion/36-character Order
  values. No horizontal overflow, Payment/Checkout UI or browser console/page
  error was observed. Same-tick locks, percentage/stale Promotion, definitive and
  unknown mutation recovery, guarded resubmit and Auth invalidation are covered
  by automated behavior tests. The global reduced-motion CSS baseline remains in
  effect. Production solution/V2Board is NOT TESTED.
- M5-003 controlled-browser verification: PASS at exact 1280 x 720 and 390 x 844
  in Light/Dark/System for lazy Payment Methods, empty/multiple methods, null icon
  fallback, fixed + percent fee metadata, long method name, 36-character Order ID,
  local QR, redirect-ready, finished-pending, definitive error, unknown-result
  acknowledgement and pending -> processing recovery. Payment/Cancel mutual
  exclusion and keyboard Escape/focus restoration were verified in the browser.
  No horizontal overflow, iframe, raw redirect target, false payment
  success claim or application console error was observed. Automated tests prove
  QR content is not fetched or persisted, Checkout same-tick POST occurs once,
  polling stops on close/non-pending/hard cap, manual status refresh works, and
  all required recovery/Auth boundaries hold. Production solution/V2Board Payment
  runtime is NOT TESTED.
- AUR-M6-001 controlled-browser verification: PASS at exact 1280 x 720 and
  390 x 844 in Light/Dark/System for eligible/ineligible Access, hidden/revealed
  long credential, copy success, danger confirmation, acknowledgement gating,
  same-action double click, success state reset, 409 unavailable, definitive
  rotation failure, unknown-result recovery success/failure, guarded resubmit,
  manual Access recovery, Escape focus restoration and recovery-read Auth
  invalidation. No horizontal overflow or application console warning/error was
  observed. Automated tests additionally cover clipboard failure, all four
  UNKNOWN codes and all required mutation/recovery Auth boundaries. Production
  solution/V2Board Subscription Rotation runtime is NOT TESTED.
- AUR-M6-002 controlled-browser verification: PASS at exact 1280 x 720 and
  390 x 844 in Light/Dark/System for renewalAllowed enabled/disabled, danger
  confirmation, acknowledgement gating, cancel/Escape focus restoration,
  same-action double click, success and authoritative Overview reconciliation,
  success reconciliation failure, all four definitive errors, all four UNKNOWN
  codes, UNKNOWN recovery success/failure, manual recovery, Auth invalidation and
  Rotate/Advance pending mutual exclusion. Long product text did not overflow;
  no horizontal overflow, raw upstream message or application console
  warning/error was observed. Automated tests additionally prove same-tick
  cross-action locking, all recovery/Auth boundaries and credential-free query
  keys. Production solution/V2Board Advance Period runtime is NOT TESTED.
- AUR-M7-001 controlled-browser verification: PASS at exact 1280 x 720 and
  390 x 844 in Light/Dark/System for Wallet loading, zero/normal/maximum balance,
  JPY zero-fraction formatting, Account Config loading/error, Wallet read error,
  keyboard Retry and Wallet Auth invalidation. No horizontal overflow, Deposit /
  Gift Card / ledger UI, or browser console warning/error was observed. Automated
  tests additionally cover malformed DTO boundaries, both Auth error codes and
  Query cache clearing. Production solution/V2Board Wallet runtime is NOT TESTED.
- AUR-M7-002 controlled-browser verification: PASS at exact 1280 x 720 and
  390 x 844 in Light/Dark/System for CNY and JPY human amount input, invalid
  decimals, zero, maximum structural boundary, confirmation, same-tick double
  confirm, success with a 36-character Order ID, UNAVAILABLE, AMOUNT_INVALID,
  CREATE_FAILED, UNKNOWN Orders recovery success/failure, manual recovery,
  guarded resubmission confirmation, Orders navigation, Wallet refresh and Auth
  invalidation. Request evidence showed one Deposit POST for double confirm,
  Orders-only recovery/handoff, and no automatic Payment Methods, Checkout or
  Status request. No horizontal overflow, false balance-credit claim, browser
  console warning/error or application page error was observed. Production
  solution/V2Board Wallet Deposit and Payment runtime is NOT TESTED.
- AUR-M7-003 controlled-browser verification: PASS at exact 1280 x 720 and
  390 x 844 in Light/Dark/System for password-masked code, explicit show/hide,
  empty and 255-character boundaries, masked confirmation and acknowledgement,
  all five Public effects, negative signed balance/validity/traffic, all eight
  definitive errors, UNKNOWN recovery success/partial failure, manual recovery,
  confirmed success with reconciliation failure, Auth invalidation and Deposit /
  Gift Card pending mutual exclusion. No horizontal overflow, complete code in
  visible UI/URL, raw upstream message, causal inference, browser console
  warning/error or application page error was observed. Request evidence showed
  Wallet/Me/Overview recovery and no active Subscription Access or subscription
  content request. Automated tests additionally cover exact code preservation,
  signed INT boundaries, malformed effects, same-tick locks, ALREADY_REDEEMED
  after UNKNOWN and every recovery/Auth boundary. Production solution/V2Board
  Gift Card runtime is NOT TESTED.
- AUR-M8-001 controlled-browser verification: PASS at exact 1280 x 720 and
  390 x 844 in Light/Dark/System for empty and ordered multi-Ticket lists, all
  priority/status labels, lazy Detail selection and switching, empty Messages,
  long subject/message/URL/numeric ID, multiline content, `fromMe` true/false,
  List/Detail ordinary errors and keyboard Retry, `TICKET_NOT_FOUND`, List/Detail
  Auth invalidation, Escape/focus restoration and selected-item semantics. XSS-like
  subject/message strings stayed visible as text; no `img`, `script`, unsafe anchor
  or `window.hacked` execution was observed. Request evidence showed one initial
  Ticket List GET, no eager Detail or Ticket POST, and one exact Detail GET per
  selected Ticket. No horizontal overflow, Create/Reply/Close control, raw upstream
  message, browser console warning/error or application page error was observed.
  Production solution/V2Board Ticket runtime is NOT TESTED.
- AUR-M8-002 controlled-browser verification: PASS at exact 1280 x 720 and
  390 x 844 in Light/Dark/System for Create open/cancel/focus restoration,
  low/normal/high priority, 1/255/256 subject and 1/10000/10001 message
  boundaries, multiline and HTML-like raw input, same-tick submit, pending form
  locking, confirmed success, success reconciliation failure, TICKET_UNAVAILABLE,
  TICKET_CREATE_FAILED, VALIDATION_ERROR, UNKNOWN List recovery success/failure,
  keyboard manual recovery, acknowledgement reset after payload change, Create
  and recovery Auth invalidation, and existing Ticket Detail read behavior.
  Request evidence showed exact raw Public body, one POST under double submit,
  GET-only reconciliation/manual recovery, no automatic Detail, and no inferred
  Ticket selection/ID. No horizontal overflow, raw upstream message, Reply/Close
  control, browser console warning/error or application page error was observed.
  Production solution/V2Board Ticket Create runtime is NOT TESTED.
- AUR-M8-002 required-fix automated regression: PASS for initial List loading/error,
  cached stale List refetch success/failure, UNKNOWN recovery-failure remount and
  confirmed-success reconciliation-failure remount. Create remains disabled while
  the canonical List is not successful or is fetching, and reopens only after a
  successful authoritative List read. These tests failed against the reviewed
  implementation before the authority gate was applied.
- AUR-M8-002 required-fix controlled-browser verification: PASS at 1280 x 720
  Light/Dark and 390 x 844 System for initial List loading, initial ordinary error,
  keyboard Retry, and UNKNOWN recovery-failure followed by reload/remount. When local
  UNKNOWN state disappeared after reload and the fresh List failed, Create remained
  disabled with an explanatory message and no Dialog; request evidence remained at
  one POST until List Retry succeeded. No horizontal overflow or browser console
  warning/error was observed. Cached stale List refetch is covered by the automated
  real-page QueryClient regression because browser reload does not retain memory cache.
- AUR-M8-003 controlled-browser verification: PASS against a local `/api/v1` mock at
  exact 1280 x 720 and 390 x 844 in Light/Dark/System for open/closed Detail, initial
  loading and ordinary-error authority gates, keyboard Retry, raw multiline/XSS-like
  Reply success, `TICKET_REPLY_FAILED`, same-looking-message Reply UNKNOWN with
  acknowledgement reset, Close confirmation/cancel, `TICKET_CLOSE_FAILED`, Close
  UNKNOWN -> open acknowledgement/confirmation and Close UNKNOWN -> closed current-state
  copy, plus Reply Auth invalidation. Request/UI evidence showed no action before fresh
  Detail authority, no false success or causal claim, no HTML execution/resource element,
  no raw upstream error, no horizontal overflow and no browser console warning/error.
  Automated tests additionally cover same-tick Reply/Close locking, cached refetch,
  reconciliation failure, manual GET-only recovery, remount safety, every required
  UNKNOWN category, strict DTOs and full Session cache clearing. Production
  solution/V2Board Ticket Reply/Close runtime is NOT TESTED.
- AUR-M9-001 controlled-browser verification: PASS against a local `/api/v1` mock at
  exact 1280 x 720 and 390 x 844 in Light/Dark/System for ordered multiple codes,
  all five stats, safe-integer maximum money and registered-user values, long code and
  255-character method, ordered Commission rows, enabled/disabled/empty Withdrawal,
  all three domain empty states, Overview/History/Withdrawal/Config ordinary-error
  isolation, safe minor-unit Config fallback, Overview Auth invalidation and absence of
  mutation controls/raw upstream errors. No horizontal overflow, value overlap or browser
  console warning/error was observed. Automated real-page tests additionally cover exact
  initial reads, explicit clipboard copy, keyboard-capable Previous/Next pagination and
  Overview/History/Withdrawal AUTH_REQUIRED/AUTH_FAILED cache clearing. Post-navigation
  copy/pagination activation was NOT TESTED in the controlled browser because the browser
  control layer stopped dispatching React click events after navigation; production
  solution/V2Board Referral runtime is NOT TESTED.
- AUR-M9-002 controlled-browser verification: PASS against a local `/api/v1` mock at
  exact 1280 x 720 and 390 x 844 in Light/Dark/System for initial authority gating,
  standard confirmation, Cancel/Escape focus restoration, same-tick double confirm,
  confirmed success, success reconciliation failure and GET-only manual recovery,
  `REFERRAL_CODE_LIMIT_REACHED`, UNKNOWN recovery success/failure, guarded acknowledgement,
  reload/remount fail-closed behavior and Create Auth invalidation. Request evidence showed
  zero POST before confirm, one POST for double confirm, Overview-only reconciliation and no
  automatic clipboard write or code identity claim. A 32-character code and confirmation
  remained within the mobile viewport; no horizontal overflow, raw upstream message or
  browser console warning/error was observed. Automated tests additionally cover strict
  bodyless DTO parsing, every UNKNOWN category, authority loss while Dialog is open, cached
  Overview refetch, every required recovery/Auth boundary and full Query cache clearing.
  Production solution/V2Board Referral Code Create runtime is NOT TESTED.
- AUR-M9-002 required-fix controlled-browser verification: PASS against the local mock for
  UNKNOWN recovery success followed by real SPA navigation from Referrals to Dashboard and
  back. The fresh remount Overview GET did not clear uncertainty: Create stayed disabled,
  the acknowledgement remained visible and no success/code-identity claim appeared. Explicit
  acknowledgement sent zero POST and enabled only the standard confirmation flow; cancelling
  acknowledgement again disabled Create. The same behavior remained usable without horizontal
  overflow at 390 x 844, and no browser console warning/error was observed. Automated tests
  additionally prove UNKNOWN marker activation before recovery completes, recovery-failure
  remount, acknowledged remount, Session Core clear, `gcTime: Infinity` and same-tick refetch
  plus immediate Confirm execution authority.
- AUR-M9-003 controlled-browser verification: PASS against a local `/api/v1` mock at exact
  1280 x 720 and 390 x 844 in Light/Dark/System for explicit financial confirmation, Cancel /
  Escape focus restoration, normal confirmed success, `INSUFFICIENT_COMMISSION_BALANCE`,
  `COMMISSION_TRANSFER_FAILED`, UNKNOWN with exact matching Overview/Wallet deltas, UNKNOWN
  recovery failure plus GET-only recovery, real SPA navigation/remount, acknowledgement and
  Transfer Auth invalidation. Request evidence showed zero POST before Confirm, exactly one POST
  for the controlled UNKNOWN flow, Overview + Wallet-only financial reconciliation and zero POST
  for acknowledgement or cancelled reconfirmation. Maximum safe Overview commission, INT_MAX
  Transfer input and current Wallet balance remained readable in the mobile confirmation without
  horizontal overflow or overlap; browser console warning/error count was zero. Automated
  real-page tests additionally cover same-tick double Confirm, Config snapshot change and
  same-tick authority refetch before React rerender, all five UNKNOWN classes, all three
  definitive errors, success reconciliation partial failures, recovery-failure remount,
  acknowledged remount, recovery Auth invalidation and Session Core clear. Production
  solution/V2Board Commission Transfer runtime is NOT TESTED.
- AUR-M9-003 primary full-reload hardening automated verification uses brand-new QueryClient and
  runtime-facing Auth state while preserving the same sessionStorage. It proves handled UNKNOWN,
  an unresolved in-flight POST before old-runtime catch, and acknowledged state all hydrate with
  the required semantics; persistent pre-arm exists before mutation invocation and remains while
  pending. Confirmed success and definitive rejection clear the marker; all UNKNOWN classes retain
  it. Storage write/read failure is fail closed with zero POST, and logout, new login and Auth
  invalidation clear persistent safety state. Controlled real-browser F5 evidence is tracked
  separately from these deterministic tests.
- AUR-M9-003 primary full-reload hardening controlled-browser verification: PASS against a local
  `/api/v1` mock. Handled UNKNOWN survived a real browser reload with Transfer disabled, empty
  amount and acknowledgement required. Acknowledged state survived reload and restored only the
  normal empty confirmation flow. A Transfer whose response remained pending was reloaded before
  the old runtime could settle; the new runtime restored active uncertainty and the mock recorded
  exactly one POST. Browser console warning/error count was zero. This is controlled evidence, not
  production solution/V2Board runtime evidence.
- AUR-M9-004 automated verification: PASS for strict raw method/account request boundaries,
  `{requested:true}` parsing, every definitive and UNKNOWN class, execution-time Options rechecks,
  same-tick double confirmation, Options-only reconciliation, no causal inference, sensitive account
  clearing and Mutation cache removal. Brand-new QueryClient/runtime tests preserve sessionStorage
  and cover handled UNKNOWN, unresolved in-flight POST reload, acknowledged reload, success/rejection
  marker clearing, storage read/write/removal failure, logout/new session/Auth invalidation and
  Withdrawal / Commission / Referral Code guard isolation. The 1024-character account boundary test was proven by
  temporarily changing the parser limit to 1025: the targeted test failed, then passed after restore.
- AUR-M9-004 controlled-browser verification: PASS against a local `/api/v1` mock at exact 1280 x 720
  and 390 x 844 in Light/Dark/System. It covered default account masking, explicit confirmation reveal,
  confirmed success, method-unsupported definitive rejection, handled UNKNOWN with real full reload,
  acknowledgement with zero POST, acknowledged reload, an unresolved in-flight POST reloaded before
  settlement, and real browser `sessionStorage` read/write SecurityError fail-closed recovery. Mock
  evidence recorded one POST for each submitted flow and zero POST for acknowledgement, cancellation
  and failed pre-arm. A 255-character method and 1024-character account remained contained in the
  mobile Dialog; body/Dialog horizontal overflow was zero, Escape restored trigger focus, raw upstream
  and internal Ticket wording were absent, and browser console warning/error count was zero. This is
  controlled evidence, not production solution/V2Board runtime evidence.

## Known gaps

- Wallet Balance Read, Wallet Deposit Create, Gift Card Redeem, all Support Ticket v1 work,
  Referral / Commission Read Model, Referral Code Create and Commission Transfer are complete and
  independently reviewed. Withdrawal Request implementation is complete with independent financial
  mutation review pending.
- Production solution/V2Board Referral Overview, Commission History, Withdrawal Options,
  Referral Code Create, Commission Transfer and Withdrawal Request behavior is NOT TESTED;
  controlled mock browser and automated contract/privacy/recovery tests are the current evidence.
- Production solution/V2Board Ticket List, Detail, Create, Reply and Close behavior is
  NOT TESTED; controlled mock browser and automated contract/privacy tests are the
  current evidence.
- Production solution/V2Board Order Create, Promotion and Cancel behavior is NOT
  TESTED; controlled mock browser and automated contract/privacy tests are the
  current evidence.
- Production solution/V2Board Payment Methods, Checkout, provider QR/redirect,
  callback processing and final Order Status behavior are NOT TESTED; controlled
  mock browser and automated Contract/privacy/recovery tests are the current
  evidence.
- Production solution/V2Board Subscription Access Rotation behavior is NOT
  TESTED; controlled mock browser and automated Contract/privacy/recovery tests
  are the current evidence.
- Production solution/V2Board Advance Subscription Period behavior is NOT TESTED;
  controlled mock browser and automated Contract/mutation/recovery tests are the
  current evidence.
- Production solution/V2Board Notice behavior is NOT TESTED; controlled mock
  browser and automated contract/security tests are the current evidence.
- Hosting provider is undecided; production requires SPA fallback.

## Next milestone

AUR-M9-004 exact-head CI verification and Independent Withdrawal Financial Mutation Review are the
next gates. Milestone 10 and Launch Readiness have not started.
