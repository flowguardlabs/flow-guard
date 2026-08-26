/**
 * Copy non-TypeScript runtime assets into dist/.
 *
 * tsc emits .ts -> .js and ignores everything else, so postgres-schema.sql never
 * reached dist/. The only copy lived in Dockerfile.backend, which meant the image
 * booted fine and a plain `pnpm build && pnpm start` produced a dist/ that threw
 * ENOENT on the schema at startup. Self-hosting without Docker is a normal
 * deployment, so the copy belongs in the build rather than in one packaging path.
 */

import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Paths relative to backend/, copied src -> dist preserving layout. */
const RUNTIME_ASSETS = ['src/database/postgres-schema.sql'];

for (const asset of RUNTIME_ASSETS) {
  const from = join(backendRoot, asset);
  const to = join(backendRoot, asset.replace(/^src\//, 'dist/'));
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log(`[build] ${asset} -> ${asset.replace(/^src\//, 'dist/')}`);
}
