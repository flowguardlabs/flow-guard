/**
 * Authentication endpoints.
 *
 * Clients call POST /api/auth/nonce with their BCH address (and optionally
 * the CAIP-122 context: domain, uri, chain-id) to obtain a short-lived,
 * single-use login nonce + the multi-line CAIP-122 message to sign. They
 * then sign that message with the wallet key that controls the declared
 * BCH address (via wc2-bch-bcr `bch_signMessage`) and attach the resulting
 * signature on subsequent authenticated requests via the SIWX headers
 * documented in `backend/src/middleware/auth.ts`.
 */

import { Router, Request, Response } from 'express';
import {
  issueAuthNonce,
  issueBearer,
  verifyWalletOwnership,
  verifyWalletOwnershipViaTx,
  type NonceContext,
} from '../middleware/auth.js';
import { buildAuthProofWcTransaction } from '../middleware/txAuthProof.js';
import { serializeWcTransaction } from '../utils/wcSerializer.js';

const router = Router();

function trimOrUndefined(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/**
 * Wallet types known to lack usable message signing, kept so older clients that
 * send only `walletType` (no `txProof` flag) still receive a proof transaction.
 *
 * - `wizardconnect` (hdwalletv1): no sign_message action at all.
 * - `optn`: has one, but its Bitcoin-signed-message length prefix is raw hex rather
 *   than a CompactSize varint, so it cannot sign our ~380-byte CAIP-122 message.
 */
const TX_PROOF_WALLET_TYPES = new Set(['wizardconnect', 'optn']);

/**
 * Whether to build the non-broadcastable proof transaction for this nonce.
 *
 * Issuing it is not a privilege: the proof tx is bound to this single-use nonce and
 * is worthless without the address's private key, so an unnecessary one is wasted
 * work rather than a security concern. Gate exists purely to avoid building it for
 * the message-signing majority.
 */
export function wantsTxProof(body: unknown): boolean {
  const payload = (body ?? {}) as { txProof?: unknown; walletType?: unknown };
  if (payload.txProof === true) return true;
  return TX_PROOF_WALLET_TYPES.has(String(payload.walletType ?? '').trim().toLowerCase());
}

router.post('/auth/nonce', async (req: Request, res: Response) => {
  const address = String(req.body?.address || '').trim();
  if (!address) {
    return res.status(400).json({ error: 'address is required' });
  }
  const context: NonceContext = {
    domain: trimOrUndefined(req.body?.domain),
    uri: trimOrUndefined(req.body?.uri),
    chainId: trimOrUndefined(req.body?.chainId),
  };
  try {
    const nonce = await issueAuthNonce(address, context);
    // authProof: a non-broadcastable proof tx for wallets that cannot sign our
    // CAIP-122 message (WizardConnect, OPTN). Message-signing wallets use `message`.
    let authProof: ReturnType<typeof serializeWcTransaction> | undefined;
    if (wantsTxProof(req.body)) {
      try {
        authProof = serializeWcTransaction(buildAuthProofWcTransaction(address, nonce.id));
      } catch {
        authProof = undefined; // non-P2PKH or build failure: message path still works
      }
    }
    return res.json({
      success: true,
      nonceId: nonce.id,
      message: nonce.message,
      expiresAt: nonce.expiresAt,
      authProof,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid address';
    return res.status(400).json({ error: 'invalid_address', message });
  }
});

/**
 * POST /api/auth/verify
 *
 * Exchange a one-shot SIWX proof (nonce id + signature, optionally an explicit
 * signer pubkey for the legacy hex path) for a 30-minute bearer token. The
 * frontend caches the bearer in sessionStorage and attaches it as
 * `Authorization: Bearer <token>` on subsequent guarded calls so the wallet
 * only prompts once per session.
 *
 * On signature failure this returns 401 — same shape as `requireWalletAuth`
 * — so the client can present a unified "auth failed" path.
 */
router.post('/auth/verify', async (req: Request, res: Response) => {
  const address = String(req.body?.address || '').trim();
  const signature = String(req.body?.signature || '').trim();
  const nonceId = String(req.body?.nonceId || '').trim();
  const signerPubkeyHex = trimOrUndefined(req.body?.signerPubkeyHex);

  if (!address || !signature || !nonceId) {
    return res.status(400).json({ error: 'address, signature, and nonceId are required' });
  }

  try {
    const user = await verifyWalletOwnership({ address, signature, nonceId, signerPubkeyHex });
    const bearer = issueBearer(user);
    return res.json({
      success: true,
      bearer: bearer.token,
      expiresAt: bearer.expiresAt,
      verifiedUser: {
        address: user.address,
        pubkeyHex: user.pubkeyHex,
        legacySiwxFormat: user.legacySiwxFormat,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return res.status(401).json({ error: 'Unauthorized', message });
  }
});

/**
 * POST /api/auth/verify-tx
 *
 * Transaction-signature login for wallets without message signing (WizardConnect
 * / hdwalletv1). Exchange a signed proof transaction (from /auth/nonce's
 * `authProof`, filled by the wallet) for the same 30-minute bearer as /verify.
 * Additive to /verify — the message-signature paths are unchanged.
 */
router.post('/auth/verify-tx', async (req: Request, res: Response) => {
  const address = String(req.body?.address || '').trim();
  const nonceId = String(req.body?.nonceId || '').trim();
  const signedTransaction = String(req.body?.signedTransaction || '').trim();

  if (!address || !nonceId || !signedTransaction) {
    return res.status(400).json({ error: 'address, nonceId, and signedTransaction are required' });
  }

  try {
    const user = await verifyWalletOwnershipViaTx({ address, nonceId, signedTransaction });
    const bearer = issueBearer(user);
    return res.json({
      success: true,
      bearer: bearer.token,
      expiresAt: bearer.expiresAt,
      verifiedUser: {
        address: user.address,
        pubkeyHex: user.pubkeyHex,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return res.status(401).json({ error: 'Unauthorized', message });
  }
});

export default router;
