/**
 * Resolve a CashToken's BCMR metadata (icon/name/symbol/decimals) so FlowGuard
 * renders a real token identity instead of a raw category id, and scales amounts
 * the way wallets do. Decimals + branding live off-chain in the BCMR registry; we
 * read them from a public indexer and cache per process.
 *
 * The cache is also exposed synchronously (getCachedTokenMeta) so the string
 * formatters can upgrade "CT 963d…" -> "STAMP" once a component has fetched it.
 */

export interface TokenMeta {
  decimals: number;
  symbol?: string;
  name?: string;
  iconUri?: string;
  web?: string;
  description?: string;
}

export type BchNetwork = 'chipnet' | 'mainnet';

export const DEFAULT_NETWORK: BchNetwork =
  import.meta.env.VITE_BCH_NETWORK === 'mainnet' ? 'mainnet' : 'chipnet';

const metaCache = new Map<string, TokenMeta | null>();
const inflight = new Map<string, Promise<TokenMeta | null>>();

function clampDecimals(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(18, Math.trunc(n))) : 0;
}

function bcmrIndexerBase(network: BchNetwork): string | null {
  return network === 'mainnet' ? 'https://bcmr.paytaca.com' : null;
}

function cacheKey(category: string, network: BchNetwork): string {
  return `${network}:${category.toLowerCase()}`;
}

/** Synchronous cache read — null if never fetched or no BCMR entry. */
export function getCachedTokenMeta(category?: string | null, network: BchNetwork = DEFAULT_NETWORK): TokenMeta | null {
  if (!category) return null;
  return metaCache.get(cacheKey(category, network)) ?? null;
}

export async function resolveTokenMeta(
  category: string,
  network: BchNetwork = DEFAULT_NETWORK,
): Promise<TokenMeta | null> {
  if (!category || !/^[0-9a-fA-F]{64}$/.test(category)) return null;
  const key = cacheKey(category, network);
  if (metaCache.has(key)) return metaCache.get(key) ?? null;
  const pending = inflight.get(key);
  if (pending) return pending;

  const base = bcmrIndexerBase(network);
  if (!base) {
    metaCache.set(key, null);
    return null;
  }

  const task = (async () => {
    try {
      const res = await fetch(`${base}/api/tokens/${category}/`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        metaCache.set(key, null);
        return null;
      }
      const data = (await res.json()) as {
        name?: string;
        description?: string;
        uris?: { icon?: string; web?: string };
        token?: { decimals?: unknown; symbol?: string };
      };
      const meta: TokenMeta = {
        decimals: clampDecimals(data?.token?.decimals),
        symbol: data?.token?.symbol,
        name: data?.name,
        iconUri: data?.uris?.icon,
        web: data?.uris?.web,
        description: data?.description,
      };
      metaCache.set(key, meta);
      return meta;
    } catch {
      metaCache.set(key, null);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, task);
  return task;
}
