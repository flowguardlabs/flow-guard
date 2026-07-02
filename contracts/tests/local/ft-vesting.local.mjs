// LOCAL libauth-VM verification of FtVestingCovenant (no network, no funding).
// cashscript's TransactionBuilder.debug() runs the real BCH VM over the built
// transaction and throws FailedRequireError on the first failing require — so a
// clean debug() proves the covenant's two-UTXO claim logic (category binding,
// state advance, remaining vault, self-funded fee) against the actual VM,
// including how OP_*TOKENCATEGORY represents the NFT capability byte.
//
//   cd contracts && npm run build:streaming && node tests/local/ft-vesting.local.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { secp256k1, hash160, encodeCashAddress, binToHex } from '@bitauth/libauth';
import { Contract, TransactionBuilder, SignatureTemplate, MockNetworkProvider, randomUtxo } from 'cashscript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(readFileSync(join(__dirname, '../../artifacts/streaming/FtVestingCovenant.json'), 'utf8'));
const NON_FINAL = 0xfffffffe;
const log = (...a) => console.log('[ft-local]', ...a);
let passed = 0, failed = 0;

// deterministic key
const priv = new Uint8Array(32).fill(7); priv[31] = 9;
const pub = secp256k1.derivePublicKeyCompressed(priv);
const pkh = hash160(pub);
const sig = new SignatureTemplate(priv);
const tokenAddr = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkhWithTokens', payload: pkh }).address;

const stateCategory = 'aa'.repeat(32);
const ftCategory = 'bb'.repeat(32);

function u40le(buf, value, off) { let v = BigInt(value); for (let i = 0; i < 5; i++) { buf[off + i] = Number(v & 0xffn); v >>= 8n; } }
function commitment({ status, flags, totalReleased, cursor, pauseStart, recipientHash }) {
  const b = Buffer.alloc(40);
  b.writeUInt8(status, 0); b.writeUInt8(flags, 1);
  b.writeBigUInt64LE(BigInt(totalReleased), 2);
  u40le(b, cursor, 10); u40le(b, pauseStart, 15);
  Buffer.from(recipientHash).copy(b, 20);
  return binToHex(b);
}

function makeContract({ totalAmount, startTs, endTs }) {
  const provider = new MockNetworkProvider();
  const contract = new Contract(
    artifact,
    ['01'.repeat(32), binToHex(pkh), 1n, BigInt(totalAmount), BigInt(startTs), BigInt(endTs), 0n, 0n, 0n, stateCategory, ftCategory],
    { provider },
  );
  return { provider, contract };
}

function stateUtxo(contract, sats, commitHex) {
  return randomUtxo({
    satoshis: BigInt(sats),
    token: { category: stateCategory, amount: 0n, nft: { capability: 'mutable', commitment: commitHex } },
    lockingBytecode: contract.bytecode,
  });
}
function vaultUtxo(contract, sats, amount) {
  return randomUtxo({
    satoshis: BigInt(sats),
    token: { category: ftCategory, amount: BigInt(amount) },
    lockingBytecode: contract.bytecode,
  });
}

function expectPass(name, fn) {
  try { fn(); log('PASS', name); passed++; }
  catch (e) { log('FAIL', name, '->', e?.message?.split('\n')[0] || e); failed++; }
}
function expectFail(name, fn) {
  try { fn(); log('FAIL', name, '-> expected a require to reject but it passed'); failed++; }
  catch { log('PASS', name, '(correctly rejected)'); passed++; }
}

const now = Math.floor(Date.now() / 1000);

// ---- 1) PARTIAL claim: ~50% vested -> 3 outputs --------------------------
expectPass('partial claim (3 outputs, remaining > 0)', () => {
  const totalAmount = 100000, startTs = now - 100000, endTs = now + 100000;
  const { contract } = makeContract({ totalAmount, startTs, endTs });
  const locktime = now - 7200;
  const vested = Math.floor((totalAmount * (locktime - startTs)) / (endTs - startTs));
  const claimable = BigInt(vested), remaining = BigInt(totalAmount) - claimable;
  if (claimable <= 0n || remaining <= 0n) throw new Error('test setup not partial');
  const init = commitment({ status: 0, flags: 1, totalReleased: 0, cursor: startTs, pauseStart: 0, recipientHash: pkh });
  const next = commitment({ status: 0, flags: 1, totalReleased: vested, cursor: startTs, pauseStart: 0, recipientHash: pkh });
  const s = stateUtxo(contract, 10000, init);
  const v = vaultUtxo(contract, 2000, totalAmount);
  new TransactionBuilder({ provider: contract.provider })
    .setLocktime(locktime)
    .addInput(s, contract.unlock.claim(sig, pub), { sequence: NON_FINAL })
    .addInput(v, contract.unlock.claim(sig, pub), { sequence: NON_FINAL })
    .addOutput({ to: tokenAddr, amount: 1000n, token: { category: ftCategory, amount: claimable } })
    .addOutput({ to: contract.tokenAddress, amount: 6000n, token: { category: stateCategory, amount: 0n, nft: { capability: 'mutable', commitment: next } } })
    .addOutput({ to: contract.tokenAddress, amount: 1000n, token: { category: ftCategory, amount: remaining } })
    .debug();
});

// ---- 2) FULL claim: fully vested -> 2 outputs (COMPLETED) -----------------
expectPass('full claim (2 outputs, remaining == 0, COMPLETED)', () => {
  const totalAmount = 100000, startTs = now - 100000, endTs = now - 90000; // long fully vested
  const { contract } = makeContract({ totalAmount, startTs, endTs });
  const locktime = now - 7200;
  const init = commitment({ status: 0, flags: 1, totalReleased: 0, cursor: startTs, pauseStart: 0, recipientHash: pkh });
  const next = commitment({ status: 3, flags: 1, totalReleased: totalAmount, cursor: startTs, pauseStart: 0, recipientHash: pkh });
  const s = stateUtxo(contract, 10000, init);
  const v = vaultUtxo(contract, 2000, totalAmount);
  new TransactionBuilder({ provider: contract.provider })
    .setLocktime(locktime)
    .addInput(s, contract.unlock.claim(sig, pub), { sequence: NON_FINAL })
    .addInput(v, contract.unlock.claim(sig, pub), { sequence: NON_FINAL })
    .addOutput({ to: tokenAddr, amount: 1000n, token: { category: ftCategory, amount: BigInt(totalAmount) } })
    .addOutput({ to: contract.tokenAddress, amount: 7000n, token: { category: stateCategory, amount: 0n, nft: { capability: 'mutable', commitment: next } } })
    .debug();
});

// ---- 3) NEGATIVE: wrong FT category on the vault must reject --------------
expectFail('claim rejects a vault whose category != ftCategory', () => {
  const totalAmount = 100000, startTs = now - 100000, endTs = now + 100000;
  const { contract } = makeContract({ totalAmount, startTs, endTs });
  const locktime = now - 7200;
  const vested = Math.floor((totalAmount * (locktime - startTs)) / (endTs - startTs));
  const claimable = BigInt(vested), remaining = BigInt(totalAmount) - claimable;
  const init = commitment({ status: 0, flags: 1, totalReleased: 0, cursor: startTs, pauseStart: 0, recipientHash: pkh });
  const next = commitment({ status: 0, flags: 1, totalReleased: vested, cursor: startTs, pauseStart: 0, recipientHash: pkh });
  const s = stateUtxo(contract, 10000, init);
  const vBad = randomUtxo({ satoshis: 2000n, token: { category: 'cc'.repeat(32), amount: BigInt(totalAmount) }, lockingBytecode: contract.bytecode });
  new TransactionBuilder({ provider: contract.provider })
    .setLocktime(locktime)
    .addInput(s, contract.unlock.claim(sig, pub), { sequence: NON_FINAL })
    .addInput(vBad, contract.unlock.claim(sig, pub), { sequence: NON_FINAL })
    .addOutput({ to: tokenAddr, amount: 1000n, token: { category: 'cc'.repeat(32), amount: claimable } })
    .addOutput({ to: contract.tokenAddress, amount: 6000n, token: { category: stateCategory, amount: 0n, nft: { capability: 'mutable', commitment: next } } })
    .addOutput({ to: contract.tokenAddress, amount: 1000n, token: { category: 'cc'.repeat(32), amount: remaining } })
    .debug();
});

// ---- 4) NEGATIVE: over-claim beyond vested must reject -------------------
expectFail('claim rejects over-claim beyond vested', () => {
  const totalAmount = 100000, startTs = now - 100000, endTs = now + 100000;
  const { contract } = makeContract({ totalAmount, startTs, endTs });
  const locktime = now - 7200;
  const vested = Math.floor((totalAmount * (locktime - startTs)) / (endTs - startTs));
  const over = BigInt(vested) + 5000n, remaining = BigInt(totalAmount) - over;
  const init = commitment({ status: 0, flags: 1, totalReleased: 0, cursor: startTs, pauseStart: 0, recipientHash: pkh });
  const next = commitment({ status: 0, flags: 1, totalReleased: Number(over), cursor: startTs, pauseStart: 0, recipientHash: pkh });
  const s = stateUtxo(contract, 10000, init);
  const v = vaultUtxo(contract, 2000, totalAmount);
  new TransactionBuilder({ provider: contract.provider })
    .setLocktime(locktime)
    .addInput(s, contract.unlock.claim(sig, pub), { sequence: NON_FINAL })
    .addInput(v, contract.unlock.claim(sig, pub), { sequence: NON_FINAL })
    .addOutput({ to: tokenAddr, amount: 1000n, token: { category: ftCategory, amount: over } })
    .addOutput({ to: contract.tokenAddress, amount: 6000n, token: { category: stateCategory, amount: 0n, nft: { capability: 'mutable', commitment: next } } })
    .addOutput({ to: contract.tokenAddress, amount: 1000n, token: { category: ftCategory, amount: remaining } })
    .debug();
});

log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
