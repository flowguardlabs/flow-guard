import { Router } from 'express';
import { VaultService } from '../services/vaultService.js';
import { CreateVaultDto } from '../models/Vault.js';
import { ElectrumNetworkProvider } from 'cashscript';
import { transactionHasExpectedOutput } from '../utils/txVerification.js';
import { VaultFundingService } from '../services/VaultFundingService.js';
import { serializeWcTransaction } from '../utils/wcSerializer.js';
import db from '../database/schema.js';
import { displayAmountToOnChain } from '../utils/amounts.js';

const router = Router();

// Create vault (now async - deploys contract to blockchain)
router.post('/', async (req, res) => {
  try {
    const dto: CreateVaultDto = req.body;
    const creator = req.headers['x-user-address'] as string || 'unknown';

    // Validate input
    if (!dto.signers || dto.signers.length !== 3) {
      return res.status(400).json({ error: 'Exactly 3 signers are required' });
    }

    if (!dto.signerPubkeys || dto.signerPubkeys.length !== 3) {
      return res.status(400).json({ error: 'Exactly 3 signer public keys are required for blockchain deployment' });
    }

    const vault = await VaultService.createVault(dto, creator);
    res.status(201).json(vault);
  } catch (error: any) {
    console.error('Vault creation error:', error);
    res.status(400).json({ error: error.message });
  }
});

// List user's vaults with role information (must come before /:id route)
router.get('/', (req, res) => {
  try {
    const userAddress = req.headers['x-user-address'] as string || 'unknown';
    
    // Get vaults where user is creator or signer
    const userVaults = VaultService.getUserVaults(userAddress);
    
    // Get public vaults that user is not already part of
    const publicVaults = VaultService.getPublicVaults().filter(
      vault => !VaultService.isCreator(vault, userAddress) && !VaultService.isSigner(vault, userAddress)
    );
    
    // Categorize user vaults
    const created = userVaults.filter(v => VaultService.isCreator(v, userAddress));
    const signerIn = userVaults.filter(
      v => VaultService.isSigner(v, userAddress) && !VaultService.isCreator(v, userAddress)
    );
    
    // Add role to each vault
    const vaultsWithRole = userVaults.map(vault => ({
      ...vault,
      role: VaultService.isCreator(vault, userAddress) ? 'creator' : 'signer'
    }));
    
    const publicWithRole = publicVaults.map(vault => ({
      ...vault,
      role: 'viewer'
    }));
    
    res.json({
      created,
      signerIn,
      public: publicWithRole,
      all: [...vaultsWithRole, ...publicWithRole]
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get vault by ID (with visibility check)
router.get('/:id', (req, res) => {
  try {
    const vault = VaultService.getVaultById(req.params.id);
    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }
    
    const userAddress = req.headers['x-user-address'] as string || 'unknown';
    
    // Check if user can view this vault
    if (!VaultService.canViewVault(vault, userAddress)) {
      return res.status(403).json({ error: 'Access denied: This vault is private' });
    }
    
    // Determine user role
    let role: 'creator' | 'signer' | 'viewer' = 'viewer';
    if (VaultService.isCreator(vault, userAddress)) {
      role = 'creator';
    } else if (VaultService.isSigner(vault, userAddress)) {
      role = 'signer';
    }
    
    res.json({
      ...vault,
      role
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get vault state
router.get('/:id/state', (req, res) => {
  try {
    const vault = VaultService.getVaultById(req.params.id);
    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }
    
    const userAddress = req.headers['x-user-address'] as string || 'unknown';
    if (!VaultService.canViewVault(vault, userAddress)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({ state: vault.state, vaultId: vault.vaultId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Add signer to vault (creator-only)
router.post('/:id/signers', (req, res) => {
  try {
    const dbId = req.params.id;
    const { signerAddress } = req.body;
    const requesterAddress = req.headers['x-user-address'] as string || 'unknown';
    
    if (!signerAddress) {
      return res.status(400).json({ error: 'Signer address is required' });
    }
    
    // Get vault by database ID first to get the vaultId
    const vault = VaultService.getVaultById(dbId);
    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }
    
    const updatedVault = VaultService.addSigner(vault.vaultId, signerAddress, requesterAddress);
    res.json(updatedVault);
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('Only the vault creator')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message.includes('already exists')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Get deposit information for a vault
// Returns contract address and amount details for frontend to use
router.get('/:id/deposit', async (req, res) => {
  try {
    const vault = VaultService.getVaultById(req.params.id);
    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }

    const userAddress = req.headers['x-user-address'] as string || 'unknown';
    
    // Only creator can deposit initially
    if (!VaultService.isCreator(vault, userAddress)) {
      return res.status(403).json({ error: 'Only the vault creator can deposit funds' });
    }

    if (!vault.contractAddress) {
      return res.status(400).json({ error: 'Vault contract address not available' });
    }

    const amountToDepositBch = Math.max(0, (vault.totalDeposit || 0) - (vault.balance || 0));
    const amountToDepositSats = BigInt(displayAmountToOnChain(amountToDepositBch, 'BCH'));

    let fundingPayload: any = undefined;
    let warning: string | undefined;

    if (amountToDepositSats > 0n) {
      const constructorParamsRow = db
        .prepare('SELECT constructor_params FROM vaults WHERE id = ?')
        .get(req.params.id) as any;

      if (constructorParamsRow?.constructor_params) {
        try {
          const network = process.env.BCH_NETWORK as 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' || 'chipnet';
          const fundingService = new VaultFundingService(network);
          const built = await fundingService.buildInitialFundingTransaction({
            constructorParamsJson: constructorParamsRow.constructor_params,
            contractAddress: vault.contractAddress,
            funderAddress: userAddress,
            depositSatoshis: amountToDepositSats,
          });

          fundingPayload = {
            wcTransaction: serializeWcTransaction(built.wcTransaction),
            stateNft: {
              tokenCategory: built.tokenCategory,
              commitment: built.initialCommitment,
            },
            depositSatoshis: built.depositSatoshis.toString(),
          };
        } catch (error: any) {
          warning = `State-NFT bootstrap transaction unavailable: ${error.message}`;
        }
      } else {
        warning = 'Vault constructor parameters are missing; cannot build state-NFT bootstrap transaction.';
      }
    }

    res.json({
      contractAddress: vault.contractAddress,
      totalDeposit: vault.totalDeposit,
      currentBalance: vault.balance || 0,
      amountToDeposit: amountToDepositBch,
      ...fundingPayload,
      ...(warning ? { warning } : {}),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update vault balance after deposit
router.post('/:id/update-balance', async (req, res) => {
  try {
    const { txid, amount } = req.body;
    const userAddress = req.headers['x-user-address'] as string || 'unknown';

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    if (!txid) {
      return res.status(400).json({ error: 'Transaction ID is required' });
    }

    const vault = VaultService.getVaultById(req.params.id);
    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }

    // Only creator can update balance (for initial deposit)
    if (!VaultService.isCreator(vault, userAddress)) {
      return res.status(403).json({ error: 'Only the vault creator can update balance' });
    }

    // Verify transaction on blockchain
    try {
      const network = process.env.BCH_NETWORK as 'mainnet' | 'chipnet' || 'chipnet';
      const provider = new ElectrumNetworkProvider(network);

      // Get transaction details from blockchain
      const txData = await provider.getRawTransaction(txid);

      if (!txData) {
        return res.status(400).json({
          error: 'Transaction not found on blockchain. Please wait for confirmation and try again.'
        });
      }

      // Verify transaction sends to vault contract address
      if (!vault.contractAddress) {
        return res.status(400).json({
          error: 'Vault contract address not available'
        });
      }

      const minSatoshis = BigInt(Math.max(546, displayAmountToOnChain(amount, 'BCH')));
      const isInitialFunding = (vault.balance || 0) <= 0;
      const hasExpectedOutput = await transactionHasExpectedOutput(
        txid,
        {
          address: vault.contractAddress,
          minimumSatoshis: minSatoshis,
          ...(isInitialFunding
            ? {
                requireNft: true,
                requiredNftCapability: 'mutable' as const,
                minimumNftCommitmentBytes: 32,
              }
            : {}),
        },
        network === 'mainnet' ? 'mainnet' : 'chipnet',
      );

      if (!hasExpectedOutput) {
        return res.status(400).json({
          error: isInitialFunding
            ? 'Initial vault funding transaction must include a mutable state NFT output to the vault contract'
            : 'Transaction does not include expected vault funding output',
        });
      }

      console.log(`Verified transaction ${txid} exists on ${network} network`);
    } catch (verifyError: any) {
      console.error('Blockchain verification failed:', verifyError);
      return res.status(400).json({
        error: 'Failed to verify transaction on blockchain. The transaction may not be confirmed yet.',
        details: verifyError.message,
      });
    }

    const updatedVault = VaultService.updateBalance(req.params.id, amount, txid);
    res.json(updatedVault);
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;
