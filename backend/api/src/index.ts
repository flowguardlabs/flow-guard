/**
 * FlowGuard API Gateway
 *
 * PURPOSE: REST + GraphQL API for frontend/SDK access
 *
 * FUNCTIONALITY:
 * - REST endpoints for covenant UTXO queries
 * - GraphQL API for complex queries
 * - WebSocket subscriptions for real-time updates
 * - Authentication and rate limiting
 *
 * ARCHITECTURE:
 * - Express server with REST endpoints
 * - Apollo GraphQL server
 * - PostgreSQL connection to indexer database
 * - Redis for caching and rate limiting
 */

import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { Pool } from 'pg';
import cors from 'cors';
import { typeDefs, resolvers } from './graphql/schema';
import { NFTMinter, MinterConfig } from './services/NFTMinter';
import { ApprovalTxBuilder, ApprovalTxBuilderConfig } from './services/ApprovalTxBuilder';

/**
 * API Configuration
 */
interface APIConfig {
  port: number;
  databaseUrl: string;
  corsOrigin: string;
  enableGraphQL: boolean;
  enableRest: boolean;
  network: 'mainnet' | 'chipnet';
  electrumServer: string;
}

/**
 * API Gateway Service
 */
export class FlowGuardAPI {
  private app: express.Application;
  private db: Pool;
  private config: APIConfig;
  private apolloServer?: ApolloServer;
  private nftMinter: NFTMinter;
  private approvalTxBuilder: ApprovalTxBuilder;

  constructor(config: APIConfig) {
    this.config = config;
    this.app = express();
    this.db = new Pool({
      connectionString: config.databaseUrl,
    });

    // Initialize NFT minter
    const minterConfig: MinterConfig = {
      network: config.network,
      electrumServer: config.electrumServer,
      covenantArtifacts: {
        vaultCovenant: null, // TODO: Load compiled artifacts
        proposalCovenant: null,
        scheduleCovenant: null,
        voteLockCovenant: null,
        tallyCovenant: null,
      },
    };
    this.nftMinter = new NFTMinter(minterConfig);

    // Initialize approval tx builder
    const approvalTxBuilderConfig: ApprovalTxBuilderConfig = {
      network: config.network,
      electrumServer: config.electrumServer,
      proposalCovenantArtifact: null, // TODO: Load compiled artifact
    };
    this.approvalTxBuilder = new ApprovalTxBuilder(approvalTxBuilderConfig);

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(cors({ origin: this.config.corsOrigin }));
    this.app.use(express.json());

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`[API] ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    if (this.config.enableRest) {
      this.setupRestRoutes();
    }
  }

  /**
   * Setup REST API routes
   */
  private setupRestRoutes(): void {
    const router = express.Router();

    // GET /api/vaults - List all vaults
    router.get('/vaults', async (req, res) => {
      try {
        const result = await this.db.query(`
          SELECT * FROM active_vaults
          ORDER BY block_height DESC
          LIMIT 100;
        `);
        res.json({ vaults: result.rows });
      } catch (error) {
        console.error('[API] Error fetching vaults:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // GET /api/vaults/:address - Get vault by address
    router.get('/vaults/:address', async (req, res) => {
      try {
        const { address } = req.params;
        const result = await this.db.query(`
          SELECT * FROM vaults
          WHERE address = $1 AND is_spent = FALSE
          LIMIT 1;
        `, [address]);

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Vault not found' });
        }

        res.json({ vault: result.rows[0] });
      } catch (error) {
        console.error('[API] Error fetching vault:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // GET /api/proposals - List proposals
    router.get('/proposals', async (req, res) => {
      try {
        const { status, vault_address } = req.query;

        let query = 'SELECT * FROM proposals WHERE is_spent = FALSE';
        const params: any[] = [];

        if (status) {
          params.push(status);
          query += ` AND status = $${params.length}`;
        }

        if (vault_address) {
          params.push(vault_address);
          query += ` AND vault_address = $${params.length}`;
        }

        query += ' ORDER BY block_height DESC LIMIT 100;';

        const result = await this.db.query(query, params);
        res.json({ proposals: result.rows });
      } catch (error) {
        console.error('[API] Error fetching proposals:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // GET /api/proposals/:id - Get proposal by ID
    router.get('/proposals/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const result = await this.db.query(`
          SELECT p.*, pm.title, pm.description, pm.payout_data
          FROM proposals p
          LEFT JOIN proposal_metadata pm ON p.proposal_id = pm.proposal_id
          WHERE p.proposal_id = $1 AND p.is_spent = FALSE
          LIMIT 1;
        `, [id]);

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Proposal not found' });
        }

        res.json({ proposal: result.rows[0] });
      } catch (error) {
        console.error('[API] Error fetching proposal:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // GET /api/schedules - List schedules
    router.get('/schedules', async (req, res) => {
      try {
        const { beneficiary } = req.query;

        let query = 'SELECT * FROM schedules WHERE is_spent = FALSE';
        const params: any[] = [];

        if (beneficiary) {
          params.push(beneficiary);
          query += ` AND beneficiary = $${params.length}`;
        }

        query += ' ORDER BY next_unlock_timestamp ASC LIMIT 100;';

        const result = await this.db.query(query, params);
        res.json({ schedules: result.rows });
      } catch (error) {
        console.error('[API] Error fetching schedules:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // GET /api/votes - List votes
    router.get('/votes', async (req, res) => {
      try {
        const { proposal_id, voter_address } = req.query;

        let query = 'SELECT * FROM votes WHERE is_spent = FALSE';
        const params: any[] = [];

        if (proposal_id) {
          params.push(proposal_id);
          query += ` AND proposal_id = $${params.length}`;
        }

        if (voter_address) {
          params.push(voter_address);
          query += ` AND voter_address = $${params.length}`;
        }

        query += ' ORDER BY block_height DESC LIMIT 100;';

        const result = await this.db.query(query, params);
        res.json({ votes: result.rows });
      } catch (error) {
        console.error('[API] Error fetching votes:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // POST /api/vaults/create - Build CreateVault transaction
    router.post('/vaults/create', async (req, res) => {
      try {
        const input = req.body;

        // Validate input
        if (!input.fundingUTXOs || !input.policyHash || !input.signerPubkeys) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        // Build unsigned transaction
        const tx = await this.nftMinter.buildCreateVaultTx({
          fundingUTXOs: input.fundingUTXOs.map((utxo: any) => ({
            txid: utxo.txid,
            vout: utxo.vout,
            satoshis: BigInt(utxo.satoshis),
          })),
          initialBalance: BigInt(input.initialBalance),
          policyHash: Buffer.from(input.policyHash, 'hex'),
          signerPubkeys: input.signerPubkeys.map((pk: string) => Buffer.from(pk, 'hex')),
          rolesMask: Buffer.from(input.rolesMask || '000000', 'hex'),
          periodDuration: input.periodDuration || 2592000, // 30 days
          periodCap: BigInt(input.periodCap || 0),
          recipientCap: BigInt(input.recipientCap || 0),
          allowlistEnabled: input.allowlistEnabled || false,
          allowlist: input.allowlist || [],
          categoryBudgets: {
            ops: BigInt(input.categoryBudgets?.ops || 0),
            grants: BigInt(input.categoryBudgets?.grants || 0),
            marketing: BigInt(input.categoryBudgets?.marketing || 0),
          },
        });

        res.json({ unsignedTx: tx });
      } catch (error) {
        console.error('[API] Error creating vault:', error);
        res.status(500).json({ error: 'Failed to create vault transaction' });
      }
    });

    // POST /api/proposals/submit - Build SubmitProposal transaction
    router.post('/proposals/submit', async (req, res) => {
      try {
        const input = req.body;

        if (!input.vaultAddress || !input.proposerDustUTXO || !input.payouts) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        const tx = await this.nftMinter.buildSubmitProposalTx({
          vaultAddress: input.vaultAddress,
          proposerDustUTXO: {
            txid: input.proposerDustUTXO.txid,
            vout: input.proposerDustUTXO.vout,
            satoshis: BigInt(input.proposerDustUTXO.satoshis),
          },
          payouts: input.payouts.map((p: any) => ({
            address: p.address,
            amount: BigInt(p.amount),
            category: p.category || 'ops',
          })),
          requiredApprovals: input.requiredApprovals || 2,
          votingDuration: input.votingDuration || 0,
          executionDelay: input.executionDelay || 86400, // 1 day default
        });

        res.json({ unsignedTx: tx });
      } catch (error) {
        console.error('[API] Error submitting proposal:', error);
        res.status(500).json({ error: 'Failed to create proposal transaction' });
      }
    });

    // POST /api/schedules/create - Build CreateSchedule transaction
    router.post('/schedules/create', async (req, res) => {
      try {
        const input = req.body;

        if (!input.fundingUTXOs || !input.beneficiaryAddress) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        const tx = await this.nftMinter.buildCreateScheduleTx({
          fundingUTXOs: input.fundingUTXOs.map((utxo: any) => ({
            txid: utxo.txid,
            vout: utxo.vout,
            satoshis: BigInt(utxo.satoshis),
          })),
          totalAmount: BigInt(input.totalAmount),
          beneficiaryAddress: input.beneficiaryAddress,
          scheduleType: input.scheduleType || 0, // RECURRING
          intervalSeconds: BigInt(input.intervalSeconds || 2592000), // 30 days
          amountPerInterval: BigInt(input.amountPerInterval),
          cliffTimestamp: BigInt(input.cliffTimestamp || 0),
        });

        res.json({ unsignedTx: tx });
      } catch (error) {
        console.error('[API] Error creating schedule:', error);
        res.status(500).json({ error: 'Failed to create schedule transaction' });
      }
    });

    // POST /api/votes/cast - Build CastVote transaction
    router.post('/votes/cast', async (req, res) => {
      try {
        const input = req.body;

        if (!input.proposalId || !input.governanceTokenUTXOs || !input.voteChoice) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        const tx = await this.nftMinter.buildCastVoteTx({
          proposalId: input.proposalId,
          governanceTokenUTXOs: input.governanceTokenUTXOs.map((utxo: any) => ({
            txid: utxo.txid,
            vout: utxo.vout,
            satoshis: BigInt(utxo.satoshis),
            tokenAmount: BigInt(utxo.tokenAmount),
          })),
          voteChoice: input.voteChoice, // 0=AGAINST, 1=FOR, 2=ABSTAIN
          unlockTimestamp: BigInt(input.unlockTimestamp),
        });

        res.json({ unsignedTx: tx });
      } catch (error) {
        console.error('[API] Error casting vote:', error);
        res.status(500).json({ error: 'Failed to create vote transaction' });
      }
    });

    // POST /api/proposals/:id/approve - Build ApproveProposal transaction
    router.post('/proposals/:id/approve', async (req, res) => {
      try {
        const { id: proposalId } = req.params;
        const input = req.body;

        if (!input.approverPubkey) {
          return res.status(400).json({ error: 'Missing approverPubkey' });
        }

        // Fetch current ProposalUTXO from database
        const proposalResult = await this.db.query(`
          SELECT * FROM proposals
          WHERE proposal_id = $1 AND is_spent = FALSE
          LIMIT 1;
        `, [proposalId]);

        if (proposalResult.rows.length === 0) {
          return res.status(404).json({ error: 'Proposal not found or already spent' });
        }

        const proposalRow = proposalResult.rows[0];

        // Reconstruct ProposalUTXO from database row
        const proposal = {
          utxo: {
            txid: proposalId.split(':')[0],
            vout: parseInt(proposalId.split(':')[1], 10),
          },
          address: proposalRow.address,
          satoshis: BigInt(proposalRow.balance),
          token: {
            category: proposalRow.token_category,
            nft: {
              capability: 'none' as const,
              commitment: proposalRow.nft_commitment,
            },
          },
          state: {
            version: proposalRow.version,
            status: proposalRow.status,
            approvalCount: proposalRow.approval_count,
            requiredApprovals: proposalRow.required_approvals,
            votingEndTimestamp: BigInt(proposalRow.voting_end_timestamp),
            executionTimelock: BigInt(proposalRow.execution_timelock),
            payoutTotal: BigInt(proposalRow.payout_total),
            payoutHash: proposalRow.payout_hash,
          },
          height: proposalRow.block_height,
          timestamp: BigInt(proposalRow.block_timestamp),
        };

        // Build ApproveProposal transaction
        const tx = await this.approvalTxBuilder.buildApproveProposalTx(
          {
            proposalId,
            approverPubkey: Buffer.from(input.approverPubkey, 'hex'),
            vaultAddress: input.vaultAddress || 'unknown', // TODO: Fetch from proposal metadata
          },
          proposal as any,
        );

        res.json({ unsignedTx: tx });
      } catch (error) {
        console.error('[API] Error approving proposal:', error);
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Failed to create approval transaction',
        });
      }
    });

    // Mount REST router
    this.app.use('/api', router);
  }

  /**
   * Setup GraphQL server
   */
  private async setupGraphQL(): Promise<void> {
    if (!this.config.enableGraphQL) return;

    this.apolloServer = new ApolloServer({
      typeDefs,
      resolvers,
    });

    await this.apolloServer.start();

    this.app.use(
      '/graphql',
      expressMiddleware(this.apolloServer, {
        context: async () => ({ db: this.db }),
      })
    );

    console.log('[API] GraphQL endpoint ready at /graphql');
  }

  /**
   * Start API server
   */
  async start(): Promise<void> {
    console.log('[API] Starting FlowGuard API Gateway...');

    // Setup GraphQL if enabled
    if (this.config.enableGraphQL) {
      await this.setupGraphQL();
    }

    // Start HTTP server
    this.app.listen(this.config.port, () => {
      console.log(`[API] Server listening on port ${this.config.port}`);
      console.log(`[API] REST API: http://localhost:${this.config.port}/api`);
      if (this.config.enableGraphQL) {
        console.log(`[API] GraphQL: http://localhost:${this.config.port}/graphql`);
      }
    });
  }

  /**
   * Stop API server
   */
  async stop(): Promise<void> {
    console.log('[API] Stopping...');
    await this.db.end();
    if (this.apolloServer) {
      await this.apolloServer.stop();
    }
  }
}

/**
 * CLI Entry Point
 */
if (require.main === module) {
  const config: APIConfig = {
    port: parseInt(process.env.PORT || '3001', 10),
    databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/flowguard',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    enableGraphQL: process.env.ENABLE_GRAPHQL !== 'false',
    enableRest: process.env.ENABLE_REST !== 'false',
    network: (process.env.NETWORK as 'mainnet' | 'chipnet') || 'chipnet',
    electrumServer: process.env.ELECTRUM_SERVER || 'chipnet.imaginary.cash:50001',
  };

  const api = new FlowGuardAPI(config);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[API] Received SIGINT, shutting down gracefully...');
    await api.stop();
    process.exit(0);
  });

  // Start API
  api.start().catch((error) => {
    console.error('[API] Fatal error:', error);
    process.exit(1);
  });
}

export default FlowGuardAPI;
