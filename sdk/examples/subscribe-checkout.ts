/**
 * Subscribing from your own frontend — the checkout side.
 *
 * The point of this file is the *order*. Every individual call is easy; knowing
 * that funding is a separate step from creation, that funding sometimes demands a
 * consolidation transaction first, and that a confirm timeout is not a failure, is
 * the part that costs an afternoon when you work it out from the API reference.
 *
 * Framework-free on purpose. There is no React or Angular here, only a wallet
 * adapter and an event callback, so it drops into either.
 *
 * The sequence:
 *
 *   1. check the API is on the network you expect        network.network()
 *   2. is this user already subscribed?                  subscriptions.status()
 *   3. deploy the contract      [wallet prompt 1]        payments.create()
 *   4. fund it                  [wallet prompt 2]        payments.fund()
 *      └─ may transparently insert a consolidation tx    [extra prompt]
 *   5. verify it went ACTIVE                             subscriptions.status()
 *
 * Two wallet prompts is inherent, not an oversight: the contract address does not
 * exist until step 3 is mined into a deployment, and you cannot fund an address you
 * do not yet know.
 */

import {
  FlowGuardClient,
  ConfirmationPendingError,
  WalletError,
  ApiError,
  type PaymentInterval,
  type WalletAdapter,
} from '../src/index.js';

export type CheckoutStage =
  | 'checking-network'
  | 'already-subscribed'
  | 'deploying-contract'
  | 'awaiting-funding-signature'
  | 'confirming'
  | 'active'
  | 'pending'
  | 'failed';

export interface CheckoutEvent {
  stage: CheckoutStage;
  message: string;
  txHash?: string;
  paymentId?: string;
}

export interface CheckoutOptions {
  wallet: WalletAdapter;
  serviceAddress: string;
  serviceName?: string;
  amountPerPeriod: number;
  interval: PaymentInterval;
  baseUrl?: string;
  /** Fail fast if the API is not on this network. Strongly recommended. */
  expectNetwork?: 'mainnet' | 'chipnet';
  onEvent?: (event: CheckoutEvent) => void;
}

export interface CheckoutResult {
  status: 'already-active' | 'active' | 'pending';
  paymentId?: string;
  txHash?: string;
  message: string;
}

export async function subscribeCheckout(options: CheckoutOptions): Promise<CheckoutResult> {
  const emit = (event: CheckoutEvent): void => options.onEvent?.(event);

  const flowguard = new FlowGuardClient({
    wallet: options.wallet,
    ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
    // In a browser you almost certainly want a persistent store so a refresh does
    // not re-prompt for login:
    //   tokenStore: new WebStorageTokenStore(window.sessionStorage)
  });

  // 1. Network agreement. Neither side switches at runtime, and a mismatch is
  //    silent: addresses and links get derived for one network while transactions
  //    are built on the other. Cheap to check, miserable to debug.
  if (options.expectNetwork) {
    emit({ stage: 'checking-network', message: 'Checking network…' });
    const actual = await flowguard.network.network();
    if (actual !== options.expectNetwork) {
      throw new Error(
        `Network mismatch: this app targets ${options.expectNetwork} but the API is on ${actual}. ` +
          'Do not fund anything in this state.',
      );
    }
  }

  const subscriber = await options.wallet.getAddress();

  // 2. Don't charge someone who is already paying.
  const existing = await flowguard.subscriptions.status(subscriber, options.serviceAddress);
  if (existing.active) {
    emit({
      stage: 'already-subscribed',
      message: 'You already have an active subscription.',
      paymentId: existing.payment?.id,
    });
    return {
      status: 'already-active',
      ...(existing.payment?.id !== undefined ? { paymentId: existing.payment.id } : {}),
      message: 'Already subscribed.',
    };
  }

  try {
    // 3 + 4. subscribe() does create-then-fund, and absorbs the consolidation case.
    emit({ stage: 'deploying-contract', message: 'Approve the contract deployment in your wallet…' });

    const result = await flowguard.subscriptions.subscribe({
      serviceAddress: options.serviceAddress,
      amountPerPeriod: options.amountPerPeriod,
      interval: options.interval,
      ...(options.serviceName !== undefined ? { serviceName: options.serviceName } : {}),
    });

    emit({
      stage: 'confirming',
      message: 'Funding broadcast, waiting for confirmation…',
      txHash: result.funding.txHash,
      paymentId: result.paymentId,
    });

    // 5. Read the state back rather than trusting the write.
    const now = await flowguard.subscriptions.status(subscriber, options.serviceAddress);

    emit({
      stage: now.active ? 'active' : 'pending',
      message: now.active ? 'Subscription active.' : 'Funded, activating shortly.',
      txHash: result.funding.txHash,
      paymentId: result.paymentId,
    });

    return {
      status: now.active ? 'active' : 'pending',
      paymentId: result.paymentId,
      txHash: result.funding.txHash,
      message: now.active
        ? 'Subscription is active.'
        : 'Funding confirmed on chain; the subscription will show as active shortly.',
    };
  } catch (error) {
    // The one case that must never be shown as a failure. The transaction was
    // broadcast and the money may well have moved — only FlowGuard's record is
    // behind. Telling this user "payment failed" invites a double payment.
    if (error instanceof ConfirmationPendingError) {
      emit({
        stage: 'pending',
        message: 'Payment sent. Confirmation is taking longer than usual.',
        txHash: error.txHash,
      });
      return {
        status: 'pending',
        txHash: error.txHash,
        message:
          'Your payment was broadcast but is not confirmed yet. Do not pay again — ' +
          `check transaction ${error.txHash}.`,
      };
    }

    if (error instanceof WalletError) {
      emit({ stage: 'failed', message: error.message });
      throw error;
    }

    if (error instanceof ApiError) {
      emit({ stage: 'failed', message: `${error.code ?? error.status}: ${error.message}` });
      throw error;
    }

    emit({ stage: 'failed', message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
