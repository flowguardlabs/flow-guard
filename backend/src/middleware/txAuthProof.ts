/**
 * Transaction-signature login proof — a message-signing substitute for wallets
 * that only implement transaction signing (e.g. WizardConnect / hdwalletv1,
 * which has no sign_message action).
 *
 * The dapp asks the wallet to sign a NON-broadcastable "proof" transaction:
 *   - 1 input, outpoint = null (all-zero txid, index 0) — references no real UTXO
 *     so it can never be broadcast; it exists only to be signed.
 *   - that input's prevout locking script = P2PKH of the address being proven,
 *     so the sighash binds to that specific key.
 *   - 1 output = OP_RETURN <challenge>, where challenge = sha256(domain||nonceId).
 *     SIGHASH_ALL commits to the output, so the signature is bound to the
 *     server-issued single-use nonce (anti-replay).
 *
 * Verifying the signature proves the signer controls the private key for the
 * declared address, exactly like a signed message would. Construction proposed
 * by Dagur Valberg (WizardConnect author).
 */

import { TransactionBuilder, MockNetworkProvider, placeholderP2PKHUnlocker } from 'cashscript';
import type { WcTransactionObject } from 'cashscript';
import {
  secp256k1,
  sha256,
  utf8ToBin,
  binToHex,
  hexToBin,
  decodeTransaction,
  decodeAuthenticationInstructions,
  cashAddressToLockingBytecode,
  hash160,
  generateSigningSerializationBCH,
} from '@bitauth/libauth';

const AUTH_PROOF_DOMAIN = 'flowguard-auth-tx:';
const AUTH_PROOF_SATS = 1000n; // fixed nominal amount; consistent between build + verify
const NULL_TXID = new Uint8Array(32);

function doubleSha256(bytes: Uint8Array): Uint8Array {
  return sha256.hash(sha256.hash(bytes));
}

/** Server-issued challenge, deterministically derived from the single-use nonce. */
function challengeForNonce(nonceId: string): Uint8Array {
  return sha256.hash(utf8ToBin(AUTH_PROOF_DOMAIN + nonceId));
}

function p2pkhHashFromAddress(address: string): Uint8Array {
  const decoded = cashAddressToLockingBytecode(address);
  if (typeof decoded === 'string') throw new Error('Address is not a valid cash address');
  const b = decoded.bytecode;
  const isP2pkh = b.length === 25 && b[0] === 0x76 && b[1] === 0xa9 && b[2] === 0x14 && b[23] === 0x88 && b[24] === 0xac;
  if (!isP2pkh) throw new Error('Address is not a supported P2PKH cash address');
  return b.slice(3, 23);
}

/** Same preimage cashscript's SignatureTemplate uses, inlined off libauth. */
function sighash(transaction: unknown, sourceOutputs: unknown[], inputIndex: number, coveredBytecode: Uint8Array, hashtype: number): Uint8Array {
  const preimage = generateSigningSerializationBCH(
    { inputIndex, sourceOutputs, transaction } as never,
    { coveredBytecode, signingSerializationType: new Uint8Array([hashtype]) },
  );
  return doubleSha256(preimage);
}

/**
 * Build the proof transaction the wallet signs. Returned as a cashscript
 * WcTransactionObject; callers serialize it (serializeWcTransaction) for the
 * /auth/nonce response so the frontend can hand it straight to the wallet.
 */
export function buildAuthProofWcTransaction(address: string, nonceId: string): WcTransactionObject {
  p2pkhHashFromAddress(address); // validate shape early
  const provider = new MockNetworkProvider();
  const fakeUtxo = { txid: binToHex(NULL_TXID), vout: 0, satoshis: AUTH_PROOF_SATS };
  return new TransactionBuilder({ provider })
    .addInput(fakeUtxo, placeholderP2PKHUnlocker(address))
    .addOpReturnOutput(['0x' + binToHex(challengeForNonce(nonceId))])
    .generateWcTransactionObject();
}

/**
 * Verify a signed proof transaction. Returns the proven compressed pubkey (hex)
 * or throws. The caller is responsible for consuming the nonce first.
 */
export function verifyAuthProofTx(address: string, nonceId: string, signedTransactionHex: string): { pubkeyHex: string } {
  const expectedChallenge = challengeForNonce(nonceId);
  const expectedHash = p2pkhHashFromAddress(address);
  const covered = cashAddressToLockingBytecode(address);
  if (typeof covered === 'string') throw new Error('Address is not a valid cash address');
  const coveredBytecode = covered.bytecode;

  const tx = decodeTransaction(hexToBin(signedTransactionHex));
  if (typeof tx === 'string') throw new Error('Proof transaction failed to decode');
  if (tx.inputs.length !== 1) throw new Error('Proof transaction must have exactly one input');
  if (tx.outputs.length !== 1) throw new Error('Proof transaction must have exactly one output');

  const input = tx.inputs[0];
  if (binToHex(input.outpointTransactionHash) !== binToHex(NULL_TXID) || input.outpointIndex !== 0) {
    throw new Error('Proof input must reference the null outpoint');
  }

  const outScript = tx.outputs[0].lockingBytecode;
  const opReturnOk =
    outScript.length === 34 &&
    outScript[0] === 0x6a && // OP_RETURN
    outScript[1] === 0x20 && // push 32 bytes
    binToHex(outScript.slice(2, 34)) === binToHex(expectedChallenge);
  if (!opReturnOk) throw new Error('Proof OP_RETURN does not match the issued nonce challenge');

  const instructions = decodeAuthenticationInstructions(input.unlockingBytecode);
  const sigFull = (instructions[0] as { data?: Uint8Array })?.data;
  const pubkey = (instructions[1] as { data?: Uint8Array })?.data;
  if (!sigFull || sigFull.length < 2 || !pubkey || pubkey.length !== 33) {
    throw new Error('Proof unlocking script is not a P2PKH signature + pubkey');
  }
  if (binToHex(hash160(pubkey)) !== binToHex(expectedHash)) {
    throw new Error('Proof pubkey does not hash to the declared address');
  }

  const hashtype = sigFull[sigFull.length - 1];
  const rawSig = sigFull.slice(0, sigFull.length - 1);
  const sourceOutputs = [{
    outpointTransactionHash: NULL_TXID,
    outpointIndex: 0,
    lockingBytecode: coveredBytecode,
    valueSatoshis: AUTH_PROOF_SATS,
    sequenceNumber: input.sequenceNumber,
  }];
  const digest = sighash(tx, sourceOutputs, 0, coveredBytecode, hashtype);

  const schnorrOk = rawSig.length === 64 && secp256k1.verifySignatureSchnorr(rawSig, pubkey, digest) === true;
  const ecdsaOk = !schnorrOk && secp256k1.verifySignatureDER(rawSig, pubkey, digest) === true;
  if (!schnorrOk && !ecdsaOk) throw new Error('Proof signature is invalid for the declared key');

  return { pubkeyHex: binToHex(pubkey) };
}
