import type { WcTransactionObject } from 'cashscript';
import { cashAddressToLockingBytecode, hexToBin } from '@bitauth/libauth';
import { toNonNegativeBigInt, type BigIntLike } from './bigint.js';

type NftCapability = 'none' | 'mutable' | 'minting';

export interface FundingInput {
  txid: string;
  vout: number;
  satoshis: BigIntLike;
  tokenCategory?: string;
  tokenAmount?: BigIntLike;
  tokenNftCapability?: NftCapability;
  tokenNftCommitment?: string;
}

export interface FundingOutput {
  to: string;
  amount: BigIntLike;
  token?: {
    category: string;
    amount: BigIntLike;
    nft?: {
      commitment: string;
      capability: NftCapability;
    };
  };
}

function getLockingBytecode(address: string): Uint8Array {
  const decoded = cashAddressToLockingBytecode(address);
  if (typeof decoded === 'string') throw new Error(decoded);
  return decoded.bytecode;
}

function toToken(
  category?: string,
  amount?: BigIntLike,
  nftCapability?: NftCapability,
  nftCommitment?: string,
) {
  if (!category || amount === undefined) return undefined;

  const tokenAmount = toNonNegativeBigInt(amount, 'token amount');

  return {
    category: hexToBin(category),
    amount: tokenAmount,
    ...(nftCapability && nftCommitment
      ? {
          nft: {
            capability: nftCapability,
            commitment: hexToBin(nftCommitment),
          },
        }
      : {}),
  };
}

/**
 * Build a WalletConnect-compatible tx object for user-funded covenant creation.
 * Inputs are standard P2PKH UTXOs controlled by `inputOwnerAddress`.
 */
export function buildFundingWcTransaction(params: {
  inputOwnerAddress: string;
  inputs: FundingInput[];
  outputs: FundingOutput[];
  userPrompt: string;
  broadcast?: boolean;
}): WcTransactionObject {
  const inputLockingBytecode = getLockingBytecode(params.inputOwnerAddress);

  const txInputs = params.inputs.map((input) => ({
    outpointTransactionHash: hexToBin(input.txid).slice().reverse(),
    outpointIndex: input.vout,
    unlockingBytecode: new Uint8Array(0),
    sequenceNumber: 0xfffffffe,
  }));

  const txOutputs = params.outputs.map((output) => {
    const outputToken = output.token
      ? toToken(
          output.token.category,
          output.token.amount,
          output.token.nft?.capability,
          output.token.nft?.commitment,
        )
      : undefined;

    return {
      lockingBytecode: getLockingBytecode(output.to),
      valueSatoshis: toNonNegativeBigInt(output.amount, 'output amount'),
      ...(outputToken ? { token: outputToken } : {}),
    };
  });

  const sourceOutputs = params.inputs.map((input, index) => {
    const inputToken = input.tokenCategory && input.tokenAmount !== undefined
      ? toToken(
          input.tokenCategory,
          input.tokenAmount,
          input.tokenNftCapability,
          input.tokenNftCommitment,
        )
      : undefined;

    return {
      outpointTransactionHash: txInputs[index].outpointTransactionHash,
      outpointIndex: input.vout,
      unlockingBytecode: new Uint8Array(0),
      sequenceNumber: 0xfffffffe,
      lockingBytecode: inputLockingBytecode,
      valueSatoshis: toNonNegativeBigInt(input.satoshis, 'input satoshis'),
      ...(inputToken ? { token: inputToken } : {}),
    };
  });

  return {
    transaction: {
      version: 2,
      inputs: txInputs,
      outputs: txOutputs,
      locktime: 0,
    } as any,
    sourceOutputs: sourceOutputs as any,
    broadcast: params.broadcast ?? true,
    userPrompt: params.userPrompt,
  };
}
