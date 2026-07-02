// Drives the production WC builders (FtVestingService.buildFundingWc +
// buildClaimWc) through a MockNetworkProvider — no network. Verifies the funding
// tx finalizes the address from a vout-0 anchor and emits the two covenant
// outputs (state NFT genesis + FT vault), and that the claim spends both.
//
//   cd backend && npx tsx test/ft-wc.integration.ts

import { secp256k1, hash160, encodeCashAddress, binToHex, hexToBin } from '@bitauth/libauth';
import { MockNetworkProvider, randomUtxo } from 'cashscript';
import { FtVestingService, encodeFtCommitment, type FtScheduleArgs } from '../src/services/FtVestingService.js';

const log = (...a: unknown[]) => console.log('[ft-wc]', ...a);
let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra?: string): void {
  if (cond) { log('PASS', name, extra ?? ''); passed += 1; } else { log('FAIL', name, extra ?? ''); failed += 1; }
}

const priv = new Uint8Array(32).fill(5); priv[31] = 11;
const pub = secp256k1.derivePublicKeyCompressed(priv) as Uint8Array;
const pkh = hash160(pub) as Uint8Array;
const senderAddr = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: pkh }).address;
const ftCategory = 'b2'.repeat(32);
const now = Math.floor(Date.now() / 1000);

const args: FtScheduleArgs = {
  vaultId: '01'.repeat(32),
  senderHash: binToHex(pkh),
  scheduleType: 1,
  totalAmount: 100_000n,
  startTimestamp: BigInt(now - 100_000),
  endTimestamp: BigInt(now + 100_000),
  cliffTimestamp: 0n,
  stepInterval: 0n,
  stepAmount: 0n,
};

async function main() {
  const provider = new MockNetworkProvider();
  // sender wallet: a vout-0 BCH anchor + an FT utxo + extra BCH
  provider.addUtxo(senderAddr, randomUtxo({ vout: 0, satoshis: 50_000n }));
  provider.addUtxo(senderAddr, randomUtxo({ satoshis: 2_000n, token: { category: ftCategory, amount: 100_000n } }));

  const svc = new FtVestingService(provider as never);
  const funding = await svc.buildFundingWc({
    args, ftCategory, tokenAmount: args.totalAmount,
    senderAddress: senderAddr, recipient: senderAddr, cancelable: true, transferable: false,
  });

  check('funding finalizes a contract address', funding.contractAddress.startsWith('bchtest:p'), funding.contractAddress);
  check('constructor params include stateCategory + ftCategory (11)', funding.constructorParams.length === 11);
  check('funding output[0] is the state NFT (genesis category, nft)', Boolean((funding.outputs[0] as any).token?.nft) && (funding.outputs[0] as any).token.category === funding.stateCategory);
  check('funding output[1] is the FT vault (ftCategory, no nft)', (funding.outputs[1] as any).token?.category === ftCategory && !(funding.outputs[1] as any).token?.nft);
  check('funding vault carries the full token amount', String((funding.outputs[1] as any).token.amount) === args.totalAmount.toString());
  check('funding WC tx has inputs (anchor first) + outputs', funding.inputs.length >= 2 && funding.inputs[0].vout === 0);

  // simulate the funded covenant: state NFT + vault at its token address
  const ftForContract = new FtVestingService(provider as never);
  const contract = ftForContract.deriveContract(args, funding.stateCategory, ftCategory);
  const initC = hexToBin(funding.initialCommitment);
  provider.addUtxo(contract.tokenAddress, randomUtxo({ satoshis: 12_000n, token: { category: funding.stateCategory, amount: 0n, nft: { capability: 'mutable', commitment: funding.initialCommitment } } }));
  provider.addUtxo(contract.tokenAddress, randomUtxo({ satoshis: 2_000n, token: { category: ftCategory, amount: 100_000n } }));

  const claim = await svc.buildClaimWc({
    args, stateCategory: funding.stateCategory, ftCategory,
    recipientAddress: senderAddr, currentCommitment: initC, nowSeconds: now,
  });
  check('claim computes a partial claimable', claim.claimable > 0n && claim.remaining > 0n, `claimable=${claim.claimable} remaining=${claim.remaining}`);
  check('claim produced a WC transaction object', Boolean(claim.wcTransaction && (claim.wcTransaction as any).transaction));

  log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { log('FAIL error', (e as Error)?.message ?? e); process.exit(1); });
