/**
 * Recurring payments.
 *
 * The covenant behind these is `RecurringPaymentCovenant`, whose own header names
 * payroll, subscriptions and allowances as its cases. `pay()` is permissionless:
 * once an interval has elapsed anyone may trigger the payout, so a recipient can
 * pull without the sender being online.
 */

import type { Http } from '../http.js';
import type { Session } from '../auth.js';
import { runLifecycle, type LifecycleResult, type RetryOptions } from '../lifecycle.js';
import type { WalletAdapter, UnsignedTransaction } from '../wallet.js';
import { readSignedHex } from '../wallet.js';
import { WalletError } from '../errors.js';
import {
  needsPreparation,
  type ConfirmResult,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type ListPaymentsResult,
  type Payment,
  type PaymentActionBuildResult,
  type PaymentFundingResponse,
} from '../types.js';

export interface PaymentsContext {
  http: Http;
  /** Absent for a read-only client. Write methods check and explain. */
  session?: Session;
  wallet?: WalletAdapter;
}

type PaymentAction = 'pause' | 'resume' | 'cancel' | 'claim';

export class Payments {
  constructor(private readonly ctx: PaymentsContext) {}

  private requireWallet(action: string): { session: Session; wallet: WalletAdapter } {
    if (!this.ctx.session || !this.ctx.wallet) {
      throw new WalletError(
        `${action} needs a signing wallet. Construct the client with a \`wallet\` — ` +
          'a read-only client can only call the public list and read methods.',
      );
    }
    return { session: this.ctx.session, wallet: this.ctx.wallet };
  }

  private async authed(): Promise<Record<string, string>> {
    const { session } = this.requireWallet('This action');
    return session.authHeaders();
  }

  // ---------------------------------------------------------------- reads
  // All public. A server gating API access never needs a wallet or a key.

  /** Payments by sender, recipient, or the pair. At least one is required. */
  async list(filter: { sender?: string; recipient?: string }): Promise<Payment[]> {
    if (!filter.sender && !filter.recipient) {
      throw new Error('list() requires at least one of `sender` or `recipient`.');
    }
    const result = await this.ctx.http.get<ListPaymentsResult>('/payments', {
      query: { sender: filter.sender, recipient: filter.recipient },
    });
    return result.payments ?? [];
  }

  async get(id: string): Promise<Payment> {
    const result = await this.ctx.http.get<{ success: boolean; payment: Payment }>(
      `/payments/${encodeURIComponent(id)}`,
    );
    return result.payment;
  }

  /**
   * The unsigned funding transaction, or a signal that the sender's wallet needs a
   * consolidation transaction first. Use `fund()` unless you are driving the steps
   * yourself — it handles the second case for you.
   */
  async fundingInfo(id: string): Promise<PaymentFundingResponse> {
    return this.ctx.http.get<PaymentFundingResponse>(
      `/payments/${encodeURIComponent(id)}/funding-info`,
    );
  }

  // ---------------------------------------------------------------- writes

  /**
   * Deploy a recurring payment contract. The sender is bound to the authenticated
   * wallet; any `sender` in the input is ignored by the API.
   *
   * The contract exists but is inert after this: status is `PENDING` until `fund()`
   * puts money behind it. Creating and funding are separate on purpose, since the
   * funding amount depends on the deployed contract address.
   */
  async create(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    return this.ctx.http.post<CreatePaymentResult>('/payments/create', input, {
      headers: await this.authed(),
    });
  }

  /**
   * Fund a pending payment, taking it to `ACTIVE`.
   *
   * Handles the consolidation case transparently. When the sender's UTXO set cannot
   * produce the genesis output the covenant needs, the API returns a preparation
   * transaction instead of funding info; this signs and broadcasts it, then re-fetches.
   * Driving `fundingInfo()` by hand and ignoring that branch is the most common way
   * to get a confusing failure here.
   */
  async fund(id: string, options: { retry?: RetryOptions } = {}): Promise<LifecycleResult<PaymentFundingResponse, ConfirmResult>> {
    const { wallet } = this.requireWallet('Funding a payment');

    let info = await this.fundingInfo(id);

    if (needsPreparation(info)) {
      await this.broadcastPreparation(info.preparationTransaction);
      info = await this.fundingInfo(id);
      if (needsPreparation(info)) {
        throw new WalletError(
          'The wallet still needs preparation after the consolidation transaction was ' +
            'broadcast. Wait for it to confirm, then retry funding.',
        );
      }
    }

    const funding = info;
    return runLifecycle<PaymentFundingResponse, ConfirmResult>(wallet, {
      build: async () => funding,
      extractTransaction: (build) => (needsPreparation(build) ? undefined : build.wcTransaction),
      confirm: async (txHash) =>
        this.ctx.http.post<ConfirmResult>(
          `/payments/${encodeURIComponent(id)}/confirm-funding`,
          { txHash },
          { headers: await this.authed() },
        ),
      prompt: 'Fund your FlowGuard recurring payment',
      ...(options.retry !== undefined ? { retry: options.retry } : {}),
    });
  }

  /** Pause an active payment. Only the sender may do this, and only if pausable. */
  pause(id: string, options?: { retry?: RetryOptions }): Promise<LifecycleResult<PaymentActionBuildResult, ConfirmResult>> {
    return this.action(id, 'pause', 'Pause your FlowGuard recurring payment', options);
  }

  /** Resume a paused payment. */
  resume(id: string, options?: { retry?: RetryOptions }): Promise<LifecycleResult<PaymentActionBuildResult, ConfirmResult>> {
    return this.action(id, 'resume', 'Resume your FlowGuard recurring payment', options);
  }

  /** Cancel permanently and return the remaining balance to the sender. */
  cancel(id: string, options?: { retry?: RetryOptions }): Promise<LifecycleResult<PaymentActionBuildResult, ConfirmResult>> {
    return this.action(id, 'cancel', 'Cancel your FlowGuard recurring payment', options);
  }

  /**
   * Pull every elapsed interval that has not been paid yet.
   *
   * Permissionless at the covenant level, so a recipient's own backend can run this
   * on a timer without the subscriber present.
   */
  claim(id: string, options?: { retry?: RetryOptions }): Promise<LifecycleResult<PaymentActionBuildResult, ConfirmResult>> {
    return this.action(id, 'claim', 'Claim your due FlowGuard payment', options);
  }

  private async action(
    id: string,
    action: PaymentAction,
    prompt: string,
    options: { retry?: RetryOptions } = {},
  ): Promise<LifecycleResult<PaymentActionBuildResult, ConfirmResult>> {
    const { wallet } = this.requireWallet(`\`${action}\``);
    const encoded = encodeURIComponent(id);

    return runLifecycle<PaymentActionBuildResult, ConfirmResult>(wallet, {
      build: async () =>
        this.ctx.http.post<PaymentActionBuildResult>(
          `/payments/${encoded}/${action}`,
          {},
          { headers: await this.authed() },
        ),
      extractTransaction: (build) => build.wcTransaction,
      confirm: async (txHash) =>
        this.ctx.http.post<ConfirmResult>(
          `/payments/${encoded}/confirm-${action}`,
          { txHash },
          { headers: await this.authed() },
        ),
      prompt,
      ...(options.retry !== undefined ? { retry: options.retry } : {}),
    });
  }

  /**
   * Sign and broadcast the consolidation transaction, which stands outside the usual
   * build/confirm pair: it has no confirm endpoint and must land before funding info
   * can be built at all.
   */
  private async broadcastPreparation(tx: UnsignedTransaction): Promise<string> {
    const { wallet } = this.requireWallet('Funding a payment');
    const signed = await wallet.signTransaction({
      ...tx,
      broadcast: false,
      userPrompt: 'Prepare your wallet for FlowGuard funding (consolidates your coins)',
    });
    const hex = readSignedHex(signed);
    if (!hex) {
      throw new WalletError('Wallet returned no signed transaction for the preparation step.');
    }
    const result = await this.ctx.http.post<{ success: boolean; txid: string }>(
      '/transactions/broadcast',
      { txHex: hex },
    );
    return result.txid;
  }
}
