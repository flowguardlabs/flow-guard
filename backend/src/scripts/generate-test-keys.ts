import { binToHex, deriveHdPrivateNodeFromSeed, secp256k1 } from '@bitauth/libauth';
import crypto from 'crypto';

// Generate 3 signers for 2-of-3 multisig
const seed = crypto.randomBytes(32);
console.log('Seed:', binToHex(seed));
console.log('');

for (let i = 1; i <= 3; i++) {
  // Derive different paths for each signer
  const seedWithIndex = Buffer.concat([seed, Buffer.from([i])]);
  const node = deriveHdPrivateNodeFromSeed(seedWithIndex, true);
  if (!node.privateKey) {
    console.error(`Failed to derive private key for signer ${i}`);
    continue;
  }
  const privateKey = node.privateKey;
  const publicKey = secp256k1.derivePublicKeyCompressed(privateKey);
  if (!publicKey) {
    console.error(`Failed to derive public key for signer ${i}`);
    continue;
  }

  console.log(`Signer ${i}:`);
  console.log(`  Private Key: ${binToHex(privateKey)}`);
  console.log(`  Public Key:  ${binToHex(publicKey)}`);
  console.log('');
}
