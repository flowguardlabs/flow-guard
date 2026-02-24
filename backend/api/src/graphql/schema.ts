/**
 * GraphQL Schema
 *
 * Defines GraphQL types and resolvers for FlowGuard API
 */

export const typeDefs = `#graphql
  type Vault {
    txid: String!
    vout: Int!
    address: String!
    satoshis: String!
    status: Int!
    currentPeriodId: String!
    spentThisPeriod: String!
    lastUpdateTimestamp: String!
    blockHeight: String!
    isSpent: Boolean!
  }

  type Proposal {
    txid: String!
    vout: Int!
    proposalId: String!
    title: String
    description: String
    status: Int!
    approvalCount: Int!
    requiredApprovals: Int!
    votingEndTimestamp: String!
    executionTimelock: String!
    payoutTotal: String!
    vaultAddress: String!
    blockHeight: String!
    isSpent: Boolean!
  }

  type Schedule {
    txid: String!
    vout: Int!
    scheduleType: Int!
    nextUnlockTimestamp: String!
    amountPerInterval: String!
    totalReleased: String!
    beneficiary: String!
    blockHeight: String!
    isSpent: Boolean!
  }

  type Vote {
    txid: String!
    vout: Int!
    proposalId: String!
    voteChoice: Int!
    fungibleAmount: String!
    voterAddress: String!
    blockHeight: String!
    isSpent: Boolean!
  }

  type Query {
    vaults(limit: Int = 100): [Vault!]!
    vault(address: String!): Vault
    proposals(status: Int, vaultAddress: String, limit: Int = 100): [Proposal!]!
    proposal(proposalId: String!): Proposal
    schedules(beneficiary: String, limit: Int = 100): [Schedule!]!
    votes(proposalId: String, voterAddress: String, limit: Int = 100): [Vote!]!
  }
`;

export const resolvers = {
  Query: {
    vaults: async (_: any, args: any, context: any) => {
      const { limit } = args;
      const result = await context.db.query(`
        SELECT * FROM active_vaults
        ORDER BY block_height DESC
        LIMIT $1;
      `, [limit]);
      return result.rows;
    },

    vault: async (_: any, args: any, context: any) => {
      const { address } = args;
      const result = await context.db.query(`
        SELECT * FROM vaults
        WHERE address = $1 AND is_spent = FALSE
        LIMIT 1;
      `, [address]);
      return result.rows[0] || null;
    },

    proposals: async (_: any, args: any, context: any) => {
      const { status, vaultAddress, limit } = args;

      let query = `
        SELECT p.*, pm.title, pm.description
        FROM proposals p
        LEFT JOIN proposal_metadata pm ON p.proposal_id = pm.proposal_id
        WHERE p.is_spent = FALSE
      `;
      const params: any[] = [];

      if (status !== undefined) {
        params.push(status);
        query += ` AND p.status = $${params.length}`;
      }

      if (vaultAddress) {
        params.push(vaultAddress);
        query += ` AND p.vault_address = $${params.length}`;
      }

      params.push(limit);
      query += ` ORDER BY p.block_height DESC LIMIT $${params.length};`;

      const result = await context.db.query(query, params);
      return result.rows;
    },

    proposal: async (_: any, args: any, context: any) => {
      const { proposalId } = args;
      const result = await context.db.query(`
        SELECT p.*, pm.title, pm.description
        FROM proposals p
        LEFT JOIN proposal_metadata pm ON p.proposal_id = pm.proposal_id
        WHERE p.proposal_id = $1 AND p.is_spent = FALSE
        LIMIT 1;
      `, [proposalId]);
      return result.rows[0] || null;
    },

    schedules: async (_: any, args: any, context: any) => {
      const { beneficiary, limit } = args;

      let query = 'SELECT * FROM schedules WHERE is_spent = FALSE';
      const params: any[] = [];

      if (beneficiary) {
        params.push(beneficiary);
        query += ` AND beneficiary = $${params.length}`;
      }

      params.push(limit);
      query += ` ORDER BY next_unlock_timestamp ASC LIMIT $${params.length};`;

      const result = await context.db.query(query, params);
      return result.rows;
    },

    votes: async (_: any, args: any, context: any) => {
      const { proposalId, voterAddress, limit } = args;

      let query = 'SELECT * FROM votes WHERE is_spent = FALSE';
      const params: any[] = [];

      if (proposalId) {
        params.push(proposalId);
        query += ` AND proposal_id = $${params.length}`;
      }

      if (voterAddress) {
        params.push(voterAddress);
        query += ` AND voter_address = $${params.length}`;
      }

      params.push(limit);
      query += ` ORDER BY block_height DESC LIMIT $${params.length};`;

      const result = await context.db.query(query, params);
      return result.rows;
    },
  },
};
