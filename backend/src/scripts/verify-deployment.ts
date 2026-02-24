/**
 * Verify deployed contract wiring against DB state + current artifacts.
 *
 * Usage:
 *   pnpm tsx src/scripts/verify-deployment.ts
 *   pnpm tsx src/scripts/verify-deployment.ts --network=chipnet --json
 */

import { DeploymentRegistryService } from '../services/DeploymentRegistryService.js';

type Network = 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

function parseArgs() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const networkArg = args.find((arg) => arg.startsWith('--network='));
  const candidate = (networkArg?.split('=')[1] || process.env.BCH_NETWORK || 'chipnet').trim();
  const allowed = new Set(['mainnet', 'testnet3', 'testnet4', 'chipnet']);
  const network: Network = (allowed.has(candidate) ? candidate : 'chipnet') as Network;
  return { json, network };
}

async function run(): Promise<void> {
  const { json, network } = parseArgs();
  const service = new DeploymentRegistryService(network);
  const report = await service.buildReport({ verifyOnChain: true });

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('\nFlowGuard Deployment Verification');
  console.log(`Network: ${report.network}`);
  console.log(`Generated: ${report.generatedAt}`);
  console.log('');

  console.log('Summary:');
  console.log(`- Total contracts: ${report.summary.total}`);
  console.log(`- Address present: ${report.summary.withAddress}`);
  console.log(`- Constructor params present: ${report.summary.withConstructorParams}`);
  console.log(`- Address mismatch vs current artifacts: ${report.summary.addressMismatches}`);
  console.log(`- Suspected legacy bytecode: ${report.summary.suspectedLegacyBytecode}`);
  console.log(`- On-chain evidence found: ${report.summary.onChainVerified}`);
  console.log(`- No on-chain evidence: ${report.summary.noOnChainEvidence}`);
  console.log('');

  const problematic = report.entries.filter((entry) =>
    entry.addressMatchesCurrentArtifact === false
    || entry.constructorParamsError
    || entry.derivationError
    || entry.hasOnChainEvidence === false,
  );

  if (problematic.length === 0) {
    console.log('No critical deployment mismatches detected.\n');
    return;
  }

  console.log(`Problematic entries (${problematic.length}):`);
  for (const entry of problematic) {
    const reasons: string[] = [];
    if (entry.addressMatchesCurrentArtifact === false) reasons.push('address mismatch');
    if (entry.constructorParamsError) reasons.push(`constructor params: ${entry.constructorParamsError}`);
    if (entry.derivationError) reasons.push(`derivation: ${entry.derivationError}`);
    if (entry.hasOnChainEvidence === false) reasons.push('no chain evidence');
    console.log(
      `- [${entry.module}] ${entry.id} (${entry.contractType}) ${entry.contractAddress || 'no-address'} -> ${reasons.join('; ')}`,
    );
  }
  console.log('');
}

run().catch((error) => {
  console.error('verify-deployment failed:', error);
  process.exit(1);
});
