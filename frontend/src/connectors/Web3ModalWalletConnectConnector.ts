/**
 * WalletConnect v2 Connector with Web3Modal UI
 *
 * Based on reference implementations from:
 * - https://github.com/mainnet-pat/wc2-bch-bcr
 * - https://github.com/mainnet-pat/dapp-starter
 *
 * Supports BCH wallets via WalletConnect v2:
 * - Cashonize (web/mobile)
 * - Zapit (mobile)
 * - Paytaca (mobile via WC2)
 */

import SignClient from '@walletconnect/sign-client';
import type { SessionTypes } from '@walletconnect/types';
import { Web3Modal } from '@web3modal/standalone';
import { stringify } from '@bitauth/libauth';
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

// Get WalletConnect Project ID from environment
// Free at: https://cloud.walletconnect.com
const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
  '2cce9f0a8e5f0f8e88f6d5a5e4f3e2d1'; // Fallback demo ID

// Get network from environment
const BCH_NETWORK = (import.meta.env.VITE_BCH_NETWORK || 'chipnet') as 'mainnet' | 'chipnet';

export class Web3ModalWalletConnectConnector implements IWalletConnector {
  type: WalletType = 'walletconnect' as WalletType;

  private client: SignClient | null = null;
  private session: any | null = null;
  private web3Modal: Web3Modal | null = null;
  private currentAddress: string | null = null;
  private eventListeners: Map<string, Function[]> = new Map();

  private async _withRequestTimeout<T>(promise: Promise<T>, context: string): Promise<T> {
    const timeoutMs = Number(import.meta.env.VITE_WALLETCONNECT_REQUEST_TIMEOUT_MS || 90000);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`${context} timed out after ${timeoutMs / 1000}s`));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  /**
   * Check if WalletConnect is available
   * (WalletConnect works in all modern browsers)
   */
  async isAvailable(): Promise<boolean> {
    return typeof window !== 'undefined';
  }

  /**
   * Check if currently connected
   */
  async isConnected(): Promise<boolean> {
    return this.session !== null && this.currentAddress !== null;
  }

  /**
   * Connect via WalletConnect v2
   */
  async connect(): Promise<WalletInfo> {
    try {
      console.log('[Web3ModalWC] Initializing WalletConnect...');

      // Validate project ID
      if (!WALLETCONNECT_PROJECT_ID || WALLETCONNECT_PROJECT_ID === 'demo-project-id') {
        throw new Error(
          'WalletConnect requires a Project ID.\n\n' +
          'Get one free at: https://cloud.walletconnect.com\n' +
          'Then add to .env.local:\n' +
          'VITE_WALLETCONNECT_PROJECT_ID=your-project-id'
        );
      }

      // Initialize SignClient
      this.client = await SignClient.init({
        projectId: WALLETCONNECT_PROJECT_ID,
        metadata: {
          name: 'FlowGuard',
          description: 'On-Chain Treasury Management for Bitcoin Cash',
          url: window.location.origin,
          icons: [`${window.location.origin}/favicon.svg`],
        },
      });

      console.log('[Web3ModalWC] SignClient initialized');

      // Check for existing sessions
      const existingSessions = this.client.session.getAll();
      if (existingSessions.length > 0) {
        console.log('[Web3ModalWC] Found existing session, reusing...');
        this.session = existingSessions[existingSessions.length - 1];
        await this._subscribeToEvents();
        return await this._getSessionInfo();
      }

      // Create new session
      await this._createNewSession();

      return await this._getSessionInfo();
    } catch (error: any) {
      console.error('[Web3ModalWC] Connection failed:', error);

      // Handle specific errors
      if (error.message?.includes('Project ID')) {
        throw error; // Re-throw project ID errors as-is
      }

      if (error.message?.includes('timeout')) {
        throw new Error(
          'Connection timeout.\n\n' +
          'Possible issues:\n' +
          '1. Wallet app not responding\n' +
          '2. Network/firewall blocking WalletConnect\n' +
          '3. Try using Paytaca extension instead'
        );
      }

      if (error.message?.includes('WebSocket') || error.toString().includes('WebSocket')) {
        throw new Error(
          'Cannot connect to WalletConnect relay.\n\n' +
          'This might be due to:\n' +
          '- Network/firewall blocking websockets\n' +
          '- VPN/proxy interference\n\n' +
          'Try using Paytaca extension (desktop) or Testing Wallet instead.'
        );
      }

      throw new Error(`WalletConnect connection failed: ${error.message}`);
    }
  }

  /**
   * Create new WalletConnect session
   */
  private async _createNewSession(): Promise<void> {
    if (!this.client) throw new Error('SignClient not initialized');

    console.log('[Web3ModalWC] Creating new session...');

    // Determine chain based on network
    const primaryChain = BCH_NETWORK === 'chipnet' ? 'bch:bchtest' : 'bch:bitcoincash';

    console.log(`[Web3ModalWC] Requesting ${BCH_NETWORK} network (chain: ${primaryChain})`);

    // Create connection request
    const { uri, approval } = await this.client.connect({
      requiredNamespaces: {
        bch: {
          methods: ['bch_signTransaction', 'bch_signMessage', 'bch_getAddresses'],
          chains: [primaryChain],
          events: ['addressesChanged', 'disconnect'],
        },
      },
    });

    if (!uri) {
      throw new Error('Failed to generate WalletConnect URI');
    }

    // Initialize Web3Modal
    this.web3Modal = new Web3Modal({
      projectId: WALLETCONNECT_PROJECT_ID,
      walletConnectVersion: 2,
      enableExplorer: false,
      enableAccountView: true,
    });

    // Open modal with QR code
    console.log('[Web3ModalWC] Opening QR code modal...');
    this.web3Modal.openModal({ uri });

    // Wait for approval (with timeout)
    const approvalPromise = approval();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), 120000); // 2 minutes
    });

    try {
      this.session = (await Promise.race([approvalPromise, timeoutPromise])) as SessionTypes.Struct;
      console.log('[Web3ModalWC] Session approved');
    } finally {
      // Close modal
      if (this.web3Modal) {
        this.web3Modal.closeModal();
      }
    }

    // Subscribe to events
    await this._subscribeToEvents();
  }

  /**
   * Subscribe to WalletConnect events
   */
  private async _subscribeToEvents(): Promise<void> {
    if (!this.client) return;

    console.log('[Web3ModalWC] Subscribing to events...');

    this.client.on('session_ping', (args) => {
      console.log('[Web3ModalWC] Ping:', args);
    });

    this.client.on('session_event', (args) => {
      console.log('[Web3ModalWC] Event:', args);
      const { params } = args;
      if (params.chainId !== this._getPrimaryChain()) return;

      // Emit event to registered listeners
      const listeners = this.eventListeners.get(params.event.name);
      if (listeners) {
        listeners.forEach((cb) => cb(params.event.data));
      }
    });

    this.client.on('session_update', ({ topic, params }) => {
      console.log('[Web3ModalWC] Session update:', topic, params);
      if (this.session && this.session.topic === topic) {
        this.session = { ...this.session, namespaces: params.namespaces };
      }
    });

    this.client.on('session_delete', (args) => {
      console.log('[Web3ModalWC] Session deleted:', args);

      // Emit disconnect event
      const listeners = this.eventListeners.get('disconnect');
      if (listeners) {
        listeners.forEach((cb) => cb(args));
      }

      // Clean up
      this._reset();
    });
  }

  /**
   * Get wallet info from session
   */
  private async _getSessionInfo(): Promise<WalletInfo> {
    if (!this.session) {
      throw new Error('No active session');
    }

    // Get BCH accounts from session
    const bchNamespace = this.session.namespaces.bch;
    if (!bchNamespace || !bchNamespace.accounts || bchNamespace.accounts.length === 0) {
      throw new Error('No BCH accounts in session');
    }

    // Format: bch:bitcoincash:qr... or bch:bchtest:qr...
    const accountString = bchNamespace.accounts[0];
    const [, chain, address] = accountString.split(':');

    this.currentAddress = `${chain}:${address}`;

    // Determine network
    const network = chain === 'bchtest' ? 'chipnet' : 'mainnet';

    console.log('[Web3ModalWC] Connected:', { address: this.currentAddress, network });

    // Get balance
    const balance = await this.getBalance();

    return {
      address: this.currentAddress,
      network: network as 'mainnet' | 'chipnet',
      balance,
    };
  }

  /**
   * Get primary chain ID
   */
  private _getPrimaryChain(): string {
    return BCH_NETWORK === 'chipnet' ? 'bch:bchtest' : 'bch:bitcoincash';
  }

  /**
   * Reset connector state
   */
  private _reset(): void {
    this.session = null;
    this.currentAddress = null;
    this.eventListeners.clear();

    // Clear localStorage WC2 entries
    if (typeof window !== 'undefined') {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('wc@2')) {
          localStorage.removeItem(key);
        }
      });
    }
  }

  /**
   * Disconnect from WalletConnect
   */
  async disconnect(): Promise<void> {
    if (this.client && this.session) {
      try {
        await this.client.disconnect({
          topic: this.session.topic,
          reason: {
            code: 6000,
            message: 'User disconnected',
          },
        });
        console.log('[Web3ModalWC] Disconnected');
      } catch (error) {
        console.error('[Web3ModalWC] Disconnect error:', error);
      }
    }

    this._reset();
    this.client = null;
  }

  /**
   * Get connected address
   */
  async getAddress(): Promise<string> {
    if (!this.currentAddress) {
      throw new Error('Wallet not connected');
    }
    return this.currentAddress;
  }

  /**
   * Get public key
   * WalletConnect uses placeholder substitution like Paytaca
   */
  async getPublicKey(): Promise<string> {
    throw new Error(
      'WalletConnect uses automatic pubkey substitution during signing.\n\n' +
      'For contract interactions, use 33-byte zero placeholder:\n' +
      'new Uint8Array(33) // Wallet will replace with actual pubkey'
    );
  }

  /**
 * Get wallet balance via backend API
 */
  async getBalance(): Promise<WalletBalance> {
    if (!this.currentAddress) {
      return { bch: 0, sat: 0 };
    }

    try {
      const response = await fetch(`/api/wallet/balance/${encodeURIComponent(this.currentAddress)}`);
      if (!response.ok) {
        console.warn('[Web3ModalWC] Balance API returned error:', response.status);
        return { bch: 0, sat: 0 };
      }
      const data = await response.json();
      return {
        sat: data.sat || 0,
        bch: data.bch || 0,
      };
    } catch (error) {
      console.error('[Web3ModalWC] Failed to fetch balance:', error);
      return { bch: 0, sat: 0 };
    }
  }

  /**
   * Sign simple transaction
   */
  async signTransaction(_tx: Transaction): Promise<SignedTransaction> {
    throw new Error(
      'Use signCashScriptTransaction() for all WalletConnect transactions.\n\n' +
      'WalletConnect requires full transaction construction with sourceOutputs.'
    );
  }

  /**
   * Suppress chrome-extension:// redirects that the WC SDK triggers after requests.
   * The SDK tries to deep-link to the wallet app but on desktop this causes
   * unwanted navigation to chrome-extension://invalid/ or extension pages.
   */
  private async _requestWithoutRedirect<T>(fn: () => Promise<T>): Promise<T> {
    const originalOpen = window.open;
    window.open = (url?: string | URL, ...rest: any[]) => {
      const urlStr = url?.toString() || '';
      if (urlStr.startsWith('chrome-extension://') || urlStr === '') {
        console.log('[Web3ModalWC] Suppressed extension redirect:', urlStr);
        return null;
      }
      return originalOpen.call(window, url, ...rest);
    };
    try {
      return await fn();
    } finally {
      window.open = originalOpen;
    }
  }

  /**
   * Sign CashScript transaction via WalletConnect
   *
   * Uses libauth stringify for proper serialization of Uint8Array and BigInt
   */
  async signCashScriptTransaction(
    options: CashScriptSignOptions
  ): Promise<CashScriptSignResponse> {
    if (!this.client || !this.session) {
      throw new Error('Wallet not connected');
    }

    try {
      const connectedChain = this._getPrimaryChain();

      console.log('[Web3ModalWC] Signing transaction...', {
        chain: connectedChain,
        broadcast: options.broadcast ?? true,
      });

      // Use libauth stringify to handle Uint8Arrays and BigInts
      const serializedParams = JSON.parse(
        stringify({
          transaction: options.transaction,
          sourceOutputs: options.sourceOutputs,
          broadcast: options.broadcast ?? true,
          userPrompt: options.userPrompt,
        })
      );


      const result = await this._withRequestTimeout(
        this._requestWithoutRedirect(() =>
          this.client!.request({
            topic: this.session!.topic,
            chainId: connectedChain,
            request: {
              method: 'bch_signTransaction',
              params: serializedParams,
            },
          })
        ),
        'WalletConnect sign transaction request'
      );

      const typedResult = result as {
        signedTransaction: string;
        signedTransactionHash: string;
      };

      console.log('[Web3ModalWC] Transaction signed:', typedResult.signedTransactionHash);

      return {
        signedTransaction: typedResult.signedTransaction,
        signedTransactionHash: typedResult.signedTransactionHash,
      };
    } catch (error: any) {
      console.error('[Web3ModalWC] Signing failed:', error);

      if (error.message?.includes('rejected') || error.message?.includes('cancelled')) {
        throw new Error('Transaction rejected by user');
      }
      if (error.message?.includes('timed out')) {
        try {
          await this.disconnect();
        } catch {
          // Best-effort reset for stale WalletConnect sessions.
        }
        throw new Error(
          'WalletConnect signing timed out. Reconnect wallet and try again (old WC sessions can hang).'
        );
      }

      throw new Error(`Transaction signing failed: ${error.message}`);
    }
  }

  /**
   * Sign message via WalletConnect
   */
  async signMessage(message: string, userPrompt?: string): Promise<string> {
    if (!this.client || !this.session) {
      throw new Error('Wallet not connected');
    }

    try {
      const connectedChain = this._getPrimaryChain();

      console.log('[Web3ModalWC] Signing message...');

      const signature = await this._requestWithoutRedirect(() =>
        this.client!.request({
          topic: this.session!.topic,
          chainId: connectedChain,
          request: {
            method: 'bch_signMessage',
            params: { message, userPrompt },
          },
        })
      );

      console.log('[Web3ModalWC] Message signed');
      return signature as string;
    } catch (error: any) {
      console.error('[Web3ModalWC] Message signing failed:', error);

      if (error.message?.includes('rejected') || error.message?.includes('cancelled')) {
        throw new Error('Message signing rejected by user');
      }

      throw new Error(`Message signing failed: ${error.message}`);
    }
  }

  /**
   * Register event listener
   */
  on(event: 'addressChanged' | 'disconnect', callback: (data?: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);

    console.log(`[Web3ModalWC] Event listener registered: ${event}`);
  }

  /**
   * Remove event listener
   */
  off(event: string, callback: (data?: any) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }

    console.log(`[Web3ModalWC] Event listener removed: ${event}`);
  }
}
