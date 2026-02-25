/**
 * Unified Wallet Hook
 * Provides a React hook interface for Paytaca, WalletConnect v2, and mainnet.cash wallets
 * Uses Zustand for global state management
 */

import { useEffect } from 'react';
import { create } from 'zustand';
import {
  WalletType,
  WalletState,
  Transaction,
  SignedTransaction,
  IWalletConnector,
  CashScriptSignOptions,
  CashScriptSignResponse,
} from '../types/wallet';
import { createWalletConnector, MainnetConnector } from '../connectors';

// Global state store using Zustand
interface WalletStore extends WalletState {
  connector: IWalletConnector | null;
  isConnectingRef: boolean;
  initAttempted: boolean;

  // Actions
  setConnector: (connector: IWalletConnector | null) => void;
  setState: (state: Partial<WalletState>) => void;
  setConnectingRef: (value: boolean) => void;
  setInitAttempted: (value: boolean) => void;
  connect: (walletType: WalletType, seedPhrase?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (tx: Transaction) => Promise<SignedTransaction>;
  signCashScriptTransaction: (options: CashScriptSignOptions) => Promise<CashScriptSignResponse>;
  signMessage: (message: string) => Promise<string>;
  getAddress: () => Promise<string | null>;
  getPublicKey: () => Promise<string | null>;
  refreshBalance: () => Promise<void>;
}

const useWalletStore = create<WalletStore>((set, get) => ({
  // Initial state
  walletType: null,
  address: null,
  publicKey: null,
  balance: null,
  isConnected: false,
  isConnecting: false,
  network: 'chipnet',
  error: null,
  connector: null,
  isConnectingRef: false,
  initAttempted: false,

  // Actions
  setConnector: (connector) => set({ connector }),
  setState: (newState) => set((state) => ({ ...state, ...newState })),
  setConnectingRef: (value) => set({ isConnectingRef: value }),
  setInitAttempted: (value) => set({ initAttempted: value }),

  connect: async (walletType: WalletType, seedPhrase?: string) => {
    const state = get();

    // Prevent concurrent connection attempts
    if (state.isConnectingRef) {
      console.log('Connection already in progress, skipping...');
      return;
    }

    set({ isConnectingRef: true, isConnecting: true, error: null });

    try {
      let newConnector: IWalletConnector;

      // Create appropriate connector using factory
      newConnector = createWalletConnector(walletType);

      // Check availability
      const isAvailable = await newConnector.isAvailable();
      if (!isAvailable) {
        const messages: Record<WalletType, string> = {
          [WalletType.PAYTACA]: 'Paytaca wallet not found. Please install the Paytaca browser extension from the Chrome Web Store.',
          [WalletType.CASHONIZE]: 'Cashonize wallet not available. Please install Cashonize mobile app from https://cashonize.com',
          [WalletType.WALLETCONNECT]: 'WalletConnect not available',
          [WalletType.MAINNET]: 'mainnet.cash library not available',
        };
        throw new Error(messages[walletType] || 'Wallet not available');
      }

      // Connect (pass seed phrase if provided for mainnet.cash)
      console.log(`Connecting to ${walletType} wallet...`, seedPhrase ? 'with seed phrase' : 'new wallet');

      let walletInfo;
      if (walletType === WalletType.MAINNET && seedPhrase) {
        walletInfo = await (newConnector as MainnetConnector).connect(seedPhrase);
      } else {
        walletInfo = await newConnector.connect();
      }

      console.log('Wallet connected successfully:', {
        type: walletType,
        address: walletInfo.address,
        network: walletInfo.network,
      });

      // Update state - THIS IS THE CRITICAL FIX
      set({
        walletType,
        address: walletInfo.address,
        publicKey: walletInfo.publicKey || null,
        balance: walletInfo.balance || null,
        isConnected: true,
        isConnecting: false,
        network: walletInfo.network,
        error: null,
        connector: newConnector,
      });

      // Save to localStorage
      localStorage.setItem('wallet_type', walletType);
      localStorage.setItem('wallet_address', walletInfo.address);
      if (walletInfo.publicKey) {
        localStorage.setItem('wallet_publickey', walletInfo.publicKey);
      }

      console.log('[useWallet] State updated to connected:', {
        isConnected: true,
        address: walletInfo.address,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect wallet';

      console.error('Wallet connection failed:', {
        type: walletType,
        error: error,
        message: errorMessage,
      });

      set({
        isConnecting: false,
        error: errorMessage,
      });

      throw error;
    } finally {
      // Always release the lock
      set({ isConnectingRef: false });
    }
  },

  disconnect: async () => {
    const state = get();

    if (state.connector) {
      await state.connector.disconnect();
    }

    set({
      walletType: null,
      address: null,
      publicKey: null,
      balance: null,
      isConnected: false,
      isConnecting: false,
      network: 'chipnet',
      error: null,
      connector: null,
    });

    // Clear localStorage
    localStorage.removeItem('wallet_type');
    localStorage.removeItem('wallet_address');
    localStorage.removeItem('wallet_publickey');
  },

  signTransaction: async (tx: Transaction) => {
    const state = get();

    if (!state.connector) {
      throw new Error('Wallet not connected');
    }

    return state.connector.signTransaction(tx);
  },

  signCashScriptTransaction: async (options: CashScriptSignOptions) => {
    const state = get();

    if (!state.connector) {
      throw new Error('Wallet not connected');
    }

    if (!state.connector.signCashScriptTransaction) {
      throw new Error('Connected wallet does not support CashScript transactions');
    }

    return state.connector.signCashScriptTransaction(options);
  },

  signMessage: async (message: string) => {
    const state = get();

    if (!state.connector) {
      throw new Error('Wallet not connected');
    }

    return state.connector.signMessage(message);
  },

  getAddress: async () => {
    const state = get();

    if (!state.connector) {
      return state.address;
    }

    try {
      const address = await state.connector.getAddress();
      if (address && address !== state.address) {
        set({ address });
        localStorage.setItem('wallet_address', address);
      }
      return address || state.address;
    } catch (error) {
      console.error('Failed to get wallet address:', error);
      return state.address;
    }
  },

  getPublicKey: async () => {
    const state = get();

    if (!state.connector) {
      return null;
    }

    try {
      return await state.connector.getPublicKey();
    } catch (error) {
      console.error('Failed to get public key:', error);
      return null;
    }
  },

  refreshBalance: async () => {
    const state = get();

    if (!state.connector) {
      return;
    }

    try {
      const balance = await state.connector.getBalance();
      set({ balance });
    } catch (error) {
      console.error('Failed to refresh balance:', error);
    }
  },
}));

// Hook to use wallet store
export function useWallet() {
  // Get all state and actions from Zustand store
  const {
    walletType,
    address,
    publicKey,
    balance,
    isConnected,
    isConnecting,
    network,
    error,
    connector,
    isConnectingRef,
    initAttempted,
    connect,
    disconnect,
    signTransaction,
    signCashScriptTransaction,
    signMessage,
    getAddress,
    getPublicKey,
    refreshBalance,
    setState,
    setInitAttempted,
  } = useWalletStore();

  /**
   * Initialize wallet from localStorage on mount (only once globally)
   */
  useEffect(() => {
    // CRITICAL: Use global flag from Zustand store, not local ref
    if (initAttempted) {
      console.log('[useWallet] Init already attempted, skipping...');
      return;
    }

    const initWallet = async () => {
      console.log('[useWallet] Attempting initialization...');
      setInitAttempted(true);

      // Prevent concurrent initialization attempts
      if (isConnectingRef) {
        console.log('[useWallet] Connection already in progress, skipping init...');
        return;
      }

      const savedWalletType = localStorage.getItem('wallet_type') as WalletType | null;
      const savedAddress = localStorage.getItem('wallet_address');

      if (savedWalletType && savedAddress) {
        console.log('[useWallet] Found saved wallet, reconnecting...', savedWalletType);
        try {
          // Reconnect to saved wallet
          await connect(savedWalletType);
        } catch (error) {
          console.error('[useWallet] Failed to reconnect wallet:', error);
          // Clear invalid saved data
          localStorage.removeItem('wallet_type');
          localStorage.removeItem('wallet_address');
          setInitAttempted(false); // Allow retry on next mount
        }
      } else {
        console.log('[useWallet] No saved wallet found');
      }
    };

    // Small delay to prevent race conditions
    const timeoutId = setTimeout(initWallet, 100);

    return () => clearTimeout(timeoutId);
  }, [initAttempted, isConnectingRef, connect, setInitAttempted]); // Depend on global flag

  /**
   * Listen for wallet events (address changes, disconnection)
   */
  useEffect(() => {
    if (!connector) return;

    // Set up event listeners if connector supports them
    if (connector.on) {
      const handleAddressChange = (newAddress: string) => {
        setState({ address: newAddress });
        localStorage.setItem('wallet_address', newAddress);
      };

      const handleDisconnect = () => {
        disconnect();
      };

      connector.on('addressChanged', handleAddressChange);
      connector.on('disconnect', handleDisconnect);

      return () => {
        if (connector.off) {
          connector.off('addressChanged', handleAddressChange);
          connector.off('disconnect', handleDisconnect);
        }
      };
    }
  }, [connector, setState, disconnect]);

  return {
    walletType,
    address,
    publicKey,
    balance,
    isConnected,
    isConnecting,
    network,
    error,
    connect,
    disconnect,
    getPublicKey,
    signTransaction,
    signCashScriptTransaction,
    signMessage,
    getAddress,
    refreshBalance,
  };
}
