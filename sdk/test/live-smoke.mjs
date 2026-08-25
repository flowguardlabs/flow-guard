/**
 * Live smoke test against a running FlowGuard API.
 *
 * Read-only and side-effect free: it never signs, funds, or creates anything, so it
 * is safe to point at production. Verifies the SDK's read paths, its guard rails,
 * and that errors arrive typed rather than as bare strings.
 *
 *   node test/live-smoke.mjs
 *   FLOWGUARD_API=http://localhost:3001 node test/live-smoke.mjs
 */
import { FlowGuardClient, ApiError } from '../dist/index.js';

const flowguard = new FlowGuardClient({
  baseUrl: process.env.FLOWGUARD_API ?? 'https://api.flowguard.cash',
});
let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { console.log(`  PASS ${name}${detail ? ' — ' + detail : ''}`); pass++; }
  else { console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); fail++; }
};

// read-only client needs no wallet
check('canSign is false without a wallet', flowguard.canSign === false);

const net = await flowguard.network.network();
check('network()', net === 'mainnet', `reported ${net}`);

const status = await flowguard.network.status();
check('status()', status.overall === 'operational', `overall=${status.overall}, tip=${status.chain.height}`);

const price = await flowguard.network.price();
check('price()', typeof price.usd === 'number' && price.usd > 0, `$${price.usd}`);

// real address from production data
const RECIPIENT = 'bitcoincash:qrg8xmhfqytlfmt7nwk44cymp2cv3y5kksyqmw20mn';
const payments = await flowguard.payments.list({ recipient: RECIPIENT });
check('payments.list()', Array.isArray(payments), `${payments.length} payments`);

// the gating primitive — the whole point for BCH Explorer
const subs = await flowguard.subscriptions.listForService(RECIPIENT);
check('subscriptions.listForService()', Array.isArray(subs), `${subs.length} subscriptions`);

const active = await flowguard.subscriptions.isActive(
  'bitcoincash:qpdah7k0pxmqu4sj8t0r4mjvxxwv4f0t7vtytfvnay', RECIPIENT);
check('subscriptions.isActive() returns a boolean', typeof active === 'boolean', `active=${active}`);

const st = await flowguard.subscriptions.status(
  'bitcoincash:qq0ckwfz0aens24qqlrw5s07td3wvyap2v6mckkk94', RECIPIENT);
check('status() explains why not active', st.active === false && st.reason === 'none', `reason=${st.reason}`);

// list() guard
try { await flowguard.payments.list({}); check('list() rejects empty filter', false); }
catch { check('list() rejects empty filter', true); }

// write without wallet must fail with a useful message, not a crash
try {
  await flowguard.payments.create({ recipient: RECIPIENT, amountPerPeriod: 1000, interval: 'MONTHLY' });
  check('write without wallet throws', false);
} catch (e) {
  check('write without wallet throws WalletError', e.constructor.name === 'WalletError', e.message.slice(0, 60));
}

// typed API errors
try { await flowguard.payments.get('does-not-exist-abc123'); check('404 surfaces', false); }
catch (e) {
  check('ApiError with status', e instanceof ApiError && e.status >= 400, `status=${e.status} code=${e.code}`);
  check('ApiError.retryable is false for 4xx', e.retryable === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
