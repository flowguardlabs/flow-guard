#!/usr/bin/env node
/**
 * Pre-flight: confirm the frontend and backend agree on which BCH network they run on.
 *
 * Neither side can switch network at runtime — the frontend bakes VITE_BCH_NETWORK in
 * at build time and the backend reads BCH_NETWORK at boot. A mismatch is silent and
 * expensive: the frontend derives covenant addresses and explorer links for one
 * network while the backend builds and broadcasts transactions on the other, so funds
 * go to an address the app will never display.
 *
 * Run this before every OPTN test session and before any mainnet run.
 * See docs/integrations/optn-phase1-testplan.md (section 0).
 *
 * Usage:
 *   node scripts/check-network-agreement.mjs
 *   node scripts/check-network-agreement.mjs --api http://localhost:3001 --env frontend/.env.local
 *
 * Exit codes: 0 = agree, 1 = mismatch, 2 = could not determine.
 */

import { readFileSync, existsSync } from 'node:fs';

const DEFAULT_API = 'http://localhost:3001';
const DEFAULT_ENV_FILES = ['frontend/.env.local', 'frontend/.env', '.env.local', '.env'];
const REQUEST_TIMEOUT_MS = 5000;

const EXIT_AGREE = 0;
const EXIT_MISMATCH = 1;
const EXIT_UNDETERMINED = 2;

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index !== -1 ? argv[index + 1] : undefined;
}

/** Collapse every alias the codebase accepts into the two networks that matter here. */
function canonical(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return null;
  return value === 'mainnet' ? 'mainnet' : 'chipnet';
}

/** Read VITE_BCH_NETWORK from the first env file that defines it. */
function readFrontendNetwork(explicitPath) {
  const candidates = explicitPath ? [explicitPath] : DEFAULT_ENV_FILES;
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const match = readFileSync(path, 'utf8').match(/^\s*VITE_BCH_NETWORK\s*=\s*(.+)$/m);
    if (!match) continue;
    const value = match[1].trim().replace(/^["']|["']$/g, '').replace(/\s+#.*$/, '');
    if (value) return { network: canonical(value), source: path, raw: value };
  }
  return null;
}

/**
 * Reads the backend's resolved network from /api/status.
 *
 * Not from `GET /api`, which also reports it: the proposals router is mounted at
 * /api and defines its own `/`, so it shadows that handler and returns the proposal
 * list instead. This check silently reported UNDETERMINED against every live
 * backend until it was repointed here. /api/status is unauthenticated and is the
 * same source the frontend's networkGuard uses.
 */
async function readBackendNetwork(apiBase) {
  const url = `${apiBase.replace(/\/+$/, '')}/api/status`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    const name = body?.network?.name;
    if (!name) throw new Error('response has no "network.name" field');
    return { network: canonical(name), source: url, raw: String(name) };
  } finally {
    clearTimeout(timer);
  }
}

async function main(argv) {
  const apiBase = argValue(argv, '--api') ?? process.env.FLOWGUARD_API_URL ?? DEFAULT_API;

  const frontend = readFrontendNetwork(argValue(argv, '--env'));
  if (!frontend?.network) {
    console.error('UNDETERMINED — VITE_BCH_NETWORK not found in any of:');
    console.error(`  ${DEFAULT_ENV_FILES.join('\n  ')}`);
    console.error('Set it explicitly, or pass --env <path>.');
    return EXIT_UNDETERMINED;
  }

  let backend;
  try {
    backend = await readBackendNetwork(apiBase);
  } catch (error) {
    const reason = error.name === 'AbortError' ? `no response within ${REQUEST_TIMEOUT_MS}ms` : error.message;
    console.error(`UNDETERMINED — could not read backend network from ${apiBase}/api/status: ${reason}`);
    console.error('Is the backend running? Pass --api <base-url> if it is elsewhere.');
    return EXIT_UNDETERMINED;
  }

  console.log(`frontend : ${frontend.network}  (VITE_BCH_NETWORK=${frontend.raw} in ${frontend.source})`);
  console.log(`backend  : ${backend.network}  (reported by ${backend.source})`);

  if (frontend.network !== backend.network) {
    console.error(
      `\nMISMATCH — frontend is on ${frontend.network}, backend is on ${backend.network}.\n` +
        'Do not test or fund in this state: the frontend will derive addresses and explorer\n' +
        'links for one network while the backend broadcasts on the other.\n\n' +
        `Fix: set BCH_NETWORK=${frontend.network} in backend/.env (or change VITE_BCH_NETWORK),\n` +
        'then restart BOTH processes — neither reads the network at runtime.',
    );
    return EXIT_MISMATCH;
  }

  console.log(`\nAGREE — both on ${frontend.network}.`);
  return EXIT_AGREE;
}

process.exit(await main(process.argv.slice(2)));
