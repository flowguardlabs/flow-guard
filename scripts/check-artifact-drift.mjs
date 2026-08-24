#!/usr/bin/env node
/**
 * Fail if rebuilding the covenants produces artifacts that differ from what is
 * committed — ignoring the `updatedAt` build timestamp, which `cashc` restamps on
 * every compile and which carries no semantic meaning.
 *
 * Why this matters beyond tidiness:
 *
 * FlowGuard ships each covenant's compiled artifact to the *wallet*. Every
 * WalletConnect `bch_signTransaction` request carries `sourceOutputs` containing the
 * contract's redeem script and unlocking bytecode derived from these files. A wallet
 * — OPTN, Paytaca, Cashonize — has no way to recompile the .cash source; it verifies
 * and displays whatever bytecode we hand it.
 *
 * So if the committed artifact drifts from the .cash source, the address FlowGuard
 * derives, the bytecode the wallet is asked to sign over, and the rules the covenant
 * actually enforces can silently disagree. Funds land at an address whose spending
 * conditions are not the ones anyone reviewed. Committed artifacts are effectively a
 * consensus surface, not build output, and CI has to treat them that way.
 *
 * Run `pnpm --filter @flowguard/contracts run build` first, then this.
 *
 * Usage:
 *   node scripts/check-artifact-drift.mjs
 *
 * Exit codes: 0 = no drift, 1 = drift, 2 = could not run.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ARTIFACT_DIR = 'contracts/artifacts';

/**
 * Resolve the repo root and run everything from there, so the check behaves
 * identically whether it is invoked from the repo root, from `contracts/` via
 * `pnpm run check:drift`, or from CI. Without this, a cwd-relative `contracts/artifacts`
 * pathspec silently matches nothing and the check passes without inspecting anything —
 * the worst failure mode for a guard like this.
 */
const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

/** Fields `cashc` regenerates on every build that carry no semantic meaning. */
const VOLATILE_FIELDS = ['updatedAt'];

const EXIT_CLEAN = 0;
const EXIT_DRIFT = 1;
const EXIT_ERROR = 2;

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, cwd: REPO_ROOT });
}

/** Stable, volatile-field-free representation for comparison. */
function normalize(jsonText, label) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
  for (const field of VOLATILE_FIELDS) delete parsed[field];
  return JSON.stringify(sortKeys(parsed), null, 2);
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeys(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function main() {
  let changed;
  try {
    changed = git(['diff', '--name-only', '--', ARTIFACT_DIR]).split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (error) {
    console.error(`Could not run git diff: ${error.message}`);
    return EXIT_ERROR;
  }

  const untracked = git(['ls-files', '--others', '--exclude-standard', '--', ARTIFACT_DIR])
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const realDrift = [];
  const timestampOnly = [];

  for (const file of changed) {
    let committed;
    let rebuilt;
    try {
      committed = normalize(git(['show', `HEAD:${file}`]), `committed ${file}`);
      rebuilt = normalize(readFileSync(resolve(REPO_ROOT, file), 'utf8'), `rebuilt ${file}`);
    } catch (error) {
      console.error(error.message);
      return EXIT_ERROR;
    }
    (committed === rebuilt ? timestampOnly : realDrift).push(file);
  }

  for (const file of timestampOnly) {
    console.log(`ok        ${file} — ${VOLATILE_FIELDS.join('/')} only, ignored`);
  }

  if (realDrift.length === 0 && untracked.length === 0) {
    console.log(`\nPASS — ${ARTIFACT_DIR} matches a fresh build of the .cash sources.`);
    return EXIT_CLEAN;
  }

  if (realDrift.length > 0) {
    console.error('\nFAIL — committed artifacts do not match a fresh build:');
    for (const file of realDrift) console.error(`  ${file}`);
  }
  if (untracked.length > 0) {
    console.error('\nFAIL — build produced artifacts that are not committed:');
    for (const file of untracked) console.error(`  ${file}`);
  }
  console.error(
    '\nThese files are shipped to wallets inside WalletConnect `sourceOutputs`. A wallet\n' +
      'cannot recompile the .cash source, so stale artifacts mean users sign bytecode that\n' +
      'does not match the reviewed contract.\n\n' +
      'Fix: run `pnpm --filter @flowguard/contracts run build` and commit the result.',
  );
  return EXIT_DRIFT;
}

process.exit(main());
