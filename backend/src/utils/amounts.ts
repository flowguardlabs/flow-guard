const SATOSHIS_PER_BCH = 100_000_000;

export type TokenTypeLike = 'BCH' | 'CASHTOKENS' | 'FUNGIBLE_TOKEN' | null | undefined;

function finiteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function bchToSatoshis(amountBch: number): number {
  return Math.max(0, Math.round(finiteNumber(amountBch) * SATOSHIS_PER_BCH));
}

export function satoshisToBch(amountSats: number): number {
  return finiteNumber(amountSats) / SATOSHIS_PER_BCH;
}

export function isFungibleTokenType(tokenType: TokenTypeLike): boolean {
  return tokenType === 'CASHTOKENS' || tokenType === 'FUNGIBLE_TOKEN';
}

function clampDecimals(decimals: unknown): number {
  return Math.max(0, Math.min(18, Math.trunc(finiteNumber(decimals))));
}

/**
 * Convert DB/display amount to on-chain unit:
 * - BCH => satoshis
 * - CashTokens => token base units (whole tokens x 10^decimals)
 *
 * `decimals` is the token's BCMR decimals; whole tokens the user typed are
 * scaled to base units so the covenant/vault move the same quantity a wallet
 * would show. Defaults to 0 (base-unit passthrough) for backward compatibility.
 */
export function displayAmountToOnChain(amount: number, tokenType: TokenTypeLike, decimals = 0): number {
  if (!isFungibleTokenType(tokenType)) return bchToSatoshis(amount);
  const scale = 10 ** clampDecimals(decimals);
  return Math.max(0, Math.round(finiteNumber(amount) * scale));
}

/**
 * Convert on-chain amount to DB/display unit:
 * - BCH satoshis => BCH
 * - CashTokens base units => whole tokens (base units / 10^decimals)
 */
export function onChainAmountToDisplay(amount: number, tokenType: TokenTypeLike, decimals = 0): number {
  if (!isFungibleTokenType(tokenType)) return satoshisToBch(amount);
  const scale = 10 ** clampDecimals(decimals);
  return Math.max(0, finiteNumber(amount) / scale);
}
