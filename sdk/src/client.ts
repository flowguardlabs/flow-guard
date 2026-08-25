/**
 * The client.
 *
 * Two shapes, and which one you want follows from what you are building:
 *
 *   - Read-only, no wallet. Everything the API exposes publicly: listing payments,
 *     checking whether a subscription is live, status, price. This is the shape a
 *     server uses to gate access, and it holds no secret of any kind.
 *
 *   - With a wallet. Adds every state-changing action. The wallet signs; this SDK
 *     never sees a private key and there is nowhere to put one.
 */

import { Http, type FetchLike } from './http.js';
import { Session, type TokenStore } from './auth.js';
import { Payments } from './resources/payments.js';
import { Subscriptions } from './resources/subscriptions.js';
import { Network } from './resources/network.js';
import type { WalletAdapter } from './wallet.js';

export interface FlowGuardClientOptions {
  /**
   * API origin, e.g. `https://api.flowguard.cash`. A trailing `/api` is accepted
   * and normalised. In a browser served behind FlowGuard's own proxy, pass the page
   * origin — `/api` is same-origin there and avoids CORS entirely.
   */
  baseUrl?: string;

  /** Omit for a read-only client. */
  wallet?: WalletAdapter;

  /** Where the SIWX bearer is cached. Defaults to memory, per client instance. */
  tokenStore?: TokenStore;

  /** CAIP-122 `domain` for the login message. Defaults to the API host. */
  domain?: string;
  /** CAIP-122 `uri` for the login message. Defaults to the API origin. */
  uri?: string;

  /** Provide on runtimes without a global fetch. */
  fetch?: FetchLike;

  /** Per-request timeout. Default 30s. */
  timeoutMs?: number;

  /** Extra headers on every request. For tracing, not for auth. */
  headers?: Record<string, string>;
}

const DEFAULT_BASE_URL = 'https://api.flowguard.cash';

export class FlowGuardClient {
  readonly payments: Payments;
  readonly subscriptions: Subscriptions;
  readonly network: Network;

  /** Present only when a wallet was supplied. */
  readonly session: Session | undefined;

  private readonly http: Http;

  constructor(options: FlowGuardClientOptions = {}) {
    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

    this.http = new Http({
      baseUrl,
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.headers !== undefined ? { headers: options.headers } : {}),
    });

    this.session = options.wallet
      ? new Session(this.http, options.wallet, {
          ...(options.tokenStore !== undefined ? { store: options.tokenStore } : {}),
          ...(options.domain !== undefined ? { domain: options.domain } : {}),
          ...(options.uri !== undefined ? { uri: options.uri } : {}),
        })
      : undefined;

    this.payments = new Payments({
      http: this.http,
      ...(this.session !== undefined ? { session: this.session } : {}),
      ...(options.wallet !== undefined ? { wallet: options.wallet } : {}),
    });
    this.subscriptions = new Subscriptions(this.payments);
    this.network = new Network(this.http);
  }

  /** True when this client can sign. */
  get canSign(): boolean {
    return this.session !== undefined;
  }

  /** Forget the cached bearer. The next signing action logs in again. */
  async signOut(): Promise<void> {
    await this.session?.clear();
  }
}
