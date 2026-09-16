# Aureole Production Deployment Contract

This document defines the vendor-neutral production deployment contract for Aureole.

## 1. Production Architecture

Aureole is a serverless static Single Page Application (SPA).
The default production architecture uses a **same-origin** model:

- Browser requests the frontend origin (e.g. `https://frontend.example.com`).
- API requests default to the same origin under `/api/v1/*`.
- The deployment edge/reverse proxy routes `/api/v1/*` to the solution Gateway.
- Aureole itself never knows or exposes the backend/V2Board origin.

## 2. Same-Origin `/api/v1` Default

By default, the Aureole artifact requires no build-time configuration to locate its API.
If `VITE_API_BASE_URL` is absent during build, the API client falls back to the browser's `window.location.origin` at runtime.
This ensures a standard build succeeds and produces a valid same-origin artifact.

## 3. Cross-Origin Exception

The `VITE_API_BASE_URL` variable may be provided to override the API origin.
When set, it must be an HTTPS origin (e.g., `VITE_API_BASE_URL=https://api.example.com`). It validates the protocol, rejects credential-bearing URLs, and rejects any pathname, query, or hash.
HTTP is only permitted for loopback addresses (`localhost`, `127.0.0.1`, `[::1]`) to support local development if required.

This is an **exception mode**. For cross-origin production:

- The override origin MUST be HTTPS.
- The re-frozen solution Public API returns `Access-Control-Allow-Origin: *` without `Access-Control-Allow-Credentials`; frontend domains are replaceable clients and require no solution origin configuration.
- Bearer authentication remains explicit. Origin, Referer, and cookies are not authentication or authorization inputs.
- CSP `connect-src` must permit ONLY the exact approved HTTPS solution API origin required for fetch connectivity. Do not weaken `script-src`, `img-src`, or `frame-src` merely because `connect-src` needs another origin.
- For normal same-origin production, `connect-src` should remain constrained to the allowed origin requirements without broadly using `*`.
- Bearer authentication semantics remain unchanged.
- Aureole still only calls solution `/api/v1` and must never call V2Board directly.

For same-origin Pages deployments, the Function derives the current exact HTTPS frontend `Origin` from the request URL and forwards it only as Checkout return-URL protocol metadata. It also preserves the browser `User-Agent` for V2Board payment presentation. Neither value is persisted or treated as identity.

## 4. Multi-Domain Artifact Portability

The compiled static artifact is portable and does not contain a hardcoded frontend hostname.
A single build can be deployed to multiple domains (e.g. `domain-a.example`, `domain-b.example`).
The same-origin default adapts dynamically to whatever domain serves the artifact.

## 5. Build Configuration

Two build modes are preserved:

1. **`npm run build`**: Normal development/validation production build. It supports intended uncommitted implementation changes and does not generate `release.json` or perform `verify:artifact`.
2. **`npm run build:release`**: Official deployable release build. It requires a clean source repository, produces `release.json`, performs artifact verification, and binds the artifact to the exact committed HEAD.

**Build Git-Context Requirement:**
The `build:release` command requires a clean Git checkout with valid `HEAD` metadata because `release.json` is strictly bound to the exact source commit. The resulting prebuilt `dist/` artifact does NOT require Git at runtime/deployment.

## 6. Artifact Contents

The production artifact is located in the `dist/` directory. It contains:

- `dist/index.html` (entry point)
- `dist/assets/*-[hash].js` (application logic)
- `dist/assets/*-[hash].css` (application styling)
- `dist/release.json` (machine-readable release identity)
- Static public assets

Note: `release.json` identifies the SOURCE COMMIT. It does not cryptographically prove every possible deployment environment variable.

The artifact does **not** contain backend secrets, V2Board credentials, or source maps (unless explicitly enabled).

## 7. Artifact Verification

The official release build (`npm run build:release`) automatically invokes the artifact verification command:

```bash
npm run verify:artifact
```

This guarantees:

- `index.html` and hashed assets exist.
- No unexpected `.map` files are present.
- A valid `release.json` identity exists.
- Known backend hostnames (e.g., from `.env.example`) are not baked in.
- Referenced entry assets in `index.html` are resolvable.

## 8. Release Identification

Every successful release build (`npm run build:release`) generates a static `dist/release.json`.
It contains exclusively the source Git SHA, making the release identity deterministic and independent of wall-clock build time.
This non-secret, machine-readable identity enables static-host compatibility without exposing credentials or requiring a database.

## 9. Routing Contract (Precedence)

Deployments must enforce the following routing priority:

1. **API**: `/api/v1/*` must route to the solution Gateway. It must NEVER fall through to `index.html`.
2. **Existing Static Asset**: Any existing file under the static artifact must be served directly.
3. **Missing Asset**: A missing real asset (`*.js`, `*.css`, `*.png`, etc.) must return a real 404 HTTP status.
4. **SPA Navigation (Fallback)**: Application navigation routes (e.g. `/dashboard`, `/orders`) must fall back to serving `index.html` with a 200 OK status to support TanStack Router.

## 10. Cache Contract

- **Hashed Assets**: `dist/assets/*-[hash].js` and `dist/assets/*-[hash].css` are immutable and should be configured with a long-lived cache (e.g. 1 year).
- **`index.html`**: Must NOT be indefinitely cached. Use revalidation (e.g., `Cache-Control: no-cache`) or a short cache duration to ensure browsers receive new chunk names.
- **`release.json`**: Must NOT receive immutable long-lived caching. Use revalidation or short cache semantics so verification commands can accurately determine the currently deployed release.

## 11. Atomic Publish Contract

A deployment must publish `index.html`, matching `release.json`, matching hashed assets, and static public assets as a single, coherent release. Do not publish a new release identity independently from the release it identifies.
Old hashed assets should remain available after a new deployment to support previously cached HTML, open browser tabs, CDN propagation, and rollbacks.

## 12. Rollback Contract

A valid rollback restores:

- A previous `index.html`
- Matching previous hashed assets
- Matching previous `release.json`
- Matching public API routing configuration

Production deployed-SHA verification should obtain a fresh/revalidated `release.json`. Do not allow application A to serve release metadata for B.

Rollback is **not** simply replacing `index.html` or deleting all new assets immediately.
The deployment owner is responsible for mapping the source SHA to their provider's rollback mechanism.

## 13. Security Headers and CSP Baseline

A baseline Content-Security-Policy (CSP) should restrict execution to the origin. Deployments should avoid broad wildcard (`*`) sources and avoid `unsafe-eval`.
If `unsafe-inline` is necessary, it must be used as a weaker fallback rather than silently making it the baseline.

Because `index.html` currently contains an inline theme bootstrap script, `script-src 'self'` alone is insufficient. The deployment strategy must configure a safe allowance for this inline bootstrap, preferably using a hash-based allowance or nonce strategy if applicable.

Other recommended headers:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security` (Production HTTPS is REQUIRED. HSTS enablement depends on the deployment owner confirming the host is fully HTTPS and safe for the chosen scope.)
- `Permissions-Policy` (configured as strictly as possible)
- Frame control (e.g., `frame-ancestors 'none'`)

**reCAPTCHA Conditional CSP:**
If Google reCAPTCHA is enabled, document conditional additional Google origins required for script/frame/connect sources.

**External Payment Method Icons:**
The CSP must allow required image sources (e.g., `img-src`) for external payment method icons, without allowing unrelated script or connect origins. Do not invent actual provider hostnames until known.

## 14. No-Secret Rule

The Aureole frontend is a public client.
No backend secrets, payment secrets, or private API keys may be committed or embedded in the artifact.
`VITE_*` values are public configuration, not secrets.

## 15. Production Owner Inputs

The deployment owner is responsible for providing the following environment-specific inputs:

- Actual production frontend hostname(s).
- Actual solution Gateway hostname.
- Same-origin reverse proxy / edge routing implementation.
- TLS termination and HTTPS configuration.
- CDN or static hosting provider selection.
- Security-header injection layer.
- Release publish and rollback execution mechanisms.
- Provider sandbox or payment environment settings.

## 16. Deployment Validation Checklist

Before going live, the deployment owner must verify:

- [ ] Artifact builds successfully with `npm run build:release`.
- [ ] `dist/release.json` identity matches the exact expected source SHA.
- [ ] SPA fallback correctly serves `index.html` for deep links.
- [ ] Missing `.js`/`.css` assets return 404, not `index.html`.
- [ ] `/api/v1/*` routes transparently to the solution Gateway.
- [ ] `index.html` is not aggressively cached.

## 17. Known Remaining Runtime Gaps

The following aspects are currently NOT VERIFIED and must be resolved before a final launch:

- Actual production host and CDN configuration.
- Production HTTPS and edge routing behavior.
- Production Auth, Payment, and Financial mutations (require the production backend environment to validate).

## 18. Verified Staging Rollback Drill

On 2026-09-16 the existing Cloudflare Pages staging project `aureole-cc-staging-3dc609` completed a provider-supported rollback drill:

- starting deployment: `4a17f147-192e-45c2-a23f-bc84d0f50ae5`, release `71f24b88aab2d9ae569936494d3392ad9a5e4db7`
- rollback target: `dd7ff78c-efbd-4503-957e-619a9bb45433`, release `cd6bf73b1f0c76c50d81971c1c0dc88408b5bbef`
- restored deployment: `4a17f147-192e-45c2-a23f-bc84d0f50ae5`, release `71f24b88aab2d9ae569936494d3392ad9a5e4db7`

Both rollback and restore verified HTTPS, root/index, `/login`, `/subscription`, same-origin onboarding API, missing-asset 404 and every asset referenced by the deployed `index.html`. A post-restore Login plus `/me` smoke returned HTTP 200. Staging was not left on the rollback release. This evidence does not authorize or prove a production rollback.
