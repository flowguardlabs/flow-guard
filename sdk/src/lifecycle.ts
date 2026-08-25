/**
 * The build -> sign -> confirm sequence.
 *
 * Every state-changing action in FlowGuard has the same three beats, and getting
 * them in the right order with the right retry behaviour is the part that is easy
 * to get wrong when calling the API directly:
 *
 *   1. POST the action        -> the API returns an unsigned transaction
 *   2. the wallet signs it    -> hex comes back
 *   3. POST confirm-<action>  -> the API broadcasts, watches, and updates state
 *
 * Two details carry most of the risk.
 *
 * `broadcast` is forced to false. FlowGuard broadcasts through its own node so it
 * observes the txid directly; a wallet that broadcasts on its own leaves the API
 * guessing. Some wallets ignore the flag anyway, so step 3 also accepts a txid the
 * wallet reports having broadcast itself.
 *
 * The confirm step retries, but only on failures that can change outcome. A node
 * that has not yet seen a transaction broadcast a second ago returns an error that
 * is true now and false in two seconds. A malformed request returns one that will
 * be true forever. Retrying the second kind just delays the error.
 */

import { ApiError, ConfirmationPendingError, WalletError } from './errors.js';
import { readBroadcastTxHash, readSignedHex, type UnsignedTransaction, type WalletAdapter } from './wallet.js';

export interface LifecycleResult<TBuild = unknown, TConfirm = unknown> {
  /** Broadcast transaction id. */
  txHash: string;
  /** `pending` means broadcast succeeded but FlowGuard has not caught up yet. */
  state: 'confirmed' | 'pending';
  /** Whatever the build step returned, alongside the unsigned transaction. */
  build: TBuild;
  /** The confirm response, absent when state is `pending`. */
  confirm: TConfirm | undefined;
}

export interface RetryOptions {
  /** Total confirm attempts, including the first. Default 6. */
  attempts?: number;
  /** Delay before the second attempt. Default 1500ms. */
  delayMs?: number;
  /** Multiplier applied after each attempt. Default 1.2. */
  backoff?: number;
}

export interface LifecycleSteps<TBuild, TConfirm> {
  /** Ask the API to build the transaction. Must return one to sign. */
  build(): Promise<TBuild>;
  /** Pull the unsigned transaction out of the build response. */
  extractTransaction(build: TBuild): UnsignedTransaction | undefined;
  /** Tell the API the transaction is signed, so it can broadcast and record it. */
  confirm(txHash: string, build: TBuild): Promise<TConfirm>;
  /** Shown in the wallet's approval prompt. */
  prompt?: string;
  retry?: RetryOptions;
}

const DEFAULT_ATTEMPTS = 6;
const DEFAULT_DELAY_MS = 1500;
const DEFAULT_BACKOFF = 1.2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Phrases the API uses when a node has not yet seen a just-broadcast transaction.
 *
 * Matching on message text is unpleasant, but these paths return 400 rather than a
 * distinct code, and treating them as fatal would fail actions that are actually
 * fine a second later. Narrow on purpose: a broader match would swallow real 400s.
 */
const RETRYABLE_MESSAGE_FRAGMENTS = [
  'not found',
  'not yet',
  'no such mempool',
  'txn-mempool',
  'missing inputs',
  'try again',
];

function isRetryableConfirmFailure(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.retryable) return true;
  if (error.status !== 400 && error.status !== 404) return false;
  const message = error.message.toLowerCase();
  return RETRYABLE_MESSAGE_FRAGMENTS.some((fragment) => message.includes(fragment));
}

/**
 * Run one action end to end.
 *
 * Throws `ConfirmationPendingError` — carrying the txid — when the transaction was
 * broadcast but the API never acknowledged it. That is deliberately not the same as
 * a failure: the money may well have moved, and the caller needs the txid to find out.
 */
export async function runLifecycle<TBuild, TConfirm>(
  wallet: WalletAdapter,
  steps: LifecycleSteps<TBuild, TConfirm>,
): Promise<LifecycleResult<TBuild, TConfirm>> {
  const build = await steps.build();

  const unsigned = steps.extractTransaction(build);
  if (!unsigned) {
    throw new WalletError(
      'The API did not return a transaction to sign for this action. This usually means ' +
        'a precondition was not met — check the build response.',
    );
  }

  const signed = await wallet.signTransaction({
    ...unsigned,
    broadcast: false,
    ...(steps.prompt !== undefined ? { userPrompt: steps.prompt } : {}),
  });

  // A wallet that broadcast anyway hands back a txid instead of hex. Both are fine;
  // the confirm step takes a txid either way.
  const alreadyBroadcastHash = readBroadcastTxHash(signed);
  const signedHex = readSignedHex(signed);

  if (!alreadyBroadcastHash && !signedHex) {
    throw new WalletError('Wallet returned neither signed transaction hex nor a transaction id.');
  }

  const txHash = alreadyBroadcastHash ?? signedHex!;

  const attempts = Math.max(1, steps.retry?.attempts ?? DEFAULT_ATTEMPTS);
  const backoff = Math.max(1, steps.retry?.backoff ?? DEFAULT_BACKOFF);
  let delay = Math.max(250, steps.retry?.delayMs ?? DEFAULT_DELAY_MS);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const confirm = await steps.confirm(txHash, build);
      return { txHash, state: 'confirmed', build, confirm };
    } catch (error) {
      lastError = error;
      if (!isRetryableConfirmFailure(error)) throw error;
      if (attempt < attempts) {
        await sleep(delay);
        delay = Math.round(delay * backoff);
      }
    }
  }

  throw new ConfirmationPendingError(
    txHash,
    attempts,
    lastError instanceof Error
      ? `Transaction ${txHash} was broadcast but the API did not confirm it after ${attempts} attempts ` +
          `(last error: ${lastError.message}). It may still settle — re-check before treating it as failed.`
      : undefined,
  );
}
