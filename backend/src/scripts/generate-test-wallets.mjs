import { TestNetWallet } from 'mainnet-js';

async function generateTestWallets() {
  console.log('='.repeat(80));
  console.log('FLOWGUARD TEST WALLETS - CHIPNET');
  console.log('='.repeat(80));
  console.log('\n⚠️  THESE ARE FOR TESTING ONLY - DO NOT USE ON MAINNET!\n');

  const wallets = [];

  for (let i = 1; i <= 3; i++) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`WALLET ${i} - Signer ${i}`);
    console.log('─'.repeat(80));

    // Create a new random wallet for testnet/chipnet (uses bchtest: prefix)
    const wallet = await TestNetWallet.newRandom();

    // Get wallet details
    const address = wallet.cashaddr;
    const seedPhrase = wallet.mnemonic;
    const privateKeyWif = wallet.privateKeyWif;
    const publicKey = wallet.publicKey;
    const publicKeyHex = Buffer.from(publicKey).toString('hex');

    wallets.push({
      name: `Signer ${i}`,
      address,
      seedPhrase,
      privateKeyWif,
      publicKeyHex,
    });

    console.log(`\n📍 Address (chipnet):`);
    console.log(`   ${address}`);

    console.log(`\n🔑 Seed Phrase (12 words):`);
    console.log(`   ${seedPhrase}`);

    console.log(`\n🔐 Private Key (WIF):`);
    console.log(`   ${privateKeyWif}`);

    console.log(`\n📋 Public Key (hex) - NEEDED FOR VAULT CREATION:`);
    console.log(`   ${publicKeyHex}`);
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('SUMMARY - COPY THESE FOR VAULT CREATION');
  console.log('='.repeat(80));

  console.log('\n📍 ADDRESSES:');
  wallets.forEach((w, i) => {
    console.log(`   Signer ${i + 1}: ${w.address}`);
  });

  console.log('\n📋 PUBLIC KEYS (hex):');
  wallets.forEach((w, i) => {
    console.log(`   Signer ${i + 1}: ${w.publicKeyHex}`);
  });

  console.log('\n🔑 SEED PHRASES:');
  wallets.forEach((w, i) => {
    console.log(`   Signer ${i + 1}: ${w.seedPhrase}`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('💰 GET TEST BCH FROM CHIPNET FAUCET:');
  console.log('   https://tbch.googol.cash/');
  console.log('   https://faucet.chipnet.cash/');
  console.log('='.repeat(80));

  // Output as JSON for easy copy-paste
  console.log('\n📦 JSON FORMAT (for programmatic use):');
  console.log(JSON.stringify(wallets, null, 2));
}

generateTestWallets().catch(console.error);
