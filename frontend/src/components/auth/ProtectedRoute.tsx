/**
 * Protected Route Component
 * Shows connection prompt if user is not connected to a wallet
 */

import { useWallet } from '../../hooks/useWallet';
import { useWalletModal } from '../../hooks/useWalletModal';
import { AlertCircle, Wallet } from 'lucide-react';
import { Button } from '../ui/Button';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const wallet = useWallet();
  const { openModal } = useWalletModal();

  // Show loading state while checking wallet connection
  if (wallet.isConnecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-50 dark:from-[#1a1a1a] dark:to-[#0a0a0a]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#b2ac88] border-t-transparent mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Connecting wallet...</p>
        </div>
      </div>
    );
  }

  // If wallet is not connected, show message instead of redirecting
  // This prevents redirect loops and gives better UX
  if (!wallet.isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-50 dark:from-[#1a1a1a] dark:to-[#0a0a0a] p-4">
        <div className="max-w-md w-full bg-white dark:bg-[#2d2d2d] rounded-2xl shadow-2xl p-8 border border-gray-200 dark:border-gray-700">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-[#b2ac88]/10 rounded-full">
              <AlertCircle className="w-12 h-12 text-[#b2ac88]" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-3">
            Wallet Connection Required
          </h2>

          <p className="text-gray-600 dark:text-gray-400 text-center mb-6">
            You need to connect your wallet to access this page. Please connect your Selene or mainnet.cash wallet to continue.
          </p>

          <div className="space-y-3">
            <Button
              variant="primary"
              size="lg"
              className="w-full flex items-center justify-center gap-2"
              onClick={openModal}
            >
              <Wallet className="w-5 h-5" />
              Connect Wallet
            </Button>

            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => window.location.href = '/'}
            >
              Go to Home
            </Button>
          </div>

          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              <strong>Note:</strong> FlowGuard is a non-custodial treasury management system. Your wallet remains in your control at all times.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Wallet is connected, render protected content
  return <>{children}</>;
}
