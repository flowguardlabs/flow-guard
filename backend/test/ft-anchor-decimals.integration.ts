// Covers the two money-critical fixes:
//   1. decimals-aware amount conversion (whole tokens <-> base units)
//   2. buildAnchorPrepWc — mints a vout-0 coin when the wallet has none, so
//      CashToken funding never dead-ends on "no index-0 coin to anchor genesis".
//
//   cd backend && npx tsx test/ft-anchor-decimals.integration.ts

import { secp256k1, hash160, encodeCashAddress, binToHex } from '@bitauth/libauth';
import { MockNetworkProvider, randomUtxo } from 'cashscript';
import { FtVestingService, type FtScheduleArgs } from '../src/services/FtVestingService.js';
import { displayAmountToOnChain, onChainAmountToDisplay } from '../src/utils/amounts.js';

const log = (...a: unknown[]) => console.log('[ft-anchor-decimals]', ...a);
let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra?: string): void {
  if (cond) { log('PASS', name, extra ?? ''); passed += 1; } else { log('FAIL', name, extra ?? ''); failed += 1; }
}

const priv = new Uint8Array(32).fill(7); priv[31] = 13;
const pub = secp256k1.derivePublicKeyCompressed(priv) as Uint8Array;
const pkh = hash160(pub) as Uint8Array;
const senderAddr = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: pkh }).address;
const ftCategory = 'c3'.repeat(32);
const now = Math.floor(Date.now() / 1000);

const args: FtScheduleArgs = {
  vaultId: '01'.repeat(32),
  senderHash: binToHex(pkh),
  scheduleType: 1,
  totalAmount: 200n, // 2 whole tokens of a 2-decimal token
  startTimestamp: BigInt(now - 100_000),
  endTimestamp: BigInt(now + 100_000),
  cliffTimestamp: 0n,
  stepInterval: 0n,
  stepAmount: 0n,
};

async function main() {
  // --- decimals conversion ---
  check('display 2 tokens @2dp -> 200 base units', displayAmountToOnChain(2, 'CASHTOKENS', 2) === 200);
  check('display 2.5 tokens @2dp -> 250 base units', displayAmountToOnChain(2.5, 'CASHTOKENS', 2) === 250);
  check('base 200 @2dp -> 2 whole tokens', onChainAmountToDisplay(200, 'CASHTOKENS', 2) === 2);
  check('0 decimals is passthrough', displayAmountToOnChain(2, 'CASHTOKENS', 0) === 2);
  check('BCH ignores decimals (1 BCH -> 1e8 sats)', displayAmountToOnChain(1, 'BCH', 2) === 100_000_000);

  // --- anchor prep: wallet WITHOUT a vout-0 coin needs one minted ---
  const noAnchor = new MockNetworkProvider();
  noAnchor.addUtxo(senderAddr, randomUtxo({ vout: 3, satoshis: 90_000n }));
  noAnchor.addUtxo(senderAddr, randomUtxo({ vout: 2, satoshis: 1_500n, token: { category: ftCategory, amount: 200n } }));
  const svcNoAnchor = new FtVestingService(noAnchor as never);

  const prep = await svcNoAnchor.buildAnchorPrepWc({ senderAddress: senderAddr });
  check('no vout-0 coin -> needsAnchor', prep.needsAnchor === true);
  check('anchor prep returns a WC tx', Boolean(prep.wcTransaction && (prep.wcTransaction as any).transaction));
  const firstOut = (prep.wcTransaction as any)?.transaction?.outputs?.[0];
  check('anchor output[0] carries the anchor reserve (>= 16500 sats)', firstOut && BigInt(firstOut.valueSatoshis) >= 16_500n, String(firstOut?.valueSatoshis));

  // funding must still refuse (no anchor yet) — proves the two-step gate is real
  let fundingThrew = false;
  try {
    await svcNoAnchor.buildFundingWc({
      args, ftCategory, tokenAmount: args.totalAmount,
      senderAddress: senderAddr, recipient: senderAddr, cancelable: true, transferable: false,
    });
  } catch { fundingThrew = true; }
  check('funding without a vout-0 anchor is refused', fundingThrew);

  // --- anchor prep: wallet WITH a vout-0 coin needs nothing ---
  const hasAnchor = new MockNetworkProvider();
  hasAnchor.addUtxo(senderAddr, randomUtxo({ vout: 0, satoshis: 50_000n }));
  hasAnchor.addUtxo(senderAddr, randomUtxo({ vout: 2, satoshis: 1_500n, token: { category: ftCategory, amount: 200n } }));
  const svcHasAnchor = new FtVestingService(hasAnchor as never);
  const noPrep = await svcHasAnchor.buildAnchorPrepWc({ senderAddress: senderAddr });
  check('existing vout-0 coin -> no anchor needed', noPrep.needsAnchor === false);

  // and funding now succeeds with the correct base-unit vault amount
  const funding = await svcHasAnchor.buildFundingWc({
    args, ftCategory, tokenAmount: args.totalAmount,
    senderAddress: senderAddr, recipient: senderAddr, cancelable: true, transferable: false,
  });
  const vault = funding.outputs[1] as any;
  check('funding vault carries 200 base units (2 tokens @2dp)', vault?.token?.amount === '200', vault?.token?.amount);

  log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { log('FAIL error', (e as Error)?.message ?? e); process.exit(1); });
