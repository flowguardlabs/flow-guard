/**
 * Sign-In With BCH (SIWX) session handling.
 *
 * Ported from the app's own `authFetch`, with the browser assumptions removed:
 * `sessionStorage` becomes a pluggable `TokenStore`, and `window.location` becomes
 * explicit `domain`/`uri` options. That is what lets the same code run in a Node
 * service, an Angular app, or a worker.
 *
 * The flow, once per session:
 *
 *   1. POST /auth/nonce            -> { nonceId, message } (+ authProof for tx-proof wallets)
 *   2. wallet signs the message, or the proof transaction
 *   3. POST /auth/verify | /verify-tx -> { bearer, expiresAt }
 *   4. bearer is cached and reused until it expires (~30 min)
 *
 * A 401 mid-session means the bearer lapsed; the caller burns the cache and repeats
 * once. Only once — a second 401 is a real failure, not a stale token.
 */

import { AuthError, WalletError } from './errors.js';
import type { Http } from './http.js';
import {
  requiresTxProofLogin,
  readSignedHex,
  type UnsignedTransaction,
  type WalletAdapter,
} from './wallet.js';

/** Where a bearer is kept between calls. Implement to persist across processes. */
export interface TokenStore {
  get(key: string): string | null | Promise<string | null>;
  set(key: string, value: string): void | Promise<void>;
  delete(key: string): void | Promise<void>;
}

/** Default: per-instance, in memory. Nothing is written to disk or to a browser. */
export class MemoryTokenStore implements TokenStore {
  private readonly entries = new Map<string, string>();
  get(key: string): string | null {
    return this.entries.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.entries.set(key, value);
  }
  delete(key: string): void {
    this.entries.delete(key);
  }
}

/**
 * Browser-backed store. Pass `window.sessionStorage` to survive a tab refresh but
 * not a browser close, which lines up with the ~30 minute bearer TTL.
 */
export class WebStorageTokenStore implements TokenStore {
  constructor(private readonly storage: Storage) {}
  get(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      // Safari private mode throws on access rather than returning null.
      return null;
    }
  }
  set(key: string, value: string): void {
    try {
      this.storage.setItem(key, value);
    } catch {
      // Quota exceeded is not worth failing a login over.
    }
  }
  delete(key: string): void {
    try {
      this.storage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

export interface SessionOptions {
  /** CAIP-122 `domain`. Defaults to the API host. */
  domain?: string;
  /** CAIP-122 `uri`. Defaults to the API origin. */
  uri?: string;
  store?: TokenStore;
}

interface CachedBearer {
  address: string;
  bearer: string;
  expiresAt: number;
}

interface NonceResponse {
  success: boolean;
  nonceId: string;
  message: string;
  expiresAt: number;
  authProof?: UnsignedTransaction;
}

interface VerifyResponse {
  success: boolean;
  bearer: string;
  expiresAt: number;
}

const STORAGE_KEY = 'flowguard.siwx.bearer';

/**
 * Renew this long before the stated expiry.
 *
 * A bearer that expires while in flight surfaces as a 401 on an action the user has
 * already approved in their wallet, which is the worst possible moment for it.
 */
const EXPIRY_SAFETY_MARGIN_MS = 30_000;

export class Session {
  private readonly store: TokenStore;
  private readonly domain: string | undefined;
  private readonly uri: string | undefined;
  /** De-duplicates concurrent logins so parallel calls prompt the wallet once. */
  private inFlight: Promise<string> | null = null;

  constructor(
    private readonly http: Http,
    private readonly wallet: WalletAdapter,
    options: SessionOptions = {},
  ) {
    this.store = options.store ?? new MemoryTokenStore();
    this.domain = options.domain;
    this.uri = options.uri;
  }

  /** A valid bearer, logging in only if the cached one is missing or near expiry. */
  async getBearer(): Promise<string> {
    const address = await this.wallet.getAddress();
    if (!address) throw new AuthError('Wallet is not connected.');

    const cached = await this.readCached(address);
    if (cached) return cached;

    // Several resource calls firing at once must not each open a wallet prompt.
    if (!this.inFlight) {
      this.inFlight = this.login(address).finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  /** Drop the cached bearer. Call after a 401 before retrying once. */
  async clear(): Promise<void> {
    await this.store.delete(STORAGE_KEY);
  }

  /** Authorization + address headers for an authenticated request. */
  async authHeaders(): Promise<Record<string, string>> {
    const address = await this.wallet.getAddress();
    const bearer = await this.getBearer();
    return {
      Authorization: `Bearer ${bearer}`,
      'x-user-address': address,
    };
  }

  private async readCached(address: string): Promise<string | null> {
    const raw = await this.store.get(STORAGE_KEY);
    if (!raw) return null;
    try {
      const cached = JSON.parse(raw) as Partial<CachedBearer>;
      if (cached.address !== address) return null;
      if (typeof cached.bearer !== 'string' || typeof cached.expiresAt !== 'number') return null;
      if (cached.expiresAt - EXPIRY_SAFETY_MARGIN_MS < Date.now()) return null;
      return cached.bearer;
    } catch {
      return null;
    }
  }

  private async login(address: string): Promise<string> {
    const needsTxProof = requiresTxProofLogin(this.wallet);

    const nonce = await this.http.post<NonceResponse>('/auth/nonce', {
      address,
      domain: this.domain,
      uri: this.uri,
      // Lets the API skip building a proof transaction for message-signing wallets.
      txProof: needsTxProof,
      walletType: this.wallet.walletType,
    });

    const verified = needsTxProof
      ? await this.verifyByProofTransaction(address, nonce)
      : await this.verifyByMessage(address, nonce);

    await this.store.set(
      STORAGE_KEY,
      JSON.stringify({ address, bearer: verified.bearer, expiresAt: verified.expiresAt }),
    );
    return verified.bearer;
  }

  private async verifyByMessage(address: string, nonce: NonceResponse): Promise<VerifyResponse> {
    if (typeof this.wallet.signMessage !== 'function') {
      throw new WalletError(
        'This wallet cannot sign messages. Set supportsMessageSigning: false on the ' +
          'adapter to log in with a proof transaction instead.',
      );
    }
    const signature = await this.wallet.signMessage(nonce.message);
    return this.http.post<VerifyResponse>('/auth/verify', {
      address,
      nonceId: nonce.nonceId,
      signature,
    });
  }

  /**
   * Login for wallets without usable message signing.
   *
   * The proof transaction is bound to this single-use nonce and cannot be broadcast,
   * so signing it moves no funds and proves only that the signer holds the key for
   * `address`. It is worthless to anyone else.
   */
  private async verifyByProofTransaction(
    address: string,
    nonce: NonceResponse,
  ): Promise<VerifyResponse> {
    if (!nonce.authProof) {
      throw new AuthError(
        'The API did not issue a proof transaction for this wallet. Check that the ' +
          'adapter reports a walletType the API recognises, or set txProof explicitly.',
      );
    }

    const signed = await this.wallet.signTransaction({
      ...nonce.authProof,
      broadcast: false,
      userPrompt:
        'Prove wallet ownership to FlowGuard. This transaction cannot be broadcast and moves no funds.',
    });

    const signedTransaction = readSignedHex(signed);
    if (!signedTransaction) {
      throw new WalletError('Wallet returned no signed transaction for the login proof.');
    }

    return this.http.post<VerifyResponse>('/auth/verify-tx', {
      address,
      nonceId: nonce.nonceId,
      signedTransaction,
    });
  }
}
