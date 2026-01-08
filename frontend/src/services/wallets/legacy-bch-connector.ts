/**
 * Legacy BCH Browser Extension Wallet Connector
 * 
 * This connector tries the legacy window.bitcoincash API
 * which some older wallets may still use.
 * 
 * For Paytaca, use PaytacaConnector instead.
 * For WalletConnect v2, use WalletConnectConnector.
 * 
 * @deprecated Use PaytacaConnector for Paytaca wallet
 */

import {
    IWalletConnector,
    WalletType,
    WalletInfo,
    WalletBalance,
    Transaction,
    SignedTransaction,
} from '../../types/wallet';

// Legacy BCH wallet interface that some wallets may still use
interface LegacyBCHWallet {
    getAddress(): Promise<string>;
    getAddresses?(): Promise<string[]>;
    getPublicKey?(): Promise<string>;
    getBalance?(address?: string): Promise<{ confirmed: number; unconfirmed: number }>;
    send(outputs: { address: string; amount: number }[]): Promise<{ txid: string; hex?: string }>;
    signTransaction?(tx: { hex: string }): Promise<{ txid: string; hex: string }>;
    signMessage(message: string): Promise<string>;
    on?(event: string, callback: (...args: any[]) => void): void;
    removeListener?(event: string, callback: (...args: any[]) => void): void;
}

declare global {
    interface Window {
        bitcoincash?: LegacyBCHWallet;
    }
}

/**
 * @deprecated Use PaytacaConnector for Paytaca wallet
 */
export class LegacyBCHExtensionConnector implements IWalletConnector {
    type = WalletType.PAYTACA; // Map to Paytaca type for compatibility
    private wallet: LegacyBCHWallet | null = null;
    private address_: string | null = null;

    async isAvailable(): Promise<boolean> {
        if (typeof window === 'undefined') return false;

        // Only check window.bitcoincash (legacy API)
        if (window.bitcoincash && typeof window.bitcoincash.getAddress === 'function') {
            console.log('[LegacyBCH] Found window.bitcoincash');
            return true;
        }

        return false;
    }

    async isConnected(): Promise<boolean> {
        return this.wallet !== null && this.address_ !== null;
    }

    async connect(): Promise<WalletInfo> {
        if (!window.bitcoincash) {
            throw new Error('Legacy BCH wallet not found');
        }

        this.wallet = window.bitcoincash;

        try {
            const address = await this.wallet.getAddress();
            this.address_ = address;

            let publicKey: string | undefined;
            if (this.wallet.getPublicKey) {
                try {
                    publicKey = await this.wallet.getPublicKey();
                } catch {
                    console.warn('[LegacyBCH] Could not get public key');
                }
            }

            return {
                address,
                publicKey,
                balance: await this.getBalance(),
                network: 'chipnet',
            };
        } catch (error) {
            console.error('[LegacyBCH] Connection failed:', error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        this.wallet = null;
        this.address_ = null;
    }

    async getAddress(): Promise<string> {
        if (this.address_) return this.address_;
        if (!this.wallet) throw new Error('Not connected');

        this.address_ = await this.wallet.getAddress();
        return this.address_;
    }

    async getPublicKey(): Promise<string> {
        if (!this.wallet || !this.wallet.getPublicKey) {
            throw new Error('Wallet does not support getPublicKey');
        }
        return this.wallet.getPublicKey();
    }

    async getBalance(): Promise<WalletBalance> {
        if (!this.wallet || !this.wallet.getBalance) {
            return { bch: 0, sat: 0 };
        }

        try {
            const address = await this.getAddress();
            const balance = await this.wallet.getBalance(address);
            const sat = balance.confirmed + balance.unconfirmed;
            return { bch: sat / 100000000, sat };
        } catch {
            return { bch: 0, sat: 0 };
        }
    }

    async signTransaction(tx: Transaction): Promise<SignedTransaction> {
        if (!this.wallet) throw new Error('Not connected');

        const result = await this.wallet.send([
            { address: tx.to, amount: tx.amount },
        ]);

        return {
            txId: result.txid,
            hex: result.hex || '',
        };
    }

    async signMessage(message: string): Promise<string> {
        if (!this.wallet) throw new Error('Not connected');
        return this.wallet.signMessage(message);
    }

    on(event: 'addressChanged' | 'disconnect', callback: (data?: any) => void): void {
        if (this.wallet?.on) {
            this.wallet.on(event, callback);
        }
    }

    off(event: string, callback: (data?: any) => void): void {
        if (this.wallet?.removeListener) {
            this.wallet.removeListener(event, callback);
        }
    }
}
