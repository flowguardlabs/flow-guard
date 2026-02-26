/**
 * Stream Funding Service
 * Builds funding transactions for stream contracts
 */

import {
  ElectrumNetworkProvider,
  type WcTransactionObject,
} from 'cashscript';
import { buildFundingWcTransaction } from '../utils/wcFundingBuilder.js';
import { toNonNegativeBigInt } from '../utils/bigint.js';
import { getTokenFundingSatoshis, getTokenOutputDustSatoshis } from '../utils/fundingConfig.js';

export interface FundingTransactionParams {
  contractAddress: string;
  senderAddress: string;
  amount: number | string | bigint; // satoshis or token amount
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string; // hex-encoded 32-byte category ID
  nftCommitment: string; // hex-encoded NFT commitment
  nftCapability: 'minting' | 'mutable' | 'none';
  // Contract constructor params (from StreamDeploymentService)
  constructorParams?: {
    vaultId: string; // hex
    senderHash: string; // hex
    scheduleType: number;
    totalAmount: string; // bigint as string
    startTimestamp: string; // bigint as string
    endTimestamp: string; // bigint as string
    cliffTimestamp: string; // bigint as string
    stepInterval: string; // bigint as string
    stepAmount: string; // bigint as string
  };
}

export interface TransactionOutput {
  to: string;
  amount: number | string;
  token?: {
    category: string;
    amount: number | string;
    nft?: {
      commitment: string;
      capability: 'minting' | 'mutable' | 'none';
    };
  };
}

export interface UnsignedFundingTransaction {
  // Transaction parameters for frontend to build actual tx
  inputs: Array<{
    txid: string;
    vout: number;
    satoshis: number;
    tokenCategory?: string;
    tokenAmount?: number | string;
  }>;
  outputs: TransactionOutput[];
  fee: number;

  // Deprecated: will be removed once frontend uses inputs/outputs directly
  txHex: string; // Currently contains JSON-encoded transaction params
  sourceOutputs: Array<{
    txid: string;
    vout: number;
    satoshis: number;
    tokenCategory?: string;
    tokenAmount?: number | string;
    tokenNftCapability?: 'none' | 'mutable' | 'minting';
    tokenNftCommitment?: string;
  }>;
  requiredSignatures: string[]; // Addresses that need to sign
  wcTransaction: WcTransactionObject;
}

export class StreamFundingService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  /**
   * Build a funding transaction for a stream contract
   *
   * This creates a transaction that:
   * 1. Takes UTXOs from sender's address
   * 2. Creates output to contract address with:
   *    - Required BCH amount (or dust if using tokens)
   *    - NFT with mutable capability and commitment
   *    - CashTokens if tokenType === 'FUNGIBLE_TOKEN'
   * 3. Returns change to sender
   *
   * The transaction is unsigned and must be signed by the sender's wallet
   */
  async buildFundingTransaction(params: FundingTransactionParams): Promise<UnsignedFundingTransaction> {
    const {
      contractAddress,
      senderAddress,
      amount,
      tokenType,
      tokenCategory,
      nftCommitment,
      nftCapability,
    } = params;

    // Get UTXOs for sender
    const utxos = await this.provider.getUtxos(senderAddress);

    if (!utxos || utxos.length === 0) {
      throw new Error(`No UTXOs found for address ${senderAddress}`);
    }

    // For CashTokens, we need to find UTXOs with the right token category
    let selectedUtxos: typeof utxos = [];
    let totalInputValue = 0n;
    let totalTokenInputAmount = 0n;
    const dustAmount = getTokenOutputDustSatoshis(); // Minimum BCH for token outputs
    const amountOnChain = toNonNegativeBigInt(amount, 'amount');
    let stateTokenCategory: string | undefined = tokenCategory;

    if (tokenType === 'FUNGIBLE_TOKEN') {
      if (!tokenCategory) {
        throw new Error('Token category required for FUNGIBLE_TOKEN type');
      }
      stateTokenCategory = tokenCategory;

      // Find token UTXOs with matching category
      const tokenUtxos = utxos.filter(
        (utxo: any) =>
          utxo.token?.category === tokenCategory &&
          utxo.token?.amount &&
          !utxo.token?.nft
      );

      if (tokenUtxos.length === 0) {
        throw new Error(`No fungible token UTXOs found for category ${tokenCategory}`);
      }

      // Calculate total token amount available
      let totalTokenAmount = 0n;
      for (const utxo of tokenUtxos) {
        const tokenAmount = toNonNegativeBigInt(utxo.token?.amount ?? 0n, 'token input amount');
        totalTokenAmount += tokenAmount;
        totalTokenInputAmount += tokenAmount;
        totalInputValue += toNonNegativeBigInt(utxo.satoshis, 'input satoshis');
        selectedUtxos.push(utxo);

        if (totalTokenAmount >= amountOnChain) {
          break;
        }
      }

      if (totalTokenAmount < amountOnChain) {
        throw new Error(
          `Insufficient token balance. Required: ${amountOnChain.toString()}, Available: ${totalTokenAmount.toString()}`
        );
      }

      // Also need BCH UTXOs for fees and dust
      const bchUtxos = utxos.filter((utxo: any) => !utxo.token);
      if (bchUtxos.length > 0) {
        // Add first BCH UTXO for fees
        selectedUtxos.push(bchUtxos[0]);
        totalInputValue += toNonNegativeBigInt(bchUtxos[0].satoshis, 'fee input satoshis');
      }
    } else {
      const nonTokenUtxos = utxos.filter((utxo: any) => !utxo.token);
      const categoryAnchor = nonTokenUtxos.find((utxo: any) => utxo.vout === 0);
      if (!categoryAnchor) {
        throw new Error(
          'Cannot mint stream state NFT: sender wallet needs a spendable BCH UTXO with outpoint index 0',
        );
      }
      stateTokenCategory = categoryAnchor.txid;

      // BCH only - select UTXOs to cover amount + fees
      const requiredAmount = amountOnChain + 2000n; // amount + estimated fee

      const orderedUtxos = [
        categoryAnchor,
        ...nonTokenUtxos.filter(
          (utxo: any) => utxo.txid !== categoryAnchor.txid || utxo.vout !== categoryAnchor.vout,
        ),
      ];

      for (const utxo of orderedUtxos) {
        selectedUtxos.push(utxo);
        totalInputValue += toNonNegativeBigInt(utxo.satoshis, 'input satoshis');

        if (totalInputValue >= requiredAmount) {
          break;
        }
      }

      if (totalInputValue < requiredAmount) {
        const requiredBch = (Number(requiredAmount) / 1e8).toFixed(8);
        const availableBch = (Number(totalInputValue) / 1e8).toFixed(8);
        throw new Error(
          `Insufficient BCH balance: need ${requiredBch} BCH, wallet has ${availableBch} BCH`
        );
      }
    }

    // Prepare transaction parameters
    const sourceOutputs = selectedUtxos.map((utxo: any) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      satoshis: Number(toNonNegativeBigInt(utxo.satoshis, 'source output satoshis')),
      tokenCategory: utxo.token?.category,
      tokenAmount: utxo.token?.amount !== undefined ? toNonNegativeBigInt(utxo.token.amount, 'source token amount').toString() : undefined,
      tokenNftCapability: utxo.token?.nft?.capability,
      tokenNftCommitment: utxo.token?.nft?.commitment,
    }));

    // Calculate outputs
    const tokenChangeAmount =
      tokenType === 'FUNGIBLE_TOKEN' && totalTokenInputAmount > amountOnChain
        ? totalTokenInputAmount - amountOnChain
        : 0n;
    const tokenContractSatoshis = getTokenFundingSatoshis('stream');
    const contractOutput = tokenType === 'FUNGIBLE_TOKEN' ? tokenContractSatoshis : amountOnChain;

    if (!stateTokenCategory) {
      throw new Error('Missing state token category for stream funding output');
    }

    const preliminaryOutputs: TransactionOutput[] = [
      {
        to: contractAddress,
        amount: contractOutput.toString(),
        token: tokenType === 'FUNGIBLE_TOKEN'
          ? {
            category: tokenCategory!,
            amount: amountOnChain.toString(),
            nft: {
              commitment: nftCommitment,
              capability: nftCapability,
            },
          }
          : {
            category: stateTokenCategory,
            amount: 0,
            nft: {
              commitment: nftCommitment,
              capability: nftCapability,
            },
          },
      },
    ];

    if (tokenChangeAmount > 0n) {
      preliminaryOutputs.push({
        to: senderAddress,
        amount: dustAmount.toString(),
        token: {
          category: tokenCategory!,
          amount: tokenChangeAmount.toString(),
        },
      });
    }

    preliminaryOutputs.push({ to: senderAddress, amount: '0' });

    const estimatedFee = this.estimateFee(selectedUtxos.length, preliminaryOutputs.length, preliminaryOutputs);
    const bchBudgetAfterContractAndFee = totalInputValue - contractOutput - estimatedFee;
    const bchBudgetAfterTokenChange =
      tokenChangeAmount > 0n ? bchBudgetAfterContractAndFee - dustAmount : bchBudgetAfterContractAndFee;

    if (bchBudgetAfterTokenChange < 0n) {
      throw new Error(
        'Insufficient BCH balance to cover outputs and fees for token funding transaction'
      );
    }

    const contractAndTokenOutputs: TransactionOutput[] = preliminaryOutputs.slice(0, -1);
    const outputs: TransactionOutput[] = [];

    if (bchBudgetAfterTokenChange > 546n) {
      outputs.push({
        to: senderAddress,
        amount: bchBudgetAfterTokenChange.toString(),
      });
    }

    outputs.push(...contractAndTokenOutputs);

    // Return structured transaction parameters
    // Frontend must build and sign the actual raw transaction using these params
    const wcTransaction = buildFundingWcTransaction({
      inputOwnerAddress: senderAddress,
      inputs: sourceOutputs,
      outputs,
      userPrompt: `Fund stream contract ${contractAddress}`,
      broadcast: true,
    });

    return {
      inputs: sourceOutputs,
      outputs,
      fee: Number(estimatedFee),
      // Deprecated fields (for backwards compat):
      txHex: JSON.stringify({ inputs: sourceOutputs, outputs, fee: estimatedFee.toString() }),
      sourceOutputs,
      requiredSignatures: [senderAddress],
      wcTransaction,
    };
  }

  /**
   * Estimate fee for funding transaction
   */
  estimateFee(numInputs: number, numOutputs: number, outputs?: TransactionOutput[]): bigint {
    let outputBytes = 0;
    if (outputs) {
      for (const output of outputs) {
        let outSize = 8;
        if (output.token) {
          outSize += 34;
          if (output.token.nft?.commitment) {
            outSize += 1 + output.token.nft.commitment.length / 2;
          }
          if (output.token.amount && BigInt(output.token.amount) > 0n) {
            outSize += 9;
          }
        }
        outSize += 36;
        outputBytes += outSize;
      }
    } else {
      outputBytes = numOutputs * 36;
    }
    const estimatedSize = numInputs * 148 + outputBytes + 10;
    const feeRate = 2n;
    return BigInt(estimatedSize) * feeRate;
  }
}
