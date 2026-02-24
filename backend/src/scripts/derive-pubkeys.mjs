import { TestNetWallet } from 'mainnet-js';

async function derivePubkeys() {
  const seedPhrases = [
    'fuel museum silly student illegal bread lens bomb claim vital turkey nephew',
    'lecture coach draw grow ski bright regret inmate fossil group change annual',
    'laptop memory engine ranch hill trouble this floor basket wash welcome battle'
  ];

  console.log('='.repeat(80));
  console.log('DERIVING PUBLIC KEYS FROM SEED PHRASES');
  console.log('='.repeat(80));

  const wallets = [];

  for (let i = 0; i < seedPhrases.length; i++) {
    const seedPhrase = seedPhrases[i];

    // Create wallet from seed phrase
    const wallet = await TestNetWallet.fromSeed(seedPhrase);

    const address = wallet.cashaddr;
    const publicKey = wallet.publicKey;
    const publicKeyHex = Buffer.from(publicKey).toString('hex');

    wallets.push({
      name: `Signer ${i + 1}`,
      seedPhrase,
      address,
      publicKeyHex,
    });

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`WALLET ${i + 1} - Signer ${i + 1}`);
    console.log('─'.repeat(80));
    console.log(`\n🔑 Seed Phrase:`);
    console.log(`   ${seedPhrase}`);
    console.log(`\n📍 Address:`);
    console.log(`   ${address}`);
    console.log(`\n📋 Public Key (hex):`);
    console.log(`   ${publicKeyHex}`);
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('SUMMARY - COPY FOR VAULT CREATION');
  console.log('='.repeat(80));

  console.log('\n📍 ADDRESSES:');
  wallets.forEach((w, i) => {
    console.log(`   Signer ${i + 1}: ${w.address}`);
  });

  console.log('\n📋 PUBLIC KEYS (hex):');
  wallets.forEach((w, i) => {
    console.log(`   Signer ${i + 1}: ${w.publicKeyHex}`);
  });
}

derivePubkeys().catch(console.error);
