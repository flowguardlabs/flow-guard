/**
 * Electron Cash Wallet Connector
 * Connects to Electron Cash desktop wallet via RPC interface
 * Electron Cash must be running locally with RPC enabled
 */

import {
  IWalletConnector,
  WalletType,
  WalletInfo,
  WalletBalance,
  Transaction,
  SignedTransaction,
} from '../../types/wallet';

/**
 * Type definition for Electron Cash RPC methods
 * Documents the available RPC calls for type safety
 */
// @ts-expect-error - Interface kept for documentation purposes
interface ElectronCashRPC {
  getaddressesbyaccount(account: string): Promise<string[]>;
  getaddressinfo(address: string): Promise<{ pubkey: string }>;
  getbalance(): Promise<number>;
  getnewaddress(): Promise<string>;
  signrawtransaction(hex: string): Promise<{ hex: string; complete: boolean }>;
  sendrawtransaction(hex: string): Promise<string>;
  getnetworkinfo(): Promise<{ networkactive: boolean }>;
}

export class ElectronCashConnector implements IWalletConnector {
  type = WalletType.ELECTRON_CASH;
  private rpcUrl: string;
  private rpcUser: string;
  private rpcPassword: string;
  private address: string | null = null;

  constructor(rpcUrl?: string, rpcUser?: string, rpcPassword?: string) {
    // Read from environment variables first, then localStorage, then defaults
    this.rpcUrl = rpcUrl || 
      import.meta.env.VITE_ELECTRON_CASH_RPC_URL || 
      (typeof window !== 'undefined' ? localStorage.getItem('electron_cash_rpc_url') : null) || 
      'http://localhost:8332';
    this.rpcUser = rpcUser || 
      import.meta.env.VITE_ELECTRON_CASH_RPC_USER || 
      (typeof window !== 'undefined' ? localStorage.getItem('electron_cash_rpc_user') : null) || 
      'user';
    this.rpcPassword = rpcPassword || 
      import.meta.env.VITE_ELECTRON_CASH_RPC_PASSWORD || 
      (typeof window !== 'undefined' ? localStorage.getItem('electron_cash_rpc_password') : null) || 
      'pass';
  }

  /**
   * Check if Electron Cash RPC is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${btoa(`${this.rpcUser}:${this.rpcPassword}`)}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getnetworkinfo',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return !data.error;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Connect to Electron Cash wallet
   */
  async connect(): Promise<WalletInfo> {
    try {
      // Check if RPC is available
      const available = await this.isAvailable();
      if (!available) {
        throw new Error(
          'Electron Cash RPC not available. Please ensure Electron Cash is running with RPC enabled.\n\n' +
          'To enable RPC in Electron Cash:\n' +
          '1. Open Electron Cash\n' +
          '2. Go to Tools > Preferences > Network\n' +
          '3. Enable "Server" tab\n' +
          '4. Check "Run as server" and set RPC port (default: 8332)\n' +
          '5. Set RPC username and password'
        );
      }

      // Get a new address or use default account
      const address = await this.rpcCall<string>('getnewaddress');
      this.address = address;

      // Get public key
      const addressInfo = await this.rpcCall<{ pubkey: string }>('getaddressinfo', [address]);
      const publicKey = addressInfo.pubkey;

      // Get balance
      const balanceSat = await this.rpcCall<number>('getbalance');
      const balance: WalletBalance = {
        bch: balanceSat / 100000000,
        sat: balanceSat,
      };

      return {
        address,
        publicKey,
        balance,
        network: 'chipnet', // Electron Cash can work on any network
      };
    } catch (error) {
      console.error('Failed to connect to Electron Cash:', error);
      throw new Error(
        `Failed to connect to Electron Cash: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Disconnect from Electron Cash
   */
  async disconnect(): Promise<void> {
    this.address = null;
  }

  /**
   * Get wallet address
   */
  async getAddress(): Promise<string> {
    if (!this.address) {
      throw new Error('Wallet not connected');
    }
    return this.address;
  }

  /**
   * Get wallet public key
   */
  async getPublicKey(): Promise<string> {
    if (!this.address) {
      throw new Error('Wallet not connected');
    }

    try {
      const addressInfo = await this.rpcCall<{ pubkey: string }>('getaddressinfo', [this.address]);
      return addressInfo.pubkey;
    } catch (error) {
      console.error('Failed to get public key:', error);
      throw new Error('Failed to retrieve public key from Electron Cash');
    }
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<WalletBalance> {
    try {
      const balanceSat = await this.rpcCall<number>('getbalance');
      return {
        bch: balanceSat / 100000000,
        sat: balanceSat,
      };
    } catch (error) {
      console.error('Failed to get balance:', error);
      return { bch: 0, sat: 0 };
    }
  }

  /**
   * Sign transaction
   * Electron Cash has excellent support for signing raw transaction hex
   */
  async signTransaction(tx: Transaction): Promise<SignedTransaction> {
    if (!this.address) {
      throw new Error('Wallet not connected');
    }

    try {
      // If transaction has raw hex data, use it directly
      if (tx.data && typeof tx.data === 'string' && tx.data.length > 100) {
        const signedHex = await this.signRawTransaction(tx.data);
        // Broadcast to get txId
        const txId = await this.rpcCall<string>('sendrawtransaction', [signedHex]);
        return { txId, hex: signedHex };
      }

      // For simple sends, build transaction first
      // This is a simplified version - in production, you'd build the full transaction
      throw new Error('Simple send transactions not yet implemented for Electron Cash');
    } catch (error) {
      console.error('Failed to sign transaction:', error);
      throw new Error('Failed to sign transaction with Electron Cash');
    }
  }

  /**
   * Sign raw transaction hex
   * This is Electron Cash's strength - excellent raw transaction signing support
   */
  async signRawTransaction(txHex: string): Promise<string> {
    if (!this.address) {
      throw new Error('Wallet not connected');
    }

    try {
      const result = await this.rpcCall<{ hex: string; complete: boolean }>('signrawtransaction', [txHex]);
      
      if (!result.complete) {
        throw new Error('Transaction signing incomplete. Some inputs may not be signed.');
      }

      return result.hex;
    } catch (error) {
      console.error('Failed to sign raw transaction:', error);
      throw new Error(`Failed to sign raw transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sign a message
   */
  async signMessage(message: string): Promise<string> {
    if (!this.address) {
      throw new Error('Wallet not connected');
    }

    try {
      // Electron Cash RPC signmessage method
      const signature = await this.rpcCall<string>('signmessage', [this.address, message]);
      return signature;
    } catch (error) {
      console.error('Failed to sign message:', error);
      throw new Error('Failed to sign message with Electron Cash');
    }
  }

  /**
   * Make RPC call to Electron Cash
   */
  private async rpcCall<T>(method: string, params: any[] = []): Promise<T> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${btoa(`${this.rpcUser}:${this.rpcPassword}`)}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`RPC call failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`RPC error: ${data.error.message || 'Unknown error'}`);
    }

    return data.result as T;
  }
}

