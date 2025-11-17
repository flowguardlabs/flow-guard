/**
 * Unified Wallet Hook
 * Provides a React hook interface for both Selene and mainnet.cash wallets
 */

import { useState, useEffect, useCallback } from 'react';
import {
  WalletType,
  WalletState,
  WalletActions,
  Transaction,
  SignedTransaction,
  IWalletConnector,
} from '../types/wallet';
import { SeleneConnector } from '../services/wallets/selene-connector';
import { MainnetConnector } from '../services/wallets/mainnet-connector';

type UseWalletReturn = WalletState & WalletActions;

export function useWallet(): UseWalletReturn {
  const [state, setState] = useState<WalletState>({
    walletType: null,
    address: null,
    balance: null,
    isConnected: false,
    isConnecting: false,
    network: 'chipnet',
    error: null,
  });

  const [connector, setConnector] = useState<IWalletConnector | null>(null);

  /**
   * Initialize wallet from localStorage on mount
   */
  useEffect(() => {
    const initWallet = async () => {
      const savedWalletType = localStorage.getItem('wallet_type') as WalletType | null;
      const savedAddress = localStorage.getItem('wallet_address');

      if (savedWalletType && savedAddress) {
        try {
          // Reconnect to saved wallet
          await connect(savedWalletType);
        } catch (error) {
          console.error('Failed to reconnect wallet:', error);
          // Clear invalid saved data
          localStorage.removeItem('wallet_type');
          localStorage.removeItem('wallet_address');
        }
      }
    };

    initWallet();
  }, []);

  /**
   * Listen for Selene wallet events (account/network changes)
   */
  useEffect(() => {
    const handleAccountChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      const newAddress = customEvent.detail.address;

      setState((prev) => ({
        ...prev,
        address: newAddress,
      }));

      localStorage.setItem('wallet_address', newAddress);
    };

    const handleNetworkChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      const newNetwork = customEvent.detail.network;

      setState((prev) => ({
        ...prev,
        network: newNetwork,
      }));

      // Refresh balance when network changes
      refreshBalance();
    };

    window.addEventListener('selene:accountChanged', handleAccountChange);
    window.addEventListener('selene:networkChanged', handleNetworkChange);

    return () => {
      window.removeEventListener('selene:accountChanged', handleAccountChange);
      window.removeEventListener('selene:networkChanged', handleNetworkChange);
    };
  }, []);

  /**
   * Connect to a wallet
   */
  const connect = useCallback(async (walletType: WalletType): Promise<void> => {
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      let newConnector: IWalletConnector;

      // Create appropriate connector
      switch (walletType) {
        case WalletType.SELENE:
          newConnector = new SeleneConnector();
          break;
        case WalletType.MAINNET:
          // Default to chipnet for development
          newConnector = new MainnetConnector('chipnet');
          break;
        default:
          throw new Error('Unsupported wallet type');
      }

      // Check availability
      const isAvailable = await newConnector.isAvailable();
      if (!isAvailable) {
        throw new Error(
          walletType === WalletType.SELENE
            ? 'Selene wallet extension not found. Please install Selene.'
            : 'mainnet.cash library not available'
        );
      }

      // Connect
      const walletInfo = await newConnector.connect();

      // Update state
      setState({
        walletType,
        address: walletInfo.address,
        balance: walletInfo.balance || null,
        isConnected: true,
        isConnecting: false,
        network: walletInfo.network,
        error: null,
      });

      setConnector(newConnector);

      // Save to localStorage
      localStorage.setItem('wallet_type', walletType);
      localStorage.setItem('wallet_address', walletInfo.address);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect wallet';

      setState((prev) => ({
        ...prev,
        isConnecting: false,
        error: errorMessage,
      }));

      throw error;
    }
  }, []);

  /**
   * Disconnect wallet
   */
  const disconnect = useCallback(async (): Promise<void> => {
    if (connector) {
      await connector.disconnect();
    }

    setState({
      walletType: null,
      address: null,
      balance: null,
      isConnected: false,
      isConnecting: false,
      network: 'chipnet',
      error: null,
    });

    setConnector(null);

    // Clear localStorage
    localStorage.removeItem('wallet_type');
    localStorage.removeItem('wallet_address');
  }, [connector]);

  /**
   * Sign transaction
   */
  const signTransaction = useCallback(
    async (tx: Transaction): Promise<SignedTransaction> => {
      if (!connector) {
        throw new Error('Wallet not connected');
      }

      return connector.signTransaction(tx);
    },
    [connector]
  );

  /**
   * Sign message
   */
  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      if (!connector) {
        throw new Error('Wallet not connected');
      }

      return connector.signMessage(message);
    },
    [connector]
  );

  /**
   * Refresh balance
   */
  const refreshBalance = useCallback(async (): Promise<void> => {
    if (!connector) {
      return;
    }

    try {
      const balance = await connector.getBalance();
      setState((prev) => ({ ...prev, balance }));
    } catch (error) {
      console.error('Failed to refresh balance:', error);
    }
  }, [connector]);

  return {
    ...state,
    connect,
    disconnect,
    signTransaction,
    signMessage,
    refreshBalance,
  };
}

