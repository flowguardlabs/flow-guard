/**
 * Wallet Connectors for FlowGuard
 *
 * Complete rewrite based on BCH reference implementations:
 * - https://github.com/mainnet-pat/dapp-starter
 * - https://github.com/mainnet-pat/wc2-bch-bcr
 *
 * Supports five wallet types:
 * 1. Paytaca Native (browser extension - window.paytaca API)
 * 2. Cashonize (CashScript-aware mobile wallet via WalletConnect v2)
 * 3. WalletConnect v2 (Zapit and other mobile wallets)
 * 4. WizardConnect (BCH-native, NIP-17 transport - beta, Paytaca mobile only)
 * 5. OPTN Wallet (covenant-native mobile wallet via WalletConnect v2 - beta)
 */

export { PaytacaNativeConnector } from './PaytacaNativeConnector';
export { CashonizeConnector } from './CashonizeConnector';
export { Web3ModalWalletConnectConnector } from './Web3ModalWalletConnectConnector';
export { WizardConnectConnector } from './WizardConnectConnector';
export { OptnConnector, OPTN_WALLET_URL } from './OptnConnector';

import type { IWalletConnector, WalletType } from '../types/wallet';
import { PaytacaNativeConnector } from './PaytacaNativeConnector';
import { CashonizeConnector } from './CashonizeConnector';
import { Web3ModalWalletConnectConnector } from './Web3ModalWalletConnectConnector';
import { WizardConnectConnector } from './WizardConnectConnector';
import { OptnConnector, OPTN_WALLET_URL } from './OptnConnector';

/**
 * Feature flag for WizardConnect. Defaults to disabled because the protocol
 * is pre-1.0 with active churn and only one production wallet today.
 *
 * Enable with: VITE_ENABLE_WIZARDCONNECT=true (in frontend/.env.local)
 */
export function isWizardConnectEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_WIZARDCONNECT === 'true';
}

/**
 * Feature flag for OPTN Wallet. Defaults to disabled: the pairing is wire-compatible
 * on paper (same WalletConnect v2 namespace, same covenant placeholder handling) but
 * unproven end to end, and OPTN signs with its first derived address only. Keep it
 * off in production until the Phase 1 compatibility run produces mainnet txids.
 *
 * Enable with: VITE_ENABLE_OPTN=true (in frontend/.env.local)
 *
 * @see docs/integrations/optn-phase1-testplan.md
 */
export function isOptnEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_OPTN === 'true';
}

/**
 * Factory function to create wallet connector by type
 *
 * @param type - Wallet type
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

    case 'wizardconnect':
      if (!isWizardConnectEnabled()) {
        throw new Error(
          'WizardConnect is in beta and disabled by default. ' +
            'Enable with VITE_ENABLE_WIZARDCONNECT=true in your env.',
        );
      }
      return new WizardConnectConnector();

    case 'optn':
      if (!isOptnEnabled()) {
        throw new Error(
          'OPTN Wallet support is in beta and disabled by default. ' +
            'Enable with VITE_ENABLE_OPTN=true in your env.',
        );
      }
      return new OptnConnector();

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
    case 'cashonize':
      return 'Cashonize';
    case 'walletconnect':
      return 'WalletConnect';
    case 'wizardconnect':
      return 'WizardConnect';
    case 'optn':
      return 'OPTN Wallet';
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
    case 'cashonize':
      return 'CashScript-aware mobile wallet';
    case 'walletconnect':
      return 'Mobile wallets (Cashonize, Zapit)';
    case 'wizardconnect':
      return 'BCH-native, end-to-end encrypted (Beta)';
    case 'optn':
      return 'Covenant-native mobile wallet (Beta)';
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
    case 'wizardconnect':
      return 'https://paytaca.com';
    case 'optn':
      return OPTN_WALLET_URL;
    default:
      return null;
  }
}
