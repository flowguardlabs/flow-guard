export type TransactionNoticeNetwork = 'chipnet' | 'mainnet';

export interface TransactionNotice {
  txHash: string;
  network: TransactionNoticeNetwork;
  label?: string;
}

export interface TransactionNoticeDetail extends TransactionNotice {
  timestamp: number;
}

export const TX_NOTICE_EVENT = 'flowguard:tx-notice';

export function normalizeWalletNetwork(network?: string | null): TransactionNoticeNetwork {
  if (network === 'mainnet') {
    return 'mainnet';
  }
  return 'chipnet';
}

export function emitTransactionNotice(notice: TransactionNotice): void {
  if (typeof window === 'undefined') {
    return;
  }

  const detail: TransactionNoticeDetail = {
    ...notice,
    timestamp: Date.now(),
  };

  window.dispatchEvent(new CustomEvent<TransactionNoticeDetail>(TX_NOTICE_EVENT, { detail }));
}
