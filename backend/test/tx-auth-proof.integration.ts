// Exercises the ported backend auth-proof module: build the proof tx, sign it
// like a WizardConnect wallet (fill the P2PKH placeholders), verify, + reject cases.
//   cd backend && npx tsx test/tx-auth-proof.integration.ts
import { buildAuthProofWcTransaction, verifyAuthProofTx } from '../src/middleware/txAuthProof.js';
import {
  secp256k1, sha256, utf8ToBin, binToHex, encodeTransaction, encodeCashAddress, hash160,
  generateSigningSerializationBCH,
} from '@bitauth/libauth';

let pass = 0, fail = 0;
const check = (n: string, c: boolean) => { console.log(c ? 'PASS' : 'FAIL', n); c ? pass++ : fail++; };

const priv = sha256.hash(utf8ToBin('backend-auth-test-user'));
const pub = secp256k1.derivePublicKeyCompressed(priv) as Uint8Array;
const addr = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: hash160(pub) as Uint8Array }).address;
const nonceId = 'test-nonce-xyz';

function walletSign(nId: string): string {
  const wc = buildAuthProofWcTransaction(addr, nId);
  const covered = wc.sourceOutputs[0].lockingBytecode;
  const preimage = generateSigningSerializationBCH(
    { inputIndex: 0, sourceOutputs: wc.sourceOutputs, transaction: wc.transaction } as never,
    { coveredBytecode: covered, signingSerializationType: new Uint8Array([0x41]) },
  );
  const sighash = sha256.hash(sha256.hash(preimage));
  const sig = new Uint8Array([...secp256k1.signMessageHashSchnorr(priv, sighash) as Uint8Array, 0x41]);
  const push = (d: Uint8Array) => new Uint8Array([d.length, ...d]);
  wc.transaction.inputs[0].unlockingBytecode = new Uint8Array([...push(sig), ...push(pub)]);
  return binToHex(encodeTransaction(wc.transaction));
}

const signed = walletSign(nonceId);
check('valid proof accepted + returns correct pubkey', verifyAuthProofTx(addr, nonceId, signed).pubkeyHex === binToHex(pub));

const tryReject = (name: string, fn: () => void) => { try { fn(); check(name, false); } catch { check(name, true); } };
tryReject('reject: wrong nonce (op_return mismatch)', () => verifyAuthProofTx(addr, 'other-nonce', signed));
const otherPub = secp256k1.derivePublicKeyCompressed(sha256.hash(utf8ToBin('someone-else'))) as Uint8Array;
const otherAddr = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: hash160(otherPub) as Uint8Array }).address;
tryReject('reject: wrong address (pubkey hash mismatch)', () => verifyAuthProofTx(otherAddr, nonceId, signed));
tryReject('reject: flipped signature byte', () => {
  const bytes = signed.split(''); const i = signed.length - 80; bytes[i] = bytes[i] === '0' ? '1' : '0';
  verifyAuthProofTx(addr, nonceId, bytes.join(''));
});
// cross-key replay: a proof signed by a DIFFERENT key for the same nonce must fail address binding
check('build is deterministic for same nonce', binToHex(buildAuthProofWcTransaction(addr, nonceId).sourceOutputs[0].lockingBytecode) === binToHex(buildAuthProofWcTransaction(addr, nonceId).sourceOutputs[0].lockingBytecode));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
