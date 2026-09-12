# Status

## Current milestone

Milestone 3 - Auth / Account (`AUR-M3-002` Registration / Recovery)

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

## Auth Session Core status

R1 REVIEW FIXES COMPLETE locally. Login and `/me` response parsing now accepts
and strips additive unknown fields while validating known fields. sessionStorage
write failures degrade to memory-only Auth. Real QueryClient concurrency tests
confirm logout and A-to-B transitions reject stale Session A results without
extra cancellation code. Registration and account management remain outside
this checkpoint.

## Current commit

This checkpoint is part of the M3-001 implementation commit. A commit cannot
embed its own SHA without changing that SHA; Git HEAD and the implementation
report are the operational source of truth.

## Validation summary

- Node.js 24.13.0 / npm 11.6.2
- `npm run format:check`: PASS
- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm test`: PASS (6 files, 41 tests)
- `npm run build`: PASS
- Build evidence: primary entry JS 462.99 kB raw / 145.98 kB gzip; CSS 25.05 kB
  raw / 5.58 kB gzip. Login route chunk is 13.18 kB gzip. Assets remain within
  budget; initial-route composition has not been measured by a dedicated analyzer.
- Browser verification: PASS at 1280 x 720 and 390 x 844 for Login Light/Dark,
  keyboard validation, visible error, loading, controlled login, refresh
  bootstrap, authenticated App Shell, mobile Drawer and local logout. No
  horizontal overflow or browser console error was observed.
- M3-001 implementation CI: PASS for
  `d3b2896d97681b9a816fafa0254122e97a82f2cc` in workflow run `34702858678`.
- M3-001R1 remote GitHub Actions is tracked by exact final SHA in the
  implementation report.

## Known gaps

- Registration, onboarding, email code and password recovery are not implemented.
- Account preferences, password change, account config and stats are not implemented.
- Non-Auth feature routes remain placeholders without mock business data.
- Hosting provider is undecided; production requires SPA fallback.

## Next milestone

Continue Milestone 3 only after independent Auth review. The next implementation
task is not authorized by this checkpoint.
