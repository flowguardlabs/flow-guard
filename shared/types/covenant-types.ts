/**
 * Shared Covenant Types
 *
 * TypeScript type definitions for all UTXO covenant states
 * Used by: frontend, backend, indexer, executor, SDK, validator
 *
 * NOTE: These types mirror the NFT commitment encodings in contracts/lib/StateEncoding.cash
 * Keep in sync with on-chain state layouts
 */

/**
 * VaultState (32 bytes NFT commitment)
 *
 * Layout:
 * [0-3]:   version (uint32)
 * [4]:     status (uint8)
 * [5-7]:   rolesMask (24-bit bitfield)
 * [8-15]:  current_period_id (uint64)
 * [16-23]: spent_this_period (uint64, satoshis)
 * [24-31]: last_update_timestamp (uint64, unix seconds)
 */
export interface VaultState {
  version: number;
  status: VaultStatus;
  rolesMask: Buffer; // 3 bytes
  currentPeriodId: bigint;
  spentThisPeriod: bigint; // satoshis
  lastUpdateTimestamp: bigint; // unix seconds
}

export enum VaultStatus {
  ACTIVE = 0,
  PAUSED = 1,
  EMERGENCY_LOCK = 2,
  MIGRATING = 3,
}

/**
 * ProposalState (64 bytes NFT commitment)
 *
 * Layout:
 * [0-3]:   version
 * [4]:     status
 * [5-7]:   approval_count (uint24)
 * [8-11]:  required_approvals (uint32)
 * [12-19]: voting_end_timestamp (uint64)
 * [20-27]: execution_timelock (uint64)
 * [28-35]: payout_total (uint64, satoshis)
 * [36-63]: payout_hash (first 28 bytes of SHA256)
 */
export interface ProposalState {
  version: number;
  status: ProposalStatus;
  approvalCount: number;
  requiredApprovals: number;
  votingEndTimestamp: bigint;
  executionTimelock: bigint;
  payoutTotal: bigint; // satoshis
  payoutHash: Buffer; // 28 bytes
}

export enum ProposalStatus {
  DRAFT = 0,
  SUBMITTED = 1,
  VOTING = 2,
  APPROVED = 3,
  QUEUED = 4,
  EXECUTABLE = 5,
  EXECUTED = 6,
  CANCELLED = 7,
  EXPIRED = 8,
}

/**
 * ScheduleState (48 bytes NFT commitment)
 *
 * Layout:
 * [0-3]:   version
 * [4]:     schedule_type
 * [5-7]:   reserved
 * [8-15]:  interval_seconds
 * [16-23]: next_unlock_timestamp
 * [24-31]: amount_per_interval
 * [32-39]: total_released_so_far
 * [40-47]: cliff_timestamp (0 if no cliff)
 */
export interface ScheduleState {
  version: number;
  scheduleType: ScheduleType;
  intervalSeconds: bigint;
  nextUnlockTimestamp: bigint;
  amountPerInterval: bigint; // satoshis
  totalReleased: bigint; // satoshis
  cliffTimestamp: bigint; // unix seconds, 0 if no cliff
}

export enum ScheduleType {
  RECURRING = 0,
  LINEAR_VESTING = 1,
  STEP_VESTING = 2,
}

/**
 * VoteState (32 bytes NFT commitment)
 *
 * Layout:
 * [0-3]:   version
 * [4-7]:   proposal_id (first 4 bytes of hash)
 * [8]:     vote_choice
 * [9-15]:  reserved
 * [16-23]: lock_timestamp
 * [24-31]: unlock_timestamp
 */
export interface VoteState {
  version: number;
  proposalIdPrefix: Buffer; // 4 bytes
  voteChoice: VoteChoice;
  lockTimestamp: bigint;
  unlockTimestamp: bigint;
}

export enum VoteChoice {
  AGAINST = 0,
  FOR = 1,
  ABSTAIN = 2,
}

/**
 * TallyState (48 bytes NFT commitment)
 *
 * Layout:
 * [0-3]:   version
 * [4-7]:   proposal_id (first 4 bytes)
 * [8-15]:  total_votes_for (uint64)
 * [16-23]: total_votes_against (uint64)
 * [24-31]: total_votes_abstain (uint64)
 * [32-39]: quorum_threshold (uint64)
 * [40-47]: tally_timestamp (uint64)
 */
export interface TallyState {
  version: number;
  proposalIdPrefix: Buffer; // 4 bytes
  votesFor: bigint; // token amount
  votesAgainst: bigint;
  votesAbstain: bigint;
  quorumThreshold: bigint;
  tallyTimestamp: bigint;
}

/**
 * UTXO Reference
 *
 * Identifies a specific UTXO on-chain
 */
export interface UTXORef {
  txid: string; // hex string
  vout: number; // output index
}

/**
 * CashToken Data
 *
 * NFT and/or Fungible Token data for UTXO
 */
export interface CashTokenData {
  category: string; // hex string (32 bytes)
  nft?: {
    capability?: 'none' | 'mutable' | 'minting';
    commitment: Buffer; // Variable length 0-40 bytes
  };
  amount?: bigint; // Fungible token amount (if present)
}

/**
 * Covenant UTXO (Generic)
 *
 * Base type for all covenant UTXOs
 */
export interface CovenantUTXO<TState = any> {
  utxo: UTXORef;
  address: string; // Covenant P2SH32 address
  satoshis: bigint; // BCH amount
  token?: CashTokenData; // CashTokens data (if present)
  state: TState; // Decoded NFT commitment state
  height: number; // Block height where UTXO was created
  timestamp: bigint; // Block timestamp
}

/**
 * Specific UTXO Types
 */
export type VaultUTXO = CovenantUTXO<VaultState>;
export type ProposalUTXO = CovenantUTXO<ProposalState>;
export type ScheduleUTXO = CovenantUTXO<ScheduleState>;
export type VoteUTXO = CovenantUTXO<VoteState>;
export type TallyUTXO = CovenantUTXO<TallyState>;
