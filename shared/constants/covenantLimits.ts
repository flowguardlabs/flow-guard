/**
 * FlowGuard Covenant Limits (Current Implementations)
 *
 * These constants describe the limits enforced by the contracts currently
 * shipped in FlowGuard. They are implementation limits, not automatic network
 * limits, and they do not expand simply because a BCH VM upgrade activates.
 *
 * Broader signer sets, larger trustless tallies, or wider payout fanout require
 * explicit covenant redesign and redeployment inside FlowGuard.
 */

/**
 * Covenant Engineering Limits
 *
 * Conservative estimates based on BCH consensus rules and standard relay policies.
 */
export const COVENANT_LIMITS = {
  // ==================== M-of-N MULTISIG LIMITS ====================

  /**
   * MAX_SIGNERS_PRE_LAYLA
   *
   * Current treasury and proposal contracts compile three fixed signer slots.
   * FlowGuard does not yet ship an arbitrary signer-set covenant.
   */
  MAX_SIGNERS_PRE_LAYLA: 3,

  /**
   * MAX_APPROVALS_REQUIRED
   *
   * Current spend / resume / cancel paths top out at two signer approvals.
   * Emergency lock remains a distinct all-3 path in VaultCovenant.
   */
  MAX_APPROVALS_REQUIRED: 2,

  // ==================== VOTE TALLY LIMITS ====================

  /**
   * MAX_VOTES_PRE_LAYLA
   *
   * The currently shipped fixed-max tally covenant handles three direct votes.
   * Larger governance tallies still require alternate attestation paths.
   */
  MAX_VOTES_PRE_LAYLA: 3,

  // ==================== PAYOUT RECIPIENT LIMITS ====================

  /**
   * MAX_RECIPIENTS_PRE_LAYLA
   *
   * Current treasury proposal execution targets one payout recipient per
   * proposal covenant state transition.
   */
  MAX_RECIPIENTS_PRE_LAYLA: 1,

  // ==================== TRANSACTION SIZE LIMITS ====================

  /**
   * MAX_STANDARD_TX_SIZE
   *
   * BCH standard transaction relay limit: 100,000 bytes (100KB).
   * Transactions larger than this may not relay or confirm.
   */
  MAX_STANDARD_TX_SIZE: 100000,

  /**
   * MAX_SCRIPT_SIZE_ESTIMATE
   *
   * Estimated safe P2SH32 script size for reliable relay.
   * No hard consensus limit, but practical limit ~10-20KB for relay.
   */
  MAX_SCRIPT_SIZE_ESTIMATE: 10000,

  // ==================== PERFORMANCE LIMITS ====================

  /**
   * MAX_OPCODE_COUNT
   *
   * BCH consensus limit: 201 operations per script.
   * Critical constraint for vote tallying and complex covenant logic.
   */
  MAX_OPCODE_COUNT: 201,

  /**
   * MAX_STACK_SIZE
   *
   * BCH consensus limit: 1000 stack elements maximum.
   */
  MAX_STACK_SIZE: 1000,

  /**
   * MAX_VALIDATION_TIME_MS
   *
   * Target maximum script validation time: 1000ms (1 second).
   * Slower validation may cause relay issues or user experience problems.
   */
  MAX_VALIDATION_TIME_MS: 1000,

  // ==================== CASHTOKENS NFT LIMITS ====================

  /**
   * MAX_NFT_COMMITMENT_LENGTH
   *
   * CashTokens specification: NFT commitments are variable length 0-40 bytes.
   * Per cashtokens.org spec.
   */
  MAX_NFT_COMMITMENT_LENGTH: 40,

  /**
   * MIN_NFT_COMMITMENT_LENGTH
   *
   * Minimum NFT commitment length: 0 bytes (valid per spec).
   * FlowGuard uses: 32, 48, or 64 bytes depending on covenant type.
   */
  MIN_NFT_COMMITMENT_LENGTH: 0,

  // ==================== DUST LIMITS ====================

  /**
   * MIN_DUST_AMOUNT
   *
   * Minimum UTXO value for relay: 546 satoshis.
   * UTXOs below this may not relay.
   */
  MIN_DUST_AMOUNT: 546,
} as const;

/**
 * Benchmark Metadata
 *
 * Tracking status and validation requirements.
 */
export const BENCHMARK_METADATA = {
  status: 'CURRENT_IMPLEMENTATION' as const,
  dateEstimated: '2026-03-04',
  actualChipnetTested: false,
  needsValidation: false,

  assumptions: [
    'Values reflect the contracts currently deployed by FlowGuard',
    'Network upgrades do not automatically widen these limits',
    'Expanded signer sets, tallies, or payout fanout require new covenant code',
  ],

  nextSteps: [
    'Design next-generation treasury and governance covenants for larger signer sets',
    'Benchmark those rewritten covenants on chipnet before changing product claims',
    'Update docs and UI only after contract behavior is actually expanded',
  ],

  references: [
    'contracts/tests/benchmarks/RESULTS.md - Full benchmark analysis',
    'contracts/tests/benchmarks/README.md - Benchmarking methodology',
    'workflow3.md - Engineering limits specification',
  ],
} as const;

/**
 * BCH VM Upgrade Context
 *
 * BCH network upgrades can expand what future FlowGuard covenants are able to
 * do, but the current product keeps its fixed-branch behavior until new
 * contracts are implemented and deployed.
 */
export const POST_LAYLA_EXPECTED = {
  CONTRACT_REWRITE_REQUIRED: true,
  NETWORK_CONTEXT_ONLY: true,

  chips: [
    'Loops CHIP',
    'Functions CHIP',
    'Bitwise CHIP',
    'P2SH32 CHIP',
  ],

  chipnetActivationDate: '2025-11-16T12:00:00Z',
  mainnetActivationDate: '2026-05-15T12:00:00Z',
  note:
    'FlowGuard must ship new covenant implementations before larger signer sets or trustless tally expansion become live product capabilities.',
} as const;

export function isPostLayla(): boolean {
  const currentDate = new Date();
  const laylaActivation = new Date('2026-05-15T12:00:00Z');
  return currentDate >= laylaActivation;
}

/**
 * Get current FlowGuard covenant limits.
 *
 * This intentionally returns the live product limits even after the network
 * upgrade date. FlowGuard limits only change when FlowGuard contracts change.
 */
export function getCurrentLimits() {
  return COVENANT_LIMITS;
}

/**
 * Export individual limits for convenience
 */
export const {
  MAX_SIGNERS_PRE_LAYLA,
  MAX_APPROVALS_REQUIRED,
  MAX_VOTES_PRE_LAYLA,
  MAX_RECIPIENTS_PRE_LAYLA,
  MAX_STANDARD_TX_SIZE,
  MAX_SCRIPT_SIZE_ESTIMATE,
  MAX_OPCODE_COUNT,
  MAX_STACK_SIZE,
  MAX_VALIDATION_TIME_MS,
  MAX_NFT_COMMITMENT_LENGTH,
  MIN_NFT_COMMITMENT_LENGTH,
  MIN_DUST_AMOUNT,
} = COVENANT_LIMITS;

/**
 * Default export
 */
export default COVENANT_LIMITS;
