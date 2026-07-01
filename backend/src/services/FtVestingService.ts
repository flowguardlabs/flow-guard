/**
 * FtVestingService — two-UTXO fungible-token vesting (FtVestingCovenant).
 *
 * Streams an arbitrary CashToken the sender merely holds (no minting authority).
 * The state NFT (FlowGuard genesis category) and the streamed token (user
 * category) live in SEPARATE UTXOs at one covenant address; both categories are
 * compiled into the address, so it can only be derived once the genesis anchor
 * (state category = anchor txid) is known — i.e. at funding time.
 *
 * This module is self-contained: the proven BCH VestingCovenant path is not
 * touched. See contracts/core/streaming/FtVestingCovenant.cash and the local VM
 * proof in contracts/tests/local/ft-vesting.local.mjs.
 */

import {
  Contract,
  TransactionBuilder,
  SignatureTemplate,
  type ElectrumNetworkProvider,
  type Utxo,
} from 'cashscript';
import {
  hash160,
  binToHex,
  hexToBin,
  cashAddressToLockingBytecode,
  decodeCashAddress,
} from '@bitauth/libauth';
import { ContractFactory } from './ContractFactory.js';

const NON_FINAL_SEQUENCE = 0xfffffffe;
const CLAIM_LOCKTIME_BUFFER = 7200; // set nLockTime below MTP so the spend is immediately mineable
const CLAIM_FEE = 4000n; // within the covenant's <= 8000 two-input cap, above min relay
const STATE_NFT_RESERVE = 12_000n; // BCH in the state NFT UTXO: covers claim fee + output dust
const VAULT_DUST = 1_500n; // BCH carried by the FT vault UTXO
const OUTPUT_DUST = 1_000n; // BCH on each token output during a claim

export type FtScheduleType = 1 | 2; // 1=LINEAR, 2=STEP

export interface FtScheduleArgs {
  vaultId: string; // hex 32
  senderHash: string; // hex 20
  scheduleType: FtScheduleType;
  totalAmount: bigint; // token base units
  startTimestamp: bigint;
  endTimestamp: bigint;
  cliffTimestamp: bigint;
  stepInterval: bigint;
  stepAmount: bigint;
}

export interface FtCommitmentState {
  status: number;
  flags: number;
  totalReleased: bigint;
  cursor: number;
  pauseStart: number;
  recipientHash: Uint8Array;
}

function setUint40LE(target: Uint8Array, offset: number, value: number): void {
  let v = Math.max(0, Math.floor(value));
  for (let i = 0; i < 5; i += 1) {
    target[offset + i] = v & 0xff;
    v = Math.floor(v / 256);
  }
}

export function encodeFtCommitment(state: FtCommitmentState): Uint8Array {
  const c = new Uint8Array(40);
  c[0] = state.status & 0xff;
  c[1] = state.flags & 0xff;
  new DataView(c.buffer, 2, 8).setBigUint64(0, state.totalReleased, true);
  setUint40LE(c, 10, state.cursor);
  setUint40LE(c, 15, state.pauseStart);
  c.set(state.recipientHash, 20);
  return c;
}

export function addressToHash160(address: string): Uint8Array {
  const decoded = cashAddressToLockingBytecode(address);
  if (typeof decoded === 'string') throw new Error(decoded);
  const b = decoded.bytecode;
  const isP2pkh =
    b.length === 25 && b[0] === 0x76 && b[1] === 0xa9 && b[2] === 0x14 && b[23] === 0x88 && b[24] === 0xac;
  if (!isP2pkh) throw new Error(`FT stream sender/recipient must be P2PKH: ${address}`);
  return b.slice(3, 23);
}

/** Token-aware P2PKH address (same locking bytecode, required for token outputs). */
export function toTokenAwareAddress(address: string): string {
  const decoded = decodeCashAddress(address);
  if (typeof decoded === 'string') throw new Error(decoded);
  const isTokenAware = decoded.type === 'p2pkhWithTokens' || decoded.type === 'p2shWithTokens';
  if (isTokenAware) return address;
  return address; // caller passes a token-aware address for token outputs
}

export class FtVestingService {
  constructor(private readonly provider: ElectrumNetworkProvider) {}

  /**
   * Derive the covenant. stateCategory = the genesis anchor's txid; ftCategory =
   * the streamed token. The address is a pure function of these + the schedule.
   */
  deriveContract(args: FtScheduleArgs, stateCategory: string, ftCategory: string): Contract {
    const artifact = ContractFactory.getArtifact('FtVestingCovenant');
    return new Contract(
      artifact,
      [
        args.vaultId,
        args.senderHash,
        BigInt(args.scheduleType),
        args.totalAmount,
        args.startTimestamp,
        args.endTimestamp,
        args.cliffTimestamp,
        args.stepInterval,
        args.stepAmount,
        stateCategory,
        ftCategory,
      ],
      { provider: this.provider },
    );
  }

  initialCommitment(args: FtScheduleArgs, recipient: string, cancelable: boolean, transferable: boolean): Uint8Array {
    let flags = 0;
    if (cancelable) flags |= 1;
    if (transferable) flags |= 2;
    return encodeFtCommitment({
      status: 0,
      flags,
      totalReleased: 0n,
      cursor: Number(args.startTimestamp),
      pauseStart: 0,
      recipientHash: addressToHash160(recipient),
    });
  }

  /**
   * The two covenant-bound funding outputs: [0] state NFT (genesis), [1] FT vault.
   * Both go to the covenant's TOKEN-AWARE address. The caller's funding tx must
   * spend the genesis anchor (vout 0) at input index 0 so stateCategory mints.
   */
  fundingOutputs(params: {
    contract: Contract;
    stateCategory: string;
    ftCategory: string;
    tokenAmount: bigint;
    initialCommitment: Uint8Array;
  }): Array<{ to: string; amount: bigint; token: unknown }> {
    return [
      {
        to: params.contract.tokenAddress,
        amount: STATE_NFT_RESERVE,
        token: {
          category: params.stateCategory,
          amount: 0n,
          nft: { capability: 'mutable', commitment: binToHex(params.initialCommitment) },
        },
      },
      {
        to: params.contract.tokenAddress,
        amount: VAULT_DUST,
        token: { category: params.ftCategory, amount: params.tokenAmount },
      },
    ];
  }

  /** Linear/step vested-total at an effective time, matching the covenant's integer math. */
  static vestedTotal(args: FtScheduleArgs, effectiveTime: number, cursor: number): bigint {
    const elapsed = BigInt(effectiveTime - cursor);
    if (elapsed <= 0n) return 0n;
    const total = args.totalAmount;
    if (args.scheduleType === 1) {
      const duration = args.endTimestamp - args.startTimestamp;
      if (elapsed >= duration) return total;
      return (total * elapsed) / duration;
    }
    const completedSteps = elapsed / args.stepInterval;
    const vested = completedSteps * args.stepAmount;
    return vested > total ? total : vested;
  }

  /**
   * Build the two-UTXO claim: spend [0] state NFT + [1] FT vault, releasing the
   * vested token to the recipient, advancing the state NFT, and returning the
   * remainder to the vault (3 outputs, or 2 when the vault empties).
   */
  buildClaim(params: {
    args: FtScheduleArgs;
    stateCategory: string;
    ftCategory: string;
    stateUtxo: Utxo;
    vaultUtxo: Utxo;
    currentCommitment: Uint8Array;
    recipientAddress: string; // token-aware
    recipientSig: SignatureTemplate;
    recipientPubkey: Uint8Array;
    nowSeconds: number;
  }): { builder: TransactionBuilder; claimable: bigint; remaining: bigint; locktime: number } {
    const contract = this.deriveContract(params.args, params.stateCategory, params.ftCategory);
    const cursor = Number(readUint40LE(params.currentCommitment, 10));
    const totalReleased = new DataView(
      params.currentCommitment.buffer,
      params.currentCommitment.byteOffset + 2,
      8,
    ).getBigUint64(0, true);
    const flags = params.currentCommitment[1];
    const recipientHash = params.currentCommitment.slice(20, 40);

    const locktime = params.nowSeconds - CLAIM_LOCKTIME_BUFFER;
    const vested = FtVestingService.vestedTotal(params.args, locktime, cursor);
    const claimable = vested - totalReleased;
    if (claimable <= 0n) throw new Error('Nothing vested to claim yet');

    const vaultAmount = toBigInt(params.vaultUtxo.token?.amount);
    if (claimable > vaultAmount) throw new Error('claimable exceeds vault balance');
    const remaining = vaultAmount - claimable;

    const newTotalReleased = totalReleased + claimable;
    const newStatus = newTotalReleased >= params.args.totalAmount ? 3 : 0;
    const newCommitment = encodeFtCommitment({
      status: newStatus,
      flags,
      totalReleased: newTotalReleased,
      cursor,
      pauseStart: 0,
      recipientHash,
    });

    const stateInSats = toBigInt(params.stateUtxo.satoshis);
    const vaultInSats = toBigInt(params.vaultUtxo.satoshis);

    const builder = new TransactionBuilder({ provider: this.provider })
      .setLocktime(locktime)
      .addInput(params.stateUtxo, contract.unlock.claim(params.recipientSig, params.recipientPubkey), { sequence: NON_FINAL_SEQUENCE })
      .addInput(params.vaultUtxo, contract.unlock.claim(params.recipientSig, params.recipientPubkey), { sequence: NON_FINAL_SEQUENCE })
      .addOutput({ to: params.recipientAddress, amount: OUTPUT_DUST, token: { category: params.ftCategory, amount: claimable } });

    if (remaining > 0n) {
      const stateOut = stateInSats + vaultInSats - OUTPUT_DUST - OUTPUT_DUST - CLAIM_FEE;
      builder
        .addOutput({ to: contract.tokenAddress, amount: stateOut, token: { category: params.stateCategory, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(newCommitment) } } })
        .addOutput({ to: contract.tokenAddress, amount: OUTPUT_DUST, token: { category: params.ftCategory, amount: remaining } });
    } else {
      const stateOut = stateInSats + vaultInSats - OUTPUT_DUST - CLAIM_FEE;
      builder.addOutput({ to: contract.tokenAddress, amount: stateOut, token: { category: params.stateCategory, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(newCommitment) } } });
    }

    return { builder, claimable, remaining, locktime };
  }
}

function readUint40LE(buf: Uint8Array, offset: number): number {
  let v = 0;
  for (let i = 4; i >= 0; i -= 1) v = v * 256 + buf[offset + i];
  return v;
}

function toBigInt(value: bigint | number | string | undefined): bigint {
  if (value === undefined) return 0n;
  return typeof value === 'bigint' ? value : BigInt(value);
}

export { hexToBin, hash160 };
