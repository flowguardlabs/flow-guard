// Chipnet e2e for FtVestingCovenant — the two-UTXO arbitrary-FT vesting model.
//
// Proves a holder can stream a token they DON'T issue (no minting authority):
//   1. mint our own fungible token  (category_FT)            [the "user's" token]
//   2. make a separate genesis anchor                        (category_state)
//   3. fund the covenant: ONE tx mints the state NFT (category_state) AND
//      deposits the FT into a separate vault UTXO (category_FT), both at the
//      covenant address
//   4. partial claim: spend BOTH UTXOs -> recipient gets the vested FT, the
//      state NFT advances, the remaining FT returns to the vault (3 outputs)
//
// A successful claim broadcast proves the category binding, the paired spend,
// and the self-funded fee on a real node.
//   cd contracts && npm run build:streaming
//   CHIPNET_PRIVKEY_HEX=<64hex> node tests/e2e/ft-vesting.e2e.mjs

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
const log = (...a) => console.log('[ft-e2e]', ...a);
const fail = (m) => { console.error('[ft-e2e] FAIL:', m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadOrGenKey() {
  const hex = process.env.CHIPNET_PRIVKEY_HEX;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) return hexToBin(hex);
  const k = new Uint8Array(32);
  for (let i = 0; i < 32; i++) k[i] = (Date.now() + i * 131) & 0xff;
  while (!secp256k1.validatePrivateKey(k)) k[0] = (k[0] + 1) & 0xff;
  log('GENERATED key (set CHIPNET_PRIVKEY_HEX to reuse):', binToHex(k));
  return k;
}

const priv = loadOrGenKey();
const pub = secp256k1.derivePublicKeyCompressed(priv);
const pkh = hash160(pub);
const sig = new SignatureTemplate(priv);
const addr = encodeCashAddress({ prefix: PREFIX, type: 'p2pkh', payload: pkh }).address;
const tokenAddr = encodeCashAddress({ prefix: PREFIX, type: 'p2pkhWithTokens', payload: pkh }).address;

function u40le(buf, value, off) { let v = BigInt(value); for (let i = 0; i < 5; i++) { buf[off + i] = Number(v & 0xffn); v >>= 8n; } }
function encodeCommitment({ status, flags, totalReleased, cursor, pauseStart, recipientHash }) {
  const b = Buffer.alloc(40);
  b.writeUInt8(status, 0);
  b.writeUInt8(flags, 1);
  b.writeBigUInt64LE(BigInt(totalReleased), 2);
  u40le(b, cursor, 10);
  u40le(b, pauseStart, 15);
  Buffer.from(recipientHash).copy(b, 20);
  return b;
}

const bchUtxos = async (provider) => (await provider.getUtxos(addr)).filter((u) => !u.token);
async function waitUtxo(provider, address, pred, label, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const u = (await provider.getUtxos(address)).find(pred);
    if (u) return u;
    if (i % 3 === 0) log(`waiting for ${label}...`);
    await sleep(4000);
  }
  fail(`timed out waiting for ${label}`);
}

// Spend all current BCH utxos -> a fresh vout-0 anchor of `amount` + change.
async function makeAnchor(provider, amount) {
  const utxos = await bchUtxos(provider);
  const total = utxos.reduce((s, u) => s + u.satoshis, 0n);
  const tx = await new TransactionBuilder({ provider })
    .addInputs(utxos, sig.unlockP2PKH())
    .addOutput({ to: addr, amount })                      // vout 0 = anchor
    .addOutput({ to: addr, amount: total - amount - 500n }) // vout 1 = change
    .send();
  return waitUtxo(provider, addr, (u) => u.txid === tx.txid && u.vout === 0, `anchor ${amount}`);
}

async function main() {
  const provider = new ElectrumNetworkProvider(NETWORK);
  log('wallet:', addr);
  const bal = (await bchUtxos(provider)).reduce((s, u) => s + u.satoshis, 0n);
  log('balance (sats):', bal.toString());
  if (bal < 60000n) {
    log(`Fund ${addr} from https://tbch.googol.cash (>= 0.0006 tBCH) and re-run with CHIPNET_PRIVKEY_HEX=${binToHex(priv)}`);
    process.exit(2);
  }

  // ---- 1) mint our own fungible token (category_FT) ------------------------
  const ftSupply = 100000n;
  const anchorFt = await makeAnchor(provider, 6000n);
  const categoryFt = anchorFt.txid;
  {
    const fresh = await bchUtxos(provider);
    const a0 = fresh.find((u) => u.txid === anchorFt.txid && u.vout === 0);
    const others = fresh.filter((u) => !(u.txid === a0.txid && u.vout === a0.vout));
    const totalIn = fresh.reduce((s, u) => s + u.satoshis, 0n);
    const tb = new TransactionBuilder({ provider }).addInput(a0, sig.unlockP2PKH());
    if (others.length) tb.addInputs(others, sig.unlockP2PKH());
    tb.addOutput({ to: tokenAddr, amount: 2000n, token: { category: categoryFt, amount: ftSupply } }); // vout0 = our FT
    tb.addOutput({ to: addr, amount: totalIn - 2000n - 500n });
    const mintTx = await tb.send();
    log('minted FT category:', categoryFt, 'supply', ftSupply.toString(), 'tx', mintTx.txid);
    await waitUtxo(provider, addr, (u) => u.token?.category === categoryFt && BigInt(u.token.amount) === ftSupply, 'our FT utxo');
  }

  // ---- 2) separate genesis anchor for the state NFT (category_state) --------
  const anchorState = await makeAnchor(provider, 30000n);
  const categoryState = anchorState.txid;

  // ---- 3) instantiate covenant (both categories compiled in) ---------------
  const now = Math.floor(Date.now() / 1000);
  const startTs = now - 100000;
  const endTs = now + 100000;          // ~50% vested at now
  const totalAmount = Number(ftSupply); // vest the whole supply
  const vaultId = '01'.repeat(32);
  const contract = new Contract(
    artifact,
    [vaultId, binToHex(pkh), 1n, BigInt(totalAmount), BigInt(startTs), BigInt(endTs), 0n, 0n, 0n,
      categoryState, categoryFt],
    { provider },
  );
  log('covenant token address:', contract.tokenAddress);

  // ---- 4) fund: state NFT (genesis) + FT vault in ONE tx -------------------
  const initCommitment = encodeCommitment({ status: 0, flags: 0x01, totalReleased: 0, cursor: startTs, pauseStart: 0, recipientHash: pkh });
  {
    const freshBch = await bchUtxos(provider);
    const stateAnchor = freshBch.find((u) => u.txid === anchorState.txid && u.vout === 0);
    const ftUtxo = (await provider.getUtxos(addr)).find((u) => u.token?.category === categoryFt && !u.token?.nft);
    if (!ftUtxo) fail('lost track of the FT utxo');
    const moreBch = freshBch.filter((u) => !(u.txid === stateAnchor.txid && u.vout === stateAnchor.vout));
    const totalIn = stateAnchor.satoshis + ftUtxo.satoshis + moreBch.reduce((s, u) => s + u.satoshis, 0n);

    const tb = new TransactionBuilder({ provider });
    tb.addInput(stateAnchor, sig.unlockP2PKH());   // input0 vout-0 => genesis category_state
    tb.addInput(ftUtxo, sig.unlockP2PKH());        // input1 = our FT
    if (moreBch.length) tb.addInputs(moreBch, sig.unlockP2PKH());
    tb.addOutput({ to: contract.tokenAddress, amount: 10000n, token: { category: categoryState, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(initCommitment) } } });
    tb.addOutput({ to: contract.tokenAddress, amount: 2000n, token: { category: categoryFt, amount: ftSupply } });
    tb.addOutput({ to: addr, amount: totalIn - 12000n - 800n });
    const fundTx = await tb.send();
    log('funding tx (state NFT + FT vault):', fundTx.txid);
  }

  const stateUtxo = await waitUtxo(provider, contract.tokenAddress, (u) => Boolean(u.token?.nft) && u.token.category === categoryState, 'state NFT utxo');
  const vaultUtxo = await waitUtxo(provider, contract.tokenAddress, (u) => u.token?.category === categoryFt && !u.token?.nft, 'FT vault utxo');
  log('state NFT:', stateUtxo.satoshis.toString(), 'sats | vault:', vaultUtxo.token.amount.toString(), 'tokens', vaultUtxo.satoshis.toString(), 'sats');

  // ---- 5) PARTIAL claim: 3 outputs (recipient FT + state NFT + remaining) ---
  const claimLocktime = now - 7200;                 // >=500M, <= MTP
  const elapsed = claimLocktime - startTs;
  const duration = endTs - startTs;
  const vestedTotal = Math.floor((totalAmount * elapsed) / duration);
  const claimable = BigInt(vestedTotal);            // totalReleased was 0
  const remaining = ftSupply - claimable;
  if (claimable <= 0n || remaining <= 0n) fail(`expected a partial claim, got claimable=${claimable} remaining=${remaining}`);
  log('partial claim: vested', vestedTotal, 'claimable', claimable.toString(), 'remaining', remaining.toString());

  const newCommitment = encodeCommitment({ status: 0, flags: 0x01, totalReleased: vestedTotal, cursor: startTs, pauseStart: 0, recipientHash: pkh });
  const stateOutSats = stateUtxo.satoshis + vaultUtxo.satoshis - 1000n - 1000n - 4000n; // out0=1000, out2=1000, fee=4000

  const claimTx = await new TransactionBuilder({ provider })
    .setLocktime(claimLocktime)
    .addInput(stateUtxo, contract.unlock.claim(sig, pub), { sequence: NON_FINAL })   // input0 = state NFT
    .addInput(vaultUtxo, contract.unlock.claim(sig, pub), { sequence: NON_FINAL })   // input1 = FT vault
    .addOutput({ to: tokenAddr, amount: 1000n, token: { category: categoryFt, amount: claimable } })           // out0 vested FT
    .addOutput({ to: contract.tokenAddress, amount: stateOutSats, token: { category: categoryState, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(newCommitment) } } }) // out1 state
    .addOutput({ to: contract.tokenAddress, amount: 1000n, token: { category: categoryFt, amount: remaining } }) // out2 remaining vault
    .send();

  log('FT CLAIM BROADCAST OK:', claimTx.txid);
  log(`PASS — streamed ${claimable} of ${ftSupply} FT (no minting authority); state advanced; ${remaining} left in vault.`);
}

main().catch((e) => fail(e?.message || String(e)));
