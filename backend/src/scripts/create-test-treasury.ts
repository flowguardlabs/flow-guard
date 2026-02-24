import { hexToBin, encodeCashAddress, lockingBytecodeToCashAddress } from '@bitauth/libauth';

// Public keys from generate-test-keys.ts
const pubkey1 = '02fdd0ebd4270fd65e8e16457d7014861f602fffac52848aa9464489f43031f3be';
const pubkey2 = '028a91b0c77ab28d2a27f7408231ddaca478f3fdf67528a0ad54dfed9fc012c355';
const pubkey3 = '0314be7cd062e7254b41f5c872df7fb3397058d7c379ed5e2205da51014afcd80c';

// Derive P2PKH addresses from public keys
import { hash160 } from '@bitauth/libauth';

function pubkeyToAddress(pubkeyHex: string): string {
  const pubkeyBytes = hexToBin(pubkeyHex);
  if (!pubkeyBytes) {
    throw new Error('Failed to convert pubkey to bytes');
  }
  const pubkeyHash = hash160(pubkeyBytes);

  // Use encodeCashAddress for chipnet
  const result = encodeCashAddress('chipnet', 0, pubkeyHash);
  if (typeof result === 'string') {
    return result;
  }
  throw new Error('Failed to encode address');
}

const address1 = pubkeyToAddress(pubkey1);
const address2 = pubkeyToAddress(pubkey2);
const address3 = pubkeyToAddress(pubkey3);

console.log('Signer Addresses:');
console.log('  Address 1:', address1);
console.log('  Address 2:', address2);
console.log('  Address 3:', address3);
console.log('');

const treasuryRequest = {
  name: 'FlowGuard Test Treasury',
  description: 'Proof-of-Flow verification treasury - 2-of-3 multisig',
  signers: [address1, address2, address3],
  signerPubkeys: [pubkey1, pubkey2, pubkey3],
  approvalThreshold: 2,
  cycleDuration: 604800, // 1 week in seconds
  spendingCap: 100000000, // 1 BCH in satoshis
  totalDeposit: 0,
  unlockAmount: 10000000, // 0.1 BCH per cycle
  isPublic: true,
};

console.log('Treasury Creation Request:');
console.log(JSON.stringify(treasuryRequest, null, 2));
