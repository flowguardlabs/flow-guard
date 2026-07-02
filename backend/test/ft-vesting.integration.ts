// Drives the REAL FtVestingService.buildClaim through cashscript's local VM
// (MockNetworkProvider + .debug()) to prove the backend emits a covenant-valid
// two-UTXO claim — no network, no funding.
//
//   cd backend && npx tsx test/ft-vesting.integration.ts

import { secp256k1, hash160, encodeCashAddress, binToHex } from '@bitauth/libauth';
import { MockNetworkProvider, SignatureTemplate, randomUtxo } from 'cashscript';
import { FtVestingService, encodeFtCommitment, type FtScheduleArgs } from '../src/services/FtVestingService.js';

const log = (...a: unknown[]) => console.log('[ft-int]', ...a);
let passed = 0;
let failed = 0;

const priv = new Uint8Array(32).fill(3);
priv[31] = 7;
const pub = secp256k1.derivePublicKeyCompressed(priv) as Uint8Array;
const pkh = hash160(pub) as Uint8Array;
const sig = new SignatureTemplate(priv);
const recipientTokenAddr = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkhWithTokens', payload: pkh }).address;

const stateCategory = 'a1'.repeat(32);
const ftCategory = 'b2'.repeat(32);
const now = Math.floor(Date.now() / 1000);

function scheduleArgs(startTs: number, endTs: number, total: bigint): FtScheduleArgs {
  return {
    vaultId: '01'.repeat(32),
    senderHash: binToHex(pkh),
    scheduleType: 1,
    totalAmount: total,
    startTimestamp: BigInt(startTs),
    endTimestamp: BigInt(endTs),
    cliffTimestamp: 0n,
    stepInterval: 0n,
    stepAmount: 0n,
  };
}

function run(name: string, fn: () => void): void {
  try {
    fn();
    log('PASS', name);
    passed += 1;
  } catch (e) {
    log('FAIL', name, '->', (e as Error)?.message?.split('\n')[0] ?? e);
    failed += 1;
  }
}

// partial claim (3 outputs)
run('service builds a covenant-valid PARTIAL claim', () => {
  const total = 100_000n;
  const args = scheduleArgs(now - 100_000, now + 100_000, total);
  const svc = new FtVestingService(new MockNetworkProvider() as never);
  const contract = svc.deriveContract(args, stateCategory, ftCategory);
  const init = encodeFtCommitment({ status: 0, flags: 1, totalReleased: 0n, cursor: now - 100_000, pauseStart: 0, recipientHash: pkh });

  const stateUtxo = randomUtxo({
    satoshis: 12_000n,
    token: { category: stateCategory, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(init) } },
    lockingBytecode: contract.bytecode,
  });
  const vaultUtxo = randomUtxo({
    satoshis: 1_500n,
    token: { category: ftCategory, amount: total },
    lockingBytecode: contract.bytecode,
  });

  const { builder, claimable, remaining } = svc.buildClaim({
    args, stateCategory, ftCategory, stateUtxo, vaultUtxo,
    currentCommitment: init, recipientAddress: recipientTokenAddr,
    recipientSig: sig, recipientPubkey: pub, nowSeconds: now,
  });
  if (claimable <= 0n || remaining <= 0n) throw new Error(`expected partial, got claimable=${claimable} remaining=${remaining}`);
  builder.debug(); // runs the covenant in the real VM; throws on a failed require
  log('  claimable', claimable.toString(), 'remaining', remaining.toString());
});

// full claim (2 outputs, COMPLETED)
run('service builds a covenant-valid FULL claim', () => {
  const total = 100_000n;
  const args = scheduleArgs(now - 100_000, now - 90_000, total); // fully vested
  const svc = new FtVestingService(new MockNetworkProvider() as never);
  const contract = svc.deriveContract(args, stateCategory, ftCategory);
  const init = encodeFtCommitment({ status: 0, flags: 1, totalReleased: 0n, cursor: now - 100_000, pauseStart: 0, recipientHash: pkh });

  const stateUtxo = randomUtxo({
    satoshis: 12_000n,
    token: { category: stateCategory, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(init) } },
    lockingBytecode: contract.bytecode,
  });
  const vaultUtxo = randomUtxo({
    satoshis: 1_500n,
    token: { category: ftCategory, amount: total },
    lockingBytecode: contract.bytecode,
  });

  const { builder, claimable, remaining } = svc.buildClaim({
    args, stateCategory, ftCategory, stateUtxo, vaultUtxo,
    currentCommitment: init, recipientAddress: recipientTokenAddr,
    recipientSig: sig, recipientPubkey: pub, nowSeconds: now,
  });
  if (remaining !== 0n) throw new Error(`expected full claim (remaining 0), got ${remaining}`);
  builder.debug();
  log('  claimable', claimable.toString(), '(full)');
});

log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
