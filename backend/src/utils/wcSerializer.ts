import { binToHex, encodeTransaction } from '@bitauth/libauth';
import type { WcTransactionObject } from 'cashscript';

export interface SerializedWcTransaction {
  transaction: string; // hex-encoded
  sourceOutputs: SerializedSourceOutput[];
  broadcast?: boolean;
  userPrompt?: string;
}

export interface SerializedSourceOutput {
  outpointTransactionHash?: string;
  outpointIndex?: number;
  unlockingBytecode?: string;
  sequenceNumber?: number;
  lockingBytecode: string;
  valueSatoshis: string;
  token?: {
    category: string;
    amount: string;
    nft?: {
      capability: 'none' | 'mutable' | 'minting';
      commitment: string;
    };
  };
  contract?: {
    abiFunction: object;
    redeemScript: string;
    artifact: object;
  };
}

export function serializeWcTransaction(wcTx: WcTransactionObject): SerializedWcTransaction {
  const txHex = binToHex(encodeTransaction(wcTx.transaction));

  const sourceOutputs: SerializedSourceOutput[] = wcTx.sourceOutputs.map((so) => {
    const serialized: SerializedSourceOutput = {
      lockingBytecode: binToHex(so.lockingBytecode),
      valueSatoshis: so.valueSatoshis.toString(),
    };

    if (so.outpointTransactionHash) {
      serialized.outpointTransactionHash = binToHex(so.outpointTransactionHash);
    }
    if (so.outpointIndex !== undefined) {
      serialized.outpointIndex = so.outpointIndex;
    }
    if (so.unlockingBytecode !== undefined) {
      serialized.unlockingBytecode = binToHex(so.unlockingBytecode);
    }
    if (so.sequenceNumber !== undefined) {
      serialized.sequenceNumber = so.sequenceNumber;
    }

    if (so.token) {
      serialized.token = {
        category: binToHex(so.token.category),
        amount: so.token.amount.toString(),
      };
      if (so.token.nft) {
        serialized.token.nft = {
          capability: so.token.nft.capability,
          commitment: binToHex(so.token.nft.commitment),
        };
      }
    }

    if (so.contract) {
      serialized.contract = {
        abiFunction: so.contract.abiFunction,
        redeemScript: binToHex(so.contract.redeemScript),
        artifact: so.contract.artifact,
      };
    }

    return serialized;
  });

  return {
    transaction: txHex,
    sourceOutputs,
    broadcast: wcTx.broadcast,
    userPrompt: wcTx.userPrompt,
  };
}
