# Database

FlowGuard runs on **PostgreSQL**. Production uses Supabase; local development can use
any Postgres.

## Configuration

`DATABASE_URL` is required and the process refuses to start without it.

```env
DATABASE_URL=postgresql://user:pass@host:5432/flowguard
```

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Connection string. Pooled endpoint in production |
| `DIRECT_URL` | Unpooled endpoint, for migrations |
| `PG_SSL_INSECURE` | Skips CA verification. See below |

### PG_SSL_INSECURE

Supabase's pooler presents a certificate chain whose CA is not in Node's default trust
store, which surfaces as `SELF_SIGNED_CERT_IN_CHAIN`. Setting `PG_SSL_INSECURE=true`
keeps the connection encrypted and skips only CA verification.

It is a workaround, not the destination — pin the CA with `PG_SSL_CA_PEM` when
convenient.

## The `db` shim

`pg.ts` exposes a `db` object that mimics the `better-sqlite3` API — `prepare().get()`,
`.all()`, `.run()` — over a `pg` connection pool.

That shape is historical. FlowGuard began on SQLite, and the shim let the migration to
Postgres happen without rewriting every call site. New code can use it or reach for the
pool directly; the shim is not a limitation, just the existing idiom.

`better-sqlite3` remains a devDependency for the one-time import scripts under
`backend/scripts/`. It is not used at runtime, and the production image is built with
`--ignore-scripts` so its native binding is never compiled.

## Schema

Applied automatically at startup from `postgres-schema.sql`, which the build copies into
`dist/database/`. Column migrations are additive and run on boot, so a new column
reaches an existing table without data loss.

Roughly 30 tables covering vaults, proposals, cycles, streams, payments, airdrops,
rewards, bounties, grants, governance, and indexer sync state.

## Local setup

```bash
createdb flowguard
echo "DATABASE_URL=postgresql://localhost:5432/flowguard" >> backend/.env
pnpm dev
```

The schema initialises on first boot. See
[Local Environment](https://docs.flowguard.cash/guides/local-environment) for the full
stack.
