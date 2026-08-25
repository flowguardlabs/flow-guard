/**
 * Error types.
 *
 * The API answers failures as `{ error, message }` with a mix of shapes across
 * routers, so callers were left doing `err.message.includes(...)` to decide what
 * happened. These classes give a `catch` block something structural to branch on.
 */

/** Base class, so `catch (e) { if (e instanceof FlowGuardError) }` covers everything. */
export class FlowGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A non-2xx response. `status` and `code` are what you branch on. */
export class ApiError extends FlowGuardError {
  readonly status: number;
  /** The API's `error` field, e.g. `RATE_LIMIT_EXCEEDED`, `ORIGIN_NOT_ALLOWED`. */
  readonly code: string | undefined;
  readonly path: string;
  readonly body: unknown;

  constructor(args: {
    status: number;
    path: string;
    message: string;
    code?: string;
    body?: unknown;
  }) {
    super(args.message);
    this.status = args.status;
    this.code = args.code;
    this.path = args.path;
    this.body = args.body;
  }

  /**
   * True for failures where retrying the identical request can succeed: the node
   * has not yet seen a freshly broadcast transaction, an upstream timed out, or we
   * are being rate limited. Distinct from a 400, which will fail identically forever.
   */
  get retryable(): boolean {
    if (this.status === 429) return true;
    if (this.status >= 500) return true;
    return false;
  }
}

/** The wallet declined, or is missing a capability the requested action needs. */
export class WalletError extends FlowGuardError {}

/** SIWX login failed: nonce expired, signature rejected, or address mismatch. */
export class AuthError extends FlowGuardError {}

/**
 * The transaction was signed and broadcast, but the API had not acknowledged it
 * before we stopped retrying.
 *
 * This is deliberately not a plain failure. The chain state may well be correct —
 * the funds moved — and only FlowGuard's record of it is behind. Callers should
 * surface it as pending and re-check, never as "your payment failed", and the
 * txHash is here so they can.
 */
export class ConfirmationPendingError extends FlowGuardError {
  readonly txHash: string;
  readonly attempts: number;

  constructor(txHash: string, attempts: number, message?: string) {
    super(
      message ??
        `Transaction ${txHash} was broadcast but not confirmed by the API after ${attempts} attempts. ` +
          'It may still settle — re-check before treating it as failed.',
    );
    this.txHash = txHash;
    this.attempts = attempts;
  }
}
