# Status

## Current milestone

Milestone 3 - Auth / Account (`AUR-M3-001` Auth Session Core)

## Foundation status

Milestone 2 is COMPLETE. Repository bootstrap, frontend foundation, app shell,
route/query/API boundaries, theme infrastructure, Git SSOT, tests and CI
baseline are present. Remote Foundation CI completed successfully for
`6283ecab829b7207ef5fccf609a957de9ef9f54e` in workflow run `34701065472`.

## Auth Session Core status

COMPLETE locally. Login, memory + sessionStorage credential persistence, `/me`
bootstrap, protected route guard, Auth-aware root redirect, local logout,
authenticated Query cache clearing and recoverable service-error handling are
implemented. Registration and account management remain outside this checkpoint.

## Current commit

This checkpoint is part of the M3-001 implementation commit. A commit cannot
embed its own SHA without changing that SHA; Git HEAD and the implementation
report are the operational source of truth.

## Validation summary

- Node.js 24.13.0 / npm 11.6.2
- `npm run format:check`: PASS
- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm test`: PASS (5 files, 30 tests)
- `npm run build`: PASS
- Build evidence: primary entry JS 462.96 kB raw / 145.98 kB gzip; CSS 25.05 kB
  raw / 5.58 kB gzip. Login route chunk is 13.18 kB gzip. Assets remain within
  budget; initial-route composition has not been measured by a dedicated analyzer.
- Browser verification: PASS at 1280 x 720 and 390 x 844 for Login Light/Dark,
  keyboard validation, visible error, loading, controlled login, refresh
  bootstrap, authenticated App Shell, mobile Drawer and local logout. No
  horizontal overflow or browser console error was observed.
- M3-001 remote GitHub Actions: pending final commit and push.

## Known gaps

- Registration, onboarding, email code and password recovery are not implemented.
- Account preferences, password change, account config and stats are not implemented.
- Non-Auth feature routes remain placeholders without mock business data.
- Hosting provider is undecided; production requires SPA fallback.

## Next milestone

Continue Milestone 3 only after independent Auth review. The next implementation
task is not authorized by this checkpoint.
