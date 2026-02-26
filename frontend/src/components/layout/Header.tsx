import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Wallet, LogOut, Menu, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useWallet } from '../../hooks/useWallet';
import { useWalletModal } from '../../hooks/useWalletModal';

/**
 * Header component with FlowGuard branding and navigation
 *
 * DESIGN RULES:
 * - Uses ONLY Sage palette colors (#F1F3E0, #D2DCB6, #A1BC98, #778873)
 * - All colors via Tailwind classes from globals.css tokens
 * - NO bg-white, text-black, border-black, or CSS variables (text-ink, etc.)
 */
export const Header: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const wallet = useWallet();
  const { openModal } = useWalletModal();
  const location = useLocation();

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <header className="border-b border-border bg-surface/80 sticky top-0 z-50 backdrop-blur-md transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-20 justify-between">
          {/* Logo */}
          <Link to="/" className="flex-shrink-0">
            <img
              src="/assets/flow-green.png"
              alt="FlowGuard"
              className="h-8 object-contain"
            />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            <Link
              to="/app"
              className={`text-xs uppercase tracking-widest font-medium transition-colors ${isActive('/app') || isActive('/vaults') ? 'text-primary' : 'text-textSecondary hover:text-primary'
                }`}
            >
              Launch App
            </Link>
            <Link
              to="/proposals"
              className={`text-xs uppercase tracking-widest font-medium transition-colors ${isActive('/proposals') ? 'text-primary' : 'text-textSecondary hover:text-primary'
                }`}
            >
              Proposals
            </Link>
            <a
              href="https://docs.flowguard.cash"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs uppercase tracking-widest font-medium text-textSecondary hover:text-primary transition-colors"
            >
              Docs
            </a>
          </nav>

          {/* Right side - Wallet & Actions */}
          <div className="hidden md:flex items-center gap-4">
            {wallet.isConnected ? (
              <div className="flex items-center gap-4">
                {wallet.balance && (
                  <div className="text-xs font-mono text-textMuted">
                    {wallet.balance.bch.toFixed(4)} BCH
                  </div>
                )}

                <div className="flex items-center gap-2 px-3 py-2 bg-surfaceAlt rounded-sm border border-border">
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
                  <span className="text-xs font-mono text-textPrimary">
                    {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
                  </span>
                </div>

                <button
                  onClick={() => wallet.disconnect()}
                  className="p-2 hover:bg-surfaceAlt rounded-sm transition-colors text-textMuted hover:text-primary"
                  title="Disconnect Wallet"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={openModal}
                className="flex items-center gap-2"
              >
                <Wallet className="w-4 h-4" />
                Connect Wallet
              </Button>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-surfaceAlt transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6 text-textPrimary" />
            ) : (
              <Menu className="w-6 h-6 text-textPrimary" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden py-4 border-t border-border bg-surface absolute w-full left-0 shadow-lg">
          <nav className="flex flex-col space-y-4 px-6">
            <Link
              to="/app"
              className="text-xs uppercase tracking-widest font-medium text-textSecondary hover:text-primary transition-colors py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Launch App
            </Link>
            <Link
              to="/proposals"
              className="text-xs uppercase tracking-widest font-medium text-textSecondary hover:text-primary transition-colors py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Proposals
            </Link>
            <a
              href="https://docs.flowguard.cash"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs uppercase tracking-widest font-medium text-textSecondary hover:text-primary transition-colors py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Docs
            </a>

            <div className="pt-4 border-t border-border">
              {wallet.isConnected ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-textMuted">Connected as</span>
                    <button
                      onClick={() => {
                        wallet.disconnect();
                        setMobileMenuOpen(false);
                      }}
                      className="text-xs text-primary hover:underline uppercase tracking-wide font-medium"
                    >
                      Disconnect
                    </button>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 bg-surfaceAlt rounded-sm border border-border">
                    <span className="w-2 h-2 rounded-full bg-accent"></span>
                    <span className="text-xs font-mono text-textPrimary truncate">
                      {wallet.address}
                    </span>
                  </div>
                </div>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    openModal();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2"
                >
                  <Wallet className="w-4 h-4" />
                  Connect Wallet
                </Button>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};
