/**
 * @flowguard/sdk — TypeScript client for FlowGuard.
 *
 * Contract-backed treasuries, streams, payments and subscriptions on Bitcoin Cash.
 * Zero runtime dependencies; the wallet does the signing and no key ever reaches
 * this package.
 *
 * Gate an API on a live subscription — no wallet, no key, no auth:
 *
 * ```ts
 * const flowguard = new FlowGuardClient();
 * if (!(await flowguard.subscriptions.isActive(userAddress, MY_ADDRESS))) {
 *   return res.status(402).json({ error: 'Subscription required' });
 * }
 * ```
 *
 * Subscribe from the browser, with a connected wallet:
 *
 * ```ts
 * const flowguard = new FlowGuardClient({ wallet });
 * await flowguard.subscriptions.subscribe({
 *   serviceAddress: MY_ADDRESS,
 *   amountPerPeriod: 100_000,
 *   interval: 'MONTHLY',
 * });
 * ```
 */

export { FlowGuardClient, type FlowGuardClientOptions } from './client.js';

export {
  Session,
  MemoryTokenStore,
  WebStorageTokenStore,
  type TokenStore,
  type SessionOptions,
} from './auth.js';

export {
  runLifecycle,
  type LifecycleResult,
  type LifecycleSteps,
  type RetryOptions,
} from './lifecycle.js';

export {
  requiresTxProofLogin,
  readSignedHex,
  readBroadcastTxHash,
  type WalletAdapter,
  type UnsignedTransaction,
  type SignedTransactionResult,
  type SourceOutput,
} from './wallet.js';

export {
  FlowGuardError,
  ApiError,
  AuthError,
  WalletError,
  ConfirmationPendingError,
} from './errors.js';

export { Payments, type PaymentsContext } from './resources/payments.js';
export {
  Subscriptions,
  type SubscriptionStatus,
  type SubscribeInput,
  type SubscribeResult,
} from './resources/subscriptions.js';
export { Network } from './resources/network.js';

export {
  needsPreparation,
  type Payment,
  type PaymentInterval,
  type PaymentStatus,
  type TokenType,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentFundingInfo,
  type PaymentFundingPreparationRequired,
  type PaymentFundingResponse,
  type ListPaymentsResult,
  type PaymentActionBuildResult,
  type ConfirmResult,
  type StatusPayload,
  type BchPrice,
} from './types.js';

export type { FetchLike, HttpOptions, RequestOptions } from './http.js';
