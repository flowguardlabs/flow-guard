-- Add tx_hash column to vaults table
ALTER TABLE vaults ADD COLUMN tx_hash TEXT;

-- Add tx_hash column to streams table  
ALTER TABLE streams ADD COLUMN tx_hash TEXT;

-- Add tx_hash column to payments table
ALTER TABLE payments ADD COLUMN tx_hash TEXT;

-- Add tx_hash column to airdrops table
ALTER TABLE airdrops ADD COLUMN tx_hash TEXT;
