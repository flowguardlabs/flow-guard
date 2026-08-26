/**
 * Schema initialization — runs the Postgres DDL at boot.
 * Idempotent (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS).
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from './pg.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** PostgreSQL 15.0, the first release with `security_invoker` on views. */
const SECURITY_INVOKER_MIN_VERSION = 150_000;

/**
 * Run the view as its caller rather than its owner, so RLS on the underlying
 * `streams` table is not bypassed.
 *
 * Separate from the schema file because the option only exists in PostgreSQL 15+
 * and the schema is executed as one statement: inlined, it is a syntax error on
 * 13 and 14 that takes the whole init down and stops the backend booting. Older
 * self-hosted Postgres is a normal deployment, so this degrades instead.
 *
 * On a server without the option the view still works. What is lost is the RLS
 * guarantee, which only matters where RLS policies exist on `streams` — managed
 * Postgres like Supabase, which is 15+ anyway.
 */
async function applyViewSecurityInvoker(): Promise<void> {
  const { rows } = await pool.query<{ server_version_num: string }>(
    'SHOW server_version_num',
  );
  const version = Number(rows[0]?.server_version_num);

  if (!Number.isFinite(version) || version < SECURITY_INVOKER_MIN_VERSION) {
    console.log(
      `[db] Postgres ${version || 'unknown'} predates security_invoker (15+); ` +
        'streams_with_vested runs with owner privileges.',
    );
    return;
  }

  await pool.query('ALTER VIEW streams_with_vested SET (security_invoker = true)');
}

export async function initializeSchema(): Promise<void> {
  const schemaPath = join(__dirname, 'postgres-schema.sql');
  const schemaSQL = readFileSync(schemaPath, 'utf8');

  try {
    await pool.query(schemaSQL);
    await applyViewSecurityInvoker();
    console.log('[db] Postgres schema applied successfully.');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[db] Schema init failed:', message);
    throw err;
  }
}
