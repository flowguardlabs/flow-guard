/**
 * Shared Covenant Parameters
 *
 * Constants for covenant validation limits
 * Used by: contracts, frontend, backend, indexer, executor, SDK
 *
 * CRITICAL: These values MUST be determined via benchmarking
 * See: contracts/tests/benchmarks/
 *
 * Run benchmarking suite:
 * - npm run benchmark:signers  (determines MAX_SIGNERS_PRE_LAYLA)
 * - npm run benchmark:votes    (determines MAX_VOTES_PRE_LAYLA)
 * - npm run benchmark:recipients (determines MAX_RECIPIENTS_PRE_LAYLA)
 */

/**
 * MAX_SIGNERS_PRE_LAYLA
 *
 * Maximum M-of-N signers supportable pre-Layla upgrade
 *
 * CONSTRAINT: Hardcoded M-of-N validation in VaultCovenant
 * - Script size grows linearly with N
 * - Limited by P2SH32 script size and tx relay rules
 *
 * BENCHMARKING: See contracts/tests/benchmarks/signers-benchmark.js
 * - Tests 2-of-3, 3-of-5, 5-of-7, 7-of-10, 10-of-15, 15-of-20, 20-of-30
 * - Measures bytecode size, tx construction, relay success
 * - Expected result: 5 to 10 (conservative estimate)
 *
 * POST-LAYLA (May 15, 2026): Arbitrary M-of-N via Loops CHIP
 */
export const MAX_SIGNERS_PRE_LAYLA = 7; // TBD via benchmarking (placeholder: 7)

/**
 * MAX_VOTES_PRE_LAYLA
 *
 * Maximum votes aggregatable trustlessly on-chain pre-Layla
 *
 * CONSTRAINT: Hardcoded input validation in TallyCommitmentCovenant
 * - Each vote input validated separately
 * - Limited by tx size (100KB) and opcode count
 *
 * BENCHMARKING: See contracts/tests/benchmarks/votes-benchmark.js
 * - Tests 5, 10, 20, 30, 50, 100 vote inputs
 * - Measures tx size, validation time, relay success
 * - Expected result: 10 to 30 (conservative estimate)
 *
 * FALLBACK: For proposals with >MAX_VOTES_PRE_LAYLA voters:
 * - Use M-of-N attested tally (HYBRID enforceability)
 * - Off-chain tally computation + on-chain M-of-N attestation
 * - Independent validators verify tally (social consensus)
 *
 * POST-LAYLA (May 15, 2026): Arbitrary vote count via Loops CHIP
 */
export const MAX_VOTES_PRE_LAYLA = 20; // TBD via benchmarking (placeholder: 20)

/**
 * MAX_RECIPIENTS_PRE_LAYLA
 *
 * Maximum payout recipients per transaction pre-Layla
 *
 * CONSTRAINT: Hardcoded recipient validation in GuardrailChecks
 * - Each recipient validated for caps, allowlist, category
 * - Limited by tx size (100KB) and guardrail bytecode size
 *
 * BENCHMARKING: See contracts/tests/benchmarks/recipients-benchmark.js
 * - Tests 5, 10, 20, 50, 100, 200, 500 recipients
 * - Measures tx size, guardrail overhead
 * - Expected result: 50 to 200 (likely larger than signers/votes)
 *
 * POST-LAYLA (May 15, 2026): Arbitrary recipients via Loops CHIP
 */
export const MAX_RECIPIENTS_PRE_LAYLA = 100; // TBD via benchmarking (placeholder: 100)

/**
 * MAX_ALLOWLIST_SIZE
 *
 * Maximum addresses in recipient allowlist
 * Same constraints as MAX_RECIPIENTS_PRE_LAYLA
 */
export const MAX_ALLOWLIST_SIZE = MAX_RECIPIENTS_PRE_LAYLA;

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
 * Layla Upgrade Date
 *
 * May 15, 2026 - Loops, Functions, Bitwise, P2SH32 CHIPs activate
 */
export const LAYLA_ACTIVATION_TIMESTAMP = 1778947200n; // May 15, 2026 00:00:00 UTC

/**
 * Check if Layla upgrade is active
 */
export function isLaylaActive(currentTimestamp: bigint): boolean {
  return currentTimestamp >= LAYLA_ACTIVATION_TIMESTAMP;
}

/**
 * Get max voters for current time
 *
 * Pre-Layla: MAX_VOTES_PRE_LAYLA (trustless)
 * Post-Layla: Unlimited (Loops CHIP)
 */
export function getMaxVoters(currentTimestamp: bigint): number | null {
  if (isLaylaActive(currentTimestamp)) {
    return null; // Unlimited
  }
  return MAX_VOTES_PRE_LAYLA;
}

/**
 * Get max signers for current time
 *
 * Pre-Layla: MAX_SIGNERS_PRE_LAYLA (hardcoded)
 * Post-Layla: Unlimited (Loops CHIP)
 */
export function getMaxSigners(currentTimestamp: bigint): number | null {
  if (isLaylaActive(currentTimestamp)) {
    return null; // Unlimited
  }
  return MAX_SIGNERS_PRE_LAYLA;
}

/**
 * Get max recipients for current time
 *
 * Pre-Layla: MAX_RECIPIENTS_PRE_LAYLA (hardcoded)
 * Post-Layla: Unlimited (Loops CHIP)
 */
export function getMaxRecipients(currentTimestamp: bigint): number | null {
  if (isLaylaActive(currentTimestamp)) {
    return null; // Unlimited
  }
  return MAX_RECIPIENTS_PRE_LAYLA;
}
