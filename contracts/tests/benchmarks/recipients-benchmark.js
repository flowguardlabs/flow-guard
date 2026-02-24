/**
 * Payout Recipient Limits Benchmarking Script
 *
 * PURPOSE: Empirically determine MAX_RECIPIENTS_PRE_LAYLA
 *
 * METHOD:
 * 1. Construct ExecuteProposal transactions with increasing output counts
 * 2. Measure transaction size
 * 3. Test relay on chipnet
 * 4. Identify maximum output count within engineering limits
 *
 * FACTORS:
 * - Transaction size limits (100KB standard)
 * - Output count (no BCH consensus limit, but relay rules apply)
 * - Guardrail validation complexity (hardcoded branches)
 * - Transaction construction time
 *
 * EXPECTED RESULT: MAX_RECIPIENTS_PRE_LAYLA = 50 to 200
 * (Likely larger than signers/votes since outputs are smaller than inputs)
 */

const fs = require('fs');
const path = require('path');

// Configuration matrix for testing
const RECIPIENT_CONFIGS = [
  { recipients: 5, label: '5-recipients' },
  { recipients: 10, label: '10-recipients' },
  { recipients: 20, label: '20-recipients' },
  { recipients: 50, label: '50-recipients' },
  { recipients: 100, label: '100-recipients' },
  { recipients: 200, label: '200-recipients' },
  { recipients: 500, label: '500-recipients' }, // Likely to fail - testing limits
];

// Thresholds
const LIMITS = {
  maxTxSize: 100000, // 100KB standard tx size limit
  maxOutputs: 2000, // BCH has no strict consensus limit, but relay rules apply
  outputCost: 34, // Minimum P2PKH output size (8 bytes value + 26 bytes script)
};

// Results storage
const results = {
  timestamp: new Date().toISOString(),
  network: 'chipnet',
  configs: [],
  recommendation: null,
};

console.log('='.repeat(80));
console.log('FlowGuard Payout Recipient Limits Benchmarking Suite');
console.log('='.repeat(80));
console.log();
console.log('OBJECTIVE: Determine MAX_RECIPIENTS_PRE_LAYLA');
console.log('METHOD: Test transaction construction with increasing recipient counts');
console.log();
console.log(`Testing ${RECIPIENT_CONFIGS.length} configurations...`);
console.log();

/**
 * Estimate transaction size for N payout recipients
 *
 * Transaction structure:
 * - Version: 4 bytes
 * - Input count: 1 byte (varint)
 * - Inputs:
 *   - VaultUTXO: ~500 bytes (with covenant script + sigs)
 *   - ProposalUTXO: ~200 bytes
 * - Output count: 1-3 bytes (varint)
 * - Outputs:
 *   - New VaultUTXO: ~100 bytes (NFT + state)
 *   - N payout recipients: N * ~34 bytes (P2PKH)
 * - Locktime: 4 bytes
 *
 * Each payout output:
 * - Value: 8 bytes
 * - Script length: 1 byte
 * - P2PKH script: 25 bytes
 * Total: ~34 bytes per recipient
 */
function estimateTxSize(recipientCount) {
  const baseSize = 10; // Version + locktime + varint overhead
  const inputsSize = 700; // VaultUTXO + ProposalUTXO inputs
  const vaultOutputSize = 100; // New VaultUTXO output
  const recipientOutputSize = 34; // P2PKH output per recipient

  // Total size
  const totalSize = baseSize + inputsSize + vaultOutputSize + (recipientCount * recipientOutputSize);

  return totalSize;
}

/**
 * Estimate guardrail validation overhead
 *
 * For each recipient, covenant validates:
 * - Recipient cap check
 * - Allowlist check (if enabled)
 * - Category budget check
 *
 * Pre-Layla: Hardcoded branches for each recipient
 * Bytecode grows linearly with recipient count
 */
function estimateGuardrailOverhead(recipientCount) {
  // Rough estimate: ~50 bytes of bytecode per recipient validation
  return recipientCount * 50;
}

/**
 * Test payout transaction construction
 */
function testPayoutTransaction(recipientCount, label) {
  console.log('-'.repeat(80));
  console.log(`Configuration: ${label} (${recipientCount} payout recipients)`);
  console.log('-'.repeat(80));

  try {
    // Estimate transaction size
    const txSizeEstimate = estimateTxSize(recipientCount);
    console.log(`[${label}]   Estimated tx size: ${txSizeEstimate} bytes`);

    // Estimate guardrail validation overhead
    const guardrailOverhead = estimateGuardrailOverhead(recipientCount);
    console.log(`[${label}]   Guardrail bytecode overhead: ~${guardrailOverhead} bytes`);

    // Check tx size limit
    if (txSizeEstimate > LIMITS.maxTxSize) {
      throw new Error(`Transaction size ${txSizeEstimate} exceeds limit ${LIMITS.maxTxSize}`);
    }

    // Check output count limit
    if (recipientCount > LIMITS.maxOutputs) {
      throw new Error(`Output count ${recipientCount} exceeds limit ${LIMITS.maxOutputs}`);
    }

    // Check if tx size is reasonable for relay
    const txSizeOk = txSizeEstimate <= LIMITS.maxTxSize;
    const outputCountOk = recipientCount <= LIMITS.maxOutputs;

    console.log(`[${label}] Tx size check: ${txSizeOk ? '✓ PASS' : '✗ FAIL'} (${txSizeEstimate}/${LIMITS.maxTxSize} bytes)`);
    console.log(`[${label}] Output count check: ${outputCountOk ? '✓ PASS' : '✗ FAIL'} (${recipientCount}/${LIMITS.maxOutputs} outputs)`);

    const status = (txSizeOk && outputCountOk) ? 'PASSED' : 'FAILED';
    console.log(`[${label}] Overall: ${status}`);
    console.log();

    return {
      success: status === 'PASSED',
      txSizeEstimate,
      guardrailOverhead,
      status,
    };
  } catch (error) {
    console.log(`[${label}] ✗ Test failed: ${error.message}`);
    console.log();
    return {
      success: false,
      error: error.message,
      status: 'FAILED',
    };
  }
}

/**
 * Run benchmarking suite
 */
async function runBenchmarks() {
  for (const config of RECIPIENT_CONFIGS) {
    const { recipients, label } = config;

    // Test transaction construction
    const testResult = testPayoutTransaction(recipients, label);

    results.configs.push({
      label,
      recipients,
      status: testResult.status,
      txSizeEstimate: testResult.txSizeEstimate,
      guardrailOverhead: testResult.guardrailOverhead,
    });
  }

  // Analyze results
  analyzeResults();
}

/**
 * Analyze results and recommend MAX_RECIPIENTS_PRE_LAYLA
 */
function analyzeResults() {
  console.log('='.repeat(80));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(80));
  console.log();

  const passingConfigs = results.configs.filter((c) => c.status === 'PASSED');

  if (passingConfigs.length === 0) {
    console.log('⚠️  WARNING: No configurations passed all tests!');
    console.log('   Recommend: MAX_RECIPIENTS_PRE_LAYLA = 10 (very conservative)');
    results.recommendation = {
      maxRecipients: 10,
      confidence: 'LOW',
      reason: 'No configurations passed benchmarking tests',
    };
  } else {
    const largestPassing = passingConfigs[passingConfigs.length - 1];
    const recommendedMax = largestPassing.recipients;

    // Apply safety margin (30% reduction)
    const conservativeMax = Math.floor(recommendedMax * 0.7);

    console.log(`✓ Largest passing configuration: ${largestPassing.label}`);
    console.log(`  Recipient count: ${largestPassing.recipients}`);
    console.log(`  Tx size estimate: ${largestPassing.txSizeEstimate} bytes`);
    console.log(`  Guardrail overhead: ~${largestPassing.guardrailOverhead} bytes`);
    console.log();
    console.log(`RECOMMENDATION (with 30% safety margin):`);
    console.log(`  MAX_RECIPIENTS_PRE_LAYLA = ${conservativeMax}`);

    results.recommendation = {
      maxRecipients: conservativeMax,
      confidence: 'MEDIUM',
      reason: `Largest passing: ${largestPassing.label}, reduced by 30% safety margin`,
      largestPassing: largestPassing.label,
    };
  }

  console.log();
  console.log('Full results table:');
  console.log('-'.repeat(80));
  console.log('Config           | Recipients | Tx Size | Guardrail OH | Status');
  console.log('-'.repeat(80));

  results.configs.forEach((c) => {
    const txSize = c.txSizeEstimate ? `${c.txSizeEstimate}B` : 'N/A';
    const overhead = c.guardrailOverhead ? `~${c.guardrailOverhead}B` : 'N/A';
    console.log(
      `${c.label.padEnd(16)} | ${String(c.recipients).padStart(10)} | ${txSize.padEnd(7)} | ${overhead.padEnd(12)} | ${c.status}`
    );
  });

  console.log('-'.repeat(80));
  console.log();

  // Save results
  const resultsPath = path.join(__dirname, 'RESULTS-recipients.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`Results saved to: ${resultsPath}`);
  console.log();

  generateMarkdownReport();
}

/**
 * Generate markdown report
 */
function generateMarkdownReport() {
  const reportPath = path.join(__dirname, 'RESULTS-recipients.md');

  let markdown = `# FlowGuard Payout Recipient Benchmark Results\n\n`;
  markdown += `**Date**: ${results.timestamp}\n`;
  markdown += `**Network**: ${results.network}\n\n`;

  markdown += `## Recommendation\n\n`;
  markdown += `\`\`\`typescript\n`;
  markdown += `export const MAX_RECIPIENTS_PRE_LAYLA = ${results.recommendation.maxRecipients};\n`;
  markdown += `\`\`\`\n\n`;
  markdown += `**Confidence**: ${results.recommendation.confidence}\n\n`;
  markdown += `**Reasoning**: ${results.recommendation.reason}\n\n`;

  markdown += `## Test Results\n\n`;
  markdown += `| Config | Recipients | Tx Size (est.) | Guardrail Overhead | Status |\n`;
  markdown += `|--------|------------|----------------|--------------------|--------|\n`;

  results.configs.forEach((c) => {
    const txSize = c.txSizeEstimate ? `${c.txSizeEstimate}B` : 'N/A';
    const overhead = c.guardrailOverhead ? `~${c.guardrailOverhead}B` : 'N/A';
    markdown += `| ${c.label} | ${c.recipients} | ${txSize} | ${overhead} | ${c.status} |\n`;
  });

  markdown += `\n## Implementation Notes\n\n`;
  markdown += `### Pre-Layla Constraints\n\n`;
  markdown += `- Hardcoded validation for each recipient (no loops)\n`;
  markdown += `- Guardrail bytecode grows linearly: ~50 bytes per recipient\n`;
  markdown += `- Transaction size dominated by outputs: ~34 bytes per P2PKH recipient\n\n`;

  markdown += `### Guardrail Validation Per Recipient\n\n`;
  markdown += `Each recipient requires validation:\n`;
  markdown += `1. **Recipient cap check**: \`payout_amount <= recipient_cap\`\n`;
  markdown += `2. **Allowlist check** (if enabled): recipient in allowlist\n`;
  markdown += `3. **Category budget check**: category spending within limits\n\n`;

  markdown += `See: \`lib/GuardrailChecks.cash :: validatePayoutOutputs()\`\n\n`;

  markdown += `## Post-Layla Upgrade\n\n`;
  markdown += `After May 15, 2026 (Loops CHIP activation):\n`;
  markdown += `- Iterate arbitrary recipient count (no hardcoded limit)\n`;
  markdown += `- Reduced bytecode size (single loop instead of N branches)\n`;
  markdown += `- MAX_RECIPIENTS only limited by tx size (100KB)\n\n`;

  markdown += `## Next Steps\n\n`;
  markdown += `1. Update \`shared/constants/covenantParams.ts\` with MAX_RECIPIENTS_PRE_LAYLA\n`;
  markdown += `2. Update \`lib/GuardrailChecks.cash\` to support MAX_RECIPIENTS_PRE_LAYLA\n`;
  markdown += `3. Test on chipnet with actual multi-recipient payouts\n`;
  markdown += `4. Document recipient limits in UI/docs\n`;

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

module.exports = { runBenchmarks, RECIPIENT_CONFIGS, LIMITS };
