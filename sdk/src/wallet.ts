/**
 * The wallet contract.
 *
 * Kept as small as the protocol actually requires so that any BCH wallet can be
 * adapted without pulling a wallet SDK into this package. FlowGuard's own frontend
 * satisfies it with WalletConnect, WizardConnect, Cashonize, Paytaca and OPTN
 * adapters; none of that is imported here.
 */

/** One input's source output, as the wallet needs it to build a signature. */
export interface SourceOutput {
  outpointTransactionHash: string;
  outpointIndex: number;
  sequenceNumber: number;
  unlockingBytecode: string;
  lockingBytecode: string;
  valueSatoshis: string;
  token?: {
    category: string;
    amount: string;
    nft?: { capability: string; commitment: string };
  };
  contract?: {
    abiFunction: { name: string; inputs: Array<{ name: string; type: string }> };
    redeemScript: string;
    artifact: { contractName: string };
  };
}

/**
 * An unsigned transaction as the API emits it: hex plus the source outputs needed
 * to sign it. The wire shape is WalletConnect's `bch_signTransaction` payload,
 * which is what every BCH wallet with covenant support already speaks.
 */
export interface UnsignedTransaction {
  transaction: string;
  sourceOutputs: SourceOutput[];
  /**
   * Always sent as `false` by this SDK. FlowGuard broadcasts through its own node so
   * it observes the txid, rather than asking the wallet to broadcast and then trying
   * to work out what happened.
   */
  broadcast?: boolean;
  /** Shown by the wallet in its approval prompt. */
  userPrompt?: string;
}

export interface SignedTransactionResult {
  /** Signed transaction hex. Some wallets return an object; adapters normalise. */
  signedTransaction?: string;
  /** Present when a wallet broadcast on its own despite `broadcast: false`. */
  signedTransactionHash?: string;
  [key: string]: unknown;
}

/**
 * What the SDK needs from a wallet.
 *
 * `signMessage` is optional on purpose. WizardConnect has no message-signing action
 * at all, and OPTN has one whose Bitcoin-signed-message length prefix is raw hex
 * rather than a CompactSize varint, so it cannot sign FlowGuard's ~380-byte CAIP-122
 * login string. Both authenticate by signing a non-broadcastable proof transaction
 * instead — see `supportsMessageSigning`.
 */
export interface WalletAdapter {
  /** Connected cash address. Must be P2PKH for payments and streams. */
  getAddress(): Promise<string> | string;

  /** Sign an arbitrary string. Omit when the wallet cannot do this usefully. */
  signMessage?(message: string): Promise<string>;

  /** Sign a covenant-aware transaction. Required for every state-changing action. */
  signTransaction(tx: UnsignedTransaction): Promise<SignedTransactionResult | string>;

  /**
   * Set `false` when the wallet has no usable message signing, which routes login
   * through the proof-transaction path. Left undefined, the SDK infers it from the
   * presence of `signMessage`.
   */
  supportsMessageSigning?: boolean;

  /** Free-form label forwarded to the API so it can pick the right login path. */
  walletType?: string;
}

/** True when this wallet must log in by signing a proof transaction. */
export function requiresTxProofLogin(wallet: WalletAdapter): boolean {
  if (wallet.supportsMessageSigning === false) return true;
  if (wallet.supportsMessageSigning === true) return false;
  return typeof wallet.signMessage !== 'function';
}

/** Normalise the several shapes wallets return from a signing call. */
export function readSignedHex(result: SignedTransactionResult | string): string | undefined {
  if (typeof result === 'string') return result.length > 0 ? result : undefined;
  if (typeof result.signedTransaction === 'string' && result.signedTransaction.length > 0) {
    return result.signedTransaction;
  }
  return undefined;
}

/** A txid, when the wallet broadcast on its own instead of returning hex. */
export function readBroadcastTxHash(
  result: SignedTransactionResult | string,
): string | undefined {
  if (typeof result === 'string') return undefined;
  const hash = result.signedTransactionHash;
  return typeof hash === 'string' && hash.length > 0 ? hash : undefined;
}
