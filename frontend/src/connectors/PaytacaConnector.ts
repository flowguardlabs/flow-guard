/**
 * Paytaca Wallet Connector
 *
 * Implements IWalletConnector for Paytaca browser extension
 * Based on WC2 BCH BCR specification: https://github.com/mainnet-pat/wc2-bch-bcr
 */

import type {
  IWalletConnector,
  WalletType,
  WalletInfo,
  WalletBalance,
  Transaction,
  SignedTransaction,
  CashScriptSignOptions,
  CashScriptSignResponse,
} from '../types/wallet';

export class PaytacaConnector implements IWalletConnector {
  type: WalletType = 'paytaca' as WalletType;
  private walletApi: any = null;

  /**
   * Check if Paytaca extension is installed
   * Retries for up to 1 second to allow extension to inject
   */
  async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    // Retry up to 10 times with 100ms delay
    // This allows the extension time to inject into the page
    for (let i = 0; i < 10; i++) {
      if (window.paytaca && typeof window.paytaca.address === 'function') {
        console.log(`Paytaca detected after ${i * 100}ms`);
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('Paytaca not detected after 1 second');
    return false;
  }

  /**
   * Connect to Paytaca wallet
   */
  async connect(): Promise<WalletInfo> {
    console.log('PaytacaConnector.connect() called');
    console.log('window.paytaca:', window.paytaca);

    if (!(await this.isAvailable())) {
      const debugInfo = {
        hasWindow: typeof window !== 'undefined',
        hasPaytaca: !!window.paytaca,
        paytacaKeys: window.paytaca ? Object.keys(window.paytaca) : [],
      };
      console.error('Paytaca not available:', debugInfo);
      throw new Error(
        'Paytaca extension not found. Please install it from the Chrome Web Store.\n' +
        'Debug: ' + JSON.stringify(debugInfo)
      );
    }

    this.walletApi = window.paytaca!;
    console.log('Paytaca API methods:', Object.keys(this.walletApi));

    try {
      // Request connection permission
      console.log('Calling paytaca.connect()...');
      await this.walletApi.connect();
      console.log('Paytaca connected successfully');

      // Get address
      const address = await this.walletApi.address();
      if (!address) {
        throw new Error('Failed to get address from Paytaca');
      }

      // Determine network from address prefix
      let network: 'mainnet' | 'testnet' | 'chipnet' = 'mainnet';
      if (address.startsWith('bchtest:')) {
        network = 'chipnet'; // Chipnet uses bchtest prefix
      } else if (address.startsWith('bchreg:')) {
        network = 'testnet';
      }

      // Get balance
      const balance = await this.getBalance();

      return {
        address,
        network,
        balance,
      };
    } catch (error: any) {
      console.error('Paytaca connection error:', error);

      // Check for common errors and provide helpful messages
      if (error.message?.includes('Wallet not initialized')) {
        throw new Error(
          'Paytaca wallet not set up.\n\n' +
          'Steps:\n' +
          '1. Click Paytaca extension icon (top-right)\n' +
          '2. Create/import wallet\n' +
          '3. Switch to Chipnet network\n' +
          '4. Refresh page and connect again\n\n' +
          'See PAYTACA_SETUP.md for detailed guide'
        );
      }

      if (error.message?.includes('User rejected')) {
        throw new Error('Connection cancelled. Click Connect again to retry.');
      }

      throw new Error(`Failed to connect to Paytaca: ${error.message}`);
    }
  }

  /**
   * Check if currently connected
   */
  async isConnected(): Promise<boolean> {
    if (!this.walletApi) return false;
    try {
      return await this.walletApi.connected();
    } catch {
      return false;
    }
  }

  /**
   * Disconnect from Paytaca
   */
  async disconnect(): Promise<void> {
    if (this.walletApi) {
      try {
        await this.walletApi.disconnect();
      } catch (error) {
        console.error('Paytaca disconnect error:', error);
      }
      this.walletApi = null;
    }
  }

  /**
   * Get connected address
   */
  async getAddress(): Promise<string> {
    if (!this.walletApi) {
      throw new Error('Wallet not connected');
    }

    const address = await this.walletApi.address();
    if (!address) {
      throw new Error('Failed to get address');
    }

    return address;
  }

  /**
   * Get public key
   * Note: Paytaca uses placeholder substitution for CashScript,
   * so public key may not be directly exposed
   */
  async getPublicKey(): Promise<string> {
    // Paytaca doesn't expose raw public keys for privacy
    // Instead, it uses placeholder substitution when signing CashScript transactions
    // The backend should use placeholder values, and Paytaca will substitute during signing
    throw new Error(
      'Paytaca uses placeholder substitution for signatures. ' +
      'Pass placeholder pubkeys in transaction template, Paytaca will substitute during signing.'
    );
  }

  /**
   * Get wallet balance
   * Fetches from backend indexer API
   */
  async getBalance(): Promise<WalletBalance> {
    const address = await this.getAddress();

    try {
      // Call backend API to get balance
      const response = await fetch(`/api/wallet/balance/${encodeURIComponent(address)}`);

      if (!response.ok) {
        console.warn('Failed to fetch balance from backend, returning 0');
        return { bch: 0, sat: 0 };
      }

      const data = await response.json();
      return {
        sat: data.sat || data.satoshis || 0,
        bch: data.bch || (data.sat || 0) / 100000000,
      };
    } catch (error) {
      console.error('Balance fetch error:', error);
      // Return zero balance on error instead of failing
      return { bch: 0, sat: 0 };
    }
  }

  /**
   * Sign a simple transaction
   */
  async signTransaction(_tx: Transaction): Promise<SignedTransaction> {
    if (!this.walletApi) {
      throw new Error('Wallet not connected');
    }

    // For simple transactions, we need to build a proper tx hex
    // This should come from the backend, not constructed here
    throw new Error(
      'Simple transactions not supported. Use signCashScriptTransaction() with backend-provided tx template.'
    );
  }

  /**
   * Sign a CashScript contract transaction
   * This is the primary signing method for FlowGuard
   */
  async signCashScriptTransaction(
    options: CashScriptSignOptions
  ): Promise<CashScriptSignResponse> {
    if (!this.walletApi) {
      throw new Error('Wallet not connected');
    }

    try {
      const result = await this.walletApi.signTransaction({
        transaction: options.transaction,
        sourceOutputs: options.sourceOutputs,
        broadcast: options.broadcast ?? true,
        userPrompt: options.userPrompt,
      });

      if (!result) {
        throw new Error('Signing failed - no response from wallet');
      }

      return {
        signedTransaction: result.signedTransaction,
        signedTransactionHash: result.signedTransactionHash,
      };
    } catch (error: any) {
      console.error('Paytaca signing error:', error);
      throw new Error(`Transaction signing failed: ${error.message}`);
    }
  }

  /**
   * Sign a message
   */
  async signMessage(message: string, userPrompt?: string): Promise<string> {
    if (!this.walletApi) {
      throw new Error('Wallet not connected');
    }

    try {
      const signature = await this.walletApi.signMessage({
        message,
        userPrompt,
      });

      if (!signature) {
        throw new Error('Message signing failed - no signature returned');
      }

      return signature;
    } catch (error: any) {
      console.error('Paytaca message signing error:', error);
      throw new Error(`Message signing failed: ${error.message}`);
    }
  }

  /**
   * Register event listener
   */
  on(event: 'addressChanged' | 'disconnect', callback: (data?: any) => void): void {
    if (this.walletApi && typeof this.walletApi.on === 'function') {
      this.walletApi.on(event, callback);
    }
  }

  /**
   * Remove event listener
   */
  off(_event: string, _callback: (data?: any) => void): void {
    // Paytaca API doesn't specify removeListener method
    // Store listeners if needed for cleanup
    console.warn('Paytaca off() not implemented');
  }
}
