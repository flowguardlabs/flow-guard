import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, X } from 'lucide-react';
import { getExplorerTxUrl } from '../../utils/blockchain';
import { TX_NOTICE_EVENT, type TransactionNoticeDetail } from '../../utils/txNotice';

function shortenTxHash(txHash: string): string {
  if (txHash.length <= 22) {
    return txHash;
  }
  return `${txHash.slice(0, 12)}...${txHash.slice(-10)}`;
}

export function TransactionNoticeToast() {
  const [notice, setNotice] = useState<TransactionNoticeDetail | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleNotice = (event: Event) => {
      const customEvent = event as CustomEvent<TransactionNoticeDetail>;
      if (!customEvent.detail?.txHash) {
        return;
      }
      setCopied(false);
      setNotice(customEvent.detail);
    };

    window.addEventListener(TX_NOTICE_EVENT, handleNotice as EventListener);
    return () => {
      window.removeEventListener(TX_NOTICE_EVENT, handleNotice as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timeout = window.setTimeout(() => setNotice(null), 18000);
    return () => window.clearTimeout(timeout);
  }, [notice?.timestamp]);

  const txUrl = useMemo(() => {
    if (!notice) {
      return '';
    }
    return getExplorerTxUrl(notice.txHash, notice.network);
  }, [notice]);

  if (!notice) {
    return null;
  }

  const label = notice.label || 'Transaction broadcast';
  const displayedHash = shortenTxHash(notice.txHash);

  const copyTxHash = async () => {
    try {
      await navigator.clipboard.writeText(notice.txHash);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[120] w-[min(92vw,32rem)]">
      <div className="rounded-xl border border-primary/25 bg-surface p-4 shadow-xl backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-sans font-semibold text-textPrimary">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              {label}
            </p>
            <p className="mt-1 break-all font-mono text-xs text-textMuted">{displayedHash}</p>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="rounded-md p-1 text-textMuted transition-colors hover:bg-surfaceAlt hover:text-textPrimary"
            aria-label="Close transaction notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          <a
            href={txUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-mono font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            View on Explorer
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          <button
            type="button"
            onClick={copyTxHash}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-mono text-textPrimary transition-colors hover:bg-surfaceAlt"
          >
            {copied ? 'Copied' : 'Copy Hash'}
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
