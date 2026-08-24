# Deploying the backend and indexer

The frontend is a Cloudflare Worker and deploys from `frontend/` (`pnpm deploy`).
Everything here is the other half: the Express API and the chain indexer, which are
not Workers-shaped (long-lived `pg` connections over TCP, `ElectrumNetworkProvider`,
several `setInterval` monitors) and run on a plain always-on box.

These files are copies of what is live. Until this directory existed the only
record of the production topology was prose in `MIGRATION.md`, which meant a lost
host could not be rebuilt from the repository.

## Host

GreenCloud KVM VPS, Frankfurt, Ubuntu 24.04, 4GB/2-core, `172.93.185.150`.
Frankfurt because Supabase Postgres is in `eu-west-1` and backend↔DB is the hot path.

Layout on the host:

```
/root/flowguard/
  docker-compose.yml      <- deploy/docker-compose.yml
  Dockerfile.backend      <- repo root
  Dockerfile.indexer      <- repo root
  backend/.env            <- secrets, never in git
  backend/  contracts/  shared/
/etc/caddy/Caddyfile      <- deploy/Caddyfile
```

## Request path

```
browser
  -> flowguard.cash            Cloudflare Worker (static assets + /api/* proxy)
  -> api.flowguard.cash:443    Caddy, TLS termination, DNS-only in Cloudflare
  -> 127.0.0.1:3001            backend container
  -> indexer:8080              status only, compose network, not published
```

`api.flowguard.cash` is grey-clouded so Caddy can complete the ACME challenge. That
leaves the host directly reachable, which is why the backend treats the forwarded
client IP as untrusted unless it arrives with `EDGE_PROXY_SECRET`.

## backend/.env

Not in git. Required keys:

| Key | Notes |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Supabase Postgres, `eu-west-1` |
| `PG_SSL_INSECURE` | `true`. Supabase's pooler CA is not in Node's default trust store. Connection is still TLS; only CA verification is skipped. Replace with a pinned `PG_SSL_CA_PEM` when convenient. |
| `BCH_NETWORK` | `mainnet` |
| `PORT` | `3001` |
| `SIWX_BEARER_SECRET`, `SIWX_DOMAIN`, `SIWX_URI`, `SIWX_CHAIN_ID` | auth |
| `AIRDROP_CLAIM_KEY_ENCRYPTION_KEY` | airdrop claim keys |
| `CORS_ALLOWED_ORIGINS` | Every browser origin that calls the API cross-origin. Must include the app and explorer subdomains — a missing entry is a hard 403, not a silent downgrade. |
| `EDGE_PROXY_SECRET` | Shared with the Worker's secret of the same name. Without it the backend ignores the forwarded client IP and rate limiting buckets every Worker request together. |

`NODE_ENV` is **not** taken from this file. It is set to `production` in
`docker-compose.yml`, which overrides `env_file`. The `.env` on the host still says
`development`; the compose value is what applies. Worth cleaning up, but do not
assume the file is authoritative.

## Deploying a change

```bash
rsync -a --delete backend contracts shared Dockerfile.backend Dockerfile.indexer \
  root@172.93.185.150:/root/flowguard/
ssh root@172.93.185.150 'cd /root/flowguard && docker compose up -d --build'
```

Then confirm:

```bash
curl -s https://api.flowguard.cash/health
curl -s https://api.flowguard.cash/api/status | jq '.overall, .components[] | select(.group=="Workers")'
node scripts/check-network-agreement.mjs --api https://api.flowguard.cash \
  --env frontend/.env.production.local
```

## Worker secret

`EDGE_PROXY_SECRET` exists in two places and must match:

```bash
cd frontend && npx wrangler secret put EDGE_PROXY_SECRET   # Worker
# and the same value in /root/flowguard/backend/.env
```

Rotating it is safe in either order — a mismatch degrades rate limiting back to
per-Cloudflare-IP bucketing, it does not break requests.
