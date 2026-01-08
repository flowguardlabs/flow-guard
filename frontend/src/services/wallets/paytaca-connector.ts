/**
 * Paytaca Browser Extension Wallet Connector
 * 
 * Uses the official Paytaca API based on:
 * https://github.com/mainnet-pat/wc2-bch-bcr
 * 
 * This connector properly integrates with Paytaca's window.paytaca API
 * and supports CashScript transaction signing for covenant interactions.
 */

import {
    IWalletConnector,
    WalletType,
    WalletInfo,
    WalletBalance,
    Transaction,
    SignedTransaction,
    CashScriptSignOptions,
    CashScriptSignResponse,
} from '../../types/wallet';

export class PaytacaConnector implements IWalletConnector {
    type = WalletType.PAYTACA;
    private address_: string | null = null;
    private eventHandlers: Map<string, (data?: any) => void> = new Map();

    /**
     * Check if Paytaca extension is installed and available
     */
    async isAvailable(): Promise<boolean> {
        if (typeof window === 'undefined') return false;

        // Check for window.paytaca directly
        if (window.paytaca && typeof window.paytaca.address === 'function') {
            console.log('[Paytaca] Extension detected via window.paytaca');
            return true;
        }

        // Wait up to 3 seconds for injection (extension may load async)
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 30; // 3 seconds

            const check = setInterval(() => {
                attempts++;
                if (window.paytaca && typeof window.paytaca.address === 'function') {
                    clearInterval(check);
                    console.log(`[Paytaca] Extension detected after ${attempts * 100}ms`);
                    resolve(true);
                } else if (attempts >= maxAttempts) {
                    clearInterval(check);
                    console.warn('[Paytaca] Extension not detected after 3s');
                    resolve(false);
                }
            }, 100);
        });
    }

    /**
     * Check if currently connected
     */
    async isConnected(): Promise<boolean> {
        if (!window.paytaca) return false;
        try {
            return await window.paytaca.connected();
        } catch {
            return false;
        }
    }

    /**
     * Connect to Paytaca wallet
     */
    async connect(): Promise<WalletInfo> {
        const available = await this.isAvailable();
        if (!available) {
            throw new Error(
                'Paytaca wallet not found. Please install the Paytaca browser extension:\n' +
                'https://chrome.google.com/webstore/detail/paytaca/pakphhpnneopheifihmjcjnbdbhaaiaa'
            );
        }

        try {
            // Check if already connected
            const isConnected = await window.paytaca!.connected();

            if (!isConnected) {
                // Request connection - this prompts user approval
                await new Promise<void>((resolve, reject) => {
                    // Set up listener for connection completion
                    const onAddressChanged = () => {
                        window.paytaca!.on('addressChanged', () => { });  // Clear listener
                        resolve();
                    };

                    window.paytaca!.on('addressChanged', onAddressChanged);

                    // Initiate connection
                    window.paytaca!.connect().catch(reject);

                    // Timeout after 60 seconds
                    setTimeout(() => reject(new Error('Connection timeout')), 60000);
                });
            }

            // Get address
            const address = await window.paytaca!.address();
            if (!address) {
                throw new Error('Failed to get address from Paytaca');
            }
            this.address_ = address;

            console.log('[Paytaca] Connected:', address);

            return {
                address,
                publicKey: undefined, // Paytaca doesn't expose raw pubkey via standard API
                balance: await this.getBalance(),
                network: 'chipnet', // TODO: Detect network from address prefix
            };
        } catch (error) {
            console.error('[Paytaca] Connection failed:', error);
            throw error;
        }
    }

    /**
     * Disconnect from Paytaca
     */
    async disconnect(): Promise<void> {
        if (!window.paytaca) return;

        try {
            await window.paytaca.disconnect();
        } catch (error) {
            console.warn('[Paytaca] Disconnect error:', error);
        }

        this.address_ = null;
        this.eventHandlers.clear();
    }

    /**
     * Get connected address
     */
    async getAddress(): Promise<string> {
        if (this.address_) return this.address_;

        if (!window.paytaca) {
            throw new Error('Paytaca not connected');
        }

        const address = await window.paytaca.address();
        if (!address) {
            throw new Error('No address available - wallet may not be connected');
        }

        this.address_ = address;
        return address;
    }

    /**
     * Get public key
     * Note: Paytaca's standard API doesn't expose raw public keys.
     * For CashScript contracts, the signature placeholder approach is used instead.
     */
    async getPublicKey(): Promise<string> {
        // Paytaca handles pubkey substitution internally during signing
        // For contracts, we use 33-byte zero placeholder that Paytaca replaces
        throw new Error(
            'Paytaca wallet uses automatic pubkey substitution during signing. ' +
            'Use signCashScriptTransaction() with zero-filled pubkey placeholders.'
        );
    }

    /**
     * Get wallet balance
     * Note: Balance fetching is typically done via Electrum/indexer, not wallet API
     */
    async getBalance(): Promise<WalletBalance> {
        // Paytaca doesn't expose balance via its dApp API
        // Balance should be fetched from blockchain indexer
        console.warn('[Paytaca] Balance fetching not supported via dApp API. Use indexer.');
        return { bch: 0, sat: 0 };
    }

    /**
     * Sign a simple send transaction
     * For basic BCH transfers, we construct a minimal transaction
     */
    async signTransaction(_tx: Transaction): Promise<SignedTransaction> {
        if (!window.paytaca) {
            throw new Error('Paytaca not connected');
        }

        // For simple sends, we need to construct a proper transaction
        // This is a simplified version - full implementation would use libauth
        console.warn('[Paytaca] Simple send via signTransaction - consider using signCashScriptTransaction');

        // TODO: Construct proper transaction using libauth
        // For now, throw error directing to proper method
        throw new Error(
            'Use signCashScriptTransaction() for Paytaca transactions. ' +
            'Direct sends require constructing transaction with libauth.'
        );
    }

    /**
     * Sign a CashScript contract transaction
     * This is the proper API for covenant interactions
     */
    async signCashScriptTransaction(options: CashScriptSignOptions): Promise<CashScriptSignResponse> {
        if (!window.paytaca) {
            throw new Error('Paytaca not connected');
        }

        try {
            const result = await window.paytaca.signTransaction({
                transaction: options.transaction,
                sourceOutputs: options.sourceOutputs,
                broadcast: options.broadcast ?? true,
                userPrompt: options.userPrompt,
            });

            if (!result) {
                throw new Error('Transaction rejected or signing failed');
            }

            return {
                signedTransaction: result.signedTransaction,
                signedTransactionHash: result.signedTransactionHash,
            };
        } catch (error) {
            console.error('[Paytaca] Transaction signing failed:', error);
            throw error;
        }
    }

    /**
     * Sign a message
     */
    async signMessage(message: string, userPrompt?: string): Promise<string> {
        if (!window.paytaca) {
            throw new Error('Paytaca not connected');
        }

        try {
            const signature = await window.paytaca.signMessage({
                message,
                userPrompt,
            });

            if (!signature) {
                throw new Error('Message signing rejected');
            }

            return signature;
        } catch (error) {
            console.error('[Paytaca] Message signing failed:', error);
            throw error;
        }
    }

    /**
     * Register event listener
     */
    on(event: 'addressChanged' | 'disconnect', callback: (data?: any) => void): void {
        if (!window.paytaca) return;

        this.eventHandlers.set(event, callback);
        window.paytaca.on(event, callback);
    }

    /**
     * Remove event listener
     * Note: Paytaca API may not support removing individual listeners
     */
    off(event: string, _callback: (data?: any) => void): void {
        this.eventHandlers.delete(event);
    }
}
