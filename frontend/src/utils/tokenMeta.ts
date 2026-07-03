/**
 * Resolve a CashToken's BCMR metadata (decimals/symbol/name) so the create form
 * scales whole-token amounts the same way the sender's wallet does. Decimals live
 * off-chain in the BCMR registry; we read them from a public indexer and cache.
 */

export interface TokenMeta {
  decimals: number;
  symbol?: string;
  name?: string;
}

type BchNetwork = 'chipnet' | 'mainnet';

const metaCache = new Map<string, TokenMeta | null>();

function clampDecimals(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(18, Math.trunc(n))) : 0;
}

function bcmrIndexerBase(network: BchNetwork): string | null {
  return network === 'mainnet' ? 'https://bcmr.paytaca.com' : null;
}

export async function resolveTokenMeta(
  category: string,
  network: BchNetwork = 'mainnet',
): Promise<TokenMeta | null> {
  if (!category || !/^[0-9a-fA-F]{64}$/.test(category)) return null;
  const key = `${network}:${category.toLowerCase()}`;
  if (metaCache.has(key)) return metaCache.get(key) ?? null;

  const base = bcmrIndexerBase(network);
  if (!base) {
    metaCache.set(key, null);
    return null;
  }

  try {
    const res = await fetch(`${base}/api/tokens/${category}/`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      metaCache.set(key, null);
      return null;
    }
    const data = (await res.json()) as { name?: string; token?: { decimals?: unknown; symbol?: string } };
    const meta: TokenMeta = {
      decimals: clampDecimals(data?.token?.decimals),
      symbol: data?.token?.symbol,
      name: data?.name,
    };
    metaCache.set(key, meta);
    return meta;
  } catch {
    metaCache.set(key, null);
    return null;
  }
}
