/**
 * NFTMinter Service
 *
 * PURPOSE: Construct genesis transactions for covenant NFT minting
 * - VaultNFT (CreateVault)
 * - ProposalNFT (SubmitProposal)
 * - ScheduleNFT (CreateSchedule)
 * - VoteNFT (CastVote)
 * - TallyNFT (CreateTally)
 *
 * ARCHITECTURE:
 * - Uses CashScript SDK for covenant deployment
 * - Encodes NFT commitments per CashTokens spec
 * - Returns unsigned transaction templates for frontend signing
 *
 * CASHTOKENS NFT MINTING:
 * - NFT category = hash of genesis outpoint (first input txid:vout)
 * - NFT commitment = variable length 0-40 bytes (state encoding)
 * - Minting capability required in genesis tx (created automatically)
 */

import { ElectrumNetworkProvider, Contract, SignatureTemplate } from 'cashscript';
import crypto from 'crypto';
import {
  VaultState,
  ProposalState,
  ScheduleState,
  VoteState,
  TallyState,
  VaultStatus,
  ProposalStatus,
  ScheduleType,
  VoteChoice,
} from '@flowguard/shared/types/covenant-types';

/**
 * NFT Minter Configuration
 */
export interface MinterConfig {
  network: 'mainnet' | 'chipnet';
  electrumServer: string;
  covenantArtifacts: {
    vaultCovenant: any; // Compiled CashScript artifact
    proposalCovenant: any;
    scheduleCovenant: any;
    voteLockCovenant: any;
    tallyCovenant: any;
  };
}

/**
 * Unsigned Transaction Template
 */
export interface UnsignedTransaction {
  hex: string; // Raw transaction hex
  inputs: Array<{
    txid: string;
    vout: number;
    satoshis: bigint;
  }>;
  outputs: Array<{
    address?: string;
    satoshis: bigint;
    token?: any;
  }>;
  nftCategory?: string; // NFT category ID (for reference)
}

/**
 * CreateVault Input Parameters
 */
export interface CreateVaultInput {
  fundingUTXOs: Array<{
    txid: string;
    vout: number;
    satoshis: bigint;
    privateKey?: string; // Optional, for server-side signing
  }>;
  initialBalance: bigint; // Satoshis to put in vault
  policyHash: Buffer; // SHA256 hash of policy document (32 bytes)
  signerPubkeys: Buffer[]; // Signer public keys (for signerSetHash)
  rolesMask: Buffer; // 3-byte bitfield for roles
  periodDuration: number; // Seconds per budget period
  periodCap: bigint; // Max spending per period (satoshis)
  recipientCap: bigint; // Max per recipient
  allowlistEnabled: boolean;
  allowlist: string[]; // BCH addresses (max 3 pre-Layla)
  categoryBudgets: {
    ops: bigint;
    grants: bigint;
    marketing: bigint;
  };
}

/**
 * SubmitProposal Input Parameters
 */
export interface SubmitProposalInput {
  vaultAddress: string; // Vault to spend from
  proposerDustUTXO: {
    txid: string;
    vout: number;
    satoshis: bigint;
  };
  payouts: Array<{
    address: string;
    amount: bigint;
    category: string; // ops/grants/marketing
  }>;
  requiredApprovals: number; // M-of-N threshold
  votingDuration: number; // Seconds (if governance vote)
  executionDelay: number; // Timelock delay in seconds
}

/**
 * CreateSchedule Input Parameters
 */
export interface CreateScheduleInput {
  fundingUTXOs: Array<{
    txid: string;
    vout: number;
    satoshis: bigint;
  }>;
  totalAmount: bigint; // Total to lock in schedule
  beneficiaryAddress: string;
  scheduleType: ScheduleType; // RECURRING, LINEAR_VESTING, STEP_VESTING
  intervalSeconds: bigint; // Time between unlocks
  amountPerInterval: bigint; // Amount per unlock
  cliffTimestamp: bigint; // Cliff (0 if none)
}

/**
 * CastVote Input Parameters
 */
export interface CastVoteInput {
  proposalId: string; // Proposal hash
  governanceTokenUTXOs: Array<{
    txid: string;
    vout: number;
    satoshis: bigint;
    tokenAmount: bigint; // GovernanceFT amount
  }>;
  voteChoice: VoteChoice; // FOR, AGAINST, ABSTAIN
  unlockTimestamp: bigint; // When tokens unlock (voting_end + buffer)
}

/**
 * NFTMinter Service
 */
export class NFTMinter {
  private config: MinterConfig;
  private provider: ElectrumNetworkProvider;

  constructor(config: MinterConfig) {
    this.config = config;
    this.provider = new ElectrumNetworkProvider(config.network);
  }

  /**
   * Build CreateVault transaction
   *
   * Transaction structure:
   * - Input[0...n]: Funding UTXOs (BCH to seed vault)
   * - Output[0]: VaultUTXO (newly minted VaultNFT with initial state)
   * - Output[1]: ChangeUTXO (if any)
   *
   * NFT Minting:
   * - Category = hash(input[0].outpoint) = hash(fundingUTXOs[0].txid:vout)
   * - Commitment = encodeVaultState(initial_state)
   * - Capability = none (genesis minting handled by CashScript)
   *
   * @param input - CreateVault parameters
   * @returns Unsigned transaction template
   */
  async buildCreateVaultTx(input: CreateVaultInput): Promise<UnsignedTransaction> {
    console.log('[NFTMinter] Building CreateVault transaction...');

    // 1. Compute signerSetHash (hash of concatenated pubkeys)
    const signerSetHash = this.computeSignerSetHash(input.signerPubkeys);

    // 2. Encode initial VaultState commitment
    const initialState: VaultState = {
      version: 1,
      status: VaultStatus.ACTIVE,
      rolesMask: input.rolesMask,
      currentPeriodId: BigInt(Math.floor(Date.now() / 1000 / input.periodDuration)),
      spentThisPeriod: BigInt(0),
      lastUpdateTimestamp: BigInt(Math.floor(Date.now() / 1000)),
    };

    const vaultCommitment = this.encodeVaultState(initialState);

    // 3. Compute NFT category (hash of first input outpoint)
    // Category = hash(txid || vout) per CashTokens spec
    const genesisOutpoint = Buffer.concat([
      Buffer.from(input.fundingUTXOs[0].txid, 'hex').reverse(), // Little-endian
      Buffer.alloc(4),
    ]);
    genesisOutpoint.writeUInt32LE(input.fundingUTXOs[0].vout, 32);
    const nftCategory = crypto.createHash('sha256').update(genesisOutpoint).digest('hex');

    console.log('[NFTMinter]   NFT Category:', nftCategory);
    console.log('[NFTMinter]   Policy Hash:', input.policyHash.toString('hex'));
    console.log('[NFTMinter]   Signer Set Hash:', signerSetHash.toString('hex'));

    // 4. Instantiate VaultCovenant with constructor parameters
    // NOTE: In production, this would use CashScript Contract.fromArtifact()
    // For now, return transaction structure (actual contract deployment pending CashScript integration)

    const totalInputValue = input.fundingUTXOs.reduce(
      (sum, utxo) => sum + utxo.satoshis,
      BigInt(0),
    );

    const changeAmount = totalInputValue - input.initialBalance - BigInt(1000); // 1000 sat tx fee

    const tx: UnsignedTransaction = {
      hex: '', // To be filled by CashScript
      inputs: input.fundingUTXOs.map((utxo) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        satoshis: utxo.satoshis,
      })),
      outputs: [
        // Output 0: VaultUTXO with minted VaultNFT
        {
          satoshis: input.initialBalance,
          token: {
            category: nftCategory,
            nft: {
              capability: 'none' as const,
              commitment: vaultCommitment,
            },
          },
        },
        // Output 1: Change (if any)
        ...(changeAmount > BigInt(546)
          ? [
              {
                satoshis: changeAmount,
              },
            ]
          : []),
      ],
      nftCategory,
    };

    console.log('[NFTMinter]   ✓ CreateVault tx built:', {
      inputCount: tx.inputs.length,
      outputCount: tx.outputs.length,
      initialBalance: input.initialBalance.toString(),
      nftCategory,
    });

    // TODO: Use CashScript SDK to generate actual transaction hex:
    // const contract = Contract.fromArtifact(
    //   this.config.covenantArtifacts.vaultCovenant,
    //   [input.policyHash, signerSetHash, input.rolesMask, ...],
    //   this.provider
    // );
    // const unsignedTx = await contract.deploy(input.initialBalance, vaultCommitment);
    // return { hex: unsignedTx.toHex(), ... };

    return tx;
  }

  /**
   * Build SubmitProposal transaction
   *
   * Transaction structure:
   * - Input[0]: ProposerDustUTXO (546 sats for ProposalNFT)
   * - Output[0]: ProposalUTXO (newly minted ProposalNFT)
   * - Output[1]: Change (if any)
   *
   * NFT Minting:
   * - Category = hash(input[0].outpoint)
   * - Commitment = encodeProposalState(initial_state)
   *
   * @param input - SubmitProposal parameters
   * @returns Unsigned transaction template
   */
  async buildSubmitProposalTx(input: SubmitProposalInput): Promise<UnsignedTransaction> {
    console.log('[NFTMinter] Building SubmitProposal transaction...');

    // 1. Compute payout hash (SHA256 of payout data)
    const payoutHash = this.computePayoutHash(input.payouts);

    // 2. Compute payout total
    const payoutTotal = input.payouts.reduce((sum, p) => sum + p.amount, BigInt(0));

    // 3. Encode initial ProposalState commitment
    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    const initialState: ProposalState = {
      version: 1,
      status: ProposalStatus.SUBMITTED,
      approvalCount: 0,
      requiredApprovals: input.requiredApprovals,
      votingEndTimestamp: currentTime + BigInt(input.votingDuration),
      executionTimelock: currentTime + BigInt(input.executionDelay),
      payoutTotal,
      payoutHash: payoutHash.slice(0, 28), // First 28 bytes
    };

    const proposalCommitment = this.encodeProposalState(initialState);

    // 4. Compute NFT category (hash of first input outpoint)
    const genesisOutpoint = Buffer.concat([
      Buffer.from(input.proposerDustUTXO.txid, 'hex').reverse(),
      Buffer.alloc(4),
    ]);
    genesisOutpoint.writeUInt32LE(input.proposerDustUTXO.vout, 32);
    const nftCategory = crypto.createHash('sha256').update(genesisOutpoint).digest('hex');

    console.log('[NFTMinter]   NFT Category:', nftCategory);
    console.log('[NFTMinter]   Payout Hash:', payoutHash.toString('hex'));
    console.log('[NFTMinter]   Payout Total:', payoutTotal.toString());

    const tx: UnsignedTransaction = {
      hex: '',
      inputs: [
        {
          txid: input.proposerDustUTXO.txid,
          vout: input.proposerDustUTXO.vout,
          satoshis: input.proposerDustUTXO.satoshis,
        },
      ],
      outputs: [
        // Output 0: ProposalUTXO with minted ProposalNFT
        {
          satoshis: BigInt(546), // Dust for NFT
          token: {
            category: nftCategory,
            nft: {
              capability: 'none' as const,
              commitment: proposalCommitment,
            },
          },
        },
        // Output 1: Change (if any)
        ...(input.proposerDustUTXO.satoshis > BigInt(546 + 500)
          ? [
              {
                satoshis: input.proposerDustUTXO.satoshis - BigInt(546 + 500), // 500 sat fee
              },
            ]
          : []),
      ],
      nftCategory,
    };

    console.log('[NFTMinter]   ✓ SubmitProposal tx built:', {
      nftCategory,
      status: ProposalStatus[initialState.status],
      requiredApprovals: initialState.requiredApprovals,
    });

    return tx;
  }

  /**
   * Build CreateSchedule transaction
   *
   * Transaction structure:
   * - Input[0...n]: Funding UTXOs (BCH to lock in schedule)
   * - Output[0]: ScheduleUTXO (newly minted ScheduleNFT)
   * - Output[1]: Change (if any)
   *
   * NFT Minting:
   * - Category = hash(input[0].outpoint)
   * - Commitment = encodeScheduleState(initial_state)
   *
   * @param input - CreateSchedule parameters
   * @returns Unsigned transaction template
   */
  async buildCreateScheduleTx(input: CreateScheduleInput): Promise<UnsignedTransaction> {
    console.log('[NFTMinter] Building CreateSchedule transaction...');

    // 1. Compute initial unlock timestamp (now + interval)
    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    const nextUnlock = currentTime + input.intervalSeconds;

    // 2. Encode initial ScheduleState commitment
    const initialState: ScheduleState = {
      version: 1,
      scheduleType: input.scheduleType,
      intervalSeconds: input.intervalSeconds,
      nextUnlockTimestamp: nextUnlock,
      amountPerInterval: input.amountPerInterval,
      totalReleased: BigInt(0),
      cliffTimestamp: input.cliffTimestamp,
    };

    const scheduleCommitment = this.encodeScheduleState(initialState);

    // 3. Compute NFT category (hash of first input outpoint)
    const genesisOutpoint = Buffer.concat([
      Buffer.from(input.fundingUTXOs[0].txid, 'hex').reverse(),
      Buffer.alloc(4),
    ]);
    genesisOutpoint.writeUInt32LE(input.fundingUTXOs[0].vout, 32);
    const nftCategory = crypto.createHash('sha256').update(genesisOutpoint).digest('hex');

    console.log('[NFTMinter]   NFT Category:', nftCategory);
    console.log('[NFTMinter]   Schedule Type:', ScheduleType[initialState.scheduleType]);
    console.log('[NFTMinter]   Next Unlock:', new Date(Number(nextUnlock) * 1000).toISOString());

    const totalInputValue = input.fundingUTXOs.reduce(
      (sum, utxo) => sum + utxo.satoshis,
      BigInt(0),
    );

    const changeAmount = totalInputValue - input.totalAmount - BigInt(1000); // 1000 sat tx fee

    const tx: UnsignedTransaction = {
      hex: '',
      inputs: input.fundingUTXOs.map((utxo) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        satoshis: utxo.satoshis,
      })),
      outputs: [
        // Output 0: ScheduleUTXO with minted ScheduleNFT
        {
          satoshis: input.totalAmount,
          token: {
            category: nftCategory,
            nft: {
              capability: 'none' as const,
              commitment: scheduleCommitment,
            },
          },
        },
        // Output 1: Change (if any)
        ...(changeAmount > BigInt(546)
          ? [
              {
                satoshis: changeAmount,
              },
            ]
          : []),
      ],
      nftCategory,
    };

    console.log('[NFTMinter]   ✓ CreateSchedule tx built:', {
      inputCount: tx.inputs.length,
      outputCount: tx.outputs.length,
      totalAmount: input.totalAmount.toString(),
      nftCategory,
    });

    return tx;
  }

  /**
   * Build CastVote transaction
   *
   * Transaction structure:
   * - Input[0...n]: GovernanceFT UTXOs (tokens to lock with vote)
   * - Output[0]: VoteUTXO (minted VoteNFT + locked GovernanceFT)
   *
   * NFT Minting:
   * - Category = same as GovernanceFT category (vote locks tokens)
   * - Commitment = encodeVoteState(vote_choice, lock_time)
   *
   * @param input - CastVote parameters
   * @returns Unsigned transaction template
   */
  async buildCastVoteTx(input: CastVoteInput): Promise<UnsignedTransaction> {
    console.log('[NFTMinter] Building CastVote transaction...');

    // 1. Encode VoteState commitment
    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    const proposalIdPrefix = Buffer.from(input.proposalId.slice(0, 8), 'hex'); // First 4 bytes

    const initialState: VoteState = {
      version: 1,
      proposalIdPrefix,
      voteChoice: input.voteChoice,
      lockTimestamp: currentTime,
      unlockTimestamp: input.unlockTimestamp,
    };

    const voteCommitment = this.encodeVoteState(initialState);

    // 2. Compute total token amount
    const totalTokens = input.governanceTokenUTXOs.reduce(
      (sum, utxo) => sum + utxo.tokenAmount,
      BigInt(0),
    );

    // 3. NFT category = GovernanceFT category (tokens are locked)
    // NOTE: This assumes all governanceTokenUTXOs have the same category
    // In production, validate all inputs have matching category
    const nftCategory = 'governance-token-category-placeholder'; // Should be extracted from input UTXOs

    console.log('[NFTMinter]   Vote Choice:', VoteChoice[initialState.voteChoice]);
    console.log('[NFTMinter]   Total Tokens:', totalTokens.toString());
    console.log('[NFTMinter]   Unlock Time:', new Date(Number(input.unlockTimestamp) * 1000).toISOString());

    const tx: UnsignedTransaction = {
      hex: '',
      inputs: input.governanceTokenUTXOs.map((utxo) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        satoshis: utxo.satoshis,
      })),
      outputs: [
        // Output 0: VoteUTXO (VoteNFT + locked GovernanceFT)
        {
          satoshis: BigInt(546), // Dust for NFT
          token: {
            category: nftCategory,
            nft: {
              capability: 'none' as const,
              commitment: voteCommitment,
            },
            amount: totalTokens, // Locked GovernanceFT amount
          },
        },
      ],
      nftCategory,
    };

    console.log('[NFTMinter]   ✓ CastVote tx built:', {
      inputCount: tx.inputs.length,
      voteChoice: VoteChoice[initialState.voteChoice],
      tokensLocked: totalTokens.toString(),
    });

    return tx;
  }

  // ==================== STATE ENCODING FUNCTIONS ====================

  /**
   * Encode VaultState into NFT commitment (32 bytes)
   *
   * Mirrors: contracts/lib/StateEncoding.cash :: encodeVaultState()
   */
  private encodeVaultState(state: VaultState): Buffer {
    const commitment = Buffer.alloc(32);

    // [0-3]: version
    commitment.writeUInt32BE(state.version, 0);

    // [4]: status
    commitment.writeUInt8(state.status, 4);

    // [5-7]: rolesMask (3 bytes)
    state.rolesMask.copy(commitment, 5, 0, 3);

    // [8-15]: current_period_id
    commitment.writeBigUInt64BE(state.currentPeriodId, 8);

    // [16-23]: spent_this_period
    commitment.writeBigUInt64BE(state.spentThisPeriod, 16);

    // [24-31]: last_update_timestamp
    commitment.writeBigUInt64BE(state.lastUpdateTimestamp, 24);

    return commitment;
  }

  /**
   * Encode ProposalState into NFT commitment (64 bytes)
   *
   * Mirrors: contracts/lib/StateEncoding.cash :: encodeProposalState()
   */
  private encodeProposalState(state: ProposalState): Buffer {
    const commitment = Buffer.alloc(64);

    // [0-3]: version
    commitment.writeUInt32BE(state.version, 0);

    // [4]: status
    commitment.writeUInt8(state.status, 4);

    // [5-7]: approval_count (uint24, 3 bytes big-endian)
    commitment.writeUInt8((state.approvalCount >> 16) & 0xff, 5);
    commitment.writeUInt8((state.approvalCount >> 8) & 0xff, 6);
    commitment.writeUInt8(state.approvalCount & 0xff, 7);

    // [8-11]: required_approvals
    commitment.writeUInt32BE(state.requiredApprovals, 8);

    // [12-19]: voting_end_timestamp
    commitment.writeBigUInt64BE(state.votingEndTimestamp, 12);

    // [20-27]: execution_timelock
    commitment.writeBigUInt64BE(state.executionTimelock, 20);

    // [28-35]: payout_total
    commitment.writeBigUInt64BE(state.payoutTotal, 28);

    // [36-63]: payout_hash (28 bytes)
    state.payoutHash.copy(commitment, 36, 0, 28);

    return commitment;
  }

  /**
   * Encode ScheduleState into NFT commitment (48 bytes)
   *
   * Mirrors: contracts/lib/StateEncoding.cash :: encodeScheduleState()
   */
  private encodeScheduleState(state: ScheduleState): Buffer {
    const commitment = Buffer.alloc(48);

    // [0-3]: version
    commitment.writeUInt32BE(state.version, 0);

    // [4]: schedule_type
    commitment.writeUInt8(state.scheduleType, 4);

    // [5-7]: reserved (zeros)

    // [8-15]: interval_seconds
    commitment.writeBigUInt64BE(state.intervalSeconds, 8);

    // [16-23]: next_unlock_timestamp
    commitment.writeBigUInt64BE(state.nextUnlockTimestamp, 16);

    // [24-31]: amount_per_interval
    commitment.writeBigUInt64BE(state.amountPerInterval, 24);

    // [32-39]: total_released
    commitment.writeBigUInt64BE(state.totalReleased, 32);

    // [40-47]: cliff_timestamp
    commitment.writeBigUInt64BE(state.cliffTimestamp, 40);

    return commitment;
  }

  /**
   * Encode VoteState into NFT commitment (32 bytes)
   *
   * Mirrors: contracts/lib/StateEncoding.cash :: encodeVoteState()
   */
  private encodeVoteState(state: VoteState): Buffer {
    const commitment = Buffer.alloc(32);

    // [0-3]: version
    commitment.writeUInt32BE(state.version, 0);

    // [4-7]: proposal_id (first 4 bytes)
    state.proposalIdPrefix.copy(commitment, 4, 0, 4);

    // [8]: vote_choice
    commitment.writeUInt8(state.voteChoice, 8);

    // [9-15]: reserved (zeros)

    // [16-23]: lock_timestamp
    commitment.writeBigUInt64BE(state.lockTimestamp, 16);

    // [24-31]: unlock_timestamp
    commitment.writeBigUInt64BE(state.unlockTimestamp, 24);

    return commitment;
  }

  /**
   * Encode TallyState into NFT commitment (48 bytes)
   *
   * Mirrors: contracts/lib/StateEncoding.cash :: encodeTallyState()
   */
  private encodeTallyState(state: TallyState): Buffer {
    const commitment = Buffer.alloc(48);

    // [0-3]: version
    commitment.writeUInt32BE(state.version, 0);

    // [4-7]: proposal_id (first 4 bytes)
    state.proposalIdPrefix.copy(commitment, 4, 0, 4);

    // [8-15]: total_votes_for
    commitment.writeBigUInt64BE(state.votesFor, 8);

    // [16-23]: total_votes_against
    commitment.writeBigUInt64BE(state.votesAgainst, 16);

    // [24-31]: total_votes_abstain
    commitment.writeBigUInt64BE(state.votesAbstain, 24);

    // [32-39]: quorum_threshold
    commitment.writeBigUInt64BE(state.quorumThreshold, 32);

    // [40-47]: tally_timestamp
    commitment.writeBigUInt64BE(state.tallyTimestamp, 40);

    return commitment;
  }

  // ==================== UTILITY FUNCTIONS ====================

  /**
   * Compute signerSetHash (SHA256 of concatenated pubkeys)
   *
   * Mirrors: VaultCovenant constructor validation
   */
  private computeSignerSetHash(pubkeys: Buffer[]): Buffer {
    const concatenated = Buffer.concat(pubkeys);
    return crypto.createHash('sha256').update(concatenated).digest();
  }

  /**
   * Compute payout hash (SHA256 of payout data)
   *
   * Mirrors: VaultCovenant.cash payout hash computation
   *
   * Format: SHA256(recipient1 + amount1 + recipient2 + amount2 + ...)
   */
  private computePayoutHash(
    payouts: Array<{ address: string; amount: bigint; category?: string }>,
  ): Buffer {
    // Convert addresses to hash160 (20 bytes)
    // Extract from P2PKH addresses
    const buffers: Buffer[] = [];

    for (const payout of payouts) {
      // Decode CashAddr to get hash160
      // NOTE: In production, use proper CashAddr decoding library
      const recipientHash = Buffer.alloc(20); // Placeholder
      buffers.push(recipientHash);

      // Add amount (8 bytes big-endian)
      const amountBuf = Buffer.alloc(8);
      amountBuf.writeBigUInt64BE(payout.amount, 0);
      buffers.push(amountBuf);
    }

    const combined = Buffer.concat(buffers);
    return crypto.createHash('sha256').update(combined).digest();
  }

  /**
   * Convert BCH address to hash160
   *
   * TODO: Implement proper CashAddr decoding
   */
  private addressToHash160(address: string): Buffer {
    // Placeholder - use cashaddr library in production
    return Buffer.alloc(20);
  }
}

export default NFTMinter;
