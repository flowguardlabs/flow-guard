import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  resolveTokenMeta,
  getCachedTokenMeta,
  DEFAULT_NETWORK,
  type TokenMeta,
  type BchNetwork,
} from '../../utils/tokenMeta';
import { shortenCategory } from '../../utils/tokenFormat';

/**
 * Fetch a CashToken's BCMR metadata and re-render when it lands. Seeds from the
 * synchronous cache so an already-resolved token paints instantly.
 */
export function useTokenMeta(category?: string | null, network: BchNetwork = DEFAULT_NETWORK): TokenMeta | null {
  const [meta, setMeta] = useState<TokenMeta | null>(() => getCachedTokenMeta(category, network));

  useEffect(() => {
    let alive = true;
    if (!category) {
      setMeta(null);
      return;
    }
    const cached = getCachedTokenMeta(category, network);
    if (cached) setMeta(cached);
    resolveTokenMeta(category, network).then((m) => {
      if (alive) setMeta(m);
    });
    return () => {
      alive = false;
    };
  }, [category, network]);

  return meta;
}

function initials(symbol?: string, category?: string | null): string {
  if (symbol) return symbol.slice(0, 3).toUpperCase();
  if (category) return category.slice(0, 2).toUpperCase();
  return 'CT';
}

export function TokenAvatar({
  iconUri,
  symbol,
  category,
  size = 20,
}: {
  iconUri?: string;
  symbol?: string;
  category?: string | null;
  size?: number;
}) {
  const [errored, setErrored] = useState(false);
  const dimension = { width: size, height: size };

  if (!iconUri || errored) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-surfaceAlt font-semibold text-textMuted"
        style={{ ...dimension, fontSize: Math.max(8, Math.round(size * 0.36)) }}
      >
        {initials(symbol, category)}
      </span>
    );
  }

  return (
    <img
      src={iconUri}
      alt={symbol || 'token'}
      loading="lazy"
      onError={() => setErrored(true)}
      className="shrink-0 rounded-full object-cover ring-1 ring-border"
      style={dimension}
    />
  );
}

/** Inline "icon + SYMBOL" for tables, chips, and amount suffixes. */
export function TokenBadge({
  category,
  network,
  size = 16,
  className = '',
}: {
  category?: string | null;
  network?: BchNetwork;
  size?: number;
  className?: string;
}) {
  const meta = useTokenMeta(category, network);
  const label = meta?.symbol || (category ? `CT ${shortenCategory(category)}` : 'tokens');
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <TokenAvatar iconUri={meta?.iconUri} symbol={meta?.symbol} category={category} size={size} />
      <span className="font-medium text-textPrimary">{label}</span>
    </span>
  );
}

/** Rich identity block: icon + name + symbol chip + category link to an explorer. */
export function TokenIdentity({
  category,
  network,
  className = '',
}: {
  category?: string | null;
  network?: BchNetwork;
  className?: string;
}) {
  const meta = useTokenMeta(category, network);
  if (!category) return null;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <TokenAvatar iconUri={meta?.iconUri} symbol={meta?.symbol} category={category} size={40} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-textPrimary">{meta?.name || 'CashToken'}</span>
          {meta?.symbol && (
            <span className="rounded bg-surfaceAlt px-1.5 py-0.5 text-[11px] font-medium text-textMuted">
              {meta.symbol}
            </span>
          )}
        </div>
        <a
          href={`https://tokenexplorer.cash/?tokenId=${category}`}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-textMuted transition-colors hover:text-accent"
          title={category}
        >
          {shortenCategory(category)}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
