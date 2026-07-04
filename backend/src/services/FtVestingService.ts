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
  ElectrumNetworkProvider,
  placeholderSignature,
  placeholderPublicKey,
  type Utxo,
  type WcTransactionObject,
} from 'cashscript';
import {
  hash160,
  binToHex,
  hexToBin,
  cashAddressToLockingBytecode,
  decodeCashAddress,
  encodeCashAddress,
} from '@bitauth/libauth';
import { ContractFactory } from './ContractFactory.js';
import { buildFundingWcTransaction } from '../utils/wcFundingBuilder.js';
import { finalizeWcTransactionSequences } from './txFinality.js';

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

/** Reverse a 32-byte category hex (display txid <-> internal byte order). */
export function reverseCategory(hex: string): string {
  const bytes = hex.match(/../g);
  if (!bytes || bytes.length !== 32) throw new Error(`category must be 32-byte hex, got ${hex.length / 2} bytes`);
  return bytes.reverse().join('');
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

/** Token-aware address (same locking bytecode) — required for CashToken outputs. */
export function toTokenAwareAddress(address: string): string {
  const decoded = decodeCashAddress(address);
  if (typeof decoded === 'string') throw new Error(decoded);
  if (decoded.type === 'p2pkhWithTokens' || decoded.type === 'p2shWithTokens') return address;
  const tokenType = decoded.type === 'p2sh' ? 'p2shWithTokens' : 'p2pkhWithTokens';
  return encodeCashAddress({ prefix: decoded.prefix, type: tokenType, payload: decoded.payload }).address;
}

export class FtVestingService {
  private readonly provider: ElectrumNetworkProvider;

  constructor(providerOrNetwork: ElectrumNetworkProvider | 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.provider = typeof providerOrNetwork === 'string'
      ? new ElectrumNetworkProvider(providerOrNetwork)
      : providerOrNetwork;
  }

  /**
   * Derive the covenant. stateCategory = the genesis anchor's txid; ftCategory =
   * the streamed token. Both are passed as DISPLAY txids (as electrum/DB report
   * them) and reversed to internal byte order for the compiled-in bytes32 args —
   * on-chain token category introspection is internal order, and cashscript takes
   * constructor bytes literally (unlike output token.category, which it reverses).
   * The address is a pure function of these + the schedule.
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
        reverseCategory(stateCategory),
        reverseCategory(ftCategory),
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
    if (claimable <= 0n) throw new Error('Nothing to claim yet — wait for more of the stream to vest, then try again.');

    const vaultAmount = toBigInt(params.vaultUtxo.token?.amount);
    if (claimable > vaultAmount) throw new Error('The claim amount is more than the tokens the stream currently holds. Refresh and try again.');
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

  /**
   * Serialize constructor params for DB STORAGE order: 9 schedule + ftCategory
   * (index 9) + stateCategory (index 10). This MUST match deployFtVestingStream
   * (create: index 9 = ftCategory) and parseFtVestingRow (read: index 9 =
   * ftCategory, index 10 = stateCategory) so repeated funding-info calls stay
   * consistent. NOTE: this is the DB serialization order, independent of the
   * covenant constructor order — deriveContract() takes stateCategory/ftCategory
   * as explicit args and always emits the covenant's [stateCategory, ftCategory].
   */
  constructorParams(
    args: FtScheduleArgs,
    stateCategory: string,
    ftCategory: string,
  ): Array<{ type: 'bytes' | 'bigint'; value: string }> {
    return [
      { type: 'bytes', value: args.vaultId },
      { type: 'bytes', value: args.senderHash },
      { type: 'bigint', value: String(args.scheduleType) },
      { type: 'bigint', value: args.totalAmount.toString() },
      { type: 'bigint', value: args.startTimestamp.toString() },
      { type: 'bigint', value: args.endTimestamp.toString() },
      { type: 'bigint', value: args.cliffTimestamp.toString() },
      { type: 'bigint', value: args.stepInterval.toString() },
      { type: 'bigint', value: args.stepAmount.toString() },
      { type: 'bytes', value: ftCategory },
      { type: 'bytes', value: stateCategory },
    ];
  }

  /**
   * Build the two-UTXO funding transaction the SENDER signs via WalletConnect.
   * Picks a vout-0 anchor (stateCategory = its txid), derives the address, and
   * emits [0] state NFT genesis, [1] FT vault, plus token/BCH change — all from
   * the sender's P2PKH UTXOs, no minting authority. Returns the finalized address
   * + constructor params so the stream row can be persisted.
   */
  async buildFundingWc(params: {
    args: FtScheduleArgs;
    ftCategory: string;
    tokenAmount: bigint;
    senderAddress: string;
    recipient: string;
    cancelable: boolean;
    transferable: boolean;
    existingStateCategory?: string | null;
  }): Promise<{
    contractAddress: string;
    stateCategory: string;
    initialCommitment: string;
    constructorParams: Array<{ type: 'bytes' | 'bigint'; value: string }>;
    inputs: FundingSourceOutput[];
    outputs: FundingOutputSpec[];
    fee: number;
    wcTransaction: WcTransactionObject;
  }> {
    const utxos = await this.provider.getUtxos(params.senderAddress);
    const bchUtxos = utxos.filter((u) => !u.token);
    // Idempotency: if a prior funding-info already chose an anchor and it's still
    // unspent, reuse it so the address doesn't drift on retries/reloads.
    const anchor = (params.existingStateCategory
      && bchUtxos.find((u) => u.vout === 0 && u.txid === params.existingStateCategory))
      || bchUtxos.find((u) => u.vout === 0);
    if (!anchor) {
      throw new Error('Your wallet needs a little spendable BCH to fund a token stream. Send yourself a small amount of BCH (or receive some), then try funding again.');
    }
    const stateCategory = anchor.txid;
    const contract = this.deriveContract(params.args, stateCategory, params.ftCategory);
    const initC = this.initialCommitment(params.args, params.recipient, params.cancelable, params.transferable);

    const ftUtxos = utxos.filter(
      (u) => u.token?.category === params.ftCategory && !u.token?.nft && toBigInt(u.token?.amount) > 0n,
    );
    const selectedFt: Utxo[] = [];
    let ftSum = 0n;
    for (const u of ftUtxos) {
      if (ftSum >= params.tokenAmount) break;
      selectedFt.push(u);
      ftSum += toBigInt(u.token?.amount);
    }
    if (ftSum < params.tokenAmount) {
      throw new Error(`Not enough of this token in your wallet: the stream needs ${params.tokenAmount} but you hold ${ftSum}. Lower the amount, or add more of the token to your wallet.`);
    }

    const FEE = 1500n;
    const need = STATE_NFT_RESERVE + VAULT_DUST + FEE;
    const selected: Utxo[] = [anchor, ...selectedFt];
    let inSats = toBigInt(anchor.satoshis) + selectedFt.reduce((s, u) => s + toBigInt(u.satoshis), 0n);
    const extraBch = bchUtxos.filter((u) => !(u.txid === anchor.txid && u.vout === anchor.vout));
    for (const u of extraBch) {
      if (inSats >= need + 546n) break;
      selected.push(u);
      inSats += toBigInt(u.satoshis);
    }
    if (inSats < need) throw new Error(`Not enough BCH to cover the stream's on-chain reserve and network fee (need about ${need} sats, your wallet has ${inSats}). Add a little BCH and try again.`);

    const inputs: FundingSourceOutput[] = selected.map((u) => ({
      txid: u.txid,
      vout: u.vout,
      satoshis: Number(toBigInt(u.satoshis)),
      tokenCategory: u.token?.category,
      tokenAmount: u.token?.amount !== undefined ? toBigInt(u.token.amount).toString() : undefined,
      tokenNftCapability: u.token?.nft?.capability,
      tokenNftCommitment: u.token?.nft?.commitment
        ? (typeof u.token.nft.commitment === 'string' ? u.token.nft.commitment : binToHex(u.token.nft.commitment))
        : undefined,
    }));

    const outputs: FundingOutputSpec[] = [
      {
        to: contract.tokenAddress,
        amount: STATE_NFT_RESERVE.toString(),
        token: { category: stateCategory, amount: '0', nft: { commitment: binToHex(initC), capability: 'mutable' } },
      },
      {
        to: contract.tokenAddress,
        amount: VAULT_DUST.toString(),
        token: { category: params.ftCategory, amount: params.tokenAmount.toString() },
      },
    ];
    const ftChange = ftSum - params.tokenAmount;
    if (ftChange > 0n) {
      outputs.push({
        to: toTokenAwareAddress(params.senderAddress),
        amount: VAULT_DUST.toString(),
        token: { category: params.ftCategory, amount: ftChange.toString() },
      });
    }
    const bchChange = inSats - STATE_NFT_RESERVE - VAULT_DUST - (ftChange > 0n ? VAULT_DUST : 0n) - FEE;
    if (bchChange > 546n) outputs.push({ to: params.senderAddress, amount: bchChange.toString() });

    const wcTransaction = buildFundingWcTransaction({
      inputOwnerAddress: params.senderAddress,
      inputs,
      outputs,
      userPrompt: `Fund CashToken stream ${contract.address}`,
      broadcast: false,
    });

    return {
      contractAddress: contract.address,
      stateCategory,
      initialCommitment: binToHex(initC),
      constructorParams: this.constructorParams(params.args, stateCategory, params.ftCategory),
      inputs,
      outputs,
      fee: Number(FEE),
      wcTransaction,
    };
  }

  /**
   * BCH's token-genesis rule requires spending a coin at output-index 0, so the
   * state NFT's category can equal that input's txid. Many wallets have no vout-0
   * coin (all coins landed at other indices), which would block funding. This
   * builds a one-off self-send the SENDER signs: output[0] pays the sender, so the
   * resulting coin sits at vout 0 and the next funding-info call can anchor on it.
   * Returns { needsAnchor: false } when a usable vout-0 BCH coin already exists.
   */
  async buildAnchorPrepWc(params: { senderAddress: string; userPrompt?: string }): Promise<{
    needsAnchor: boolean;
    anchorSats?: number;
    wcTransaction?: WcTransactionObject;
  }> {
    const utxos = await this.provider.getUtxos(params.senderAddress);
    const bchUtxos = utxos.filter((u) => !u.token);
    if (bchUtxos.some((u) => u.vout === 0)) return { needsAnchor: false };

    // The anchor coin must fund the whole two-UTXO reserve + claim fee on its own,
    // so a single vout-0 input is enough for the follow-up funding tx.
    const ANCHOR_SATS = STATE_NFT_RESERVE + VAULT_DUST + 3_000n;
    const FEE = 500n;
    const need = ANCHOR_SATS + FEE;
    const sorted = [...bchUtxos].sort((a, b) => Number(toBigInt(b.satoshis) - toBigInt(a.satoshis)));
    const selected: Utxo[] = [];
    let inSats = 0n;
    for (const u of sorted) {
      selected.push(u);
      inSats += toBigInt(u.satoshis);
      if (inSats >= need + 546n) break;
    }
    if (inSats < need) {
      throw new Error('Your wallet needs a little more spendable BCH to prepare a token stream (about 17,000 sats). Add a small amount of BCH and try again.');
    }

    const inputs: FundingSourceOutput[] = selected.map((u) => ({
      txid: u.txid,
      vout: u.vout,
      satoshis: Number(toBigInt(u.satoshis)),
    }));
    const outputs: FundingOutputSpec[] = [
      { to: params.senderAddress, amount: ANCHOR_SATS.toString() },
    ];
    const change = inSats - ANCHOR_SATS - FEE;
    if (change > 546n) outputs.push({ to: params.senderAddress, amount: change.toString() });

    const wcTransaction = buildFundingWcTransaction({
      inputOwnerAddress: params.senderAddress,
      inputs,
      outputs,
      userPrompt: params.userPrompt ?? 'Prepare your wallet to fund a CashToken stream',
      broadcast: false,
    });
    return { needsAnchor: true, anchorSats: Number(ANCHOR_SATS), wcTransaction };
  }

  /**
   * Build the two-input claim the RECIPIENT signs via WalletConnect. Placeholder
   * signatures on both covenant inputs are filled in by the wallet. The emitted
   * transaction is structurally identical to buildClaim (VM-proven).
   */
  async buildClaimWc(params: {
    args: FtScheduleArgs;
    stateCategory: string;
    ftCategory: string;
    recipientAddress: string; // token-aware
    currentCommitment: Uint8Array;
    nowSeconds: number;
  }): Promise<{ claimable: bigint; remaining: bigint; wcTransaction: WcTransactionObject }> {
    const contract = this.deriveContract(params.args, params.stateCategory, params.ftCategory);
    const utxos = await this.provider.getUtxos(contract.tokenAddress);
    const stateUtxo = utxos.find((u) => Boolean(u.token?.nft) && u.token?.category === params.stateCategory);
    const vaultUtxo = utxos.find((u) => u.token?.category === params.ftCategory && !u.token?.nft);
    if (!stateUtxo || !vaultUtxo) throw new Error('The stream is still confirming on-chain — its state or token vault is not visible yet. Wait a few seconds and try again.');

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
    if (claimable <= 0n) throw new Error('Nothing to claim yet — wait for more of the stream to vest, then try again.');
    const vaultAmount = toBigInt(vaultUtxo.token?.amount);
    if (claimable > vaultAmount) throw new Error('The claim amount is more than the tokens the stream currently holds. Refresh and try again.');
    const remaining = vaultAmount - claimable;

    const newTotalReleased = totalReleased + claimable;
    const newStatus = newTotalReleased >= params.args.totalAmount ? 3 : 0;
    const newCommitment = encodeFtCommitment({ status: newStatus, flags, totalReleased: newTotalReleased, cursor, pauseStart: 0, recipientHash });

    const stateInSats = toBigInt(stateUtxo.satoshis);
    const vaultInSats = toBigInt(vaultUtxo.satoshis);

    const builder = new TransactionBuilder({ provider: this.provider })
      .setLocktime(locktime)
      .addInput(stateUtxo, contract.unlock.claim(placeholderSignature(), placeholderPublicKey()), { sequence: NON_FINAL_SEQUENCE })
      .addInput(vaultUtxo, contract.unlock.claim(placeholderSignature(), placeholderPublicKey()), { sequence: NON_FINAL_SEQUENCE })
      .addOutput({ to: toTokenAwareAddress(params.recipientAddress), amount: OUTPUT_DUST, token: { category: params.ftCategory, amount: claimable } });

    if (remaining > 0n) {
      const stateOut = stateInSats + vaultInSats - OUTPUT_DUST - OUTPUT_DUST - CLAIM_FEE;
      builder
        .addOutput({ to: contract.tokenAddress, amount: stateOut, token: { category: params.stateCategory, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(newCommitment) } } })
        .addOutput({ to: contract.tokenAddress, amount: OUTPUT_DUST, token: { category: params.ftCategory, amount: remaining } });
    } else {
      const stateOut = stateInSats + vaultInSats - OUTPUT_DUST - CLAIM_FEE;
      builder.addOutput({ to: contract.tokenAddress, amount: stateOut, token: { category: params.stateCategory, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(newCommitment) } } });
    }

    const wcTransaction = finalizeWcTransactionSequences(
      builder.generateWcTransactionObject({ broadcast: true, userPrompt: 'Claim vested CashTokens' }),
    );
    return { claimable, remaining, wcTransaction };
  }

  /** Pause: sender-signed, touches ONLY the state NFT (1 input -> 1 output). */
  async buildPauseWc(params: {
    args: FtScheduleArgs;
    stateCategory: string;
    ftCategory: string;
    currentCommitment: Uint8Array;
    nowSeconds: number;
  }): Promise<{ wcTransaction: WcTransactionObject }> {
    const contract = this.deriveContract(params.args, params.stateCategory, params.ftCategory);
    const stateUtxo = (await this.provider.getUtxos(contract.tokenAddress))
      .find((u) => Boolean(u.token?.nft) && u.token?.category === params.stateCategory);
    if (!stateUtxo) throw new Error('The stream is still confirming on-chain — its state is not visible yet. Wait a few seconds and try again.');
    const c = params.currentCommitment;
    if (c[0] !== 0) throw new Error('This stream can only be paused while it is active.');
    const flags = c[1];
    const totalReleased = new DataView(c.buffer, c.byteOffset + 2, 8).getBigUint64(0, true);
    const cursor = readUint40LE(c, 10);
    const recipientHash = c.slice(20, 40);
    const locktime = params.nowSeconds - CLAIM_LOCKTIME_BUFFER;
    const newCommitment = encodeFtCommitment({ status: 1, flags, totalReleased, cursor, pauseStart: locktime, recipientHash });
    const stateOut = toBigInt(stateUtxo.satoshis) - 2000n; // pause fee <= covenant cap 5000
    const builder = new TransactionBuilder({ provider: this.provider })
      .setLocktime(locktime)
      .addInput(stateUtxo, contract.unlock.pause(placeholderSignature(), placeholderPublicKey()), { sequence: NON_FINAL_SEQUENCE })
      .addOutput({ to: contract.tokenAddress, amount: stateOut, token: { category: params.stateCategory, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(newCommitment) } } });
    return { wcTransaction: finalizeWcTransactionSequences(builder.generateWcTransactionObject({ broadcast: true, userPrompt: 'Pause stream' })) };
  }

  /** Resume: sender-signed, advances the cursor by the pause duration (1 input -> 1 output). */
  async buildResumeWc(params: {
    args: FtScheduleArgs;
    stateCategory: string;
    ftCategory: string;
    currentCommitment: Uint8Array;
    nowSeconds: number;
  }): Promise<{ wcTransaction: WcTransactionObject }> {
    const contract = this.deriveContract(params.args, params.stateCategory, params.ftCategory);
    const stateUtxo = (await this.provider.getUtxos(contract.tokenAddress))
      .find((u) => Boolean(u.token?.nft) && u.token?.category === params.stateCategory);
    if (!stateUtxo) throw new Error('The stream is still confirming on-chain — its state is not visible yet. Wait a few seconds and try again.');
    const c = params.currentCommitment;
    if (c[0] !== 1) throw new Error('This stream can only be resumed while it is paused.');
    const flags = c[1];
    const totalReleased = new DataView(c.buffer, c.byteOffset + 2, 8).getBigUint64(0, true);
    const cursor = readUint40LE(c, 10);
    const pauseStart = readUint40LE(c, 15);
    const recipientHash = c.slice(20, 40);
    const locktime = params.nowSeconds - CLAIM_LOCKTIME_BUFFER;
    if (locktime <= pauseStart) throw new Error('Please wait a moment before resuming — a little time must pass after pausing.');
    const newCursor = cursor + (locktime - pauseStart);
    const newCommitment = encodeFtCommitment({ status: 0, flags, totalReleased, cursor: newCursor, pauseStart: 0, recipientHash });
    const stateOut = toBigInt(stateUtxo.satoshis) - 2000n;
    const builder = new TransactionBuilder({ provider: this.provider })
      .setLocktime(locktime)
      .addInput(stateUtxo, contract.unlock.resume(placeholderSignature(), placeholderPublicKey()), { sequence: NON_FINAL_SEQUENCE })
      .addOutput({ to: contract.tokenAddress, amount: stateOut, token: { category: params.stateCategory, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(newCommitment) } } });
    return { wcTransaction: finalizeWcTransactionSequences(builder.generateWcTransactionObject({ broadcast: true, userPrompt: 'Resume stream' })) };
  }

  /** Cancel: sender-signed, splits vested->recipient / unvested->sender, burns the state NFT. */
  async buildCancelWc(params: {
    args: FtScheduleArgs;
    stateCategory: string;
    ftCategory: string;
    currentCommitment: Uint8Array;
    recipientAddress: string;
    senderAddress: string;
    nowSeconds: number;
  }): Promise<{ claimableNow: bigint; unvested: bigint; wcTransaction: WcTransactionObject }> {
    const contract = this.deriveContract(params.args, params.stateCategory, params.ftCategory);
    const utxos = await this.provider.getUtxos(contract.tokenAddress);
    const stateUtxo = utxos.find((u) => Boolean(u.token?.nft) && u.token?.category === params.stateCategory);
    const vaultUtxo = utxos.find((u) => u.token?.category === params.ftCategory && !u.token?.nft);
    if (!stateUtxo || !vaultUtxo) throw new Error('The stream is still confirming on-chain — its state or token vault is not visible yet. Wait a few seconds and try again.');
    const c = params.currentCommitment;
    const totalReleased = new DataView(c.buffer, c.byteOffset + 2, 8).getBigUint64(0, true);
    const cursor = readUint40LE(c, 10);
    const locktime = params.nowSeconds - CLAIM_LOCKTIME_BUFFER;
    const vested = FtVestingService.vestedTotal(params.args, locktime, cursor);
    const claimableNow = vested - totalReleased > 0n ? vested - totalReleased : 0n;
    const vaultAmount = toBigInt(vaultUtxo.token?.amount);
    const unvested = vaultAmount - claimableNow;
    const bch = toBigInt(stateUtxo.satoshis) + toBigInt(vaultUtxo.satoshis);
    const CANCEL_FEE = 4000n;
    const recipientTokenAddr = toTokenAwareAddress(params.recipientAddress);
    const senderTokenAddr = toTokenAwareAddress(params.senderAddress);

    const builder = new TransactionBuilder({ provider: this.provider })
      .setLocktime(locktime)
      .addInput(stateUtxo, contract.unlock.cancel(placeholderSignature(), placeholderPublicKey()), { sequence: NON_FINAL_SEQUENCE })
      .addInput(vaultUtxo, contract.unlock.cancel(placeholderSignature(), placeholderPublicKey()), { sequence: NON_FINAL_SEQUENCE });

    if (claimableNow > 0n && unvested > 0n) {
      const half = (bch - CANCEL_FEE) / 2n;
      builder
        .addOutput({ to: recipientTokenAddr, amount: half, token: { category: params.ftCategory, amount: claimableNow } })
        .addOutput({ to: senderTokenAddr, amount: bch - CANCEL_FEE - half, token: { category: params.ftCategory, amount: unvested } });
    } else if (claimableNow > 0n) {
      builder.addOutput({ to: recipientTokenAddr, amount: bch - CANCEL_FEE, token: { category: params.ftCategory, amount: claimableNow } });
    } else {
      builder.addOutput({ to: senderTokenAddr, amount: bch - CANCEL_FEE, token: { category: params.ftCategory, amount: unvested } });
    }
    return {
      claimableNow,
      unvested,
      wcTransaction: finalizeWcTransactionSequences(builder.generateWcTransactionObject({ broadcast: true, userPrompt: 'Cancel stream' })),
    };
  }

  /** Transfer: current recipient reassigns the stream to a new recipient (state NFT only). */
  async buildTransferWc(params: {
    args: FtScheduleArgs;
    stateCategory: string;
    ftCategory: string;
    currentCommitment: Uint8Array;
    newRecipientAddress: string;
  }): Promise<{ wcTransaction: WcTransactionObject }> {
    const contract = this.deriveContract(params.args, params.stateCategory, params.ftCategory);
    const stateUtxo = (await this.provider.getUtxos(contract.tokenAddress))
      .find((u) => Boolean(u.token?.nft) && u.token?.category === params.stateCategory);
    if (!stateUtxo) throw new Error('The stream is still confirming on-chain — its state is not visible yet. Wait a few seconds and try again.');
    const c = params.currentCommitment;
    if (c[0] !== 0) throw new Error('This stream can only be transferred to a new recipient while it is active.');
    const newRecipientHash = addressToHash160(params.newRecipientAddress);
    const newCommitment = new Uint8Array(40);
    newCommitment.set(c.slice(0, 20), 0); // covenant keeps status/flags/released/cursor/pause
    newCommitment.set(newRecipientHash, 20);
    const stateOut = toBigInt(stateUtxo.satoshis) - 2000n;
    const builder = new TransactionBuilder({ provider: this.provider })
      .addInput(
        stateUtxo,
        contract.unlock.transfer(placeholderSignature(), placeholderPublicKey(), binToHex(newRecipientHash)),
        { sequence: NON_FINAL_SEQUENCE },
      )
      .addOutput({ to: contract.tokenAddress, amount: stateOut, token: { category: params.stateCategory, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(newCommitment) } } });
    return { wcTransaction: finalizeWcTransactionSequences(builder.generateWcTransactionObject({ broadcast: true, userPrompt: 'Transfer stream' })) };
  }
}

interface FundingSourceOutput {
  txid: string;
  vout: number;
  satoshis: number;
  tokenCategory?: string;
  tokenAmount?: string;
  tokenNftCapability?: 'none' | 'mutable' | 'minting';
  tokenNftCommitment?: string;
}

interface FundingOutputSpec {
  to: string;
  amount: string;
  token?: {
    category: string;
    amount: string;
    nft?: { commitment: string; capability: 'none' | 'mutable' | 'minting' };
  };
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
