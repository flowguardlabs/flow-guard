/**
 * Wallet Selection Modal
 * Allows users to choose between Paytaca, WalletConnect v2, and mainnet.cash
 */

import { useState, useEffect } from 'react';
import { WalletType } from '../../types/wallet';
import { Wallet, X, ExternalLink, Smartphone, Coins, Download, Key, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface WalletOption {
  type: WalletType;
  name: string;
  description: string;
  Icon: LucideIcon;
  installUrl?: string;
  recommended?: boolean;
}

const walletOptions: WalletOption[] = [
  {
    type: WalletType.PAYTACA,
    name: 'Paytaca',
    description: 'Connect your Paytaca browser extension',
    Icon: Wallet,
    installUrl: 'https://chrome.google.com/webstore/detail/paytaca/pakphhpnneopheifihmjcjnbdbhaaiaa',
    recommended: true,
  },
  {
    type: WalletType.WALLETCONNECT,
    name: 'WalletConnect',
    description: 'Cashonize, Zapit, or mobile wallets',
    Icon: Smartphone,
  },
  {
    type: WalletType.MAINNET,
    name: 'mainnet.cash',
    description: 'Use seed phrase wallet (for testing)',
    Icon: Coins,
  },
];

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectWallet: (walletType: WalletType, seedPhrase?: string) => Promise<void>;
  isConnecting: boolean;
  error: string | null;
}

export function WalletModal({
  isOpen,
  onClose,
  onSelectWallet,
  isConnecting,
  error,
}: WalletModalProps) {
  const [selectedWallet, setSelectedWallet] = useState<WalletType | null>(null);
  const [showSeedInput, setShowSeedInput] = useState(false);
  const [seedPhrase, setSeedPhrase] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [paytacaAvailable, setPaytacaAvailable] = useState<boolean | null>(null);

  // Check if Paytaca is available on mount
  useEffect(() => {
    if (isOpen) {
      const checkPaytaca = async () => {
        // Quick check for window.paytaca
        const available = typeof window !== 'undefined' &&
          !!window.paytaca &&
          typeof window.paytaca.address === 'function';
        setPaytacaAvailable(available ?? false);
      };
      checkPaytaca();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnect = async (walletType: WalletType) => {
    // For mainnet.cash, show seed phrase input option
    if (walletType === WalletType.MAINNET && !showSeedInput) {
      setSelectedWallet(walletType);
      setShowSeedInput(true);
      return;
    }

    // For WalletConnect, show coming soon message
    if (walletType === WalletType.WALLETCONNECT) {
      setLocalError('WalletConnect v2 support coming soon. Use Paytaca extension for now.');
      return;
    }

    setSelectedWallet(walletType);
    setLocalError(null);

    try {
      await onSelectWallet(walletType, seedPhrase || undefined);
      // Wait for React to process the state update
      await new Promise(resolve => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 50);
        });
      });
      onClose();
      setShowSeedInput(false);
      setSeedPhrase('');
    } catch (err) {
      setSelectedWallet(null);
    }
  };

  const handleGoBack = () => {
    setShowSeedInput(false);
    setSeedPhrase('');
    setSelectedWallet(null);
    setLocalError(null);
  };

  const handleImportSeed = async () => {
    if (!seedPhrase.trim()) {
      setLocalError('Please enter a seed phrase');
      return;
    }

    const words = seedPhrase.trim().split(/\s+/);
    if (words.length !== 12) {
      setLocalError('Seed phrase must be 12 words');
      return;
    }

    await handleConnect(WalletType.MAINNET);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#2d2d2d] rounded-2xl shadow-2xl max-w-md w-full my-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#b2ac88]/10 rounded-lg">
              <Wallet className="w-5 h-5 text-[#b2ac88]" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Connect Wallet
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            disabled={isConnecting}
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {(error || localError) && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200">{error || localError}</p>
            </div>
          )}

          {!showSeedInput ? (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Choose a wallet to connect to FlowGuard
              </p>

              {/* Wallet Options */}
              <div className="space-y-3">
                {walletOptions.map((wallet) => {
                  const WalletIcon = wallet.Icon;
                  const isPending = isConnecting && selectedWallet === wallet.type;
                  const isPaytaca = wallet.type === WalletType.PAYTACA;
                  const showInstallHint = isPaytaca && paytacaAvailable === false;

                  return (
                    <button
                      key={wallet.type}
                      onClick={() => handleConnect(wallet.type)}
                      disabled={isConnecting}
                      className={`w-full p-4 border rounded-xl transition-all hover:border-[#b2ac88] hover:shadow-md group bg-white dark:bg-[#1a1a1a] ${isPending
                        ? 'border-[#b2ac88] bg-[#b2ac88]/5 dark:bg-[#b2ac88]/10'
                        : 'border-gray-200 dark:border-gray-700'
                        } ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-[#b2ac88]/10 dark:bg-[#b2ac88]/20 rounded-lg">
                            <WalletIcon className="w-6 h-6 text-[#b2ac88] dark:text-[#b2ac88]" />
                          </div>
                          <div className="text-left">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-[#b2ac88] transition-colors">
                                {wallet.name}
                              </h3>
                              {wallet.recommended && (
                                <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
                                  Recommended
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {wallet.description}
                            </p>
                            {showInstallHint && (
                              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                Extension not detected - install below
                              </p>
                            )}
                          </div>
                        </div>

                        {isPending ? (
                          <Loader2 className="w-5 h-5 text-[#b2ac88] animate-spin" />
                        ) : wallet.installUrl ? (
                          <a
                            href={wallet.installUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                            title="Install extension"
                          >
                            <ExternalLink className="w-4 h-4 text-gray-400 dark:text-gray-500 hover:text-[#b2ac88] dark:hover:text-[#b2ac88]" />
                          </a>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Info */}
              <div className="mt-6 p-4 bg-gray-50 dark:bg-[#1a1a1a] rounded-lg border border-gray-200 dark:border-gray-800">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  <strong className="text-gray-900 dark:text-white">Note:</strong> By connecting your wallet, you agree to FlowGuard's
                  terms. Your wallet remains in your custody at all times.
                </p>
              </div>
            </>
          ) : (
            /* Seed Phrase Import Screen */
            <div className="space-y-4">
              <button
                onClick={handleGoBack}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-[#b2ac88] dark:hover:text-[#b2ac88] transition-colors flex items-center gap-1"
              >
                ← Back to wallet options
              </button>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Import or Create Wallet
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Choose an option below to get started
                </p>
              </div>

              {/* Create New Wallet Button */}
              <button
                onClick={() => handleConnect(WalletType.MAINNET)}
                disabled={isConnecting}
                className="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-[#b2ac88] hover:shadow-md transition-all bg-white dark:bg-[#1a1a1a] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-[#b2ac88]/10 dark:bg-[#b2ac88]/20 rounded-lg">
                    <Download className="w-5 h-5 text-[#b2ac88]" />
                  </div>
                  <div className="text-left">
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      Create New Wallet
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Generate a new wallet with a seed phrase
                    </p>
                  </div>
                </div>
              </button>

              <div className="text-center text-sm text-gray-500 dark:text-gray-400">
                or
              </div>

              {/* Import Existing Wallet */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-[#b2ac88]" />
                  <label className="font-semibold text-gray-900 dark:text-white">
                    Import Existing Wallet
                  </label>
                </div>

                <textarea
                  value={seedPhrase}
                  onChange={(e) => setSeedPhrase(e.target.value)}
                  placeholder="Enter your 12-word seed phrase..."
                  className="w-full p-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-[#b2ac88] focus:border-transparent resize-none"
                  rows={3}
                  disabled={isConnecting}
                />

                <button
                  onClick={handleImportSeed}
                  disabled={isConnecting || !seedPhrase.trim()}
                  className="w-full px-4 py-3 bg-[#b2ac88] hover:bg-[#9d9771] text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConnecting ? 'Importing...' : 'Import Wallet'}
                </button>
              </div>

              {/* Security Notice */}
              <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  <strong>⚠️ Security Notice:</strong> Never share your seed phrase with anyone. FlowGuard will never ask for your seed phrase after initial import.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
