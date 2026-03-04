/**
 * Shared Covenant Parameters
 *
 * Current FlowGuard-wide constants used by contracts, frontend, backend,
 * indexer, executor, and SDK layers.
 *
 * These are implementation limits for the contracts currently shipped in the
 * product. They do not automatically expand when the BCH network activates new
 * VM features.
 */

/**
 * MAX_SIGNERS_PRE_LAYLA
 *
 * Current treasury/proposal contracts compile exactly three signer slots.
 */
export const MAX_SIGNERS_PRE_LAYLA = 3;

/**
 * MAX_VOTES_PRE_LAYLA
 *
 * Current fixed-max tally covenant supports three direct votes.
 */
export const MAX_VOTES_PRE_LAYLA = 3;

/**
 * MAX_RECIPIENTS_PRE_LAYLA
 *
 * Current treasury proposal execution targets one payout recipient.
 */
export const MAX_RECIPIENTS_PRE_LAYLA = 1;

/**
 * MAX_ALLOWLIST_SIZE
 *
 * Maximum addresses in recipient allowlist
 * Current treasury allowlist compiles three explicit address slots.
 */
export const MAX_ALLOWLIST_SIZE = 3;

/**
 * MAX_CATEGORY_COUNT
 *
 * Maximum budget categories
 * Hardcoded validation in GuardrailChecks
 */
export const MAX_CATEGORY_COUNT = 10; // Reasonable limit for pre-Layla

/**
 * NFT Commitment Sizes (per CashTokens spec)
 */
export const NFT_COMMITMENT_MIN_SIZE = 0; // Bytes
export const NFT_COMMITMENT_MAX_SIZE = 40; // Bytes (spec limit)

/**
 * Standard Commitment Sizes (Fixed-length encoding)
 */
export const VAULT_STATE_SIZE = 32; // Bytes
export const PROPOSAL_STATE_SIZE = 64; // Bytes
export const SCHEDULE_STATE_SIZE = 48; // Bytes
export const VOTE_STATE_SIZE = 32; // Bytes
export const TALLY_STATE_SIZE = 48; // Bytes

/**
 * Time Constants
 */
export const SECONDS_PER_DAY = 86400n;
export const SECONDS_PER_WEEK = 604800n;
export const SECONDS_PER_MONTH = 2592000n; // 30 days
export const SECONDS_PER_YEAR = 31536000n; // 365 days

/**
 * Default Governance Parameters
 */
export const DEFAULT_VOTING_PERIOD = SECONDS_PER_WEEK; // 7 days
export const DEFAULT_EXECUTION_DELAY = SECONDS_PER_DAY * 2n; // 2 days
export const DEFAULT_QUORUM_THRESHOLD = 1000000n; // 0.01 BCH worth of tokens
export const DEFAULT_MAJORITY_THRESHOLD = 50; // 50%

/**
 * Network Parameters
 */
export const BCH_SATOSHIS_PER_BCH = 100000000n; // 1 BCH = 100,000,000 satoshis
export const MAX_TX_SIZE_STANDARD = 100000; // 100KB standard tx size limit
export const P2PKH_OUTPUT_SIZE = 34; // Bytes (8 value + 26 script)
export const P2SH32_MAX_SCRIPT_SIZE = 10000; // Conservative estimate (TBD)

/**
 * BCH VM Upgrade Context
 *
 * The BCH 2026 upgrade may expand what future FlowGuard covenants can do, but
 * these constants remain tied to the contracts currently deployed by FlowGuard.
 */
export const LAYLA_ACTIVATION_TIMESTAMP = 1778990400n; // May 15, 2026 12:00:00 UTC

/**
 * Check whether the BCH 2026 VM upgrade is active on the network.
 */
export function isLaylaActive(currentTimestamp: bigint): boolean {
  return currentTimestamp >= LAYLA_ACTIVATION_TIMESTAMP;
}

/**
 * Get max voters for the current FlowGuard implementation.
 */
export function getMaxVoters(_currentTimestamp: bigint): number {
  return MAX_VOTES_PRE_LAYLA;
}

/**
 * Get max signers for the current FlowGuard implementation.
 */
export function getMaxSigners(_currentTimestamp: bigint): number {
  return MAX_SIGNERS_PRE_LAYLA;
}

/**
 * Get max recipients for the current FlowGuard implementation.
 */
export function getMaxRecipients(_currentTimestamp: bigint): number {
  return MAX_RECIPIENTS_PRE_LAYLA;
}
