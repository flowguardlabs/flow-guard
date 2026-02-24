-- Migration 003: Add Payments and Airdrops Tables

-- Recurring payments (RecurringPaymentCovenant)
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  payment_id TEXT UNIQUE NOT NULL, -- Human-readable ID like #FG-PAY-001
  vault_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  recipient_name TEXT,
  token_type TEXT NOT NULL DEFAULT 'BCH', -- 'BCH' or 'CASHTOKENS'
  token_category TEXT,
  amount_per_period REAL NOT NULL,
  interval TEXT NOT NULL, -- 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY'
  interval_seconds INTEGER NOT NULL,
  start_date INTEGER NOT NULL, -- Unix timestamp
  end_date INTEGER, -- Unix timestamp (null = perpetual)
  next_payment_date INTEGER NOT NULL, -- Unix timestamp
  total_paid REAL DEFAULT 0,
  payment_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED'
  pausable INTEGER DEFAULT 1, -- Boolean
  contract_address TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (vault_id) REFERENCES vaults(vault_id)
);

-- Payment execution history
CREATE TABLE IF NOT EXISTS payment_executions (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  amount REAL NOT NULL,
  paid_at INTEGER DEFAULT (strftime('%s', 'now')),
  tx_hash TEXT,
  FOREIGN KEY (payment_id) REFERENCES payments(id)
);

-- Airdrop / distribution campaigns (AirdropCovenant)
CREATE TABLE IF NOT EXISTS airdrops (
  id TEXT PRIMARY KEY,
  campaign_id TEXT UNIQUE NOT NULL, -- Human-readable ID like #FG-DROP-001
  vault_id TEXT NOT NULL,
  creator TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  campaign_type TEXT NOT NULL DEFAULT 'AIRDROP', -- 'AIRDROP' | 'REWARD' | 'BOUNTY' | 'GRANT'
  token_type TEXT NOT NULL DEFAULT 'BCH',
  token_category TEXT,
  total_amount REAL NOT NULL,
  amount_per_claim REAL NOT NULL,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  claimed_count INTEGER DEFAULT 0,
  claim_link TEXT,
  start_date INTEGER NOT NULL,
  end_date INTEGER,
  status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'
  require_kyc INTEGER DEFAULT 0, -- Boolean
  max_claims_per_address INTEGER DEFAULT 1,
  contract_address TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (vault_id) REFERENCES vaults(vault_id)
);

-- Airdrop claim records
CREATE TABLE IF NOT EXISTS airdrop_claims (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  claimer TEXT NOT NULL,
  amount REAL NOT NULL,
  claimed_at INTEGER DEFAULT (strftime('%s', 'now')),
  tx_hash TEXT,
  FOREIGN KEY (campaign_id) REFERENCES airdrops(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_sender ON payments(sender);
CREATE INDEX IF NOT EXISTS idx_payments_recipient ON payments(recipient);
CREATE INDEX IF NOT EXISTS idx_payments_vault ON payments(vault_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payment_executions_payment ON payment_executions(payment_id);
CREATE INDEX IF NOT EXISTS idx_airdrops_creator ON airdrops(creator);
CREATE INDEX IF NOT EXISTS idx_airdrops_vault ON airdrops(vault_id);
CREATE INDEX IF NOT EXISTS idx_airdrops_status ON airdrops(status);
CREATE INDEX IF NOT EXISTS idx_airdrop_claims_campaign ON airdrop_claims(campaign_id);
CREATE INDEX IF NOT EXISTS idx_airdrop_claims_claimer ON airdrop_claims(claimer);
