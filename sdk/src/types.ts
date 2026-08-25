/** Response shapes for the endpoints the SDK covers. */

import type { UnsignedTransaction } from './wallet.js';

export type PaymentInterval = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY';

/** `PENDING` until the contract is funded; the contract is live only from `ACTIVE`. */
export type PaymentStatus = 'PENDING' | 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';

export type TokenType = 'BCH' | 'FUNGIBLE_TOKEN';

export interface Payment {
  id: string;
  /** Human-facing identifier, e.g. `#FG-PAY-004`. */
  payment_id: string;
  vault_id: string;
  sender: string;
  recipient: string;
  recipient_name: string | null;
  token_type: TokenType;
  token_category: string | null;
  amount_per_period: number;
  interval: PaymentInterval;
  interval_seconds: number;
  /** Unix seconds. */
  start_date: number;
  /** Unix seconds. 0 means open-ended. */
  end_date: number;
  /** Unix seconds. The instant the next period may be pulled. */
  next_payment_date: number;
  total_paid: number;
  payment_count: number;
  status: PaymentStatus;
  contract_address: string | null;
  tx_hash: string | null;
  created_at: number;
  latest_event?: unknown;
}

export interface CreatePaymentInput {
  /** P2PKH cash address. Contract addresses are rejected. */
  recipient: string;
  recipientName?: string;
  amountPerPeriod: number;
  interval: PaymentInterval;
  /** Unix seconds. Defaults to now. */
  startDate?: number;
  /** Unix seconds. Omit or 0 for open-ended. */
  endDate?: number;
  tokenType?: TokenType;
  tokenCategory?: string;
  cancelable?: boolean;
  pausable?: boolean;
  vaultId?: string;
}

export interface CreatePaymentResult {
  success: boolean;
  message: string;
  payment: Payment;
  deployment: {
    contractAddress: string;
    paymentId: string;
    onChainPaymentId: string;
    fundingRequired: boolean;
    cancelable: boolean;
  };
}

export interface PaymentFundingInfo {
  success: true;
  fundingInfo: {
    contractAddress: string;
    amount: number;
    onChainAmount: number;
    tokenType: TokenType;
    inputs: unknown[];
    outputs: unknown[];
    fee: number;
  };
  wcTransaction: UnsignedTransaction;
}

/**
 * Returned instead of funding info when the sender's UTXO set cannot produce the
 * genesis output the covenant needs. A consolidation transaction must be signed and
 * broadcast first, then funding info re-fetched.
 */
export interface PaymentFundingPreparationRequired {
  success: false;
  requiresPreparation: true;
  preparationTransaction: UnsignedTransaction;
  message: string;
}

export type PaymentFundingResponse = PaymentFundingInfo | PaymentFundingPreparationRequired;

export function needsPreparation(
  response: PaymentFundingResponse,
): response is PaymentFundingPreparationRequired {
  return response.success === false && response.requiresPreparation === true;
}

export interface ListPaymentsResult {
  success: boolean;
  payments: Payment[];
  total: number;
}

/** Build responses for pause / resume / cancel / claim all share this shape. */
export interface PaymentActionBuildResult {
  success: boolean;
  wcTransaction?: UnsignedTransaction;
  message?: string;
  [key: string]: unknown;
}

export interface ConfirmResult {
  success: boolean;
  state?: 'confirmed' | 'pending';
  retryable?: boolean;
  message?: string;
  [key: string]: unknown;
}

export interface StatusPayload {
  updatedAt: string;
  overall: 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'maintenance' | 'unknown';
  network: { name: 'mainnet' | 'chipnet'; isMainnet: boolean; displayName: string; testnetWarning: boolean };
  chain: { height: number | null; latencyMs: number | null; error: string | null };
  components: Array<{ id: string; name: string; group: string; status: string; description: string }>;
  summary: { operational: number; degraded: number; outage: number };
}

export interface BchPrice {
  usd: number;
  source: string;
  updatedAt: number;
}
