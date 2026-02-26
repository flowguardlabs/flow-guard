/**
 * Wallet Selection Modal
 * Allows users to choose between Paytaca, WalletConnect v2, and mainnet.cash
 *
 * DESIGN RULES:
 * - Uses ONLY Sage palette colors (#F1F3E0, #D2DCB6, #A1BC98, #778873)
 * - All colors via Tailwind classes from globals.css tokens
 * - NO hardcoded hex values (#00E676, gray-*, red-*, etc.)
 * - NO bg-white (use bg-surface)
 */

import { useState } from 'react';
import { WalletType } from '../../types/wallet';
import { Wallet, X, ExternalLink, Smartphone, Download, Key, Loader2 } from 'lucide-react';
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
    type: WalletType.WALLETCONNECT,
    name: 'WalletConnect',
    description: 'Paytaca, Selene',
    Icon: Smartphone,
    recommended: true,
  },
  {
    type: WalletType.PAYTACA,
    name: 'Paytaca',
    description: 'Browser extension or mobile app',
    Icon: Wallet,
  },
  {
    type: WalletType.CASHONIZE,
    name: 'Cashonize',
    description: 'CashScript-aware mobile wallet (Covenant support)',
    Icon: Smartphone,
  },
  {
    type: WalletType.MAINNET,
    name: 'Testing Wallet',
    description: 'Seed phrase wallet (dev/testing only)',
    Icon: Key,
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
  const [hideForWC, setHideForWC] = useState(false);

  if (!isOpen) return null;

  // Hide our modal during WalletConnect to allow QR modal to show
  const isWalletConnect = selectedWallet === WalletType.WALLETCONNECT;
  const shouldHide = hideForWC && isWalletConnect && isConnecting;

  const handleConnect = async (walletType: WalletType) => {
    // For mainnet.cash, show seed phrase input option
    if (walletType === WalletType.MAINNET && !showSeedInput) {
      setSelectedWallet(walletType);
      setShowSeedInput(true);
      return;
    }

    setSelectedWallet(walletType);
    setLocalError(null);

    // Hide our modal if WalletConnect (to show QR modal)
    if (walletType === WalletType.WALLETCONNECT) {
      setHideForWC(true);
    }

    try {
      await onSelectWallet(walletType, seedPhrase || undefined);

      // Connection succeeded - close modal immediately
      console.log('[WalletModal] Connection succeeded, closing modal...');

      // Reset state first
      setShowSeedInput(false);
      setSeedPhrase('');
      setSelectedWallet(null);
      setHideForWC(false);

      // Close modal
      onClose();
    } catch (err: any) {
      // Connection failed - show our modal again with error
      console.log('[WalletModal] Connection failed:', err);
      setHideForWC(false);
      setSelectedWallet(null);
      setLocalError(err.message || 'Connection failed. Please try again.');
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
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-textPrimary/50 backdrop-blur-sm p-4 overflow-y-auto transition-opacity duration-200 ${shouldHide ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
    >
      <div className="bg-surface rounded-2xl shadow-lg max-w-md w-full my-auto border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primarySoft rounded-lg">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-textPrimary">
              Connect Wallet
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surfaceAlt rounded-lg transition-colors"
            disabled={isConnecting}
          >
            <X className="w-5 h-5 text-textSecondary" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {(error || localError) && (
            <div className="p-4 bg-primarySoft border border-primary rounded-lg">
              <p className="text-sm text-primary font-medium">{error || localError}</p>
            </div>
          )}

          {!showSeedInput ? (
            <>
              <p className="text-sm text-textSecondary">
                Choose a wallet to connect to FlowGuard
              </p>

              {/* Wallet Options */}
              <div className="space-y-3">
                {walletOptions.map((wallet) => {
                  const WalletIcon = wallet.Icon;
                  const isPending = isConnecting && selectedWallet === wallet.type;

                  return (
                    <button
                      key={wallet.type}
                      onClick={() => handleConnect(wallet.type)}
                      disabled={isConnecting}
                      className={`w-full p-4 border rounded-xl transition-all group bg-surface
                        ${isPending ? 'border-primary bg-accentDim' : 'border-border'}
                        ${!isConnecting && 'hover:border-primary hover:shadow-md'}
                        ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-primarySoft rounded-lg">
                            <WalletIcon className="w-6 h-6 text-primary" />
                          </div>
                          <div className="text-left">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-textPrimary group-hover:text-primary transition-colors">
                                {wallet.name}
                              </h3>
                              {wallet.recommended && (
                                <span className="px-2 py-0.5 text-xs bg-primarySoft text-primary rounded-full font-medium">
                                  Recommended
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-textSecondary">
                              {wallet.description}
                            </p>
                          </div>
                        </div>

                        {isPending ? (
                          <Loader2 className="w-5 h-5 text-primary animate-spin" />
                        ) : wallet.installUrl ? (
                          <a
                            href={wallet.installUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 hover:bg-surfaceAlt rounded-lg transition-colors"
                            title="Install extension"
                          >
                            <ExternalLink className="w-4 h-4 text-textMuted hover:text-primary transition-colors" />
                          </a>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Info */}
              <div className="mt-6 p-4 bg-surfaceAlt rounded-lg border border-border">
                <p className="text-xs text-textSecondary">
                  <strong className="text-textPrimary">Note:</strong> By connecting your wallet, you agree to FlowGuard's
                  terms. Your wallet remains in your custody at all times.
                </p>
              </div>
            </>
          ) : (
            /* Seed Phrase Import Screen */
            <div className="space-y-4">
              <button
                onClick={handleGoBack}
                className="text-sm text-textSecondary hover:text-primary transition-colors flex items-center gap-1"
              >
                ← Back to wallet options
              </button>

              <div>
                <h3 className="text-lg font-semibold text-textPrimary mb-2">
                  Import or Create Wallet
                </h3>
                <p className="text-sm text-textSecondary mb-4">
                  Choose an option below to get started
                </p>
              </div>

              {/* Create New Wallet Button */}
              <button
                onClick={() => handleConnect(WalletType.MAINNET)}
                disabled={isConnecting}
                className="w-full p-4 border border-border rounded-xl hover:border-primary hover:shadow-md transition-all bg-surface disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primarySoft rounded-lg">
                    <Download className="w-5 h-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <h4 className="font-semibold text-textPrimary">
                      Create New Wallet
                    </h4>
                    <p className="text-sm text-textSecondary">
                      Generate a new wallet with a seed phrase
                    </p>
                  </div>
                </div>
              </button>

              <div className="text-center text-sm text-textMuted">
                or
              </div>

              {/* Import Existing Wallet */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-primary" />
                  <label className="font-semibold text-textPrimary">
                    Import Existing Wallet
                  </label>
                </div>

                <textarea
                  value={seedPhrase}
                  onChange={(e) => setSeedPhrase(e.target.value)}
                  placeholder="Enter your 12-word seed phrase..."
                  className="w-full p-3 border border-border rounded-lg bg-surface text-textPrimary placeholder-textMuted focus:ring-2 focus:ring-focusRing focus:border-primary resize-none transition-colors"
                  rows={3}
                  disabled={isConnecting}
                />

                <button
                  onClick={handleImportSeed}
                  disabled={isConnecting || !seedPhrase.trim()}
                  className="w-full px-4 py-3 bg-primary hover:bg-primaryHover text-background font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConnecting ? 'Importing...' : 'Import Wallet'}
                </button>
              </div>

              {/* Security Notice */}
              <div className="mt-4 p-4 bg-accentDim border border-accent rounded-lg">
                <p className="text-xs text-primary">
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
