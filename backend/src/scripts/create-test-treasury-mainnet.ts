import { TestNetWallet } from 'mainnet-js';

// Public keys from generate-test-keys.ts
const pubkey1 = '02fdd0ebd4270fd65e8e16457d7014861f602fffac52848aa9464489f43031f3be';
const pubkey2 = '028a91b0c77ab28d2a27f7408231ddaca478f3fdf67528a0ad54dfed9fc012c355';
const pubkey3 = '0314be7cd062e7254b41f5c872df7fb3397058d7c379ed5e2205da51014afcd80c';

// Private keys (for reference, but not needed for address derivation)
const privkey1 = '00bc72828348055d70b5dd648e3e86883e54b08c8030995a40b78bc4536ead20';
const privkey2 = '982b29550a85ef63b997591d26c005c4952f812fcfe9d46a22563496b2cf50ce';
const privkey3 = '77ecfd5d27a1b3377a3e2d73be2fc8dc7f69b593d188b685f546f9d40702c512';

async function main() {
  // Create wallets from private keys to get addresses
  const wallet1 = await TestNetWallet.fromId(`wif:testnet:${privkey1}`);
  const wallet2 = await TestNetWallet.fromId(`wif:testnet:${privkey2}`);
  const wallet3 = await TestNetWallet.fromId(`wif:testnet:${privkey3}`);

  const address1 = wallet1.cashaddr!;
  const address2 = wallet2.cashaddr!;
  const address3 = wallet3.cashaddr!;

  console.log('Signer Addresses (chipnet):');
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

  // Write to file for curl
  const fs = await import('fs');
  fs.writeFileSync('/tmp/treasury-request.json', JSON.stringify(treasuryRequest, null, 2));
  console.log('');
  console.log('Saved to /tmp/treasury-request.json');
}

main().catch(console.error);
