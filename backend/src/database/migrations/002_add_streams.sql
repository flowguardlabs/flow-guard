-- Migration 002: Add Streaming Payments Tables
-- Transforms FlowGuard into "Sablier for BCH"

-- Streams table - recipient-centric payment streams
CREATE TABLE IF NOT EXISTS streams (
  id TEXT PRIMARY KEY,
  stream_id TEXT UNIQUE NOT NULL, -- Human-readable ID like #FG-BCH-001
  vault_id TEXT NOT NULL,
  sender TEXT NOT NULL, -- Vault address
  recipient TEXT NOT NULL, -- Recipient BCH address
  token_type TEXT NOT NULL DEFAULT 'BCH', -- 'BCH' or 'CASHTOKENS'
  token_category TEXT, -- For CashTokens (category ID)
  total_amount REAL NOT NULL,
  withdrawn_amount REAL DEFAULT 0,
  stream_type TEXT NOT NULL, -- 'LINEAR' | 'RECURRING' | 'STEP'
  start_time INTEGER NOT NULL, -- Unix timestamp
  end_time INTEGER, -- Unix timestamp (null for perpetual)
  interval_seconds INTEGER, -- For recurring streams
  cliff_timestamp INTEGER, -- Vesting cliff
  cancelable INTEGER DEFAULT 1, -- Boolean: can sender cancel?
  transferable INTEGER DEFAULT 0, -- Boolean: can recipient transfer?
  status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED'
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (vault_id) REFERENCES vaults(vault_id)
);

-- Stream claims table - tracks all withdrawals
CREATE TABLE IF NOT EXISTS stream_claims (
  id TEXT PRIMARY KEY,
  stream_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  amount REAL NOT NULL,
  claimed_at INTEGER DEFAULT (strftime('%s', 'now')),
  tx_hash TEXT,
  FOREIGN KEY (stream_id) REFERENCES streams(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_streams_recipient ON streams(recipient);
CREATE INDEX IF NOT EXISTS idx_streams_sender ON streams(sender);
CREATE INDEX IF NOT EXISTS idx_streams_status ON streams(status);
CREATE INDEX IF NOT EXISTS idx_streams_vault ON streams(vault_id);
CREATE INDEX IF NOT EXISTS idx_claims_stream ON stream_claims(stream_id);

-- View for easy querying of active streams with computed vested amounts
CREATE VIEW IF NOT EXISTS streams_with_vested AS
SELECT
  s.*,
  -- Compute vested amount (linear vesting formula)
  CASE
    WHEN s.status != 'ACTIVE' THEN s.withdrawn_amount
    WHEN strftime('%s', 'now') < s.cliff_timestamp THEN 0
    WHEN strftime('%s', 'now') >= s.end_time THEN s.total_amount
    ELSE (s.total_amount * (strftime('%s', 'now') - s.start_time)) / (s.end_time - s.start_time)
  END as vested_amount,
  -- Compute claimable amount
  CASE
    WHEN s.status != 'ACTIVE' THEN 0
    WHEN strftime('%s', 'now') < s.cliff_timestamp THEN 0
    WHEN strftime('%s', 'now') >= s.end_time THEN s.total_amount - s.withdrawn_amount
    ELSE ((s.total_amount * (strftime('%s', 'now') - s.start_time)) / (s.end_time - s.start_time)) - s.withdrawn_amount
  END as claimable_amount
FROM streams s;
