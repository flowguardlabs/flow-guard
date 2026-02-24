/**
 * Shared Policy Types
 *
 * TypeScript type definitions for treasury policies and guardrails
 * Used by: frontend, backend, indexer, executor, SDK
 */

/**
 * Treasury Policy
 *
 * Defines all governance rules and constraints for a treasury
 * Committed on-chain as hash, stored off-chain in full
 */
export interface TreasuryPolicy {
  version: number;
  policyId: string; // Hash of this policy (32 bytes hex)

  // Multisig Configuration
  multisig: MultisigConfig;

  // Spending Guardrails
  guardrails: Guardrails;

  // Governance Rules
  governance: GovernanceRules;

  // Time Periods
  periods: PeriodConfig;

  // Metadata
  metadata: PolicyMetadata;
}

/**
 * Multisig Configuration
 */
export interface MultisigConfig {
  requiredApprovals: number; // M (e.g., 2)
  totalSigners: number; // N (e.g., 3)
  signers: Signer[];
  signerSetHash: string; // Hash of all signer pubkey hashes (32 bytes hex)
}

export interface Signer {
  pubkeyHash: string; // 20 bytes hex (hash160 of pubkey)
  roles: SignerRole[];
  label?: string; // Off-chain metadata
  addedAt: bigint; // Timestamp when signer was added
}

export enum SignerRole {
  APPROVER = 0, // Can approve proposals
  EXECUTOR = 1, // Can execute approved proposals
  PAUSER = 2, // Can pause vault
  GUARDIAN = 3, // Can emergency lock
  // Bits 4-23 reserved for future roles
}

/**
 * Spending Guardrails
 */
export interface Guardrails {
  // Period Cap
  periodCap: bigint; // Max spending per period (satoshis), 0 = no limit

  // Recipient Constraints
  recipientCap: bigint; // Max per-recipient payout (satoshis), 0 = no limit
  allowlist?: GuardrailList; // If present, only these recipients allowed
  denylist?: GuardrailList; // If present, these recipients forbidden

  // Category Budgets
  categoryBudgets?: CategoryBudget[];
}

export interface GuardrailList {
  enabled: boolean;
  addresses: string[]; // Array of address hashes (20 bytes hex each)
  addressesHash: string; // Hash of addresses array (for on-chain commitment)
}

export interface CategoryBudget {
  categoryId: number; // 0=ops, 1=grants, 2=marketing, etc.
  label: string; // Off-chain label
  budgetPerPeriod: bigint; // Max spending per period (satoshis), 0 = no limit
  spentThisPeriod: bigint; // Current spending (tracked off-chain, validated on-chain)
}

/**
 * Governance Rules
 */
export interface GovernanceRules {
  // Proposal Voting
  votingPeriod: bigint; // Seconds (e.g., 7 days)
  executionDelay: bigint; // Timelock after approval (e.g., 2 days)

  // Quorum and Majority
  quorumThreshold: bigint; // Min token amount to vote (e.g., 0.01 BCH worth)
  majorityThreshold: number; // Percentage (e.g., 50 = 50%)

  // Vote Tallying
  maxVotesPerTally: number; // Max voters for trustless on-chain tally
  hybridFallback: boolean; // Use M-of-N attested tally if exceeded
}

/**
 * Period Configuration
 */
export interface PeriodConfig {
  periodDuration: bigint; // Seconds (e.g., 30 days)
  startTimestamp: bigint; // When first period started (unix seconds)
}

/**
 * Policy Metadata
 */
export interface PolicyMetadata {
  name: string; // Treasury name (e.g., "BCH Builder Grants")
  description?: string;
  createdAt: bigint;
  createdBy?: string; // Creator address or identifier
}

/**
 * Payout Request
 *
 * Describes a proposed spending from treasury
 * Submitted as proposal, validated against guardrails
 */
export interface PayoutRequest {
  recipients: PayoutRecipient[];
  totalAmount: bigint; // Sum of all recipient amounts (satoshis)
  payoutHash: string; // Hash of recipients array (32 bytes hex)
  category?: number; // Category ID for budget tracking
}

export interface PayoutRecipient {
  address: string; // BCH address (cashaddr format)
  addressHash: string; // 20 bytes hex (for covenant validation)
  amount: bigint; // Satoshis
  label?: string; // Off-chain label (e.g., "Q1 Grant - Alice")
  category?: number; // Category ID
}

/**
 * Proposal (Off-chain Data)
 *
 * Full proposal metadata stored off-chain
 * Hash committed in ProposalState on-chain
 */
export interface Proposal {
  proposalId: string; // 32 bytes hex (hash of proposal)
  title: string;
  description: string;
  payout: PayoutRequest;
  submittedBy: string; // Submitter address or identifier
  submittedAt: bigint;
  status: ProposalStatus; // Mirrors on-chain ProposalStatus
}

/**
 * User-facing proposal status for frontend
 */
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
