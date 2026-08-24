// Batch-creates N real mainnet vesting streams (one per derived wallet) to a
// single recipient, and inserts a UI-shaped row into Supabase `streams` for each
// — same fields the app's create flow writes, so they show in the UI and the
// indexer (now on Supabase) tracks them. Lots of on-chain txns by design.
//
//   railway run --service backend -- env BCH_NETWORK=mainnet \
//     FUND_KEY=<64hex> RECIPIENT=bitcoincash:q... N=10 \
//     npx tsx test/create-streams-batch.ts

import { secp256k1, hash160, encodeCashAddress, decodeCashAddress, binToHex, hexToBin } from '@bitauth/libauth';
import { Contract, TransactionBuilder, SignatureTemplate, ElectrumNetworkProvider } from 'cashscript';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

const NETWORK = (process.env.BCH_NETWORK as any) || 'mainnet';
const PREFIX = NETWORK === 'mainnet' ? 'bitcoincash' : 'bchtest';
const N = Number(process.env.N || '10');
const log = (...a: unknown[]) => console.log('[batch]', ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const artifact = JSON.parse(readFileSync(new URL('../../contracts/artifacts/streaming/VestingCovenant.json', import.meta.url), 'utf8'));

const fundKey = hexToBin(process.env.FUND_KEY!);
const fundPub = secp256k1.derivePublicKeyCompressed(fundKey) as Uint8Array;
const fundPkh = hash160(fundPub) as Uint8Array;
const fundSig = new SignatureTemplate(fundKey);
const fundAddr = encodeCashAddress({ prefix: PREFIX, type: 'p2pkh', payload: fundPkh }).address;
const recipientDec = decodeCashAddress(process.env.RECIPIENT!) as any;
const recipientPkh = recipientDec.payload as Uint8Array;
const recipientAddr = process.env.RECIPIENT!;

function deriveKey(base: Uint8Array, salt: number) {
  const k = new Uint8Array(base); k[31] = (k[31] ^ salt) & 0xff; k[30] = (k[30] ^ ((salt >> 8) & 0xff)) & 0xff;
  while (!secp256k1.validatePrivateKey(k)) k[0] = (k[0] + 1) & 0xff;
  const pub = secp256k1.derivePublicKeyCompressed(k) as Uint8Array;
  const pkh = hash160(pub) as Uint8Array;
  return { priv: k, pub, pkh, sig: new SignatureTemplate(k), addr: encodeCashAddress({ prefix: PREFIX, type: 'p2pkh', payload: pkh }).address };
}
function u40le(buf: Buffer, value: number, off: number) { let v = BigInt(value); for (let i = 0; i < 5; i++) { buf[off + i] = Number(v & 0xffn); v >>= 8n; } }
function vestingCommitment(startTs: number, recip: Uint8Array) {
  const b = Buffer.alloc(40);
  b.writeUInt8(0, 0); b.writeUInt8(0x01, 1); b.writeBigUInt64LE(0n, 2); u40le(b, startTs, 10); u40le(b, 0, 15);
  Buffer.from(recip).copy(b, 20);
  return b;
}
async function waitUtxo(provider: ElectrumNetworkProvider, address: string, pred: (u: any) => boolean, label: string): Promise<any> {
  for (let i = 0; i < 60; i++) { const u = (await provider.getUtxos(address)).find(pred); if (u) return u; if (i % 4 === 0) log(`  waiting ${label}...`); await sleep(4000); }
  throw new Error(`timeout ${label}`);
}

async function main() {
  const provider = new ElectrumNetworkProvider(NETWORK);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  log('funder:', fundAddr, '| recipient:', recipientAddr, '| N:', N);

  // next stream_id sequence
  const seqRow = await pool.query("SELECT stream_id FROM streams WHERE stream_id LIKE '#FG-BCH-%'");
  let maxSeq = 0;
  for (const r of seqRow.rows) { const m = /#FG-BCH-(\d+)/.exec(r.stream_id); if (m) maxSeq = Math.max(maxSeq, Number(m[1])); }
  log('starting stream_id seq at', maxSeq + 1);

  const wallets = Array.from({ length: N }, (_, i) => deriveKey(fundKey, 0x100 + i));

  // 1) distribute: one tx funding all N wallets
  let utxos = (await provider.getUtxos(fundAddr)).filter((u: any) => !u.token);
  const bal = utxos.reduce((s: bigint, u: any) => s + u.satoshis, 0n);
  const perWallet = 28000n;
  if (bal < perWallet * BigInt(N) + 5000n) throw new Error(`need ${perWallet * BigInt(N) + 5000n}, have ${bal}`);
  const dtb = new TransactionBuilder({ provider }).addInputs(utxos, fundSig.unlockP2PKH());
  for (const w of wallets) dtb.addOutput({ to: w.addr, amount: perWallet });
  dtb.addOutput({ to: fundAddr, amount: bal - perWallet * BigInt(N) - 1000n });
  const dist = await dtb.send();
  log('distribute tx:', dist.txid);
  for (const w of wallets) await waitUtxo(provider, w.addr, (u: any) => u.txid === dist.txid, `funds@${w.addr.slice(-6)}`);

  // 2) per wallet: anchor + fund a vesting stream to recipient, insert UI row
  let seq = maxSeq;
  const created: any[] = [];
  for (let i = 0; i < N; i++) {
    const w = wallets[i];
    seq++;
    const tag = `#FG-BCH-${String(seq).padStart(3, '0')}`;
    log(`\n[${i + 1}/${N}] ${tag} from ${w.addr.slice(-8)}`);
    // anchor (vout-0 genesis input)
    const wu = (await provider.getUtxos(w.addr)).filter((u: any) => !u.token);
    const wbal = wu.reduce((s: bigint, u: any) => s + u.satoshis, 0n);
    const at = await new TransactionBuilder({ provider }).addInputs(wu, w.sig.unlockP2PKH())
      .addOutput({ to: w.addr, amount: wbal - 1000n }).send();
    const anchor = await waitUtxo(provider, w.addr, (u: any) => u.txid === at.txid && u.vout === 0, 'anchor');

    const now = Math.floor(Date.now() / 1000);
    const startTs = now - 50000, endTs = now + 50000;       // ~vesting window: active + partially claimable now
    const totalAmount = 6000;
    const vaultId = binToHex(w.pkh).repeat(2).slice(0, 64);  // unique 32-byte id per wallet, valid hex
    const ctorArgs: any[] = [vaultId, binToHex(w.pkh), 1n, BigInt(totalAmount), BigInt(startTs), BigInt(endTs), 0n, 0n, 0n];
    const contract = new Contract(artifact, ctorArgs, { provider });
    const category = anchor.txid;
    const fundingSats = 20000n;                              // 6000 principal + ~14000 reserve (multiple claims)
    const initC = vestingCommitment(startTs, recipientPkh);
    const fresh = (await provider.getUtxos(w.addr)).filter((u: any) => !u.token);
    const a2 = fresh.find((u: any) => u.txid === anchor.txid && u.vout === 0) || anchor;
    const totalIn = fresh.reduce((s: bigint, u: any) => s + u.satoshis, 0n);
    const ftb = new TransactionBuilder({ provider }).addInput(a2, w.sig.unlockP2PKH());
    const others = fresh.filter((u: any) => !(u.txid === a2.txid && u.vout === a2.vout));
    if (others.length) ftb.addInputs(others, w.sig.unlockP2PKH());
    ftb.addOutput({ to: contract.tokenAddress, amount: fundingSats, token: { category, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(initC) } } });
    ftb.addOutput({ to: w.addr, amount: totalIn - fundingSats - 1000n });
    const fund = await ftb.send();
    log(`  funded ${contract.address.slice(-10)} tx ${fund.txid.slice(0, 12)}`);
    await waitUtxo(provider, contract.tokenAddress, (u: any) => Boolean(u.token?.nft), 'state NFT');

    const ctorSerialized = JSON.stringify(ctorArgs.map((v) => (typeof v === 'bigint' ? { type: 'bigint', value: v.toString() } : { type: 'bytes', value: v })));
    await pool.query(
      `INSERT INTO streams (id, stream_id, sender, recipient, token_type, total_amount, withdrawn_amount, stream_type,
         start_time, end_time, cancelable, transferable, refillable, status, description,
         contract_address, constructor_params, nft_commitment, nft_capability, tx_hash, activated_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'BCH',$5,0,'LINEAR',$6,$7,1,0,0,'ACTIVE',$8,$9,$10,$11,'mutable',$12,$13,$13,$13)`,
      [randomUUID(), tag, w.addr, recipientAddr, totalAmount / 1e8, startTs, endTs,
       `Batch stream ${tag} to you`, contract.address, ctorSerialized, binToHex(initC), fund.txid, now]);
    log(`  DB row inserted: ${tag}`);
    created.push({ tag, contract: contract.address, fund: fund.txid });
  }

  log(`\nDONE — ${created.length} streams created + inserted (recipient ${recipientAddr}).`);
  created.forEach((c) => log(`  ${c.tag}  ${c.contract}  fund:${c.fund}`));
  await pool.end();
  process.exit(0);
}
main().catch((e) => { console.error('[batch] FAIL:', e?.message || e); process.exit(1); });
