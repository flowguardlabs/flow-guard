/**
 * Smoke test for the /api/auth/nonce proof-transaction gate.
 *
 * `wantsTxProof` decides whether the nonce response carries an `authProof` — the
 * non-broadcastable transaction that wallets without usable message signing sign in
 * place of the CAIP-122 message. It was widened from a hardcoded
 * `walletType === 'wizardconnect'` check to a capability flag so OPTN Wallet (and any
 * future transaction-only wallet) can authenticate without another backend change.
 *
 * Issuing an unnecessary proof tx is not a privilege escalation: it is bound to a
 * single-use nonce and worthless without the address's private key. The gate exists
 * to avoid building one for the message-signing majority, so the tests below pin
 * behaviour rather than security.
 *
 * NO test framework dependency. Runs as a standalone Node script via tsx:
 *
 *   pnpm --filter @flowguard/backend exec tsx test/auth-txproof-gate.smoke.ts
 *
 * Exit code 0 on pass, non-zero on any assertion failure.
 */

import { wantsTxProof } from '../src/api/auth.js';

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean): void {
  console.log(condition ? 'PASS' : 'FAIL', name);
  if (condition) pass++;
  else fail++;
}

// --- explicit capability flag (the path the current frontend uses) --------------
check('txProof: true → proof issued', wantsTxProof({ txProof: true }) === true);
check('txProof: false → no proof', wantsTxProof({ txProof: false }) === false);
check('txProof omitted, no walletType → no proof', wantsTxProof({}) === false);

// --- legacy walletType path (older clients that predate the flag) ---------------
check('walletType wizardconnect → proof issued', wantsTxProof({ walletType: 'wizardconnect' }) === true);
check('walletType optn → proof issued', wantsTxProof({ walletType: 'optn' }) === true);
check('walletType walletconnect → no proof', wantsTxProof({ walletType: 'walletconnect' }) === false);
check('walletType paytaca → no proof', wantsTxProof({ walletType: 'paytaca' }) === false);
check('walletType cashonize → no proof', wantsTxProof({ walletType: 'cashonize' }) === false);

// --- normalisation --------------------------------------------------------------
check('walletType is case-insensitive', wantsTxProof({ walletType: 'OPTN' }) === true);
check('walletType is whitespace-tolerant', wantsTxProof({ walletType: '  wizardconnect  ' }) === true);

// --- hostile / malformed input must not throw -----------------------------------
check('null body → no proof', wantsTxProof(null) === false);
check('undefined body → no proof', wantsTxProof(undefined) === false);
check('string body → no proof', wantsTxProof('optn') === false);
check('txProof truthy-but-not-true is not honoured', wantsTxProof({ txProof: 'true' }) === false);
check('txProof: 1 is not honoured', wantsTxProof({ txProof: 1 }) === false);
check('numeric walletType → no proof', wantsTxProof({ walletType: 42 }) === false);
check('object walletType → no proof', wantsTxProof({ walletType: {} }) === false);
check('array body → no proof', wantsTxProof([]) === false);

// --- flag wins over an unknown wallet type --------------------------------------
check(
  'txProof: true with unknown walletType → proof issued',
  wantsTxProof({ txProof: true, walletType: 'some-future-wallet' }) === true,
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
