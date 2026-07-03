// tsc only emits .js — it does not copy non-TS assets. The runtime schema loader
// (src/database/init.ts) reads postgres-schema.sql from its own dist directory at
// boot, so the .sql must be copied into dist during build or startup throws
// ENOENT and the container never becomes healthy. Copy every .sql under
// src/database into the mirrored dist/database path.

import { mkdirSync, readdirSync, copyFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(backendRoot, 'src', 'database');
const distDir = join(backendRoot, 'dist', 'database');

if (!existsSync(srcDir)) {
  console.log('[copy-assets] no src/database — nothing to copy');
  process.exit(0);
}

mkdirSync(distDir, { recursive: true });

let copied = 0;
for (const file of readdirSync(srcDir)) {
  if (!file.endsWith('.sql')) continue;
  copyFileSync(join(srcDir, file), join(distDir, file));
  copied += 1;
}

console.log(`[copy-assets] copied ${copied} .sql file(s) into dist/database`);
