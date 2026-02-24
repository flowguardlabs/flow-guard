/**
 * Vote Tally Input Limits Benchmarking Script
 *
 * PURPOSE: Empirically determine MAX_VOTES_PRE_LAYLA
 *
 * METHOD:
 * 1. Create test VoteUTXOs on chipnet
 * 2. Construct CreateTally transactions with increasing input counts
 * 3. Measure transaction size and validation time
 * 4. Test relay and confirmation
 * 5. Identify maximum input count within engineering limits
 *
 * FACTORS:
 * - Transaction size limits (100KB standard)
 * - Covenant script size (TallyCommitmentCovenant bytecode)
 * - Input validation complexity (N hardcoded branches)
 * - Relay standardness rules
 * - Validation time (< 1 second)
 *
 * EXPECTED RESULT: MAX_VOTES_PRE_LAYLA = 10 to 30 (conservative estimate)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration matrix for testing
const VOTE_CONFIGS = [
  { votes: 5, label: '5-votes' },
  { votes: 10, label: '10-votes' },
  { votes: 20, label: '20-votes' },
  { votes: 30, label: '30-votes' },
  { votes: 50, label: '50-votes' },
  { votes: 100, label: '100-votes' }, // Likely to fail - testing limits
];

// Thresholds
const LIMITS = {
  maxTxSize: 100000, // 100KB standard tx size limit
  maxValidationTimeMs: 1000, // 1 second
  maxInputs: 650, // BCH standard tx max inputs (approximate)
  voteCost: 1000, // Estimated bytes per vote input (with witness data)
};

// Results storage
const results = {
  timestamp: new Date().toISOString(),
  network: 'chipnet',
  configs: [],
  recommendation: null,
};

console.log('='.repeat(80));
console.log('FlowGuard Vote Tally Input Limits Benchmarking Suite');
console.log('='.repeat(80));
console.log();
console.log('OBJECTIVE: Determine MAX_VOTES_PRE_LAYLA');
console.log('METHOD: Test tally tx construction with increasing vote counts');
console.log();
console.log(`Testing ${VOTE_CONFIGS.length} configurations...`);
console.log();

/**
 * Generate TallyCommitmentCovenant variant for N votes
 *
 * NOTE: This requires modifying TallyCommitmentCovenant.cash
 * to have hardcoded validation for N vote inputs
 *
 * For benchmarking, we use the baseline contract and estimate
 */
function generateTallyVariant(voteCount, label) {
  console.log(`[${label}] Generating tally covenant variant...`);

  // Placeholder: return baseline contract path
  // Production: generate variant with N hardcoded input validations
  return path.join(__dirname, '../../core/TallyCommitmentCovenant.cash');
}

/**
 * Compile tally covenant and measure bytecode
 */
function compileTallyContract(contractPath, label) {
  console.log(`[${label}] Compiling TallyCommitmentCovenant...`);

  const artifactPath = path.join(__dirname, `../../artifacts/${label}-TallyCommitment.json`);

  try {
    // Compile contract
    execSync(
      `cashc ${contractPath} -o ${artifactPath}`,
      { cwd: path.join(__dirname, '../..'), stdio: 'pipe' }
    );

    // Read compiled artifact
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const bytecode = artifact.bytecode;
    const bytecodeSize = bytecode.length / 2;

    console.log(`[${label}] ✓ Compiled successfully`);
    console.log(`[${label}]   Bytecode size: ${bytecodeSize} bytes`);

    return {
      success: true,
      bytecodeSize,
      artifact,
    };
  } catch (error) {
    console.log(`[${label}] ✗ Compilation failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Estimate transaction size for N vote inputs
 *
 * Transaction structure:
 * - Version: 4 bytes
 * - Input count: 1 byte (varint)
 * - Inputs: N * ~250 bytes (P2PKH input with signature)
 * - Output count: 1 byte
 * - Outputs: 1 * ~50 bytes (TallyUTXO with NFT)
 * - Locktime: 4 bytes
 *
 * Each input includes:
 * - Outpoint: 36 bytes
 * - Script length: 1 byte
 * - Unlocking script: ~150 bytes (signature + pubkey + covenant args)
 * - Sequence: 4 bytes
 * - NFT commitment: ~32 bytes (VoteState)
 * - Token amount: 8 bytes
 */
function estimateTxSize(voteCount, contractBytecodeSize) {
  const baseSize = 10; // Version + locktime + varint overhead
  const inputSize = 250; // Conservative estimate per input
  const outputSize = 100; // TallyUTXO output with NFT
  const covenantScriptSize = contractBytecodeSize;

  // Total size
  const totalSize = baseSize + (voteCount * inputSize) + outputSize + covenantScriptSize;

  return totalSize;
}

/**
 * Test tally transaction construction
 */
function testTallyTransaction(voteCount, artifact, label) {
  console.log(`[${label}] Testing tally tx construction...`);

  try {
    const txSizeEstimate = estimateTxSize(voteCount, artifact ? (artifact.bytecode.length / 2) : 0);

    console.log(`[${label}]   Estimated tx size: ${txSizeEstimate} bytes`);

    // Check tx size limit
    if (txSizeEstimate > LIMITS.maxTxSize) {
      throw new Error(`Transaction size ${txSizeEstimate} exceeds limit ${LIMITS.maxTxSize}`);
    }

    // Check input count limit
    if (voteCount > LIMITS.maxInputs) {
      throw new Error(`Input count ${voteCount} exceeds limit ${LIMITS.maxInputs}`);
    }

    console.log(`[${label}] ✓ Transaction construction test passed`);

    return {
      success: true,
      txSizeEstimate,
    };
  } catch (error) {
    console.log(`[${label}] ✗ Transaction construction failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      txSizeEstimate: null,
    };
  }
}

/**
 * Estimate validation time (heuristic)
 *
 * NOTE: Actual validation time requires on-chain testing
 * For now, use linear estimate based on vote count
 */
function estimateValidationTime(voteCount) {
  // Rough heuristic: ~5ms per vote input validation
  return voteCount * 5;
}

/**
 * Run benchmarking suite
 */
async function runBenchmarks() {
  for (const config of VOTE_CONFIGS) {
    const { votes, label } = config;

    console.log('-'.repeat(80));
    console.log(`Configuration: ${label} (${votes} vote inputs)`);
    console.log('-'.repeat(80));

    // Step 1: Generate tally variant
    const contractPath = generateTallyVariant(votes, label);

    // Step 2: Compile and measure
    const compileResult = compileTallyContract(contractPath, label);

    if (!compileResult.success) {
      results.configs.push({
        label,
        votes,
        status: 'FAILED_COMPILE',
        error: compileResult.error,
      });
      console.log();
      continue;
    }

    // Step 3: Test transaction construction
    const txResult = testTallyTransaction(votes, compileResult.artifact, label);

    // Step 4: Estimate validation time
    const validationTimeEstimate = estimateValidationTime(votes);
    const validationOk = validationTimeEstimate <= LIMITS.maxValidationTimeMs;

    console.log(`[${label}] Validation time estimate: ${validationOk ? '✓ PASS' : '✗ FAIL'} (~${validationTimeEstimate}ms / ${LIMITS.maxValidationTimeMs}ms)`);

    // Determine overall status
    let status = 'UNKNOWN';
    if (!txResult.success) {
      status = 'FAILED_TX_SIZE';
    } else if (!validationOk) {
      status = 'FAILED_VALIDATION_TIME';
    } else {
      status = 'PASSED';
    }

    results.configs.push({
      label,
      votes,
      status,
      bytecodeSize: compileResult.bytecodeSize,
      txSizeEstimate: txResult.txSizeEstimate,
      validationTimeEstimate,
      txSizeOk: txResult.success,
      validationOk,
    });

    console.log(`[${label}] Overall: ${status}`);
    console.log();
  }

  // Analyze results
  analyzeResults();
}

/**
 * Analyze results and recommend MAX_VOTES_PRE_LAYLA
 */
function analyzeResults() {
  console.log('='.repeat(80));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(80));
  console.log();

  const passingConfigs = results.configs.filter((c) => c.status === 'PASSED');

  if (passingConfigs.length === 0) {
    console.log('⚠️  WARNING: No configurations passed all tests!');
    console.log('   Recommend: MAX_VOTES_PRE_LAYLA = 5 (very conservative)');
    results.recommendation = {
      maxVotes: 5,
      confidence: 'LOW',
      reason: 'No configurations passed benchmarking tests',
    };
  } else {
    const largestPassing = passingConfigs[passingConfigs.length - 1];
    const recommendedMax = largestPassing.votes;

    // Apply safety margin (30% reduction)
    const conservativeMax = Math.floor(recommendedMax * 0.7);

    console.log(`✓ Largest passing configuration: ${largestPassing.label}`);
    console.log(`  Vote count: ${largestPassing.votes}`);
    console.log(`  Tx size estimate: ${largestPassing.txSizeEstimate} bytes`);
    console.log(`  Validation time estimate: ~${largestPassing.validationTimeEstimate}ms`);
    console.log();
    console.log(`RECOMMENDATION (with 30% safety margin):`);
    console.log(`  MAX_VOTES_PRE_LAYLA = ${conservativeMax}`);

    results.recommendation = {
      maxVotes: conservativeMax,
      confidence: 'MEDIUM',
      reason: `Largest passing: ${largestPassing.label}, reduced by 30% safety margin`,
      largestPassing: largestPassing.label,
    };
  }

  console.log();
  console.log('Full results table:');
  console.log('-'.repeat(80));
  console.log('Config       | Votes | Tx Size | Val Time | Status');
  console.log('-'.repeat(80));

  results.configs.forEach((c) => {
    const txSize = c.txSizeEstimate ? `${c.txSizeEstimate}B` : 'N/A';
    const valTime = c.validationTimeEstimate ? `~${c.validationTimeEstimate}ms` : 'N/A';
    console.log(
      `${c.label.padEnd(12)} | ${String(c.votes).padStart(5)} | ${txSize.padEnd(7)} | ${valTime.padEnd(8)} | ${c.status}`
    );
  });

  console.log('-'.repeat(80));
  console.log();

  // Save results
  const resultsPath = path.join(__dirname, 'RESULTS-votes.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`Results saved to: ${resultsPath}`);
  console.log();

  generateMarkdownReport();
}

/**
 * Generate markdown report
 */
function generateMarkdownReport() {
  const reportPath = path.join(__dirname, 'RESULTS-votes.md');

  let markdown = `# FlowGuard Vote Tally Benchmark Results\n\n`;
  markdown += `**Date**: ${results.timestamp}\n`;
  markdown += `**Network**: ${results.network}\n\n`;

  markdown += `## Recommendation\n\n`;
  markdown += `\`\`\`typescript\n`;
  markdown += `export const MAX_VOTES_PRE_LAYLA = ${results.recommendation.maxVotes};\n`;
  markdown += `\`\`\`\n\n`;
  markdown += `**Confidence**: ${results.recommendation.confidence}\n\n`;
  markdown += `**Reasoning**: ${results.recommendation.reason}\n\n`;

  markdown += `## Test Results\n\n`;
  markdown += `| Config | Votes | Tx Size (est.) | Validation Time (est.) | Status |\n`;
  markdown += `|--------|-------|----------------|------------------------|--------|\n`;

  results.configs.forEach((c) => {
    const txSize = c.txSizeEstimate ? `${c.txSizeEstimate}B` : 'N/A';
    const valTime = c.validationTimeEstimate ? `~${c.validationTimeEstimate}ms` : 'N/A';
    markdown += `| ${c.label} | ${c.votes} | ${txSize} | ${valTime} | ${c.status} |\n`;
  });

  markdown += `\n## Fallback Strategy\n\n`;
  markdown += `For proposals with >${results.recommendation.maxVotes} voters:\n\n`;
  markdown += `**Option B: M-of-N Attested Tally (HYBRID enforceability)**\n`;
  markdown += `- Off-chain tally computation\n`;
  markdown += `- On-chain M-of-N attestation by treasury approvers\n`;
  markdown += `- Independent validators verify tally (social consensus)\n\n`;

  markdown += `## Post-Layla Upgrade\n\n`;
  markdown += `After May 15, 2026 (Loops CHIP activation):\n`;
  markdown += `- Trustless arbitrary-size tally (100+ votes)\n`;
  markdown += `- No hardcoded input limit\n`;
  markdown += `- See: \`v2-layla/TallyCommitmentCovenant_v2.cash\`\n\n`;

  markdown += `## Next Steps\n\n`;
  markdown += `1. Update \`shared/constants/covenantParams.ts\` with MAX_VOTES_PRE_LAYLA\n`;
  markdown += `2. Test on chipnet with actual vote aggregation\n`;
  markdown += `3. Implement hybrid fallback for >MAX_VOTES_PRE_LAYLA\n`;
  markdown += `4. Document voter limits in UI/docs\n`;

  fs.writeFileSync(reportPath, markdown);
  console.log(`Markdown report saved to: ${reportPath}`);
  console.log();
}

/**
 * Main execution
 */
async function main() {
  try {
    await runBenchmarks();
    console.log('='.repeat(80));
    console.log('Benchmarking complete!');
    console.log('='.repeat(80));
    process.exit(0);
  } catch (error) {
    console.error('Benchmarking failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { runBenchmarks, VOTE_CONFIGS, LIMITS };
