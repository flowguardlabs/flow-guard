/**
 * Unified Wallet Hook
 * Provides a React hook interface for Paytaca, WalletConnect v2, and mainnet.cash wallets
 */

import { useState, useEffect, useCallback } from 'react';
import {
  WalletType,
  WalletState,
  WalletActions,
  Transaction,
  SignedTransaction,
  IWalletConnector,
  CashScriptSignOptions,
  CashScriptSignResponse,
} from '../types/wallet';
import { PaytacaConnector } from '../services/wallets/paytaca-connector';
import { MainnetConnector } from '../services/wallets/mainnet-connector';

type UseWalletReturn = WalletState & WalletActions;

export function useWallet(): UseWalletReturn {
  const [state, setState] = useState<WalletState>({
    walletType: null,
    address: null,
    publicKey: null,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Listen for wallet events (address changes, disconnection)
   */
  useEffect(() => {
    if (!connector) return;

    // Set up event listeners if connector supports them
    if (connector.on) {
      const handleAddressChange = (newAddress: string) => {
        setState((prev) => ({
          ...prev,
          address: newAddress,
        }));
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
  }, [connector]);

  /**
   * Connect to a wallet
   * @param walletType - Type of wallet to connect to
   * @param seedPhrase - Optional seed phrase for mainnet.cash wallet import
   */
  const connect = useCallback(async (walletType: WalletType, seedPhrase?: string): Promise<void> => {
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      let newConnector: IWalletConnector;

      // Create appropriate connector
      switch (walletType) {
        case WalletType.PAYTACA:
          newConnector = new PaytacaConnector();
          break;
        case WalletType.WALLETCONNECT:
          // TODO: Implement WalletConnect v2 connector
          throw new Error('WalletConnect v2 support coming soon. Use Paytaca extension for now.');
        case WalletType.MAINNET:
          newConnector = new MainnetConnector();
          break;
        default:
          throw new Error('Unsupported wallet type');
      }

      // Check availability
      const isAvailable = await newConnector.isAvailable();
      if (!isAvailable) {
        const messages: Record<WalletType, string> = {
          [WalletType.PAYTACA]: 'Paytaca wallet not found. Please install the Paytaca browser extension from the Chrome Web Store.',
          [WalletType.WALLETCONNECT]: 'WalletConnect not available',
          [WalletType.MAINNET]: 'mainnet.cash library not available',
        };
        throw new Error(messages[walletType] || 'Wallet not available');
      }

      // Connect (pass seed phrase if provided for mainnet.cash)
      let walletInfo;
      if (walletType === WalletType.MAINNET && seedPhrase) {
        walletInfo = await (newConnector as MainnetConnector).connect(seedPhrase);
      } else {
        walletInfo = await newConnector.connect();
      }

      // Update state
      setState((prev) => ({
        ...prev,
        walletType,
        address: walletInfo.address,
        publicKey: walletInfo.publicKey || null,
        balance: walletInfo.balance || null,
        isConnected: true,
        isConnecting: false,
        network: walletInfo.network,
        error: null,
      }));

      setConnector(newConnector);

      // Save to localStorage
      localStorage.setItem('wallet_type', walletType);
      localStorage.setItem('wallet_address', walletInfo.address);
      if (walletInfo.publicKey) {
        localStorage.setItem('wallet_publickey', walletInfo.publicKey);
      }

      // Force a microtask to ensure state update is processed
      await new Promise<void>(resolve => queueMicrotask(() => resolve()));
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
      publicKey: null,
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
    localStorage.removeItem('wallet_publickey');
  }, [connector]);

  /**
   * Sign a simple send transaction
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
   * Sign a CashScript contract transaction
   * This is the proper method for covenant interactions with Paytaca
   */
  const signCashScriptTransaction = useCallback(
    async (options: CashScriptSignOptions): Promise<CashScriptSignResponse> => {
      if (!connector) {
        throw new Error('Wallet not connected');
      }

      if (!connector.signCashScriptTransaction) {
        throw new Error('Connected wallet does not support CashScript transactions');
      }

      return connector.signCashScriptTransaction(options);
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
   * Get public key from connected wallet
   * Note: Paytaca uses placeholder substitution instead of exposing raw pubkey
   */
  const getPublicKey = useCallback(async (): Promise<string | null> => {
    if (!connector) {
      return null;
    }

    try {
      return await connector.getPublicKey();
    } catch (error) {
      console.error('Failed to get public key:', error);
      return null;
    }
  }, [connector]);

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
    getPublicKey,
    signTransaction,
    signCashScriptTransaction,
    signMessage,
    refreshBalance,
  };
}
