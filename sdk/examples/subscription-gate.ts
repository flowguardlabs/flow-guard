/**
 * Gating an API on a live subscription — the server side.
 *
 * This is the BCH Explorer case: you run an API, you want paying users to reach it
 * and everyone else to get a 402, and you want the check to be cheap enough to run
 * on every request.
 *
 * The whole check is one public GET. There is no API key to provision, no webhook
 * to receive, no secret in this file, and no wallet. Payment state lives on chain
 * and FlowGuard just reads it back to you.
 *
 * Run: npx tsx examples/subscription-gate.ts
 */

import express, { type NextFunction, type Request, type Response } from 'express';
import { FlowGuardClient, ApiError } from '../src/index.js';

/** Where subscribers pay. Yours, P2PKH. */
const SERVICE_ADDRESS = process.env.SERVICE_ADDRESS ?? 'bitcoincash:qrg8xmhfqytlfmt7nwk44cymp2cv3y5kksyqmw20mn';

const PRICE_SATS_PER_MONTH = 100_000;

// Read-only: no wallet, so this client cannot spend anything even if it wanted to.
const flowguard = new FlowGuardClient({
  baseUrl: process.env.FLOWGUARD_API ?? 'https://api.flowguard.cash',
});

/**
 * Cache subscription lookups briefly.
 *
 * Without this, a burst of requests from one user is a burst of identical API calls.
 * Sixty seconds is short enough that a cancellation takes effect promptly and long
 * enough to flatten normal traffic. Do not cache negatives for long — someone who
 * just paid should not wait out a TTL to get in.
 */
const CACHE_TTL_MS = 60_000;
const NEGATIVE_CACHE_TTL_MS = 5_000;
const cache = new Map<string, { active: boolean; expiresAt: number }>();

async function hasActiveSubscription(subscriber: string): Promise<boolean> {
  const cached = cache.get(subscriber);
  if (cached && cached.expiresAt > Date.now()) return cached.active;

  const active = await flowguard.subscriptions.isActive(subscriber, SERVICE_ADDRESS);

  cache.set(subscriber, {
    active,
    expiresAt: Date.now() + (active ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
  });
  return active;
}

/**
 * The middleware.
 *
 * Note what happens when FlowGuard itself is unreachable: paying users are let
 * through rather than locked out. That is a deliberate call and the right one for
 * a read API — a FlowGuard outage should not become your outage. Invert it for
 * anything where wrongly granting access is worse than wrongly denying it.
 */
function requireSubscription() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const subscriber = String(req.header('x-bch-address') ?? '').trim();

    if (!subscriber) {
      res.status(401).json({
        error: 'ADDRESS_REQUIRED',
        message: 'Send your BCH address in the x-bch-address header.',
      });
      return;
    }

    try {
      if (await hasActiveSubscription(subscriber)) {
        next();
        return;
      }
    } catch (error) {
      if (error instanceof ApiError && error.retryable) {
        console.warn('[gate] FlowGuard unavailable, allowing through:', error.message);
        next();
        return;
      }
      throw error;
    }

    // 402 is the correct status here, and the body tells the client how to fix it.
    res.status(402).json({
      error: 'SUBSCRIPTION_REQUIRED',
      message: 'An active FlowGuard subscription is required for this endpoint.',
      subscribe: {
        serviceAddress: SERVICE_ADDRESS,
        amountPerPeriod: PRICE_SATS_PER_MONTH,
        interval: 'MONTHLY',
      },
    });
  };
}

const app = express();

app.get('/public/ping', (_req, res) => {
  res.json({ ok: true });
});

app.get('/v1/blocks', requireSubscription(), (_req, res) => {
  res.json({ data: 'the paid thing your subscribers came for' });
});

/**
 * Let a caller see their own state, including *why* they are locked out.
 *
 * Worth exposing. "pending_funding" and "lapsed" are very different problems for a
 * user to fix, and a bare 402 tells them neither.
 */
app.get('/v1/subscription', async (req, res) => {
  const subscriber = String(req.header('x-bch-address') ?? '').trim();
  if (!subscriber) {
    res.status(401).json({ error: 'ADDRESS_REQUIRED' });
    return;
  }
  const status = await flowguard.subscriptions.status(subscriber, SERVICE_ADDRESS);
  res.json({
    active: status.active,
    reason: status.reason,
    paidThrough: status.paidThrough,
    paymentId: status.payment?.id,
  });
});

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => {
    console.log(`subscription gate listening on :${port}`);
    console.log(`  paid endpoint : GET /v1/blocks        (needs x-bch-address)`);
    console.log(`  self-check    : GET /v1/subscription  (needs x-bch-address)`);
    console.log(`  service addr  : ${SERVICE_ADDRESS}`);
  });
}

export { app, requireSubscription, hasActiveSubscription };
