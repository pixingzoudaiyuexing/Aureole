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

## Milestone 3 status

M3-001 Auth Session Core and its R1 review fixes are COMPLETE. M3-002 Registration
/ Recovery is COMPLETE locally: onboarding-driven Registration, Email Code purpose
separation, invite/terms/suffix requirements, supported/unsupported AntiBot,
single-use challenge lifecycle, shared Session establishment and Password Recovery
are implemented. Account management remains outside this checkpoint.

## Current commit

This checkpoint is part of the M3-001 implementation commit. A commit cannot
embed its own SHA without changing that SHA; Git HEAD and the implementation
report are the operational source of truth.

## Validation summary

- Node.js 24.13.0 / npm 11.6.2
- `npm run format:check`: PASS
- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm test`: PASS (11 files, 90 tests)
- `npm run build`: PASS
- Build evidence: main JS 463.30 kB raw / 146.00 kB gzip; CSS 26.00 kB raw /
  5.74 kB gzip; Register route 3.09 kB gzip; Forgot Password route 2.48 kB gzip.
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

## Runtime verification

- Desktop and Chrome 390 x 844 controlled browser flows cover basic/required
  Registration, suffix guidance, Email Code, invite, terms, unsupported
  challenge fail-closed, Session establishment, Recovery success/error and
  horizontal overflow.
- Google reCAPTCHA wrapper lifecycle is tested against a controlled mocked
  `grecaptcha` browser boundary. A real Google widget is NOT TESTED because no
  public site key authorized for the local domain was available.

## Known gaps

- Account preferences, password change, account config and stats are not implemented.
- Non-Auth feature routes remain placeholders without mock business data.
- Hosting provider is undecided; production requires SPA fallback.

## Next milestone

Continue Milestone 3 only after independent Auth review. The next implementation
task is not authorized by this checkpoint.
