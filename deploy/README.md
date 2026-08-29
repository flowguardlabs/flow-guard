# Deploying the backend and indexer

The frontend is a Cloudflare Worker and deploys from `frontend/` (`pnpm deploy`).
Everything here is the other half: the Express API and the chain indexer, which are
not Workers-shaped (long-lived `pg` connections over TCP, `ElectrumNetworkProvider`,
several `setInterval` monitors) and run on a plain always-on box.

These files are copies of what is live. Until this directory existed the only
record of the production topology was prose in `MIGRATION.md`, which meant a lost
host could not be rebuilt from the repository.

## What is actually required

The rest of this file describes how `flowguard.cash` is deployed. Almost none of it
is a requirement, so it is worth separating the two before you copy anything.

| Needed | Not needed |
|---|---|
| PostgreSQL, self-hosted or managed | Supabase specifically |
| Node 22+ | Docker, if you would rather run the process directly |
| Some TLS terminator for a public API | Caddy specifically, or Cloudflare, or any CDN |
| An Electrum server it can reach | AWS, or any cloud at all |

Schema init is verified against PostgreSQL 14 and 16. On 15 and up the
`streams_with_vested` view is created with `security_invoker`, so RLS on the
underlying table is not bypassed; on 13 and 14 that option does not exist and the
view is created without it, which is only meaningful if you have RLS policies.

There is no Supabase client or SDK in the codebase — it is `pg` and a connection
string. Nothing in the backend talks to Cloudflare: the Worker only serves the
static frontend and proxies `/api` to this backend, so if you are building your own
frontend you can skip it entirely. The one Cloudflare-aware piece, the forwarded
client IP used for rate limiting, is opt-in and falls back to the peer address when
`EDGE_PROXY_SECRET` is unset.

A homelab box running Postgres and the backend behind whatever reverse proxy you
already have is a completely normal deployment. For a database on localhost or a
trusted LAN, set `PG_SSL_DISABLED=true`; if it has its own certificate, pin the CA
with `PG_SSL_CA_PATH` instead. `PG_SSL_INSECURE` exists for managed providers whose
CA is missing from Node's trust store and is not something you should need.

Worth asking first whether you need to self-host at all. Reading FlowGuard state —
checking whether a subscription is live, listing payments — is public and
unauthenticated against `api.flowguard.cash`, so gating your own API needs no
infrastructure from you. Self-hosting is for running your own instance of the whole
thing.

## Running chipnet alongside mainnet

Integrators need somewhere to test that does not cost real BCH. `chipnet-api.flowguard.cash`
is a second, independent stack on the same host.

It has to be a second stack rather than a flag on the first. No table in the schema
carries a network column, so a database belongs to exactly one chain, and the
indexer resumes from a stored cursor — pointing a chipnet indexer at the mainnet
database would resume near height 966,000 against a chipnet tip near 321,000 and
silently index nothing while writing chipnet state into mainnet rows. The indexer
now refuses to start when `sync_state.network` disagrees with `BCH_NETWORK`, so
that mistake fails loudly.

What it costs is small. The indexer subscribes to covenant scripthashes over
Electrum rather than scanning blocks, so an instance with an empty registry does
almost nothing; the mainnet one sits under 1% CPU and 32MB.

### Setup

1. A database used by nothing else. A second free Supabase project is the cheapest
   option and keeps the load off this host.

2. `backend/.env.chipnet` on the host, same keys as `backend/.env` with:

   ```env
   DATABASE_URL=<the chipnet database>
   BCH_NETWORK=chipnet
   PORT=3002
   CORS_ALLOWED_ORIGINS=https://flowguard.cash,https://www.flowguard.cash,https://app.flowguard.cash
   ```

   Generate a **separate** `SIWX_BEARER_SECRET` and `AIRDROP_CLAIM_KEY_ENCRYPTION_KEY`.
   Sharing them would let a token minted on chipnet authenticate against mainnet.

3. `chipnet-api.flowguard.cash` as an A record to this host, **DNS-only (grey cloud)**,
   so Caddy can answer the ACME challenge.

4. Bring it up. The `-p` is required, or Compose adopts the mainnet containers:

   ```bash
   docker compose -f docker-compose.chipnet.yml -p flowguard-chipnet up -d --build
   ```

5. Reload Caddy, then check both:

   ```bash
   curl -s https://api.flowguard.cash/api/status | jq .network.name          # mainnet
   curl -s https://chipnet-api.flowguard.cash/api/status | jq .network.name  # chipnet
   ```

### Using it

Point the SDK at it. Nothing else changes:

```ts
const flowguard = new FlowGuardClient({ baseUrl: 'https://chipnet-api.flowguard.cash' });
```

Fund test wallets from the [chipnet faucet](https://tbch.googol.cash/). The two stacks
share no state, so a contract deployed on one is invisible to the other.

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
