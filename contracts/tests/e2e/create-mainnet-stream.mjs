// Creates a REAL mainnet VestingCovenant stream whose recipient is YOUR address,
// so you hold the claim key and can claim it (via the app post-redeploy, or
// directly). Linear vesting, already in-progress, so it is claimable soon.
//   BCH_NETWORK=mainnet RECIPIENT_PKH=<40hex> CHIPNET_PRIVKEY_HEX=<64hex> \
//   node tests/e2e/create-mainnet-stream.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { secp256k1, hash160, encodeCashAddress, binToHex, hexToBin } from '@bitauth/libauth';
import { Contract, TransactionBuilder, SignatureTemplate, ElectrumNetworkProvider } from 'cashscript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(readFileSync(join(__dirname, '../../artifacts/streaming/VestingCovenant.json'), 'utf8'));
const NETWORK = process.env.BCH_NETWORK || 'mainnet';
const PREFIX = NETWORK === 'mainnet' ? 'bitcoincash' : 'bchtest';
const log = (...a) => console.log('[stream]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const priv = hexToBin(process.env.CHIPNET_PRIVKEY_HEX);
const pub = secp256k1.derivePublicKeyCompressed(priv);
const pkh = hash160(pub);
const sig = new SignatureTemplate(priv);
const addr = encodeCashAddress({ prefix: PREFIX, type: 'p2pkh', payload: pkh }).address;
const recipientPkh = hexToBin(process.env.RECIPIENT_PKH);
const recipientAddr = encodeCashAddress({ prefix: PREFIX, type: 'p2pkh', payload: recipientPkh }).address;

function u40le(buf, value, off) { let v = BigInt(value); for (let i = 0; i < 5; i++) { buf[off + i] = Number(v & 0xffn); v >>= 8n; } }
function encodeCommitment({ status, flags, totalReleased, cursor, pauseStart, recipientHash }) {
  const b = Buffer.alloc(40);
  b.writeUInt8(status, 0); b.writeUInt8(flags, 1);
  b.writeBigUInt64LE(BigInt(totalReleased), 2);
  u40le(b, cursor, 10); u40le(b, pauseStart, 15);
  Buffer.from(recipientHash).copy(b, 20);
  return b;
}
async function waitUtxo(provider, address, pred, label, tries = 60) {
  for (let i = 0; i < tries; i++) { const u = (await provider.getUtxos(address)).find(pred); if (u) return u; if (i % 3 === 0) log(`waiting for ${label}...`); await sleep(4000); }
  throw new Error(`timed out: ${label}`);
}

async function main() {
  const provider = new ElectrumNetworkProvider(NETWORK);
  log('sender:', addr);
  log('recipient (you):', recipientAddr);
  const utxos = (await provider.getUtxos(addr)).filter((u) => !u.token);
  const bal = utxos.reduce((s, u) => s + u.satoshis, 0n);
  log('sender balance:', bal.toString());
  if (bal < 40000n) throw new Error('insufficient balance');

  let anchor = utxos.find((u) => u.vout === 0);
  if (!anchor) {
    const t = await new TransactionBuilder({ provider }).addInputs(utxos, sig.unlockP2PKH())
      .addOutput({ to: addr, amount: 30000n }).addOutput({ to: addr, amount: bal - 32000n }).send();
    anchor = await waitUtxo(provider, addr, (u) => u.txid === t.txid && u.vout === 0, 'anchor');
  }

  const now = Math.floor(Date.now() / 1000);
  const startTs = now - 1800;          // started 30 min ago -> already vesting
  const endTs = now + 5400;            // fully vested in ~90 min
  const totalAmount = 10000;           // 10000 sats streamed to you
  const vaultId = '5701'.repeat(16);   // 32-byte id
  const contract = new Contract(artifact, [vaultId, binToHex(pkh), 1n, BigInt(totalAmount), BigInt(startTs), BigInt(endTs), 0n, 0n, 0n], { provider });

  const category = anchor.txid;
  const fundingSats = 22000n;          // 10000 principal + ~12000 reserve (covers ~2 claims at fee 4000)
  const initC = encodeCommitment({ status: 0, flags: 0x01, totalReleased: 0, cursor: startTs, pauseStart: 0, recipientHash: recipientPkh });

  const fresh = (await provider.getUtxos(addr)).filter((u) => !u.token);
  const a2 = fresh.find((u) => u.txid === anchor.txid && u.vout === anchor.vout) || anchor;
  const totalIn = fresh.reduce((s, u) => s + u.satoshis, 0n);
  const tb = new TransactionBuilder({ provider });
  tb.addInput(a2, sig.unlockP2PKH());
  const others = fresh.filter((u) => !(u.txid === a2.txid && u.vout === a2.vout));
  if (others.length) tb.addInputs(others, sig.unlockP2PKH());
  tb.addOutput({ to: contract.tokenAddress, amount: fundingSats, token: { category, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(initC) } } });
  tb.addOutput({ to: addr, amount: totalIn - fundingSats - 2000n });
  const fund = await tb.send();

  log('STREAM CREATED on mainnet:');
  log('  funding txid:     ', fund.txid);
  log('  contract address: ', contract.tokenAddress);
  log('  category (genesis):', category);
  log('  vaultId:          ', vaultId);
  log('  senderHash:       ', binToHex(pkh));
  log('  recipientHash:    ', binToHex(recipientPkh));
  log('  scheduleType:     ', '1 (LINEAR)');
  log('  totalAmount:      ', totalAmount, 'sats');
  log('  startTs / endTs:  ', startTs, '/', endTs, `(fully vested at ${new Date(endTs * 1000).toISOString()})`);
  log('  funded:           ', fundingSats.toString(), 'sats (10000 stream + reserve)');
  log('  initial commitment:', binToHex(initC));
  log('Claim with the recipient key (you). It vests linearly; claimable now and grows to full by endTs.');
}

main().catch((e) => { console.error('[stream] FAIL:', e?.message || e); process.exit(1); });
