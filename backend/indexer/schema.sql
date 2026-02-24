/**
 * FlowGuard Indexer Database Schema
 *
 * PostgreSQL schema for indexing covenant UTXOs and state
 *
 * PURPOSE:
 * - Reconstruct UTXO state from blockchain
 * - Provide queryable API for frontend/SDK
 * - Track historical state transitions
 * - Enable efficient querying without full node
 *
 * TABLES:
 * - vaults: Treasury vault UTXOs
 * - proposals: Proposal UTXOs
 * - schedules: Schedule/vesting UTXOs
 * - votes: Vote lock UTXOs
 * - tallies: Tally commitment UTXOs
 * - transactions: Indexed transactions
 * - blocks: Block metadata
 */

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- BLOCKS TABLE
-- =============================================================================

CREATE TABLE blocks (
  height BIGINT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  timestamp BIGINT NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_blocks_timestamp ON blocks(timestamp);
CREATE INDEX idx_blocks_hash ON blocks(hash);

-- =============================================================================
-- TRANSACTIONS TABLE
-- =============================================================================

CREATE TABLE transactions (
  txid TEXT PRIMARY KEY,
  block_height BIGINT REFERENCES blocks(height),
  block_timestamp BIGINT,
  tx_index INTEGER, -- Position in block
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_block_height ON transactions(block_height);
CREATE INDEX idx_transactions_timestamp ON transactions(block_timestamp);

-- =============================================================================
-- VAULTS TABLE
-- =============================================================================

CREATE TABLE vaults (
  -- UTXO Reference
  txid TEXT NOT NULL,
  vout INTEGER NOT NULL,
  PRIMARY KEY (txid, vout),

  -- Address and Value
  address TEXT NOT NULL, -- Covenant P2SH32 address
  satoshis BIGINT NOT NULL,

  -- CashTokens Data
  token_category TEXT, -- 32 bytes hex (if NFT present)
  nft_capability TEXT, -- 'none', 'mutable', 'minting'
  nft_commitment BYTEA, -- NFT commitment (variable 0-40 bytes)
  fungible_amount BIGINT, -- Fungible token amount (if present)

  -- Decoded VaultState (from NFT commitment)
  state_version INTEGER NOT NULL,
  status INTEGER NOT NULL, -- 0=ACTIVE, 1=PAUSED, 2=EMERGENCY_LOCK, 3=MIGRATING
  roles_mask BYTEA NOT NULL, -- 3 bytes
  current_period_id BIGINT NOT NULL,
  spent_this_period BIGINT NOT NULL,
  last_update_timestamp BIGINT NOT NULL,

  -- Off-chain Policy Data (joined from policies table)
  policy_hash TEXT NOT NULL, -- References policies table

  -- Block/Transaction Metadata
  block_height BIGINT NOT NULL REFERENCES blocks(height),
  block_timestamp BIGINT NOT NULL,
  tx_index INTEGER,

  -- UTXO Lifecycle
  spent_txid TEXT, -- TXID that spent this UTXO (null if unspent)
  spent_at_height BIGINT, -- Block height where spent
  is_spent BOOLEAN NOT NULL DEFAULT FALSE,

  -- Indexer Metadata
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vaults_address ON vaults(address);
CREATE INDEX idx_vaults_policy_hash ON vaults(policy_hash);
CREATE INDEX idx_vaults_status ON vaults(status);
CREATE INDEX idx_vaults_is_spent ON vaults(is_spent);
CREATE INDEX idx_vaults_block_height ON vaults(block_height);

-- =============================================================================
-- PROPOSALS TABLE
-- =============================================================================

CREATE TABLE proposals (
  -- UTXO Reference
  txid TEXT NOT NULL,
  vout INTEGER NOT NULL,
  PRIMARY KEY (txid, vout),

  -- Address and Value
  address TEXT NOT NULL,
  satoshis BIGINT NOT NULL,

  -- CashTokens Data
  token_category TEXT,
  nft_capability TEXT,
  nft_commitment BYTEA,

  -- Decoded ProposalState (from NFT commitment)
  state_version INTEGER NOT NULL,
  status INTEGER NOT NULL, -- 0=DRAFT, 1=SUBMITTED, ..., 8=EXPIRED
  approval_count INTEGER NOT NULL,
  required_approvals INTEGER NOT NULL,
  voting_end_timestamp BIGINT NOT NULL,
  execution_timelock BIGINT NOT NULL,
  payout_total BIGINT NOT NULL,
  payout_hash BYTEA NOT NULL, -- 28 bytes

  -- Off-chain Proposal Data (joined from proposal_metadata table)
  proposal_id TEXT NOT NULL, -- 32 bytes hex (hash of proposal)

  -- Associated Vault
  vault_address TEXT NOT NULL, -- References vaults table

  -- Block/Transaction Metadata
  block_height BIGINT NOT NULL REFERENCES blocks(height),
  block_timestamp BIGINT NOT NULL,
  tx_index INTEGER,

  -- UTXO Lifecycle
  spent_txid TEXT,
  spent_at_height BIGINT,
  is_spent BOOLEAN NOT NULL DEFAULT FALSE,

  -- Indexer Metadata
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposals_proposal_id ON proposals(proposal_id);
CREATE INDEX idx_proposals_vault_address ON proposals(vault_address);
CREATE INDEX idx_proposals_status ON proposals(status);
CREATE INDEX idx_proposals_is_spent ON proposals(is_spent);
CREATE INDEX idx_proposals_voting_end ON proposals(voting_end_timestamp);

-- =============================================================================
-- SCHEDULES TABLE
-- =============================================================================

CREATE TABLE schedules (
  -- UTXO Reference
  txid TEXT NOT NULL,
  vout INTEGER NOT NULL,
  PRIMARY KEY (txid, vout),

  -- Address and Value
  address TEXT NOT NULL,
  satoshis BIGINT NOT NULL,

  -- CashTokens Data
  token_category TEXT,
  nft_capability TEXT,
  nft_commitment BYTEA,

  -- Decoded ScheduleState (from NFT commitment)
  state_version INTEGER NOT NULL,
  schedule_type INTEGER NOT NULL, -- 0=RECURRING, 1=LINEAR_VESTING, 2=STEP_VESTING
  interval_seconds BIGINT NOT NULL,
  next_unlock_timestamp BIGINT NOT NULL,
  amount_per_interval BIGINT NOT NULL,
  total_released BIGINT NOT NULL,
  cliff_timestamp BIGINT,

  -- Off-chain Schedule Data
  beneficiary TEXT NOT NULL, -- Beneficiary address

  -- Associated Vault
  vault_address TEXT,

  -- Block/Transaction Metadata
  block_height BIGINT NOT NULL REFERENCES blocks(height),
  block_timestamp BIGINT NOT NULL,
  tx_index INTEGER,

  -- UTXO Lifecycle
  spent_txid TEXT,
  spent_at_height BIGINT,
  is_spent BOOLEAN NOT NULL DEFAULT FALSE,

  -- Indexer Metadata
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedules_beneficiary ON schedules(beneficiary);
CREATE INDEX idx_schedules_vault_address ON schedules(vault_address);
CREATE INDEX idx_schedules_schedule_type ON schedules(schedule_type);
CREATE INDEX idx_schedules_next_unlock ON schedules(next_unlock_timestamp);
CREATE INDEX idx_schedules_is_spent ON schedules(is_spent);

-- =============================================================================
-- VOTES TABLE
-- =============================================================================

CREATE TABLE votes (
  -- UTXO Reference
  txid TEXT NOT NULL,
  vout INTEGER NOT NULL,
  PRIMARY KEY (txid, vout),

  -- Address and Value
  address TEXT NOT NULL,
  satoshis BIGINT NOT NULL,

  -- CashTokens Data (token amount = voting power)
  token_category TEXT NOT NULL,
  fungible_amount BIGINT NOT NULL, -- Voting power
  nft_commitment BYTEA,

  -- Decoded VoteState (from NFT commitment)
  state_version INTEGER NOT NULL,
  proposal_id_prefix BYTEA NOT NULL, -- 4 bytes
  vote_choice INTEGER NOT NULL, -- 0=AGAINST, 1=FOR, 2=ABSTAIN
  lock_timestamp BIGINT NOT NULL,
  unlock_timestamp BIGINT NOT NULL,

  -- Proposal Reference
  proposal_id TEXT NOT NULL, -- Full 32 bytes hex

  -- Voter
  voter_address TEXT NOT NULL,

  -- Block/Transaction Metadata
  block_height BIGINT NOT NULL REFERENCES blocks(height),
  block_timestamp BIGINT NOT NULL,
  tx_index INTEGER,

  -- UTXO Lifecycle
  spent_txid TEXT,
  spent_at_height BIGINT,
  is_spent BOOLEAN NOT NULL DEFAULT FALSE,

  -- Indexer Metadata
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_votes_proposal_id ON votes(proposal_id);
CREATE INDEX idx_votes_voter_address ON votes(voter_address);
CREATE INDEX idx_votes_vote_choice ON votes(vote_choice);
CREATE INDEX idx_votes_is_spent ON votes(is_spent);

-- =============================================================================
-- TALLIES TABLE
-- =============================================================================

CREATE TABLE tallies (
  -- UTXO Reference
  txid TEXT NOT NULL,
  vout INTEGER NOT NULL,
  PRIMARY KEY (txid, vout),

  -- Address and Value
  address TEXT NOT NULL,
  satoshis BIGINT NOT NULL,

  -- CashTokens Data
  token_category TEXT,
  nft_commitment BYTEA,

  -- Decoded TallyState (from NFT commitment)
  state_version INTEGER NOT NULL,
  proposal_id_prefix BYTEA NOT NULL, -- 4 bytes
  votes_for BIGINT NOT NULL,
  votes_against BIGINT NOT NULL,
  votes_abstain BIGINT NOT NULL,
  quorum_threshold BIGINT NOT NULL,
  tally_timestamp BIGINT NOT NULL,

  -- Proposal Reference
  proposal_id TEXT NOT NULL,

  -- Tally Metadata
  total_votes BIGINT NOT NULL, -- votes_for + votes_against + votes_abstain
  passed BOOLEAN NOT NULL, -- Quorum met AND majority passed

  -- Block/Transaction Metadata
  block_height BIGINT NOT NULL REFERENCES blocks(height),
  block_timestamp BIGINT NOT NULL,
  tx_index INTEGER,

  -- UTXO Lifecycle
  spent_txid TEXT,
  spent_at_height BIGINT,
  is_spent BOOLEAN NOT NULL DEFAULT FALSE,

  -- Indexer Metadata
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tallies_proposal_id ON tallies(proposal_id);
CREATE INDEX idx_tallies_passed ON tallies(passed);
CREATE INDEX idx_tallies_is_spent ON tallies(is_spent);

-- =============================================================================
-- POLICIES TABLE (Off-chain storage)
-- =============================================================================

CREATE TABLE policies (
  policy_hash TEXT PRIMARY KEY, -- 32 bytes hex (hash of policy JSON)
  policy_data JSONB NOT NULL, -- Full TreasuryPolicy object
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_policies_data ON policies USING GIN(policy_data);

-- =============================================================================
-- PROPOSAL_METADATA TABLE (Off-chain storage)
-- =============================================================================

CREATE TABLE proposal_metadata (
  proposal_id TEXT PRIMARY KEY, -- 32 bytes hex
  title TEXT NOT NULL,
  description TEXT,
  payout_data JSONB NOT NULL, -- PayoutRequest object
  submitted_by TEXT,
  submitted_at BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Update updated_at timestamp on row modification
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for all covenant tables
CREATE TRIGGER update_vaults_updated_at BEFORE UPDATE ON vaults
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_proposals_updated_at BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_votes_updated_at BEFORE UPDATE ON votes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tallies_updated_at BEFORE UPDATE ON tallies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Active (unspent) vaults
CREATE VIEW active_vaults AS
SELECT * FROM vaults WHERE is_spent = FALSE;

-- Active proposals by status
CREATE VIEW active_proposals AS
SELECT * FROM proposals WHERE is_spent = FALSE;

-- Pending proposals (SUBMITTED, VOTING, APPROVED, QUEUED, EXECUTABLE)
CREATE VIEW pending_proposals AS
SELECT * FROM proposals
WHERE is_spent = FALSE AND status IN (1, 2, 3, 4, 5);

-- Active schedules (not yet fully vested)
CREATE VIEW active_schedules AS
SELECT * FROM schedules WHERE is_spent = FALSE;

-- Recent votes (last 30 days)
CREATE VIEW recent_votes AS
SELECT * FROM votes
WHERE block_timestamp > EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days');
