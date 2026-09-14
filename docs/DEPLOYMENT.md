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
When set (e.g., `VITE_API_BASE_URL=https://api.example.com`), it validates the protocol (HTTP/HTTPS) and rejects credential-bearing URLs.
This is an **exception mode** for development, controlled staging, or specific cross-origin deployments.
In cross-origin mode, the deployment owner must ensure CORS is correctly configured on the solution Gateway.

## 4. Multi-Domain Artifact Portability

The compiled static artifact is portable and does not contain a hardcoded frontend hostname.
A single build can be deployed to multiple domains (e.g. `domain-a.example`, `domain-b.example`).
The same-origin default adapts dynamically to whatever domain serves the artifact.

## 5. Build Configuration

The official vendor-neutral production build command is:

```bash
npm run build
```

This command performs typechecking, builds the static artifact, generates release metadata, and runs artifact verification.

## 6. Artifact Contents

The production artifact is located in the `dist/` directory. It contains:

- `dist/index.html` (entry point)
- `dist/assets/*-[hash].js` (application logic)
- `dist/assets/*-[hash].css` (application styling)
- `dist/release.json` (machine-readable release identity)
- Static public assets

The artifact does **not** contain backend secrets, V2Board credentials, or source maps (unless explicitly enabled).

## 7. Artifact Verification

The build automatically invokes the artifact verification command:

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

Every successful build generates a static `dist/release.json`.
It contains the source Git SHA and the build time.
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

## 11. Atomic Publish Contract

A deployment must publish `index.html` and its referenced hashed assets as a single, coherent release.
Old hashed assets should remain available after a new deployment to support previously cached HTML, open browser tabs, CDN propagation, and rollbacks.

## 12. Rollback Contract

A valid rollback restores:

- A previous `index.html`
- Matching hashed assets
- Matching public API routing configuration

Rollback is **not** simply replacing `index.html` or deleting all new assets immediately.
The deployment owner is responsible for mapping the source SHA to their provider's rollback mechanism.

## 13. Security Headers and CSP Baseline

A baseline Content-Security-Policy (CSP) should restrict execution to the origin.
Deployments should avoid `unsafe-eval` and `*` sources unless explicitly required by an application feature.
Other recommended headers:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security` (if HTTPS is fully adopted)
- Frame control (e.g. `frame-ancestors 'none'`)

**reCAPTCHA Conditional CSP:**
If Google reCAPTCHA is enabled, the CSP must conditionally allow its required domains and inline script execution as dictated by the reCAPTCHA integration guidelines.

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

- [ ] Artifact builds successfully with `npm run build`.
- [ ] `npm run verify:artifact` passes.
- [ ] SPA fallback correctly serves `index.html` for deep links.
- [ ] Missing `.js`/`.css` assets return 404, not `index.html`.
- [ ] `/api/v1/*` routes transparently to the solution Gateway.
- [ ] `index.html` is not aggressively cached.

## 17. Known Remaining Runtime Gaps

The following aspects are currently NOT VERIFIED and must be resolved before a final launch:

- Actual production host and CDN configuration.
- Production HTTPS and edge routing behavior.
- Production Auth, Payment, and Financial mutations (require the production backend environment to validate).
