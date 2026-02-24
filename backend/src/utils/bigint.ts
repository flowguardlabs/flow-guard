export type BigIntLike = bigint | number | string;

function decimalStringToBigInt(value: string, name: string): bigint {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error(`${name} must be an integer-compatible value`);
  }
  return BigInt(trimmed);
}

export function toBigIntStrict(value: BigIntLike, name: string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error(`${name} must be a finite integer`);
    }
    return BigInt(value);
  }
  return decimalStringToBigInt(value, name);
}

export function toNonNegativeBigInt(value: BigIntLike, name: string): bigint {
  const parsed = toBigIntStrict(value, name);
  if (parsed < 0n) {
    throw new Error(`${name} must be >= 0`);
  }
  return parsed;
}

export function bigIntToJsonNumber(value: bigint, name: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${name} exceeds JavaScript safe integer range`);
  }
  return Number(value);
}
