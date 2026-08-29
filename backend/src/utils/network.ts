export type BchNetwork = 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

export function resolveBchNetwork(): BchNetwork {
  const raw = (process.env.BCH_NETWORK || process.env.NETWORK || '').trim().toLowerCase();
  if (raw === 'mainnet') return 'mainnet';
  if (raw === 'testnet3') return 'testnet3';
  if (raw === 'testnet4') return 'testnet4';
  return 'chipnet';
}

/**
 * Public explorer and faucet links, per network.
 *
 * These used to be inlined as chipnet URLs in deployment responses, so a mainnet
 * deployment handed back a chipnet.imaginary.cash link for a mainnet address and
 * a testnet faucet. Alongside a hardcoded `network: 'chipnet'` that was enough to
 * convince an integrator chipnet was served here when it was not.
 */
const ADDRESS_EXPLORER: Record<BchNetwork, string> = {
  mainnet: 'https://explorer.bitcoin.com/bch/address',
  testnet3: 'https://chipnet.imaginary.cash/address',
  testnet4: 'https://chipnet.imaginary.cash/address',
  chipnet: 'https://chipnet.imaginary.cash/address',
};

export function explorerAddressUrl(address: string, network: BchNetwork = resolveBchNetwork()): string {
  return `${ADDRESS_EXPLORER[network]}/${address}`;
}

/** `null` on mainnet, where coins are bought rather than dispensed. */
export function faucetUrl(network: BchNetwork = resolveBchNetwork()): string | null {
  return network === 'mainnet' ? null : 'https://tbch.googol.cash/';
}
