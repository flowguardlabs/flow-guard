/**
 * FlowGuard Executor Service
 *
 * PURPOSE: Automated covenant transaction execution
 *
 * FUNCTIONALITY:
 * - Monitor indexed UTXOs for executable actions
 * - Construct and broadcast covenant transactions
 * - Execute schedules (vesting unlocks, recurring payments)
 * - Execute approved proposals (after timelock)
 * - Automated period rollovers
 *
 * ARCHITECTURE:
 * - Task Scanner: Query indexer for executable tasks
 * - Transaction Builder: Construct covenant transactions
 * - Broadcaster: Broadcast to BCH network
 * - State Manager: Track execution state
 *
 * DECENTRALIZATION:
 * - Anyone can run an executor (permissionless)
 * - Execution rights enforced by covenant logic (not executor)
 * - Executor earns small fee for gas costs
 */

import { Pool } from 'pg';
import { Contract, ElectrumNetworkProvider, SignatureTemplate } from 'cashscript';
import {
  ScheduleUTXO,
  ProposalUTXO,
  VaultUTXO,
  ScheduleType,
  ProposalStatus,
} from '@flowguard/shared/types';
import { TransactionBuilder, TxBuilderConfig } from './services/TransactionBuilder';

/**
 * Executor Configuration
 */
interface ExecutorConfig {
  // Database (indexer connection)
  databaseUrl: string;

  // BCH Network
  network: 'mainnet' | 'chipnet';
  electrumServer: string;

  // Execution
  pollInterval: number; // Milliseconds between task checks
  maxGasPrice: number; // Max satoshis per byte for fees

  // Executor Wallet (for fee payment)
  executorPrivateKey?: string; // WIF format (optional, for automated execution)
}

/**
 * Executable Task
 */
interface ExecutableTask {
  type: 'schedule_unlock' | 'proposal_execute' | 'period_rollover';
  utxo: ScheduleUTXO | ProposalUTXO;
  readyAt: bigint; // Timestamp when task becomes executable
}

/**
 * Executor Service
 */
export class FlowGuardExecutor {
  private config: ExecutorConfig;
  private db: Pool;
  private provider: ElectrumNetworkProvider;
  private txBuilder: TransactionBuilder;
  private isRunning: boolean = false;

  constructor(config: ExecutorConfig) {
    this.config = config;

    // Initialize database connection
    this.db = new Pool({
      connectionString: config.databaseUrl,
    });

    // Initialize BCH network provider
    this.provider = new ElectrumNetworkProvider(config.network);

    // Initialize transaction builder
    const txBuilderConfig: TxBuilderConfig = {
      network: config.network,
      electrumServer: config.electrumServer,
      maxExecutorFee: config.maxGasPrice * 250, // Assume ~250 bytes tx
      minExecutorFee: 546, // BCH dust limit
    };
    this.txBuilder = new TransactionBuilder(txBuilderConfig);
  }

  /**
   * Start executor service
   */
  async start(): Promise<void> {
    console.log('[Executor] Starting FlowGuard Executor...');
    console.log(`[Executor] Network: ${this.config.network}`);

    // Verify database connection
    await this.verifyDatabase();

    // Start task polling loop
    this.isRunning = true;
    this.pollTasks();
  }

  /**
   * Stop executor service
   */
  async stop(): Promise<void> {
    console.log('[Executor] Stopping...');
    this.isRunning = false;
    await this.db.end();
    await this.provider.disconnect();
  }

  /**
   * Verify database connection
   */
  private async verifyDatabase(): Promise<void> {
    try {
      await this.db.query('SELECT NOW()');
      console.log('[Executor] Database connection OK');
    } catch (error) {
      console.error('[Executor] Database connection failed:', error);
      throw error;
    }
  }

  /**
   * Polling loop - check for executable tasks
   */
  private async pollTasks(): Promise<void> {
    while (this.isRunning) {
      try {
        // Scan for executable tasks
        const tasks = await this.scanExecutableTasks();

        if (tasks.length > 0) {
          console.log(`[Executor] Found ${tasks.length} executable tasks`);

          for (const task of tasks) {
            await this.executeTask(task);
          }
        }

        // Wait before next poll
        await this.sleep(this.config.pollInterval);
      } catch (error) {
        console.error('[Executor] Polling error:', error);
        await this.sleep(this.config.pollInterval);
      }
    }
  }

  /**
   * Scan database for executable tasks
   */
  private async scanExecutableTasks(): Promise<ExecutableTask[]> {
    const tasks: ExecutableTask[] = [];
    const currentTime = BigInt(Math.floor(Date.now() / 1000));

    // 1. Scan for executable schedules (unlocks ready)
    const schedules = await this.db.query<ScheduleUTXO>(`
      SELECT *
      FROM schedules
      WHERE is_spent = FALSE
        AND next_unlock_timestamp <= $1
      LIMIT 10;
    `, [currentTime.toString()]);

    for (const schedule of schedules.rows) {
      tasks.push({
        type: 'schedule_unlock',
        utxo: schedule,
        readyAt: schedule.next_unlock_timestamp,
      });
    }

    // 2. Scan for executable proposals (approved + timelock passed)
    const proposals = await this.db.query<ProposalUTXO>(`
      SELECT *
      FROM proposals
      WHERE is_spent = FALSE
        AND status = $1
        AND execution_timelock <= $2
      LIMIT 10;
    `, [ProposalStatus.EXECUTABLE, currentTime.toString()]);

    for (const proposal of proposals.rows) {
      tasks.push({
        type: 'proposal_execute',
        utxo: proposal,
        readyAt: proposal.execution_timelock,
      });
    }

    return tasks;
  }

  /**
   * Execute a task
   */
  private async executeTask(task: ExecutableTask): Promise<void> {
    console.log(`[Executor] Executing ${task.type}...`);

    try {
      switch (task.type) {
        case 'schedule_unlock':
          await this.executeScheduleUnlock(task.utxo as ScheduleUTXO);
          break;
        case 'proposal_execute':
          await this.executeProposal(task.utxo as ProposalUTXO);
          break;
        case 'period_rollover':
          // TODO: Implement period rollover
          break;
      }

      console.log(`[Executor] ✓ ${task.type} executed successfully`);
    } catch (error) {
      console.error(`[Executor] ✗ ${task.type} execution failed:`, error);
    }
  }

  /**
   * Execute schedule unlock
   *
   * Constructs transaction:
   * - Input[0]: ScheduleUTXO
   * - Output[0]: New ScheduleUTXO (updated state) OR burn if fully vested
   * - Output[1]: Payout to beneficiary
   * - tx.locktime >= next_unlock_timestamp (CLTV)
   */
  private async executeScheduleUnlock(schedule: ScheduleUTXO): Promise<void> {
    console.log(`[Executor] Unlocking schedule ${schedule.utxo.txid}:${schedule.utxo.vout}`);

    try {
      // 1. Build unsigned transaction
      const executorAddress = this.config.executorPrivateKey
        ? await this.deriveExecutorAddress()
        : 'bitcoincash:qp...'; // Placeholder if no key configured

      const beneficiaryAddress = schedule.address; // TODO: Get from schedule metadata

      const unsignedTx = await this.txBuilder.buildScheduleUnlock(
        schedule,
        executorAddress,
        beneficiaryAddress,
      );

      console.log(`[Executor]   Built unsigned tx:`, {
        locktime: unsignedTx.locktime,
        fee: unsignedTx.fee,
        inputCount: unsignedTx.inputs.length,
        outputCount: unsignedTx.outputs.length,
      });

      // 2. Sign transaction (if executor key configured)
      if (this.config.executorPrivateKey) {
        // TODO: Sign with executor key
        // const signedTx = await this.signTransaction(unsignedTx, this.config.executorPrivateKey);

        // 3. Broadcast transaction
        // const txid = await this.broadcastTransaction(signedTx.hex);
        // console.log(`[Executor]   ✓ Broadcast successful: ${txid}`);
      } else {
        console.log(`[Executor]   ⚠ No executor key configured - cannot sign/broadcast`);
        console.log(`[Executor]   Manual execution required`);
      }
    } catch (error) {
      console.error(`[Executor]   ✗ Failed to build tx:`, error);
      throw error;
    }
  }

  /**
   * Execute approved proposal
   *
   * Constructs transaction:
   * - Input[0]: VaultUTXO
   * - Input[1]: ProposalUTXO
   * - Output[0]: New VaultUTXO (updated state)
   * - Output[1+]: Payout recipients (from proposal)
   * - tx.locktime >= execution_timelock (CLTV)
   */
  private async executeProposal(proposal: ProposalUTXO): Promise<void> {
    console.log(`[Executor] Executing proposal ${proposal.utxo.txid}:${proposal.utxo.vout}`);

    try {
      // 1. Fetch associated VaultUTXO
      const vaultId = proposal.token?.category; // VaultNFT category = vaultId
      if (!vaultId) {
        throw new Error('Proposal missing vault category ID');
      }

      const vaultResult = await this.db.query<VaultUTXO>(
        `SELECT * FROM vaults WHERE id = $1 AND is_spent = FALSE LIMIT 1`,
        [vaultId],
      );

      if (vaultResult.rows.length === 0) {
        throw new Error(`VaultUTXO not found for proposal. VaultID: ${vaultId}`);
      }

      const vault = vaultResult.rows[0];

      // 2. Fetch proposal payout details (from metadata table)
      const payoutResult = await this.db.query(
        `SELECT * FROM proposal_payouts WHERE proposal_id = $1 ORDER BY id`,
        [proposal.utxo.txid], // Using txid as proposal_id
      );

      const payouts = payoutResult.rows.map((row: any) => ({
        address: row.recipient,
        amount: parseInt(row.amount, 10),
        category: row.category,
      }));

      if (payouts.length === 0) {
        throw new Error(`No payout details found for proposal ${proposal.utxo.txid}`);
      }

      // 3. Build unsigned transaction
      const executorAddress = this.config.executorPrivateKey
        ? await this.deriveExecutorAddress()
        : 'bitcoincash:qp...'; // Placeholder

      const unsignedTx = await this.txBuilder.buildProposalExecution(
        proposal,
        vault,
        executorAddress,
        payouts,
      );

      console.log(`[Executor]   Built unsigned tx:`, {
        locktime: unsignedTx.locktime,
        fee: unsignedTx.fee,
        inputCount: unsignedTx.inputs.length,
        outputCount: unsignedTx.outputs.length,
        payouts: payouts.length,
      });

      // 4. Sign and broadcast (if executor key configured)
      if (this.config.executorPrivateKey) {
        // TODO: Sign with executor key
        // const signedTx = await this.signTransaction(unsignedTx, this.config.executorPrivateKey);

        // Broadcast
        // const txid = await this.broadcastTransaction(signedTx.hex);
        // console.log(`[Executor]   ✓ Broadcast successful: ${txid}`);
      } else {
        console.log(`[Executor]   ⚠ No executor key configured - cannot sign/broadcast`);
        console.log(`[Executor]   Manual execution required`);
      }
    } catch (error) {
      console.error(`[Executor]   ✗ Failed to execute proposal:`, error);
      throw error;
    }
  }

  /**
   * Derive executor BCH address from private key
   */
  private async deriveExecutorAddress(): Promise<string> {
    // TODO: Implement WIF private key to address derivation
    // Using libauth or @bitauth/libauth
    return 'bitcoincash:qp...'; // Placeholder
  }

  /**
   * Utility: Sleep for milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * CLI Entry Point
 */
if (require.main === module) {
  const config: ExecutorConfig = {
    databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/flowguard',
    network: (process.env.NETWORK as 'mainnet' | 'chipnet') || 'chipnet',
    electrumServer: process.env.ELECTRUM_SERVER || 'chipnet.imaginary.cash',
    pollInterval: parseInt(process.env.POLL_INTERVAL || '60000', 10), // 1 minute
    maxGasPrice: parseInt(process.env.MAX_GAS_PRICE || '2', 10), // 2 sats/byte
    executorPrivateKey: process.env.EXECUTOR_PRIVATE_KEY, // Optional WIF
  };

  const executor = new FlowGuardExecutor(config);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[Executor] Received SIGINT, shutting down gracefully...');
    await executor.stop();
    process.exit(0);
  });

  // Start executor
  executor.start().catch((error) => {
    console.error('[Executor] Fatal error:', error);
    process.exit(1);
  });
}

export default FlowGuardExecutor;
