# Status

## Current milestone

Milestone 3 - Auth / Account (`AUR-M3-003` Account Self-Service)

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

## Milestone 3 status

M3-001 Auth Session Core and its R1 review fixes are COMPLETE. M3-002 Registration
/ Recovery is COMPLETE. M3-002R1 mutation race hardening is COMPLETE and its
focused independent review passed with no required fixes. M3-003 Account
Self-Service implementation is COMPLETE locally: Account identity/status, Stats,
Preferences, Account Config and Password Change are implemented. Independent
M3-003 review remains pending, so Milestone 3 remains CURRENT.

## Current commit

This file records the latest checkpoint state. A commit cannot embed its own SHA
without changing that SHA; Git HEAD and the implementation report are the
operational source of truth.

## Validation summary

- Node.js 24.13.0 / npm 11.6.2
- `npm run format:check`: PASS
- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm test`: PASS (13 files, 146 tests)
- `npm run build`: PASS
- Build evidence: main JS 468.44 kB raw / 147.30 kB gzip; CSS 28.54 kB raw /
  6.10 kB gzip; Account route 5.06 kB gzip.
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

## Known gaps

- Non-Auth feature routes remain placeholders without mock business data.
- Hosting provider is undecided; production requires SPA fallback.

## Next milestone

M3-003 requires independent Account/Auth review before Milestone 3 can close.
Milestone 4 is NOT STARTED and is not authorized by this checkpoint.
