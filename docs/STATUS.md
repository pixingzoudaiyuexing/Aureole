# Status

## Current milestone

Milestone 6 - Subscription Mutations (`AUR-M6-001` Rotate Subscription Access)

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

Milestone 6 is CURRENT. AUR-M6-001 Rotate Subscription Access implementation is
COMPLETE and its independent review is PENDING. AUR-M6-002 Advance Period is NOT
STARTED. Production Subscription Rotation runtime is NOT TESTED.

## Current commit

This file records the latest checkpoint state. A commit cannot embed its own SHA
without changing that SHA; Git HEAD and the implementation report are the
operational source of truth.

## Validation summary

- Node.js 24.13.0 / npm 11.6.2
- `npm run format:check`: PASS
- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm test`: PASS (27 files, 491 tests)
- `npm run build`: PASS
- `npm ls`: PASS
- `git diff --check`: PASS
- Build evidence: main JS 471.62 kB raw / 148.29 kB gzip; CSS 34.70 kB raw /
  7.11 kB gzip; Subscription route 13.24 kB raw / 4.83 kB gzip; Plans route
  5.15 kB gzip; Orders route 13.17 kB gzip.
  Assets remain within budget; initial-route composition has not been measured
  by a dedicated analyzer.
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

## Known gaps

- Wallet, Support and Referrals remain placeholders without mock business data.
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
- Production solution/V2Board Notice behavior is NOT TESTED; controlled mock
  browser and automated contract/security tests are the current evidence.
- Hosting provider is undecided; production requires SPA fallback.

## Next milestone

AUR-M6-001 implementation is complete. Exact-head verification and independent
Security Review are the next required gates. AUR-M6-002 remains NOT STARTED.
