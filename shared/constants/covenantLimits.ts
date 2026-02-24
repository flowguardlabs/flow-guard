/**
 * FlowGuard Covenant Limits (Pre-Layla)
 *
 * These constants define engineering limits for covenant contracts based on
 * Bitcoin Cash consensus rules and standard relay policies.
 *
 * STATUS: ESTIMATED (Conservative values pending chipnet benchmark validation)
 * SEE: contracts/tests/benchmarks/RESULTS.md for full analysis
 *
 * IMPORTANT: Post-Layla (May 2026), Loops/Functions CHIPs remove most hardcoded limits
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
   * Maximum signers in M-of-N approval set (pre-Layla hardcoded branches).
   *
   * Conservative estimate: 5
   * - 3-of-5, 5-of-7: Safe (bytecode ~750 bytes, validation <400ms)
   * - 7-of-10: Borderline (bytecode ~1,050 bytes, validation ~600ms)
   * - 10-of-15: Not recommended (exceeds performance limits)
   *
   * Constraint: Hardcoded branches increase bytecode linearly with N
   * Post-Layla: Arbitrary M-of-N with Loops CHIP (removes limit)
   */
  MAX_SIGNERS_PRE_LAYLA: 5,

  /**
   * MAX_APPROVALS_REQUIRED
   *
   * Maximum M in M-of-N configuration.
   * Same as MAX_SIGNERS_PRE_LAYLA (worst case: M == N).
   */
  MAX_APPROVALS_REQUIRED: 5,

  // ==================== VOTE TALLY LIMITS ====================

  /**
   * MAX_VOTES_PRE_LAYLA
   *
   * Maximum VoteUTXO inputs in CreateTally transaction (pre-Layla).
   *
   * Conservative estimate: 20
   * - 10 votes: Safe (opcode count ~500, tx size ~2.8KB)
   * - 20 votes: Borderline (opcode count ~1,000, approaching 201 limit)
   * - 30 votes: Exceeds opcode count limit (201 per script)
   *
   * Constraint: BCH opcode count limit (201 operations per script)
   * Fallback: For >20 votes, governance signers approve tally commitment
   * Post-Layla: Loops CHIP enables 100+ vote trustless tallying
   */
  MAX_VOTES_PRE_LAYLA: 20,

  // ==================== PAYOUT RECIPIENT LIMITS ====================

  /**
   * MAX_RECIPIENTS_PRE_LAYLA
   *
   * Maximum payout outputs in ExecuteProposal transaction.
   *
   * Conservative estimate: 50
   * - 50 recipients: Safe (tx size ~2.5KB, validation ~100ms)
   * - 100 recipients: Safe (tx size ~4.2KB, validation ~200ms)
   * - 200+ recipients: Technically feasible but conservative limit preferred
   *
   * Constraint: 100KB standard tx relay limit
   * Post-Layla: Loops CHIP enables arbitrary recipient iteration
   */
  MAX_RECIPIENTS_PRE_LAYLA: 50,

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
  status: 'ESTIMATED' as const,
  dateEstimated: '2026-01-31',
  actualChipnetTested: false,
  needsValidation: true,

  assumptions: [
    'Conservative margins for safety',
    'Based on BCH consensus rules and standard relay policies',
    'Pre-Layla hardcoded branch implementation (no Loops/Functions CHIPs)',
    'No empirical chipnet testing yet (awaiting CashScript compilation)',
  ],

  nextSteps: [
    'Compile contracts with CashScript',
    'Deploy test contracts to chipnet',
    'Run empirical benchmarks (signers-benchmark.js, votes-benchmark.js, recipients-benchmark.js)',
    'Validate or refine estimated limits',
    'Document actual measured values in RESULTS.md',
    'Update covenant implementations with validated limits',
  ],

  references: [
    'contracts/tests/benchmarks/RESULTS.md - Full benchmark analysis',
    'contracts/tests/benchmarks/README.md - Benchmarking methodology',
    'workflow3.md - Engineering limits specification',
  ],
} as const;

/**
 * Post-Layla Expected Improvements (May 2026)
 *
 * After CHIPs activation, these limits should be re-benchmarked.
 */
export const POST_LAYLA_EXPECTED = {
  MAX_SIGNERS: Infinity, // Arbitrary M-of-N with Loops CHIP
  MAX_VOTES: 100, // 100+ votes feasible with loop-based tallying
  BYTECODE_REDUCTION: 0.7, // ~70% smaller bytecode with Functions CHIP
  VALIDATION_SPEEDUP: 2.0, // ~2x faster validation with optimized loops

  chips: [
    'Loops CHIP - Arbitrary iteration (remove hardcoded M-of-N limits)',
    'Functions CHIP - Modular bytecode (reduce duplication)',
    'Bitwise CHIP - Efficient state encoding',
    'P2SH32 CHIP - 32-byte script hashes',
  ],

  activationDate: '2026-05-15',
} as const;

/**
 * Type guard: Check if running in pre-Layla or post-Layla mode
 */
export function isPostLayla(): boolean {
  const currentDate = new Date();
  const laylaActivation = new Date('2026-05-15T00:00:00Z');
  return currentDate >= laylaActivation;
}

/**
 * Get current covenant limits based on upgrade status
 */
export function getCurrentLimits() {
  if (isPostLayla()) {
    return {
      ...COVENANT_LIMITS,
      MAX_SIGNERS: POST_LAYLA_EXPECTED.MAX_SIGNERS,
      MAX_VOTES: POST_LAYLA_EXPECTED.MAX_VOTES,
      // Note: Actual post-Layla limits TBD via new benchmarks
    };
  }
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
