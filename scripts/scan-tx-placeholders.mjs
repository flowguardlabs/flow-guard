#!/usr/bin/env node
/**
 * Scan a signed transaction hex for leftover CashScript unlocker placeholders.
 *
 * FlowGuard's builders hand the wallet a transaction whose covenant inputs carry
 * placeholder pushes where the signature and public key belong:
 *
 *   signature  : 0x41 followed by 65 zero bytes  (cashscript placeholderSignature())
 *   public key : 0x21 followed by 33 zero bytes  (cashscript placeholderPublicKey())
 *
 * A wallet that understands covenant spends replaces both. A wallet that does not
 * returns the transaction with the placeholders intact; it is then rejected by the
 * network with an opaque script error, so this must be caught before broadcast.
 *
 * The frontend already enforces this in `inspectUnsignedPlaceholderInputs`
 * (frontend/src/utils/blockchain.ts). This script is the *independent* out-of-band
 * confirmation used to produce evidence for docs/integrations/optn-phase1-evidence.md
 * — it shares no code with the builder, so a bug in the builder's own guard cannot
 * make it pass.
 *
 * Two layers, deliberately:
 *   1. Raw-hex substring scan — dependency-free, always produces a verdict. This is
 *      the authoritative result.
 *   2. Per-input decode via libauth, when available — attributes a hit to an input
 *      index. Enrichment only: a decode failure downgrades detail, never the verdict.
 *      (The frontend guard returns "clean" when decode fails; this one does not.)
 *
 * Usage:
 *   node scripts/scan-tx-placeholders.mjs <tx-hex>
 *   node scripts/scan-tx-placeholders.mjs --file tx.hex
 *   echo "<tx-hex>" | node scripts/scan-tx-placeholders.mjs
 *   node scripts/scan-tx-placeholders.mjs --self-test
 *   pnpm --filter @flowguard/backend run scan:placeholders <tx-hex>
 *
 * Exit codes: 0 = clean, 1 = placeholder found, 2 = bad input.
 */

import { readFileSync } from 'node:fs';

const PLACEHOLDERS = [
  { name: 'signature', description: '0x41 + 65 zero bytes', pattern: '41' + '00'.repeat(65) },
  { name: 'public key', description: '0x21 + 33 zero bytes', pattern: '21' + '00'.repeat(33) },
];

const EXIT_CLEAN = 0;
const EXIT_PLACEHOLDER_FOUND = 1;
const EXIT_BAD_INPUT = 2;

/**
 * @param {string} raw
 * @returns {string} lowercase hex, 0x prefix and whitespace stripped
 * @throws {Error} if the input is not even-length hex
 */
function normalizeHex(raw) {
  const hex = String(raw).trim().replace(/\s+/g, '').replace(/^0x/i, '').toLowerCase();
  if (hex.length === 0) throw new Error('empty input');
  if (!/^[0-9a-f]+$/.test(hex)) throw new Error('input is not hexadecimal');
  if (hex.length % 2 !== 0) throw new Error(`odd-length hex (${hex.length} chars) — truncated input?`);
  return hex;
}

/** Every byte offset at which `pattern` occurs in `hex`. */
function findOffsets(hex, pattern) {
  const offsets = [];
  let index = hex.indexOf(pattern);
  while (index !== -1) {
    offsets.push(index / 2);
    index = hex.indexOf(pattern, index + 2);
  }
  return offsets;
}

/**
 * Authoritative layer: substring scan over the whole raw transaction.
 * @param {string} txHex
 * @returns {{ byteLength: number, hits: Array<{name: string, description: string, offsets: number[]}> }}
 */
export function scanPlaceholders(txHex) {
  const hex = normalizeHex(txHex);
  const hits = [];
  for (const placeholder of PLACEHOLDERS) {
    const offsets = findOffsets(hex, placeholder.pattern);
    if (offsets.length > 0) {
      hits.push({ name: placeholder.name, description: placeholder.description, offsets });
    }
  }
  return { byteLength: hex.length / 2, hits };
}

/**
 * Enrichment layer: attribute placeholders to input indices. Returns null when
 * libauth is unavailable or the transaction does not decode — never throws, because
 * the raw scan has already decided pass/fail.
 */
async function describeInputs(hex) {
  let libauth;
  try {
    libauth = await import('@bitauth/libauth');
  } catch {
    return { unavailable: 'libauth not resolvable from this working directory' };
  }

  const { decodeTransaction, hexToBin, binToHex } = libauth;
  let decoded;
  try {
    decoded = decodeTransaction(hexToBin(hex));
  } catch (error) {
    return { unavailable: `decode threw: ${error.message}` };
  }
  if (typeof decoded === 'string') return { unavailable: `does not decode as a transaction: ${decoded}` };

  const inputs = decoded.inputs.map((input, index) => {
    const unlockingHex = binToHex(input.unlockingBytecode);
    return {
      index,
      byteLength: input.unlockingBytecode.length,
      unsignedSignature: unlockingHex.includes(PLACEHOLDERS[0].pattern),
      unsignedPublicKey: unlockingHex.includes(PLACEHOLDERS[1].pattern),
    };
  });
  return { inputs, outputCount: decoded.outputs.length };
}

function selfTest() {
  const [sig, pubkey] = PLACEHOLDERS.map((p) => p.pattern);
  const cases = [
    { label: 'clean tx', hex: '0200000001' + 'ab'.repeat(200) + '00000000', expectHits: 0 },
    { label: 'signature placeholder', hex: '0200000001' + sig + 'ab'.repeat(20), expectHits: 1 },
    { label: 'pubkey placeholder', hex: '0200000001' + pubkey + 'ab'.repeat(20), expectHits: 1 },
    { label: 'both placeholders', hex: sig + 'ab'.repeat(4) + pubkey, expectHits: 2 },
    { label: 'two signature placeholders reported once, two offsets', hex: sig + 'ab' + sig, expectHits: 1 },
    { label: '0x prefix tolerated', hex: '0xdeadbeef', expectHits: 0 },
  ];

  let failures = 0;
  for (const testCase of cases) {
    const { hits } = scanPlaceholders(testCase.hex);
    const ok = hits.length === testCase.expectHits;
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${testCase.label} — expected ${testCase.expectHits} hit(s), got ${hits.length}`);
  }

  const doubled = scanPlaceholders(sig + 'ab' + sig);
  const offsetsOk = doubled.hits[0]?.offsets.length === 2;
  if (!offsetsOk) failures++;
  console.log(`${offsetsOk ? 'ok  ' : 'FAIL'}  overlapping-safe offset scan reports both occurrences`);

  for (const [label, bad] of [['non-hex', 'zzzz'], ['odd length', 'abc'], ['empty', '   ']]) {
    let threw = false;
    try {
      scanPlaceholders(bad);
    } catch {
      threw = true;
    }
    if (!threw) failures++;
    console.log(`${threw ? 'ok  ' : 'FAIL'}  rejects ${label}`);
  }

  console.log(failures === 0 ? '\nself-test PASS' : `\nself-test FAIL (${failures})`);
  return failures === 0 ? EXIT_CLEAN : EXIT_PLACEHOLDER_FOUND;
}

function readStdin() {
  if (process.stdin.isTTY) return '';
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

async function main(argv) {
  if (argv.includes('--self-test')) return selfTest();

  const fileIndex = argv.indexOf('--file');
  let input;
  if (fileIndex !== -1) {
    const path = argv[fileIndex + 1];
    if (!path) {
      console.error('--file requires a path');
      return EXIT_BAD_INPUT;
    }
    input = readFileSync(path, 'utf8');
  } else {
    input = argv.find((a) => !a.startsWith('--') && a !== '-') ?? readStdin();
  }

  if (!input || !input.trim()) {
    console.error('Usage: node scripts/scan-tx-placeholders.mjs <tx-hex> | --file <path> | --self-test');
    return EXIT_BAD_INPUT;
  }

  let result;
  let hex;
  try {
    hex = normalizeHex(input);
    result = scanPlaceholders(hex);
  } catch (error) {
    console.error(`Invalid transaction hex: ${error.message}`);
    return EXIT_BAD_INPUT;
  }

  const detail = await describeInputs(hex);
  if (detail.inputs) {
    console.log(`transaction: ${result.byteLength} bytes, ${detail.inputs.length} input(s), ${detail.outputCount} output(s)`);
    for (const input of detail.inputs) {
      const flags = [
        input.unsignedSignature ? 'UNSIGNED signature' : null,
        input.unsignedPublicKey ? 'UNSIGNED public key' : null,
      ].filter(Boolean);
      const state = input.byteLength === 0 ? 'EMPTY (unsigned)' : `${input.byteLength}-byte unlocking script`;
      console.log(`  input ${input.index}: ${state}${flags.length ? ` — ${flags.join(', ')}` : ''}`);
    }
  } else {
    console.log(`transaction: ${result.byteLength} bytes (per-input detail unavailable — ${detail.unavailable})`);
  }

  if (result.hits.length === 0) {
    console.log('\nPASS — no CashScript placeholder bytes remain.');
    return EXIT_CLEAN;
  }

  console.error('\nFAIL — unsigned placeholders survived signing:');
  for (const hit of result.hits) {
    console.error(`  ${hit.name} (${hit.description}) at byte offset ${hit.offsets.join(', ')}`);
  }
  console.error('\nThe wallet did not resolve every covenant input. Do NOT broadcast.');
  return EXIT_PLACEHOLDER_FOUND;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (invokedDirectly) {
  process.exit(await main(process.argv.slice(2)));
}
