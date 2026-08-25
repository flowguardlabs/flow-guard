/**
 * Subscriptions.
 *
 * A subscription is a recurring payment pointed at your address. There is no
 * separate contract or table behind this — it is a reading of the same
 * `RecurringPaymentCovenant`, named for the case people actually want to build:
 * gate an API or a feature on whether someone is paying you.
 *
 * The two sides are deliberately asymmetric.
 *
 * The service side is a plain public GET. `isActive()` needs no wallet, no key and
 * no auth, so it can sit in a request path or an edge middleware without holding
 * anything secret. The subscriber side needs a wallet, because only the subscriber
 * can authorise money leaving their own address.
 */

import type { Payments } from './payments.js';
import type { LifecycleResult, RetryOptions } from '../lifecycle.js';
import type { ConfirmResult, Payment, PaymentFundingResponse, PaymentInterval } from '../types.js';

export interface SubscriptionStatus {
  active: boolean;
  /** The payment backing this subscription, if one exists at all. */
  payment: Payment | undefined;
  /** Why it is not active. `undefined` when it is. */
  reason: 'none' | 'pending_funding' | 'paused' | 'cancelled' | 'completed' | 'lapsed' | undefined;
  /** Unix seconds at which the current paid period runs out. */
  paidThrough: number | undefined;
}

export interface SubscribeInput {
  /** The service's P2PKH address — where the money goes. */
  serviceAddress: string;
  amountPerPeriod: number;
  interval: PaymentInterval;
  serviceName?: string;
  /** Unix seconds. Omit for open-ended, which is the usual choice. */
  endDate?: number;
  /** Default true, so a subscriber can always leave. */
  cancelable?: boolean;
}

export interface SubscribeResult {
  paymentId: string;
  contractAddress: string;
  funding: LifecycleResult<PaymentFundingResponse, ConfirmResult>;
}

/**
 * How long past `next_payment_date` a subscription still counts as active.
 *
 * Without this, every subscriber is briefly locked out between the instant a period
 * elapses and the moment someone triggers the pull — which for a permissionless
 * `pay()` may be minutes. A day is long enough to absorb that and a missed cron,
 * and short enough that a genuinely lapsed subscription stops working quickly.
 */
const GRACE_PERIOD_SECONDS = 24 * 60 * 60;

export class Subscriptions {
  constructor(private readonly payments: Payments) {}

  /**
   * Whether `subscriberAddress` currently has a live subscription to
   * `serviceAddress`. Public read, safe to call from a server on every request.
   *
   * Picks the best of several if the subscriber has subscribed more than once —
   * re-subscribing after cancelling leaves the old record in place.
   */
  async status(subscriberAddress: string, serviceAddress: string): Promise<SubscriptionStatus> {
    const payments = await this.payments.list({
      sender: subscriberAddress,
      recipient: serviceAddress,
    });

    if (payments.length === 0) {
      return { active: false, payment: undefined, reason: 'none', paidThrough: undefined };
    }

    const evaluated = payments.map((payment) => this.evaluate(payment));
    const live = evaluated.find((entry) => entry.active);
    if (live) return live;

    // Nothing active: report the most recently created, which is the one the user
    // most likely just acted on and the reason they will recognise. The API orders
    // by created_at DESC, so that is the first entry.
    const mostRecent = evaluated[0];
    if (!mostRecent) {
      return { active: false, payment: undefined, reason: 'none', paidThrough: undefined };
    }
    return mostRecent;
  }

  /** Convenience wrapper for the common `if (!active) return 402` shape. */
  async isActive(subscriberAddress: string, serviceAddress: string): Promise<boolean> {
    const status = await this.status(subscriberAddress, serviceAddress);
    return status.active;
  }

  /** Every subscription pointed at your service, active or not. */
  async listForService(serviceAddress: string): Promise<SubscriptionStatus[]> {
    const payments = await this.payments.list({ recipient: serviceAddress });
    return payments.map((payment) => this.evaluate(payment));
  }

  /**
   * Subscribe: create the contract and fund it in one call. Needs a wallet, and
   * prompts twice — once for creation, once to fund — which is inherent to the
   * contract address not existing until it is deployed.
   */
  async subscribe(
    input: SubscribeInput,
    options: { retry?: RetryOptions } = {},
  ): Promise<SubscribeResult> {
    const created = await this.payments.create({
      recipient: input.serviceAddress,
      amountPerPeriod: input.amountPerPeriod,
      interval: input.interval,
      cancelable: input.cancelable ?? true,
      ...(input.serviceName !== undefined ? { recipientName: input.serviceName } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
    });

    const funding = await this.payments.fund(created.payment.id, options);

    return {
      paymentId: created.payment.id,
      contractAddress: created.deployment.contractAddress,
      funding,
    };
  }

  /** Cancel a subscription and return the unspent remainder to the subscriber. */
  cancel(
    paymentId: string,
    options?: { retry?: RetryOptions },
  ): Promise<LifecycleResult<unknown, ConfirmResult>> {
    return this.payments.cancel(paymentId, options);
  }

  /**
   * Collect everything owed across all subscribers.
   *
   * `pay()` is permissionless at the covenant level, so this runs on your own
   * schedule without any subscriber being online. Failures are collected rather
   * than thrown: one subscriber's exhausted contract should not stop the sweep.
   */
  async collectDue(
    serviceAddress: string,
    options: { retry?: RetryOptions } = {},
  ): Promise<{ collected: string[]; failed: Array<{ paymentId: string; error: string }> }> {
    const subscriptions = await this.listForService(serviceAddress);
    const now = Math.floor(Date.now() / 1000);

    const due = subscriptions.filter(
      (entry) =>
        entry.payment?.status === 'ACTIVE' && (entry.payment?.next_payment_date ?? Infinity) <= now,
    );

    const collected: string[] = [];
    const failed: Array<{ paymentId: string; error: string }> = [];

    for (const entry of due) {
      const payment = entry.payment;
      if (!payment) continue;
      try {
        await this.payments.claim(payment.id, options);
        collected.push(payment.id);
      } catch (error) {
        failed.push({
          paymentId: payment.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { collected, failed };
  }

  private evaluate(payment: Payment): SubscriptionStatus {
    const now = Math.floor(Date.now() / 1000);
    const paidThrough = payment.next_payment_date;

    if (payment.status === 'PENDING') {
      return { active: false, payment, reason: 'pending_funding', paidThrough: undefined };
    }
    if (payment.status === 'PAUSED') {
      return { active: false, payment, reason: 'paused', paidThrough };
    }
    if (payment.status === 'CANCELLED') {
      return { active: false, payment, reason: 'cancelled', paidThrough };
    }
    if (payment.status === 'COMPLETED') {
      return { active: false, payment, reason: 'completed', paidThrough };
    }

    // ACTIVE, but the paid-for period may have run out without anyone pulling yet.
    if (paidThrough && now > paidThrough + GRACE_PERIOD_SECONDS) {
      return { active: false, payment, reason: 'lapsed', paidThrough };
    }

    return { active: true, payment, reason: undefined, paidThrough };
  }
}
