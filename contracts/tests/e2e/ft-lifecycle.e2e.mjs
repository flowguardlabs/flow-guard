// Chipnet lifecycle e2e for FtVestingCovenant — every spend path on a real node,
// the way the BCH covenant rounds were proven. Each round mints its OWN CashToken
// (no minting authority) and funds a fresh two-UTXO covenant, then exercises one
// entrypoint:
//   1. claim   — recipient pulls the vested token; state advances; remainder stays
//   2. cancel  — sender splits vested(recipient)/unvested(sender); state burned
//   3. complete— permissionless after end; remaining token -> recipient
//   4. pause   -> resume — state-NFT-only transitions (vault untouched)
//
//   cd contracts && npm run build:streaming
//   CHIPNET_PRIVKEY_HEX=<64hex> node tests/e2e/ft-lifecycle.e2e.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { secp256k1, hash160, encodeCashAddress, binToHex, hexToBin } from '@bitauth/libauth';
import { Contract, TransactionBuilder, SignatureTemplate, ElectrumNetworkProvider } from 'cashscript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(readFileSync(join(__dirname, '../../artifacts/streaming/FtVestingCovenant.json'), 'utf8'));
const NETWORK = process.env.BCH_NETWORK || 'chipnet';
const PREFIX = NETWORK === 'mainnet' ? 'bitcoincash' : 'bchtest';
const NON_FINAL = 0xfffffffe;
const log = (...a) => console.log('[ft-life]', ...a);
const fail = (m) => { console.error('[ft-life] FAIL:', m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const baseHex = process.env.CHIPNET_PRIVKEY_HEX;
if (!baseHex || !/^[0-9a-fA-F]{64}$/.test(baseHex)) fail('set CHIPNET_PRIVKEY_HEX=<64hex>');
const priv = hexToBin(baseHex);
const pub = secp256k1.derivePublicKeyCompressed(priv);
const pkh = hash160(pub);
const sig = new SignatureTemplate(priv);
const addr = encodeCashAddress({ prefix: PREFIX, type: 'p2pkh', payload: pkh }).address;
const tokenAddr = encodeCashAddress({ prefix: PREFIX, type: 'p2pkhWithTokens', payload: pkh }).address;

const revCategory = (txidHex) => txidHex.match(/../g).reverse().join('');
function u40le(buf, value, off) { let v = BigInt(value); for (let i = 0; i < 5; i++) { buf[off + i] = Number(v & 0xffn); v >>= 8n; } }
function encodeCommitment({ status, flags, totalReleased, cursor, pauseStart, recipientHash }) {
  const b = Buffer.alloc(40);
  b.writeUInt8(status, 0); b.writeUInt8(flags, 1);
  b.writeBigUInt64LE(BigInt(totalReleased), 2);
  u40le(b, cursor, 10); u40le(b, pauseStart, 15);
  Buffer.from(recipientHash).copy(b, 20);
  return b;
}
const bchUtxos = async (provider) => (await provider.getUtxos(addr)).filter((u) => !u.token);
async function waitUtxo(provider, address, pred, label, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const u = (await provider.getUtxos(address)).find(pred);
    if (u) return u;
    if (i % 4 === 0) log(`  waiting ${label}...`);
    await sleep(4000);
  }
  fail(`timed out waiting for ${label}`);
}
async function makeAnchor(provider, amount) {
  const utxos = await bchUtxos(provider);
  const total = utxos.reduce((s, u) => s + u.satoshis, 0n);
  const tx = await new TransactionBuilder({ provider })
    .addInputs(utxos, sig.unlockP2PKH())
    .addOutput({ to: addr, amount })
    .addOutput({ to: addr, amount: total - amount - 500n })
    .send();
  return waitUtxo(provider, addr, (u) => u.txid === tx.txid && u.vout === 0, `anchor ${amount}`);
}

// Mint our own FT + fund a fresh two-UTXO covenant; returns everything to spend it.
async function setupStream(provider, { startTs, endTs, totalAmount, flags }) {
  const ftSupply = BigInt(totalAmount);
  const anchorFt = await makeAnchor(provider, 6000n);
  const categoryFt = anchorFt.txid;
  {
    const fresh = await bchUtxos(provider);
    const a0 = fresh.find((u) => u.txid === anchorFt.txid && u.vout === 0);
    const others = fresh.filter((u) => !(u.txid === a0.txid && u.vout === a0.vout));
    const totalIn = fresh.reduce((s, u) => s + u.satoshis, 0n);
    const tb = new TransactionBuilder({ provider }).addInput(a0, sig.unlockP2PKH());
    if (others.length) tb.addInputs(others, sig.unlockP2PKH());
    tb.addOutput({ to: tokenAddr, amount: 2000n, token: { category: categoryFt, amount: ftSupply } });
    tb.addOutput({ to: addr, amount: totalIn - 2000n - 500n });
    await tb.send();
    await waitUtxo(provider, addr, (u) => u.token?.category === categoryFt && BigInt(u.token.amount) === ftSupply, 'FT utxo');
  }
  const anchorState = await makeAnchor(provider, 30000n);
  const categoryState = anchorState.txid;

  const contract = new Contract(
    artifact,
    ['01'.repeat(32), binToHex(pkh), 1n, BigInt(totalAmount), BigInt(startTs), BigInt(endTs), 0n, 0n, 0n,
      revCategory(categoryState), revCategory(categoryFt)],
    { provider },
  );
  const initC = encodeCommitment({ status: 0, flags, totalReleased: 0, cursor: startTs, pauseStart: 0, recipientHash: pkh });
  {
    const freshBch = await bchUtxos(provider);
    const stateAnchor = freshBch.find((u) => u.txid === anchorState.txid && u.vout === 0);
    const ftUtxo = (await provider.getUtxos(addr)).find((u) => u.token?.category === categoryFt && !u.token?.nft);
    const moreBch = freshBch.filter((u) => !(u.txid === stateAnchor.txid && u.vout === stateAnchor.vout));
    const totalIn = stateAnchor.satoshis + ftUtxo.satoshis + moreBch.reduce((s, u) => s + u.satoshis, 0n);
    const tb = new TransactionBuilder({ provider });
    tb.addInput(stateAnchor, sig.unlockP2PKH());
    tb.addInput(ftUtxo, sig.unlockP2PKH());
    if (moreBch.length) tb.addInputs(moreBch, sig.unlockP2PKH());
    tb.addOutput({ to: contract.tokenAddress, amount: 12000n, token: { category: categoryState, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(initC) } } });
    tb.addOutput({ to: contract.tokenAddress, amount: 2000n, token: { category: categoryFt, amount: ftSupply } });
    tb.addOutput({ to: addr, amount: totalIn - 14000n - 800n });
    await tb.send();
  }
  const stateUtxo = await waitUtxo(provider, contract.tokenAddress, (u) => Boolean(u.token?.nft) && u.token.category === categoryState, 'state NFT');
  const vaultUtxo = await waitUtxo(provider, contract.tokenAddress, (u) => u.token?.category === categoryFt && !u.token?.nft, 'FT vault');
  return { contract, categoryFt, categoryState, stateUtxo, vaultUtxo, initC, ftSupply, startTs, endTs };
}

const vestedLinear = (total, elapsed, duration) => (elapsed >= duration ? total : (total * elapsed) / duration);

async function roundClaim(provider) {
  log('\n=== ROUND 1: claim ===');
  const now = Math.floor(Date.now() / 1000);
  const s = await setupStream(provider, { startTs: now - 100000, endTs: now + 100000, totalAmount: 100000, flags: 0x01 });
  const lt = now - 7200;
  const vested = vestedLinear(s.ftSupply, BigInt(lt - s.startTs), BigInt(s.endTs - s.startTs));
  const remaining = s.ftSupply - vested;
  const newC = encodeCommitment({ status: 0, flags: 0x01, totalReleased: vested, cursor: s.startTs, pauseStart: 0, recipientHash: pkh });
  const stateOut = s.stateUtxo.satoshis + s.vaultUtxo.satoshis - 1000n - 1000n - 4000n;
  const tx = await new TransactionBuilder({ provider })
    .setLocktime(lt)
    .addInput(s.stateUtxo, s.contract.unlock.claim(sig, pub), { sequence: NON_FINAL })
    .addInput(s.vaultUtxo, s.contract.unlock.claim(sig, pub), { sequence: NON_FINAL })
    .addOutput({ to: tokenAddr, amount: 1000n, token: { category: s.categoryFt, amount: vested } })
    .addOutput({ to: s.contract.tokenAddress, amount: stateOut, token: { category: s.categoryState, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(newC) } } })
    .addOutput({ to: s.contract.tokenAddress, amount: 1000n, token: { category: s.categoryFt, amount: remaining } })
    .send();
  log(`  CLAIM OK ${tx.txid} — ${vested}/${s.ftSupply} streamed, ${remaining} left`);
}

async function roundCancel(provider) {
  log('\n=== ROUND 2: cancel (vested->recipient, unvested->sender) ===');
  const now = Math.floor(Date.now() / 1000);
  const s = await setupStream(provider, { startTs: now - 100000, endTs: now + 100000, totalAmount: 100000, flags: 0x01 });
  const lt = now - 7200;
  const vested = vestedLinear(s.ftSupply, BigInt(lt - s.startTs), BigInt(s.endTs - s.startTs));
  const unvested = s.ftSupply - vested;
  const bch = s.stateUtxo.satoshis + s.vaultUtxo.satoshis; // ~14000; leave ~4000 fee (>= min relay for 2 covenant inputs)
  const tx = await new TransactionBuilder({ provider })
    .setLocktime(lt)
    .addInput(s.stateUtxo, s.contract.unlock.cancel(sig, pub), { sequence: NON_FINAL })
    .addInput(s.vaultUtxo, s.contract.unlock.cancel(sig, pub), { sequence: NON_FINAL })
    .addOutput({ to: tokenAddr, amount: bch / 2n - 2000n, token: { category: s.categoryFt, amount: vested } })
    .addOutput({ to: tokenAddr, amount: bch / 2n - 2000n, token: { category: s.categoryFt, amount: unvested } })
    .send();
  log(`  CANCEL OK ${tx.txid} — vested ${vested}->recipient, unvested ${unvested}->sender, state burned`);
}

async function roundComplete(provider) {
  log('\n=== ROUND 3: complete (permissionless after end) ===');
  const now = Math.floor(Date.now() / 1000);
  const s = await setupStream(provider, { startTs: now - 100000, endTs: now - 90000, totalAmount: 100000, flags: 0x01 });
  const lt = now - 7200; // >= endTs
  const remaining = s.ftSupply; // nothing released yet
  const newC = encodeCommitment({ status: 3, flags: 0x01, totalReleased: s.ftSupply, cursor: s.startTs, pauseStart: 0, recipientHash: pkh });
  const stateOut = s.stateUtxo.satoshis + s.vaultUtxo.satoshis - 1000n - 4000n;
  const tx = await new TransactionBuilder({ provider })
    .setLocktime(lt)
    .addInput(s.stateUtxo, s.contract.unlock.complete(), { sequence: NON_FINAL })
    .addInput(s.vaultUtxo, s.contract.unlock.complete(), { sequence: NON_FINAL })
    .addOutput({ to: tokenAddr, amount: 1000n, token: { category: s.categoryFt, amount: remaining } })
    .addOutput({ to: s.contract.tokenAddress, amount: stateOut, token: { category: s.categoryState, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(newC) } } })
    .send();
  log(`  COMPLETE OK ${tx.txid} — ${remaining} returned to recipient, state COMPLETED`);
}

async function roundPauseResume(provider) {
  log('\n=== ROUND 4: pause -> resume (state-NFT only) ===');
  const now = Math.floor(Date.now() / 1000);
  const s = await setupStream(provider, { startTs: now - 100000, endTs: now + 100000, totalAmount: 100000, flags: 0x01 });

  const pauseLt = now - 7200;
  const pausedC = encodeCommitment({ status: 1, flags: 0x01, totalReleased: 0, cursor: s.startTs, pauseStart: pauseLt, recipientHash: pkh });
  const pauseTx = await new TransactionBuilder({ provider })
    .setLocktime(pauseLt)
    .addInput(s.stateUtxo, s.contract.unlock.pause(sig, pub), { sequence: NON_FINAL })
    .addOutput({ to: s.contract.tokenAddress, amount: s.stateUtxo.satoshis - 3000n, token: { category: s.categoryState, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(pausedC) } } })
    .send();
  log(`  PAUSE OK ${pauseTx.txid}`);
  const pausedUtxo = await waitUtxo(provider, s.contract.tokenAddress, (u) => u.txid === pauseTx.txid && Boolean(u.token?.nft), 'paused state');

  const resumeLt = pauseLt + 3600; // still <= MTP-ish; > pauseStart
  const newCursor = s.startTs + (resumeLt - pauseLt);
  const resumedC = encodeCommitment({ status: 0, flags: 0x01, totalReleased: 0, cursor: newCursor, pauseStart: 0, recipientHash: pkh });
  const resumeTx = await new TransactionBuilder({ provider })
    .setLocktime(resumeLt)
    .addInput(pausedUtxo, s.contract.unlock.resume(sig, pub), { sequence: NON_FINAL })
    .addOutput({ to: s.contract.tokenAddress, amount: pausedUtxo.satoshis - 3000n, token: { category: s.categoryState, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(resumedC) } } })
    .send();
  log(`  RESUME OK ${resumeTx.txid} — cursor advanced by pause duration`);
}

async function main() {
  const provider = new ElectrumNetworkProvider(NETWORK);
  const bal = (await bchUtxos(provider)).reduce((s, u) => s + u.satoshis, 0n);
  log('wallet:', addr, '| tBCH sats:', bal.toString());
  if (bal < 250000n) fail(`fund ${addr} with >= 0.0025 tBCH for the full lifecycle`);

  await roundClaim(provider);
  await roundCancel(provider);
  await roundComplete(provider);
  await roundPauseResume(provider);

  log('\nPASS — every FtVestingCovenant spend path broadcast on chipnet (claim, cancel, complete, pause, resume).');
  process.exit(0);
}
main().catch((e) => fail(e?.message || String(e)));
