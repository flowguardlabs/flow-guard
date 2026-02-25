import {
  Contract,
  ElectrumNetworkProvider,
  TransactionBuilder,
  placeholderPublicKey,
  placeholderSignature,
  type WcTransactionObject,
} from 'cashscript';
import {
  binToHex,
  hexToBin,
  lockingBytecodeToCashAddress,
} from '@bitauth/libauth';
import { ContractFactory } from './ContractFactory.js';

export interface AirdropControlBuildParams {
  contractAddress: string;
  constructorParams: any[];
  currentCommitment: string;
  currentTime: number;
  tokenType: 'BCH' | 'FUNGIBLE_TOKEN';
}

export interface AirdropControlBuildResult {
  wcTransaction: WcTransactionObject;
  nextStatus: 'PAUSED' | 'CANCELLED';
  cancelReturnAddress?: string;
  remainingPool?: bigint;
}

export class AirdropControlService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  async buildPauseTransaction(params: AirdropControlBuildParams): Promise<AirdropControlBuildResult> {
    const artifact = ContractFactory.getArtifact('AirdropCovenant');
    const contract = new Contract(artifact, params.constructorParams, { provider: this.provider });
    const { contractUtxo, commitment } = await this.getContractState(params.contractAddress, params.currentCommitment);

    const status = commitment[0] ?? 0;
    const flags = commitment[1] ?? 0;
    if (status !== 0) {
      throw new Error('Campaign must be ACTIVE to pause');
    }
    if ((flags & 0x01) !== 0x01) {
      throw new Error('Campaign is not configured as cancelable/pausable');
    }
    if (commitment.length < 23) {
      throw new Error('Invalid airdrop state commitment');
    }

    // Matches AirdropCovenant.pause() serialization exactly.
    const newCommitment = new Uint8Array(40);
    newCommitment[0] = 1; // PAUSED
    newCommitment.set(commitment.slice(1, 23), 1);
    newCommitment.fill(0, 23);

    const feeReserve = 900n;
    const stateOutputSatoshis = contractUtxo.satoshis - feeReserve;
    if (stateOutputSatoshis < 546n) {
      throw new Error('Insufficient contract balance to pause campaign');
    }

    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder.setLocktime(params.currentTime);
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.pause(
        placeholderSignature(),
        placeholderPublicKey(),
      ),
    );
    txBuilder.addOutput({
      to: contract.tokenAddress,
      amount: stateOutputSatoshis,
      token: {
        category: contractUtxo.token.category,
        amount: contractUtxo.token.amount ?? 0n,
        nft: {
          capability: contractUtxo.token.nft.capability as 'none' | 'mutable' | 'minting',
          commitment: binToHex(newCommitment),
        },
      },
    });

    return {
      wcTransaction: txBuilder.generateWcTransactionObject({
        broadcast: true,
        userPrompt: 'Pause airdrop campaign',
      }),
      nextStatus: 'PAUSED',
    };
  }

  async buildCancelTransaction(params: AirdropControlBuildParams): Promise<AirdropControlBuildResult> {
    const artifact = ContractFactory.getArtifact('AirdropCovenant');
    const contract = new Contract(artifact, params.constructorParams, { provider: this.provider });
    const { contractUtxo, commitment } = await this.getContractState(params.contractAddress, params.currentCommitment);

    const status = commitment[0] ?? 0;
    const flags = commitment[1] ?? 0;
    if (status !== 0 && status !== 1) {
      throw new Error('Campaign must be ACTIVE or PAUSED to cancel');
    }
    if ((flags & 0x01) !== 0x01) {
      throw new Error('Campaign is not cancelable');
    }

    const totalClaimed = this.readUint64LE(commitment, 2);
    const totalPool = this.toBigIntParam(params.constructorParams[3], 'totalPool');
    const remainingPool = this.clampToZero(totalPool - totalClaimed);
    if (remainingPool <= 0n) {
      throw new Error('No remaining pool available to cancel');
    }

    const authorityHash = this.readBytes20(params.constructorParams[1], 'authorityHash');
    const cancelReturnAddress = this.p2pkhFromHash(authorityHash);

    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder.setLocktime(params.currentTime);
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.cancel(
        placeholderSignature(),
        placeholderPublicKey(),
      ),
    );

    const feeReserve = 1200n;
    let spentSatoshis = 0n;
    if (params.tokenType === 'FUNGIBLE_TOKEN') {
      txBuilder.addOutput({
        to: cancelReturnAddress,
        amount: 1000n,
        token: {
          category: contractUtxo.token.category,
          amount: remainingPool,
        },
      });
      spentSatoshis += 1000n;
    } else {
      if (remainingPool < 546n) {
        throw new Error('Remaining BCH pool is below dust and cannot be cancelled');
      }
      txBuilder.addOutput({
        to: cancelReturnAddress,
        amount: remainingPool,
      });
      spentSatoshis += remainingPool;
    }

    const change = contractUtxo.satoshis - spentSatoshis - feeReserve;
    if (change < 0n) {
      throw new Error('Insufficient contract balance to cover cancel transaction fee');
    }
    if (change > 546n) {
      txBuilder.addOutput({
        to: cancelReturnAddress,
        amount: change,
      });
    }

    return {
      wcTransaction: txBuilder.generateWcTransactionObject({
        broadcast: true,
        userPrompt: 'Cancel airdrop campaign and recover remaining funds',
      }),
      nextStatus: 'CANCELLED',
      cancelReturnAddress,
      remainingPool,
    };
  }

  private async getContractState(contractAddress: string, fallbackCommitment: string): Promise<{
    contractUtxo: any;
    commitment: Uint8Array;
  }> {
    const contractUtxos = await this.provider.getUtxos(contractAddress);
    if (!contractUtxos || contractUtxos.length === 0) {
      throw new Error(`No UTXOs found for airdrop contract ${contractAddress}`);
    }

    const contractUtxo = contractUtxos.find((u) => u.token?.nft != null) ?? contractUtxos[0];
    if (!contractUtxo.token?.nft) {
      throw new Error('Airdrop contract UTXO is missing required state NFT');
    }

    const onChainCommitment: unknown = contractUtxo.token.nft.commitment;
    const commitment =
      onChainCommitment instanceof Uint8Array
        ? onChainCommitment
        : typeof onChainCommitment === 'string'
        ? hexToBin(onChainCommitment)
        : hexToBin(fallbackCommitment || '');

    if (commitment.length < 18) {
      throw new Error('Invalid airdrop state commitment');
    }

    return { contractUtxo, commitment };
  }

  private readUint64LE(source: Uint8Array, offset: number): bigint {
    const view = new DataView(source.buffer, source.byteOffset + offset, 8);
    return view.getBigUint64(0, true);
  }

  private toBigIntParam(value: unknown, name: string): bigint {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(Math.trunc(value));
    if (typeof value === 'string' && value.length > 0) return BigInt(value);
    if (value instanceof Uint8Array) {
      if (value.length > 8) throw new Error(`Unsupported byte length for ${name}`);
      let result = 0n;
      for (let i = value.length - 1; i >= 0; i--) {
        result = (result << 8n) + BigInt(value[i]);
      }
      return result;
    }
    throw new Error(`Invalid constructor parameter for ${name}`);
  }

  private readBytes20(value: unknown, name: string): Uint8Array {
    let bytes: Uint8Array;
    if (value instanceof Uint8Array) {
      bytes = value;
    } else if (typeof value === 'string') {
      bytes = hexToBin(value);
    } else {
      throw new Error(`Invalid constructor parameter for ${name}`);
    }
    if (bytes.length !== 20) {
      throw new Error(`${name} must be 20 bytes`);
    }
    return bytes;
  }

  private p2pkhFromHash(hash20: Uint8Array): string {
    const lockingBytecode = new Uint8Array(25);
    lockingBytecode[0] = 0x76;
    lockingBytecode[1] = 0xa9;
    lockingBytecode[2] = 0x14;
    lockingBytecode.set(hash20, 3);
    lockingBytecode[23] = 0x88;
    lockingBytecode[24] = 0xac;
    const encoded = lockingBytecodeToCashAddress({
      bytecode: lockingBytecode,
      prefix: this.networkPrefix(),
    });
    if (typeof encoded === 'string') {
      throw new Error(`Failed to encode authority P2PKH address: ${encoded}`);
    }
    return encoded.address;
  }

  private clampToZero(value: bigint): bigint {
    return value > 0n ? value : 0n;
  }

  private networkPrefix(): 'bitcoincash' | 'bchtest' {
    return this.network === 'mainnet' ? 'bitcoincash' : 'bchtest';
  }
}
