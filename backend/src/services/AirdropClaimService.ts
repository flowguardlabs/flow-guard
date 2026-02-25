import {
  Contract,
  ElectrumNetworkProvider,
  TransactionBuilder,
  placeholderP2PKHUnlocker,
  placeholderPublicKey,
  placeholderSignature,
  type WcTransactionObject,
} from 'cashscript';
import { hexToBin, binToHex } from '@bitauth/libauth';
import { ContractFactory } from './ContractFactory.js';

export interface ClaimTransactionParams {
  airdropId: string;
  contractAddress: string;
  claimer: string;
  claimAmount: number;
  totalClaimed: number;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
  constructorParams: any[];
  currentCommitment: string;
  currentTime: number;
}

export interface ClaimTransaction {
  claimAmount: number;
  wcTransaction: WcTransactionObject;
}

export class AirdropClaimService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  async buildClaimTransaction(params: ClaimTransactionParams): Promise<ClaimTransaction> {
    const {
      contractAddress,
      claimer,
      claimAmount,
      totalClaimed,
      tokenType,
      tokenCategory,
      constructorParams,
      currentCommitment,
      currentTime,
    } = params;

    if (claimAmount <= 0) {
      throw new Error('Claim amount must be greater than 0');
    }

    const artifact = ContractFactory.getArtifact('AirdropCovenant');
    const contract = new Contract(artifact, constructorParams, { provider: this.provider });

    const contractUtxos = await this.provider.getUtxos(contractAddress);
    if (!contractUtxos || contractUtxos.length === 0) {
      throw new Error(`No UTXOs found for airdrop contract ${contractAddress}`);
    }

    const contractUtxo = contractUtxos.find(u => u.token?.nft != null) ?? contractUtxos[0];
    const contractBalance = contractUtxo.satoshis;
    if (!contractUtxo.token) {
      throw new Error('Airdrop contract UTXO is missing the required mutable state NFT');
    }

    // Update NFT commitment: status/flags/total_claimed/claims_count/last_claim_timestamp
    const commitment = currentCommitment ? hexToBin(currentCommitment) : new Uint8Array(40);
    if (commitment.length < 40) {
      throw new Error(`Invalid airdrop state commitment length: expected >=40, got ${commitment.length}`);
    }
    const newCommitment = new Uint8Array(commitment);
    const newTotalClaimed = totalClaimed + claimAmount;
    const totalPool = BigInt(
      typeof constructorParams[3] === 'bigint'
        ? constructorParams[3]
        : Number(constructorParams[3] ?? 0),
    );
    const nextStatus = totalPool > 0n && BigInt(newTotalClaimed) >= totalPool ? 3 : 0;
    newCommitment[0] = nextStatus;

    new DataView(newCommitment.buffer, newCommitment.byteOffset + 2, 8)
      .setBigUint64(0, BigInt(newTotalClaimed), true);

    const currentCount = new DataView(newCommitment.buffer, newCommitment.byteOffset + 10, 8)
      .getBigUint64(0, true);
    new DataView(newCommitment.buffer, newCommitment.byteOffset + 10, 8)
      .setBigUint64(0, currentCount + 1n, true);
    this.setUint40LE(newCommitment, 18, currentTime);
    newCommitment.fill(0, 23, 40);

    // Compute claimerHash from claimer P2PKH address
    const { cashAddressToLockingBytecode } = await import('@bitauth/libauth');
    const decoded = cashAddressToLockingBytecode(claimer);
    if (typeof decoded === 'string') throw new Error(`Invalid claimer address: ${decoded}`);
    const b = decoded.bytecode;
    const isP2pkh = b.length === 25
      && b[0] === 0x76
      && b[1] === 0xa9
      && b[2] === 0x14
      && b[23] === 0x88
      && b[24] === 0xac;
    if (!isP2pkh) {
      throw new Error(`Airdrop claims require P2PKH claimer addresses: ${claimer}`);
    }
    const claimerHash = b.slice(3, 23);

    const claimAmountBig = BigInt(claimAmount);
    const fee = 1500n;
    const feePayer = await this.selectFeePayerInputs(claimer, fee);
    const recipientOutputSatoshis = tokenType === 'FUNGIBLE_TOKEN' ? 1000n : claimAmountBig;
    const remainingAmount = contractBalance - recipientOutputSatoshis - (feePayer ? 0n : fee);
    const minimumStateOutput = 546n;

    if (remainingAmount < minimumStateOutput) {
      throw new Error('Insufficient contract balance to preserve campaign state UTXO');
    }

    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder.setLocktime(currentTime);
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.claim(
        placeholderSignature(),
        placeholderPublicKey(),
        claimerHash,
      ),
    );
    if (feePayer) {
      const unlocker = placeholderP2PKHUnlocker(claimer);
      for (const utxo of feePayer.utxos) {
        txBuilder.addInput(utxo, unlocker);
      }
    }

    if (tokenType === 'FUNGIBLE_TOKEN' && tokenCategory && contractUtxo.token) {
      txBuilder.addOutput({
        to: claimer,
        amount: 1000n,
        token: { category: tokenCategory, amount: claimAmountBig },
      });

      const remainingTokens = (contractUtxo.token.amount ?? 0n) - claimAmountBig;
      if (remainingTokens < 0n) {
        throw new Error('Insufficient token balance in campaign UTXO for claim');
      }
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
      txBuilder.addOutput({ to: claimer, amount: claimAmountBig });

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
    if (feePayer) {
      const feeChange = feePayer.total - fee;
      if (feeChange > 546n) {
        txBuilder.addOutput({
          to: claimer,
          amount: feeChange,
        });
      }
    }

    const wcTransaction = txBuilder.generateWcTransactionObject({
      broadcast: true,
      userPrompt: 'Claim airdrop allocation',
    });

    console.log('[AirdropClaimService] Built claim transaction', {
      contractAddress,
      claimAmount,
      tokenType: tokenType || 'BCH',
      tokenCategory: tokenCategory || null,
      inputSatoshis: contractUtxo.satoshis.toString(),
    });

    return { claimAmount, wcTransaction };
  }

  private setUint40LE(target: Uint8Array, offset: number, value: number): void {
    const safe = Math.max(0, Math.floor(value));
    target[offset] = safe & 0xff;
    target[offset + 1] = (safe >>> 8) & 0xff;
    target[offset + 2] = (safe >>> 16) & 0xff;
    target[offset + 3] = (safe >>> 24) & 0xff;
    target[offset + 4] = Math.floor(safe / 0x100000000) & 0xff;
  }

  private async selectFeePayerInputs(address: string, requiredFee: bigint): Promise<{
    utxos: any[];
    total: bigint;
  } | null> {
    const utxos = await this.provider.getUtxos(address);
    const spendable = utxos
      .filter((utxo: any) => !utxo.token)
      .sort((a: any, b: any) => {
        const aSats = BigInt(a.satoshis);
        const bSats = BigInt(b.satoshis);
        if (aSats < bSats) return -1;
        if (aSats > bSats) return 1;
        return 0;
      });

    const selected: any[] = [];
    let total = 0n;
    for (const utxo of spendable) {
      selected.push(utxo);
      total += BigInt(utxo.satoshis);
      if (total >= requiredFee) {
        return { utxos: selected, total };
      }
    }

    return null;
  }
}
