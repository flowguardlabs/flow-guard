/**
 * Resolve a CashToken's BCMR metadata (decimals/symbol/name) so FlowGuard scales
 * whole-token amounts the same way a wallet does. Decimals live off-chain in the
 * BCMR registry, so we read them from a public BCMR indexer and cache per process.
 */

export interface TokenMeta {
  decimals: number;
  symbol?: string;
  name?: string;
}

type BchNetwork = 'chipnet' | 'mainnet' | string | undefined;

const metaCache = new Map<string, TokenMeta | null>();

function clampDecimals(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(18, Math.trunc(n))) : 0;
}

function bcmrIndexerBase(network: BchNetwork): string | null {
  return network === 'mainnet' ? 'https://bcmr.paytaca.com' : null;
}

export async function resolveTokenMeta(category: string, network: BchNetwork): Promise<TokenMeta | null> {
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

/**
 * Decimals source-of-truth for a token stream. Prefers the on-chain BCMR registry
 * (so FlowGuard matches the sender's wallet); falls back to a caller-provided hint
 * (e.g. chipnet, where no public indexer exists), then 0.
 */
export async function resolveTokenDecimals(
  category: string,
  network: BchNetwork,
  fallback: unknown = 0,
): Promise<number> {
  const meta = await resolveTokenMeta(category, network);
  if (meta) return meta.decimals;
  return clampDecimals(fallback);
}
