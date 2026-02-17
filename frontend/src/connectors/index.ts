/**
 * Wallet Connectors for FlowGuard
 *
 * Complete rewrite based on BCH reference implementations:
 * - https://github.com/mainnet-pat/dapp-starter
 * - https://github.com/mainnet-pat/wc2-bch-bcr
 *
 * Supports four wallet types:
 * 1. Paytaca Native (browser extension - window.paytaca API)
 * 2. Cashonize (CashScript-aware mobile wallet via WalletConnect v2)
 * 3. WalletConnect v2 (Zapit and other mobile wallets)
 * 4. Mainnet.cash (testing/development)
 */

export { PaytacaNativeConnector } from './PaytacaNativeConnector';
export { CashonizeConnector } from './CashonizeConnector';
export { Web3ModalWalletConnectConnector } from './Web3ModalWalletConnectConnector';
export { MainnetConnector } from './MainnetConnector';

import type { IWalletConnector, WalletType } from '../types/wallet';
import { PaytacaNativeConnector } from './PaytacaNativeConnector';
import { CashonizeConnector } from './CashonizeConnector';
import { Web3ModalWalletConnectConnector } from './Web3ModalWalletConnectConnector';
import { MainnetConnector } from './MainnetConnector';

/**
 * Factory function to create wallet connector by type
 *
 * @param type - Wallet type: 'paytaca' | 'cashonize' | 'walletconnect' | 'mainnet'
 * @returns IWalletConnector implementation for the specified wallet type
 *
 * @example
 * ```typescript
 * const connector = createWalletConnector('cashonize');
 * await connector.connect();
 * const address = await connector.getAddress();
 * ```
 */
export function createWalletConnector(type: WalletType): IWalletConnector {
  switch (type) {
    case 'paytaca':
      return new PaytacaNativeConnector();

    case 'cashonize':
      return new CashonizeConnector();

    case 'walletconnect':
      return new Web3ModalWalletConnectConnector();

    case 'mainnet':
      return new MainnetConnector();

    default:
      throw new Error(`Unsupported wallet type: ${type}`);
  }
}

/**
 * Get user-friendly wallet display name
 */
export function getWalletDisplayName(type: WalletType): string {
  switch (type) {
    case 'paytaca':
      return 'Paytaca';
    case 'walletconnect':
      return 'WalletConnect';
    case 'mainnet':
      return 'Testing Wallet';
    default:
      return 'Unknown Wallet';
  }
}

/**
 * Get wallet description for UI
 */
export function getWalletDescription(type: WalletType): string {
  switch (type) {
    case 'paytaca':
      return 'Browser extension or mobile app';
    case 'walletconnect':
      return 'Mobile wallets (Cashonize, Zapit)';
    case 'mainnet':
      return 'Seed phrase wallet (dev/testing only)';
    default:
      return '';
  }
}

/**
 * Check if wallet type requires installation
 */
export function requiresInstallation(type: WalletType): boolean {
  return type === 'paytaca'; // Extension needs installation
}

/**
 * Get installation URL for wallet
 */
export function getInstallationUrl(type: WalletType): string | null {
  switch (type) {
    case 'paytaca':
      return 'https://chrome.google.com/webstore/detail/paytaca/pakphhpnneopheifihmjcjnbdbhaaiaa';
    default:
      return null;
  }
}
