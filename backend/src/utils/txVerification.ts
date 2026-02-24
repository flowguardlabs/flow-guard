import { ElectrumNetworkProvider } from 'cashscript';
import {
  cashAddressToLockingBytecode,
  decodeTransaction,
  hexToBin,
} from '@bitauth/libauth';

const providers: Partial<Record<string, ElectrumNetworkProvider>> = {};

function getProvider(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
  if (!providers[network]) {
    providers[network] = new ElectrumNetworkProvider(network);
  }
  return providers[network]!;
}

export async function transactionExists(
  txHash: string,
  network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet',
): Promise<boolean> {
  try {
    const tx = await getProvider(network).getRawTransaction(txHash);
    return Boolean(tx);
  } catch {
    return false;
  }
}

function asTransactionHex(rawTx: unknown): string | null {
  if (typeof rawTx === 'string') {
    return rawTx;
  }

  if (rawTx && typeof rawTx === 'object') {
    const candidate = rawTx as Record<string, unknown>;
    const keys = ['hex', 'raw', 'rawTx', 'txHex', 'transaction'];
    for (const key of keys) {
      if (typeof candidate[key] === 'string') {
        return candidate[key] as string;
      }
    }
  }

  return null;
}

function bytecodeEqual(a?: Uint8Array, b?: Uint8Array): boolean {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function tokenCategoryMatches(actual: Uint8Array, expectedHex: string): boolean {
  const expected = hexToBin(expectedHex);
  if (bytecodeEqual(actual, expected)) {
    return true;
  }
  return bytecodeEqual(actual, expected.slice().reverse());
}

export interface ExpectedOutput {
  address: string;
  minimumSatoshis?: bigint;
  tokenCategory?: string;
  minimumTokenAmount?: bigint;
  requireNft?: boolean;
  requiredNftCapability?: 'none' | 'mutable' | 'minting';
  minimumNftCommitmentBytes?: number;
}

/**
 * Verify a transaction includes an output paying a specific address.
 * Optionally verifies minimum satoshis and token category/amount.
 */
export async function transactionHasExpectedOutput(
  txHash: string,
  expected: ExpectedOutput,
  network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet',
): Promise<boolean> {
  try {
    const rawTx = await getProvider(network).getRawTransaction(txHash);
    const txHex = asTransactionHex(rawTx);
    if (!txHex) return false;

    const decoded = decodeTransaction(hexToBin(txHex)) as any;
    const outputs = Array.isArray(decoded?.outputs) ? decoded.outputs : [];
    if (!outputs.length) return false;

    const locking = cashAddressToLockingBytecode(expected.address);
    if (typeof locking === 'string') return false;
    const expectedLocking = locking.bytecode;
    const minSats = expected.minimumSatoshis ?? 0n;

    for (const output of outputs) {
      if (!bytecodeEqual(output.lockingBytecode, expectedLocking)) {
        continue;
      }

      const valueSats = BigInt(output.valueSatoshis ?? 0);
      if (valueSats < minSats) {
        continue;
      }

      if (expected.tokenCategory) {
        if (!output.token?.category) {
          continue;
        }
        if (!tokenCategoryMatches(output.token.category, expected.tokenCategory)) {
          continue;
        }
      }

      if (expected.minimumTokenAmount !== undefined) {
        const tokenAmount = BigInt(output.token?.amount ?? 0);
        if (tokenAmount < expected.minimumTokenAmount) {
          continue;
        }
      }

      if (expected.requireNft) {
        const nft = output.token?.nft;
        if (!nft) {
          continue;
        }
        if (expected.requiredNftCapability && nft.capability !== expected.requiredNftCapability) {
          continue;
        }
        if (expected.minimumNftCommitmentBytes !== undefined) {
          const commitmentLength = nft.commitment?.length ?? 0;
          if (commitmentLength < expected.minimumNftCommitmentBytes) {
            continue;
          }
        }
      }

      return true;
    }

    return false;
  } catch {
    return false;
  }
}
