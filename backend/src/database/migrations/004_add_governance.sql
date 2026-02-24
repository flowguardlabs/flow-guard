-- Governance proposals (vault-scoped)
CREATE TABLE IF NOT EXISTS governance_proposals (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  proposer TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, PASSED, FAILED, CANCELLED
  votes_for INTEGER NOT NULL DEFAULT 0,
  votes_against INTEGER NOT NULL DEFAULT 0,
  votes_abstain INTEGER NOT NULL DEFAULT 0,
  quorum INTEGER NOT NULL DEFAULT 0,
  voting_ends_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (vault_id) REFERENCES vaults(vault_id)
);

-- Individual votes
CREATE TABLE IF NOT EXISTS governance_votes (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  voter TEXT NOT NULL,
  vote TEXT NOT NULL, -- FOR, AGAINST, ABSTAIN
  weight INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (proposal_id) REFERENCES governance_proposals(id),
  UNIQUE (proposal_id, voter)
);

CREATE INDEX IF NOT EXISTS idx_governance_proposals_vault ON governance_proposals(vault_id);
CREATE INDEX IF NOT EXISTS idx_governance_votes_proposal ON governance_votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_governance_votes_voter ON governance_votes(voter);
