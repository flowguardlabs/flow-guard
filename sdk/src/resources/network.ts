/** Public, unauthenticated reads: service status and the BCH price feed. */

import type { Http } from '../http.js';
import type { BchPrice, StatusPayload } from '../types.js';

export class Network {
  constructor(private readonly http: Http) {}

  /** Full public status payload, including per-component health. */
  status(): Promise<StatusPayload> {
    return this.http.get<StatusPayload>('/status');
  }

  /**
   * Which BCH network this API is running against.
   *
   * Worth checking at startup. Neither side switches network at runtime, and a
   * mismatch is silent and expensive: addresses and explorer links are derived for
   * one network while transactions are built and broadcast on the other.
   */
  async network(): Promise<'mainnet' | 'chipnet'> {
    const status = await this.status();
    return status.network.name;
  }

  /** Oracle-signed BCH/USD price. Cached server-side for ~60s. */
  price(): Promise<BchPrice> {
    return this.http.get<BchPrice>('/price/bch-usd');
  }
}
