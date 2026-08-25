# @flowguard/sdk

TypeScript client for [FlowGuard](https://flowguard.cash) — contract-backed treasuries, streams, payments and subscriptions on Bitcoin Cash.

Zero runtime dependencies. The wallet does the signing; no private key ever reaches this package, and there is nowhere to put one.

```bash
npm install @flowguard/sdk
```

Node 18+, or any browser. Works in React, Angular, Vue, Svelte and plain JavaScript — nothing here is framework-aware.

## Two shapes of client

Which one you want follows from what you are building.

**Read-only.** No wallet, no key, no auth. Everything the API exposes publicly.

```ts
import { FlowGuardClient } from '@flowguard/sdk';

const flowguard = new FlowGuardClient();
const active = await flowguard.subscriptions.isActive(userAddress, MY_ADDRESS);
```

**With a wallet.** Adds every state-changing action.

```ts
const flowguard = new FlowGuardClient({ wallet });
await flowguard.subscriptions.subscribe({
  serviceAddress: MY_ADDRESS,
  amountPerPeriod: 100_000,
  interval: 'MONTHLY',
});
```

## Gate an API on a subscription

The check is a single public GET, so it can sit in a request path or edge middleware without holding anything secret.

```ts
app.use('/v1', async (req, res, next) => {
  const subscriber = req.header('x-bch-address');
  if (!subscriber) return res.status(401).json({ error: 'ADDRESS_REQUIRED' });

  if (await flowguard.subscriptions.isActive(subscriber, MY_ADDRESS)) return next();

  res.status(402).json({
    error: 'SUBSCRIPTION_REQUIRED',
    subscribe: { serviceAddress: MY_ADDRESS, amountPerPeriod: 100_000, interval: 'MONTHLY' },
  });
});
```

`status()` returns *why* someone is locked out, which is worth surfacing — `pending_funding` and `lapsed` are very different problems for a user to fix, and a bare 402 tells them neither.

```ts
const { active, reason, paidThrough } = await flowguard.subscriptions.status(user, MY_ADDRESS);
// reason: 'none' | 'pending_funding' | 'paused' | 'cancelled' | 'completed' | 'lapsed'
```

Collecting is permissionless at the covenant level, so your own backend can sweep on a timer with no subscriber online:

```ts
const { collected, failed } = await flowguard.subscriptions.collectDue(MY_ADDRESS);
```

## Connecting a wallet

Implement `WalletAdapter`. It is small on purpose — this package adapts to your wallet, not the other way round.

```ts
import type { WalletAdapter } from '@flowguard/sdk';

const wallet: WalletAdapter = {
  getAddress: () => connectedAddress,
  signMessage: (message) => myWallet.signMessage(message),
  signTransaction: (tx) => myWallet.signTransaction(tx),
};
```

Wallets with no usable message signing — WizardConnect has no such action, OPTN's length prefix is not a CompactSize varint and so cannot sign the ~380-byte login string — log in by signing a proof transaction instead. Say so and the SDK routes around it:

```ts
const wallet: WalletAdapter = {
  getAddress: () => connectedAddress,
  signTransaction: (tx) => myWallet.signTransaction(tx),
  supportsMessageSigning: false,
  walletType: 'optn',
};
```

That proof transaction is bound to a single-use nonce and cannot be broadcast, so signing it moves no funds and is worthless to anyone else.

## Calling things in the right order

Every state-changing action is the same three beats, and the SDK runs all three for you:

```
POST the action  →  API returns an unsigned transaction
wallet signs it  →  hex comes back
POST confirm-*   →  API broadcasts, watches, updates state
```

Three things are easy to get wrong when driving the API directly.

**Creating and funding are separate.** A new payment is `PENDING` and inert until funded. The contract address does not exist until deployment, so you cannot fund an address you do not yet know — which is also why subscribing prompts the wallet twice.

**Funding sometimes needs a consolidation transaction first.** When the sender's UTXO set cannot produce the genesis output the covenant needs, `funding-info` returns a preparation transaction instead of funding info. `payments.fund()` signs, broadcasts and re-fetches transparently. Driving `fundingInfo()` by hand and ignoring that branch is the most common way to get a confusing failure.

**A confirm timeout is not a failure.** `ConfirmationPendingError` means the transaction *was* broadcast — the money may well have moved and only FlowGuard's record is behind. It carries the txid. Show it as pending and re-check; showing "payment failed" invites a double payment.

```ts
try {
  await flowguard.subscriptions.subscribe({ ... });
} catch (error) {
  if (error instanceof ConfirmationPendingError) {
    show(`Payment sent — confirming. Do not pay again. tx: ${error.txHash}`);
  }
}
```

## Errors

| Class | Meaning |
|---|---|
| `ApiError` | Non-2xx. Has `status`, `code`, and `retryable` |
| `WalletError` | Wallet declined, or lacks a needed capability |
| `AuthError` | SIWX login failed |
| `ConfirmationPendingError` | Broadcast succeeded, confirmation did not arrive. Carries `txHash` |

All extend `FlowGuardError`.

## Sessions

The first signing action runs the SIWX login (nonce → sign → verify) and caches a bearer for ~30 minutes. Subsequent calls reuse it, and concurrent calls share one login rather than opening several wallet prompts.

Bearers are cached in memory per client instance by default. In a browser, persist across refreshes:

```ts
import { WebStorageTokenStore } from '@flowguard/sdk';

new FlowGuardClient({ wallet, tokenStore: new WebStorageTokenStore(window.sessionStorage) });
```

## Check the network

Neither side switches network at runtime. A mismatch is silent and expensive: addresses and explorer links get derived for one network while transactions are built and broadcast on the other.

```ts
if (await flowguard.network.network() !== 'mainnet') throw new Error('Wrong network');
```

## Examples

- [`examples/subscription-gate.ts`](./examples/subscription-gate.ts) — Express middleware gating an API, with caching and a fail-open policy
- [`examples/subscribe-checkout.ts`](./examples/subscribe-checkout.ts) — framework-free checkout flow with staged progress events

## Development

```bash
pnpm build                       # compile to dist/
pnpm typecheck                   # src only
npx tsc -p tsconfig.examples.json  # src + examples
node test/live-smoke.mjs         # read-only, safe against production
```

`test/live-smoke.mjs` never signs, funds or creates anything.

## API reference

Full endpoint documentation: <https://docs.flowguard.cash/api/overview>
