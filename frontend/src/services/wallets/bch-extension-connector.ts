/**
 * BCH Browser Extension Wallet Connector
 * Supports Badger, Paytaca, and other BCH browser extension wallets
 * Uses the standard window.bitcoincash API
 */

import {
  IWalletConnector,
  WalletType,
  WalletInfo,
  WalletBalance,
  Transaction,
  SignedTransaction,
} from '../../types/wallet';

// Standard BCH wallet interface (injected by browser extensions)
// Based on window.bitcoincash standard
interface BCHWallet {
  getAddress(): Promise<string>;
  getAddresses?(): Promise<string[]>;
  getPublicKey?(): Promise<string>;
  getBalance?(address?: string): Promise<{ confirmed: number; unconfirmed: number }>;
  getRegtestUTXOs?(): Promise<any[]>;
  send(outputs: { address: string; amount: number }[]): Promise<{ txid: string; hex?: string }>;
  signTransaction?(tx: any): Promise<{ txid: string; hex: string }>;
  signMessage(message: string): Promise<string>;
  on?(event: string, callback: (...args: any[]) => void): void;
  removeListener?(event: string, callback: (...args: any[]) => void): void;
}

// Extend Window interface to include bitcoincash and paytaca
declare global {
  interface Window {
    bitcoincash?: BCHWallet;
    paytaca?: BCHWallet;
  }
}

export class BCHExtensionConnector implements IWalletConnector {
  type = WalletType.BCH_EXTENSION;
  private wallet: BCHWallet | null = null;
  private address: string | null = null;
  private listeners: Map<string, (...args: any[]) => void> = new Map();

  /**
   * Check if BCH wallet extension is installed
   * Waits up to 3 seconds for wallet to be injected
   */
  async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    // Check if wallet is already available
    if (window.bitcoincash || window.paytaca) return true;

    // Wait for wallet to be injected (Paytaca may inject asynchronously)
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 30; // 3 seconds total (30 * 100ms)

      const checkWallet = setInterval(() => {
        attempts++;

        if (window.bitcoincash || window.paytaca) {
          clearInterval(checkWallet);
          resolve(true);
        } else if (attempts >= maxAttempts) {
          clearInterval(checkWallet);
          resolve(false);
        }
      }, 100);
    });
  }

  /**
   * Get the name of the installed wallet (if available)
   */
  private async getWalletName(): Promise<string> {
    if (typeof window === 'undefined') return 'Unknown';

    // Try to detect which wallet is installed
    if (window.paytaca) {
      return 'Paytaca Wallet';
    }

    if (window.bitcoincash) {
      // Could be Badger or other wallet
      return 'BCH Wallet';
    }

    return 'Unknown';
  }

  /**
   * Connect to BCH wallet (existing wallet from browser extension)
   */
  async connect(): Promise<WalletInfo> {
    if (typeof window === 'undefined') {
      throw new Error('Window is not available');
    }

    // Check for wallet availability
    const walletAvailable = await this.isAvailable();
    if (!walletAvailable) {
      throw new Error(
        'BCH wallet extension not found. Please install Badger or Paytaca wallet from the Chrome Web Store.'
      );
    }

    try {
      // Use whichever wallet is available (prefer bitcoincash standard API)
      this.wallet = window.bitcoincash || window.paytaca || null;

      if (!this.wallet) {
        throw new Error('Wallet not available');
      }

      // Get address from the user's existing wallet
      const address = await this.wallet.getAddress();
      this.address = address;

      // Get public key (required for contract deployment)
      let publicKey: string | undefined;
      try {
        publicKey = await this.getPublicKey();
      } catch (error) {
        console.warn('Could not retrieve public key:', error);
        // Public key is optional for connection, but required for vault creation
      }

      // Get balance
      const balance = await this.getBalance();

      // Set up event listeners if supported
      this.setupEventListeners();

      const walletName = await this.getWalletName();
      console.log(`Connected to ${walletName}`);

      return {
        address,
        publicKey,
        balance,
        network: 'chipnet', // Default to chipnet for now
      };
    } catch (error) {
      console.error('Failed to connect BCH wallet:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to BCH wallet';
      throw new Error(errorMessage);
    }
  }

  /**
   * Set up event listeners for wallet changes (if wallet supports it)
   */
  private setupEventListeners(): void {
    if (!this.wallet || !this.wallet.on) return;

    try {
      // Listen for account changes
      const accountChangeHandler = (newAddress: string) => {
        this.address = newAddress;
        // Emit custom event for React components
        window.dispatchEvent(
          new CustomEvent('bch:accountChanged', { detail: { address: newAddress } })
        );
      };

      this.listeners.set('accountsChanged', accountChangeHandler);

      if (this.wallet.on) {
        this.wallet.on('accountsChanged', accountChangeHandler);
      }
    } catch (error) {
      console.warn('Could not set up event listeners:', error);
    }
  }

  /**
   * Clean up event listeners
   */
  private cleanupEventListeners(): void {
    if (!this.wallet || !this.wallet.removeListener) return;

    try {
      this.listeners.forEach((handler, event) => {
        this.wallet!.removeListener!(event, handler);
      });

      this.listeners.clear();
    } catch (error) {
      console.warn('Could not clean up event listeners:', error);
    }
  }

  /**
   * Disconnect wallet
   */
  async disconnect(): Promise<void> {
    this.cleanupEventListeners();
    this.wallet = null;
    this.address = null;
  }

  /**
   * Get wallet address
   */
  async getAddress(): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    if (this.address) {
      return this.address;
    }

    this.address = await this.wallet.getAddress();
    return this.address;
  }

  /**
   * Get wallet public key (hex format)
   * Required for contract deployment
   */
  async getPublicKey(): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    try {
      if (!this.wallet.getPublicKey) {
        throw new Error('Wallet does not support getPublicKey method. Please use a compatible BCH wallet.');
      }

      const publicKey = await this.wallet.getPublicKey();
      console.log('Retrieved public key:', publicKey ? `${publicKey.substring(0, 10)}...` : 'null');
      return publicKey;
    } catch (error) {
      console.error('Failed to get public key:', error);
      throw new Error('Failed to retrieve public key from wallet. This is required for vault creation.');
    }
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<WalletBalance> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    try {
      // Try to get balance if the method exists
      if (!this.wallet.getBalance) {
        console.warn('Wallet does not support getBalance method');
        return { bch: 0, sat: 0 };
      }

      const address = await this.getAddress();
      const balanceResponse = await this.wallet.getBalance(address);
      const satoshis = balanceResponse.confirmed + balanceResponse.unconfirmed;
      const bch = satoshis / 100000000; // Convert satoshis to BCH

      return {
        bch,
        sat: satoshis,
      };
    } catch (error) {
      console.error('Failed to get balance:', error);
      // Return zero balance instead of throwing
      return {
        bch: 0,
        sat: 0,
      };
    }
  }

  /**
   * Sign and broadcast transaction
   */
  async signTransaction(tx: Transaction): Promise<SignedTransaction> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    try {
      // Use the send method which is standard across BCH wallets
      const result = await this.wallet.send([
        {
          address: tx.to,
          amount: tx.amount, // amount in satoshis
        },
      ]);

      return {
        txId: result.txid,
        hex: result.hex || '',
      };
    } catch (error) {
      console.error('Failed to sign transaction:', error);
      throw new Error('Failed to sign transaction. User may have rejected.');
    }
  }

  /**
   * Sign a message
   */
  async signMessage(message: string): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    try {
      const signature = await this.wallet.signMessage(message);
      return signature;
    } catch (error) {
      console.error('Failed to sign message:', error);
      throw new Error('Failed to sign message. User may have rejected.');
    }
  }
}
