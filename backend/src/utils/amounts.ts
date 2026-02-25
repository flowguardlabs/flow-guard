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

/**
 * Convert DB/display amount to on-chain unit:
 * - BCH => satoshis
 * - CashTokens => token base units (integer)
 */
export function displayAmountToOnChain(amount: number, tokenType: TokenTypeLike): number {
  return isFungibleTokenType(tokenType) ? Math.max(0, Math.round(finiteNumber(amount))) : bchToSatoshis(amount);
}

/**
 * Convert on-chain amount to DB/display unit:
 * - BCH satoshis => BCH
 * - CashTokens => token base units
 */
export function onChainAmountToDisplay(amount: number, tokenType: TokenTypeLike): number {
  return isFungibleTokenType(tokenType) ? Math.max(0, Math.trunc(finiteNumber(amount))) : satoshisToBch(amount);
}
