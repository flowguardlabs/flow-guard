# Migration: frontend Vercel → Cloudflare Workers (2026-08-02)

The **`frontend/`** app (Vite SPA) was moved off Vercel (Hobby account soft-blocked for exceeding
function-invocation fair-use limits) onto **Cloudflare Workers Static Assets** — free, since a Vite
SPA is pure static output (no server/SSR).

Scope: **only `frontend/` migrated.** The `backend/` (api + indexer) and `contracts/` are unaffected
and remain where they were (backend on Railway).

## Changes made
| File | Change | Why |
|------|--------|-----|
| `frontend/wrangler.jsonc` | New — assets `./dist`, `not_found_handling: single-page-application` | Serves the built SPA from a Cloudflare Worker; SPA fallback routes unknown paths to `index.html`. |
| `frontend/package.json` | Added `deploy` script (`pnpm build && npx wrangler deploy`) | Reproducible deploys. |

No app code changed — the SPA builds and runs unchanged.

## Env
All build-time `VITE_*` vars (`VITE_API_URL`, `VITE_BCH_NETWORK`, `VITE_ENABLE_WIZARDCONNECT`,
`VITE_WALLETCONNECT_PROJECT_ID`) are pulled from Vercel into `frontend/.env.production.local`
(gitignored) for the build. `VITE_API_URL` still points at the backend origin.

## Deploy
```bash
cd frontend && npm run deploy      # = pnpm build && npx wrangler deploy
```
Needs `CLOUDFLARE_API_TOKEN` in env.

- **Live (Workers subdomain):** https://flowguard.timjosh507.workers.dev
- **Cloudflare Worker name:** `flowguard`

## Custom domains (flowguard.cash) — PENDING
Zone is active on Cloudflare, but DNS still points to the old (blocked) Vercel origin. To finish,
attach these to the `flowguard` Worker (delete stale Vercel records first):
`flowguard.cash`, `www.flowguard.cash`, `app.flowguard.cash`, `explorer.flowguard.cash`.
