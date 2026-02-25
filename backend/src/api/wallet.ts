/**
 * Wallet API Routes
 * Provides wallet balance and address information
 */

import { Router } from 'express';

const router = Router();

/**
 * Get wallet balance by address
 * GET /api/wallet/balance/:address
 */
router.get('/balance/:address', async (req, res) => {
  try {
    const { address } = req.params;

    // Validate address format
    if (!address || (!address.startsWith('bitcoincash:') && !address.startsWith('bchtest:'))) {
      return res.status(400).json({
        error: 'Invalid address format. Must be cashaddr format (bitcoincash: or bchtest:)',
      });
    }

    const isTestnet = address.startsWith('bchtest:');
    const network = isTestnet ? 'chipnet' : 'mainnet';

    // Use ElectrumNetworkProvider to get UTXOs and sum balances
    const { ElectrumNetworkProvider } = await import('cashscript');
    const provider = new ElectrumNetworkProvider(network as any);
    const utxos = await provider.getUtxos(address);

    const balanceSat = utxos.reduce((sum, utxo) => sum + Number(utxo.satoshis), 0);
    const balanceBch = balanceSat / 100_000_000;

    res.json({
      address,
      sat: balanceSat,
      satoshis: balanceSat,
      bch: balanceBch,
      network,
    });
  } catch (error: any) {
    console.error('Balance query error:', error);
    res.status(500).json({
      error: 'Failed to query balance',
      message: error.message,
    });
  }
});

/**
 * Get UTXOs for an address
 * GET /api/wallet/utxos/:address
 */
router.get('/utxos/:address', async (req, res) => {
  try {
    const { address } = req.params;

    if (!address || (!address.startsWith('bitcoincash:') && !address.startsWith('bchtest:'))) {
      return res.status(400).json({
        error: 'Invalid address format',
      });
    }

    // Use ElectrumNetworkProvider to get UTXOs
    const { ElectrumNetworkProvider } = await import('cashscript');
    const network = address.startsWith('bitcoincash:') ? 'mainnet' : 'chipnet';
    const provider = new ElectrumNetworkProvider(network as any);
    const utxos = await provider.getUtxos(address);

    res.json({
      address,
      utxos,
      count: utxos.length,
    });
  } catch (error: any) {
    console.error('UTXO query error:', error);
    res.status(500).json({
      error: 'Failed to query UTXOs',
      message: error.message,
    });
  }
});

export default router;
