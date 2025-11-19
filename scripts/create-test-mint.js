#!/usr/bin/env node

/**
 * Create a test USDC mint on Solana Devnet
 */

const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { createMint } = require('@solana/spl-token');
require('dotenv').config();

async function createTestMint() {
  console.log('\n🪙 Creating test USDC mint on devnet...\n');

  try {
    // Setup connection
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    // Load keypair
    const privateKeyStr = process.env.SOLANA_PRIVATE_KEY;
    const privateKeyData = JSON.parse(privateKeyStr);
    const payer = Keypair.fromSecretKey(Uint8Array.from(privateKeyData));

    console.log('Creating mint...');
    console.log('Payer:', payer.publicKey.toString());

    // Create mint with 6 decimals (like USDC)
    const mint = await createMint(
      connection,
      payer,
      payer.publicKey, // mint authority
      null, // freeze authority (none)
      6 // decimals
    );

    console.log('\n✅ Test USDC mint created!');
    console.log('Mint address:', mint.toString());
    console.log('\n📝 Add this to your .env file:');
    console.log(`SOLANA_USDC_MINT=${mint.toString()}`);

  } catch (error) {
    console.error('❌ Failed to create mint:', error);
    process.exit(1);
  }
}

createTestMint();














