/**
 * Database Schema and Initialization
 * SQLite-only implementation
 */

import Database, { type Database as DatabaseType } from 'better-sqlite3';

// Initialize SQLite database
const dbPath = process.env.DATABASE_PATH || './flowguard.db';
const db = new Database(dbPath);
console.log('Using SQLite database:', dbPath);

// SQL schema for SQLite
const createTablesSQL = `
  CREATE TABLE IF NOT EXISTS vaults (
    id TEXT PRIMARY KEY,
    vault_id TEXT UNIQUE NOT NULL,
    creator TEXT NOT NULL,
    total_deposit REAL NOT NULL,
    spending_cap REAL NOT NULL,
    approval_threshold INTEGER NOT NULL,
    signers TEXT NOT NULL,
    state INTEGER DEFAULT 0,
    cycle_duration INTEGER NOT NULL,
    unlock_amount REAL NOT NULL,
    is_public INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY,
    vault_id TEXT NOT NULL,
    proposal_id INTEGER NOT NULL,
    recipient TEXT NOT NULL,
    amount REAL NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    approval_count INTEGER DEFAULT 0,
    approvals TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    executed_at DATETIME,
    tx_hash TEXT,
    FOREIGN KEY (vault_id) REFERENCES vaults(vault_id)
  );

  CREATE TABLE IF NOT EXISTS cycles (
    id TEXT PRIMARY KEY,
    vault_id TEXT NOT NULL,
    cycle_number INTEGER NOT NULL,
    unlock_time DATETIME NOT NULL,
    unlock_amount REAL NOT NULL,
    unlocked_at DATETIME,
    spent_amount REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vault_id) REFERENCES vaults(vault_id),
    UNIQUE(vault_id, cycle_number)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    vault_id TEXT,
    proposal_id TEXT,
    tx_hash TEXT UNIQUE NOT NULL,
    tx_type TEXT NOT NULL,
    amount REAL,
    from_address TEXT,
    to_address TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    block_height INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    confirmed_at DATETIME,
    FOREIGN KEY (vault_id) REFERENCES vaults(vault_id),
    FOREIGN KEY (proposal_id) REFERENCES proposals(id)
  );
`;

// Initialize tables
db.pragma('foreign_keys = ON');
db.exec(createTablesSQL);

// Migration: Add columns if they don't exist
try {
  const tableInfo = db.prepare("PRAGMA table_info(vaults)").all() as Array<{ name: string }>;

  const columns = [
    { name: 'is_public', sql: 'ALTER TABLE vaults ADD COLUMN is_public INTEGER DEFAULT 0' },
    { name: 'contract_address', sql: 'ALTER TABLE vaults ADD COLUMN contract_address TEXT' },
    { name: 'contract_bytecode', sql: 'ALTER TABLE vaults ADD COLUMN contract_bytecode TEXT' },
    { name: 'balance', sql: 'ALTER TABLE vaults ADD COLUMN balance REAL DEFAULT 0' },
    { name: 'signer_pubkeys', sql: 'ALTER TABLE vaults ADD COLUMN signer_pubkeys TEXT' },
    { name: 'start_time', sql: 'ALTER TABLE vaults ADD COLUMN start_time DATETIME' },
    { name: 'name', sql: 'ALTER TABLE vaults ADD COLUMN name TEXT' },
    { name: 'description', sql: 'ALTER TABLE vaults ADD COLUMN description TEXT' },
  ];

  for (const col of columns) {
    const hasColumn = tableInfo.some(c => c.name === col.name);
    if (!hasColumn) {
      db.exec(col.sql);
      console.log(`Added ${col.name} column to vaults table`);
    }
  }
} catch (error) {
  console.warn('Migration error:', error);
}

// Export database instance
export { db };
export default db;
