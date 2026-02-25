import {
  Contract,
  ElectrumNetworkProvider,
  TransactionBuilder,
  placeholderPublicKey,
  placeholderSignature,
  type WcTransactionObject,
} from 'cashscript';
import { hexToBin, binToHex } from '@bitauth/libauth';
import { ContractFactory } from './ContractFactory.js';

export interface ClaimTransactionParams {
  streamId: string;
  contractAddress: string;
  recipient: string;
  totalAmount: number;
  totalReleased: number;
  startTime: number;
  endTime: number;
  currentTime: number;
  streamType: 'LINEAR' | 'STEP';
  stepInterval?: number;
  stepAmount?: number;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
  constructorParams: any[];
  currentCommitment: string;
}

export interface ClaimTransaction {
  claimableAmount: number;
  wcTransaction: WcTransactionObject;
}

export class StreamClaimService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  calculateClaimableAmount(params: ClaimTransactionParams): number {
    const { totalAmount, totalReleased, startTime, endTime, currentTime, streamType, stepInterval, stepAmount } = params;

    const elapsed = currentTime - startTime;
    const duration = endTime - startTime;

    let vestedTotal = 0;

    if (streamType === 'LINEAR') {
      if (elapsed >= duration) {
        vestedTotal = totalAmount;
      } else if (elapsed > 0) {
        vestedTotal = Math.floor((totalAmount * elapsed) / duration);
      }
    } else if (streamType === 'STEP') {
      if (!stepInterval || !stepAmount) {
        throw new Error('Step interval and amount required for STEP vesting');
      }
      const completedSteps = Math.floor(elapsed / stepInterval);
      vestedTotal = Math.min(completedSteps * stepAmount, totalAmount);
    }

    return Math.max(0, vestedTotal - totalReleased);
  }

  async buildClaimTransaction(params: ClaimTransactionParams): Promise<ClaimTransaction> {
    const claimableAmount = this.calculateClaimableAmount(params);

    if (claimableAmount <= 0) {
      throw new Error('No funds available to claim at this time');
    }

    const {
      contractAddress,
      recipient,
      totalReleased,
      tokenType,
      tokenCategory,
      constructorParams,
      currentCommitment,
      currentTime,
    } = params;

    const artifact = ContractFactory.getArtifact('VestingCovenant');
    const contract = new Contract(artifact, constructorParams, { provider: this.provider });

    const contractUtxos = await this.provider.getUtxos(contractAddress);
    if (!contractUtxos || contractUtxos.length === 0) {
      throw new Error(`No UTXOs found for stream contract ${contractAddress}`);
    }

    const contractUtxo = contractUtxos.find(u => u.token?.nft != null) ?? contractUtxos[0];
    const contractBalance = contractUtxo.satoshis;
    if (!contractUtxo.token) {
      throw new Error('Stream contract UTXO is missing the required mutable state NFT');
    }

    // Update NFT commitment: total_released at bytes 2-9
    const commitment = hexToBin(currentCommitment);
    if (commitment.length < 40) {
      throw new Error(`Invalid stream state commitment length: expected >=40, got ${commitment.length}`);
    }
    const newCommitment = new Uint8Array(commitment);
    const newTotalReleased = totalReleased + claimableAmount;
    const newStatus = newTotalReleased >= params.totalAmount ? 3 : 0;
    newCommitment[0] = newStatus;
    const dv = new DataView(newCommitment.buffer, newCommitment.byteOffset + 2, 8);
    dv.setBigUint64(0, BigInt(newTotalReleased), true);

    const claimAmountBig = BigInt(claimableAmount);
    const fee = 1500n;
    const recipientOutputSatoshis = tokenType === 'FUNGIBLE_TOKEN' ? 1000n : claimAmountBig;
    const remainingAmount = contractBalance - recipientOutputSatoshis - fee;
    const minimumStateOutput = 546n;

    if (remainingAmount < minimumStateOutput) {
      throw new Error('Insufficient contract balance to preserve stream state UTXO');
    }

    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder.setLocktime(currentTime);

    txBuilder.addInput(
      contractUtxo,
      contract.unlock.claim(
        placeholderSignature(),
        placeholderPublicKey(),
      ),
    );

    if (tokenType === 'FUNGIBLE_TOKEN' && tokenCategory && contractUtxo.token) {
      const tokenAmount = contractUtxo.token.amount ?? 0n;
      const remainingTokens = tokenAmount - claimAmountBig;
      if (remainingTokens < 0n) {
        throw new Error('Insufficient token balance in stream contract UTXO');
      }

      txBuilder.addOutput({
        to: recipient,
        amount: 1000n,
        token: { category: tokenCategory, amount: claimAmountBig },
      });

      txBuilder.addOutput({
        to: contract.tokenAddress,
        amount: remainingAmount,
        token: {
          category: tokenCategory,
          amount: remainingTokens,
          nft: { capability: 'mutable', commitment: binToHex(newCommitment) },
        },
      });
    } else {
      txBuilder.addOutput({ to: recipient, amount: claimAmountBig });

      txBuilder.addOutput({
        to: contract.tokenAddress,
        amount: remainingAmount,
        token: {
          category: contractUtxo.token.category,
          amount: 0n,
          nft: { capability: 'mutable', commitment: binToHex(newCommitment) },
        },
      });
    }

    const wcTransaction = txBuilder.generateWcTransactionObject({
      broadcast: true,
      userPrompt: 'Claim vested funds',
    });

    console.log('[StreamClaimService] Built claim transaction', {
      contractAddress,
      claimableAmount,
      tokenType: tokenType || 'BCH',
      tokenCategory: tokenCategory || null,
      inputSatoshis: contractUtxo.satoshis.toString(),
    });

    return { claimableAmount, wcTransaction };
  }

  validateClaim(params: ClaimTransactionParams): { valid: boolean; error?: string } {
    const { currentTime, startTime, endTime } = params;

    if (currentTime < startTime) {
      return { valid: false, error: 'Vesting has not started yet' };
    }

    if (currentTime > endTime && params.totalReleased >= params.totalAmount) {
      return { valid: false, error: 'All funds have been claimed' };
    }

    const claimable = this.calculateClaimableAmount(params);
    if (claimable <= 0) {
      return { valid: false, error: 'No funds available to claim at this time' };
    }

    return { valid: true };
  }
}
