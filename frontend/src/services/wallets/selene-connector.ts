/**
 * Selene Wallet Connector
 * Provides integration with Selene browser extension wallet
 * Note: Selene is a browser extension wallet for BCH
 */

import {
  IWalletConnector,
  WalletType,
  WalletInfo,
  WalletBalance,
  Transaction,
  SignedTransaction,
} from '../../types/wallet';

// Selene wallet interface (injected by browser extension)
// Based on standard BCH wallet extension interfaces
interface SeleneWallet {
  enable(): Promise<boolean>; // Request user permission to connect
  getAddress(): Promise<string>;
  getPublicKey?(): Promise<string>;
  getBalance?(): Promise<{ confirmed: number; unconfirmed: number }>;
  signTransaction(params: {
    to: string;
    amount: number;
    data?: string;
  }): Promise<{ txId: string; hex: string }>;
  signMessage(message: string): Promise<string>;
  getNetwork?(): Promise<'mainnet' | 'testnet' | 'chipnet'>;
  on?(event: string, callback: (...args: any[]) => void): void;
  removeListener?(event: string, callback: (...args: any[]) => void): void;
}

// Extend Window interface to include Selene
declare global {
  interface Window {
    selene?: SeleneWallet;
  }
}

export class SeleneConnector implements IWalletConnector {
  type = WalletType.SELENE;
  private wallet: SeleneWallet | null = null;
  private address: string | null = null;
  private listeners: Map<string, (...args: any[]) => void> = new Map();

  /**
   * Check if Selene extension is installed
   */
  async isAvailable(): Promise<boolean> {
    return typeof window !== 'undefined' && !!window.selene;
  }

  /**
   * Connect to Selene wallet (existing wallet from browser extension)
   */
  async connect(): Promise<WalletInfo> {
    if (typeof window === 'undefined' || !window.selene) {
      throw new Error('Selene wallet extension not found. Please install Selene from https://selene.cash');
    }

    try {
      this.wallet = window.selene;

      // Request permission to connect (this will prompt user to approve connection)
      // This connects to their EXISTING wallet, not creating a new one
      const enabled = await this.wallet.enable();

      if (!enabled) {
        throw new Error('User rejected wallet connection');
      }

      // Get address from the user's existing wallet
      const address = await this.wallet.getAddress();
      this.address = address;

      // Get additional wallet info (with fallbacks for optional methods)
      const balance = await this.getBalance();

      let publicKey: string | undefined;
      try {
        publicKey = this.wallet.getPublicKey ? await this.wallet.getPublicKey() : undefined;
      } catch (err) {
        console.warn('Could not get public key:', err);
      }

      let network: 'mainnet' | 'testnet' | 'chipnet' = 'chipnet';
      try {
        network = this.wallet.getNetwork ? await this.wallet.getNetwork() : 'chipnet';
      } catch (err) {
        console.warn('Could not get network, defaulting to chipnet:', err);
      }

      // Set up event listeners if supported
      this.setupEventListeners();

      return {
        address,
        publicKey,
        balance,
        network,
      };
    } catch (error) {
      console.error('Failed to connect Selene wallet:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to Selene wallet';
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
          new CustomEvent('selene:accountChanged', { detail: { address: newAddress } })
        );
      };

      // Listen for network changes
      const networkChangeHandler = (network: string) => {
        window.dispatchEvent(
          new CustomEvent('selene:networkChanged', { detail: { network } })
        );
      };

      this.listeners.set('accountsChanged', accountChangeHandler);
      this.listeners.set('networkChanged', networkChangeHandler);

      this.wallet.on('accountsChanged', accountChangeHandler);
      this.wallet.on('networkChanged', networkChangeHandler);
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
   * Get wallet balance
   */
  async getBalance(): Promise<WalletBalance> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    try {
      // Try to get balance if the method exists
      if (!this.wallet.getBalance) {
        console.warn('Wallet does not support getBalance');
        return { bch: 0, sat: 0 };
      }

      const balanceResponse = await this.wallet.getBalance();
      const satoshis = balanceResponse.confirmed + balanceResponse.unconfirmed;
      const bch = satoshis / 100000000; // Convert satoshis to BCH

      return {
        bch,
        sat: satoshis,
      };
    } catch (error) {
      console.error('Failed to get balance:', error);
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
      const result = await this.wallet.signTransaction({
        to: tx.to,
        amount: tx.amount,
        data: tx.data,
      });

      return {
        txId: result.txId,
        hex: result.hex,
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

  /**
   * Get current network
   */
  async getNetwork(): Promise<'mainnet' | 'testnet' | 'chipnet'> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    try {
      if (!this.wallet.getNetwork) {
        return 'chipnet'; // Default to chipnet
      }
      return await this.wallet.getNetwork();
    } catch (error) {
      console.error('Failed to get network:', error);
      return 'chipnet'; // Default to chipnet
    }
  }

  /**
   * Get public key
   */
  async getPublicKey(): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    try {
      if (!this.wallet.getPublicKey) {
        throw new Error('Wallet does not support getPublicKey');
      }
      return await this.wallet.getPublicKey();
    } catch (error) {
      console.error('Failed to get public key:', error);
      throw new Error('Failed to get public key');
    }
  }
}
