#!/usr/bin/env node

/**
 * Script to create a test USDC mint on devnet
 * 
 * This creates a mint that can be used for testing
 */

const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { createMint, getMint } = require('@solana/spl-token');
const { AnchorProvider, Wallet } = require('@coral-xyz/anchor');
require('dotenv').config();

// Configuration
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY;

if (!SOLANA_PRIVATE_KEY) {
  console.error('❌ SOLANA_PRIVATE_KEY is required');
  process.exit(1);
}

// Parse keypair
function parseKeypair(keypairStr) {
  try {
    const parsed = JSON.parse(keypairStr);
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  } catch {
    const bs58 = require('bs58');
    const decoded = bs58.decode(keypairStr);
    return Keypair.fromSecretKey(decoded);
  }
}

const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
const keypair = parseKeypair(SOLANA_PRIVATE_KEY);
const wallet = new Wallet(keypair);
const provider = new AnchorProvider(connection, wallet, {
  commitment: 'confirmed',
  preflightCommitment: 'confirmed',
});

async function createTestUsdcMint() {
  console.log('🔧 Creating test USDC mint on devnet...');
  console.log(`   Network: devnet`);
  console.log(`   Authority: ${wallet.publicKey.toString()}\n`);

  try {
    // Check if we have enough SOL
    const balance = await connection.getBalance(wallet.publicKey);
    console.log(`   Wallet balance: ${balance / 1e9} SOL`);
    
    if (balance < 0.1 * 1e9) {
      console.error('   ❌ Insufficient SOL. Need at least 0.1 SOL for mint creation.');
      console.error('   Get devnet SOL: solana airdrop 1 ' + wallet.publicKey.toString() + ' --url devnet');
      process.exit(1);
    }

    // Create mint with 6 decimals (like USDC)
    console.log('   Creating mint with 6 decimals...');
    const mint = await createMint(
      connection,
      keypair,
      wallet.publicKey, // mint authority
      null, // freeze authority (null = no freeze)
      6 // decimals
    );

    console.log('\n✅ Test USDC mint created!');
    console.log(`   Mint address: ${mint.toString()}`);
    console.log(`   Decimals: 6`);
    console.log(`   Explorer: https://explorer.solana.com/address/${mint.toString()}?cluster=devnet`);
    console.log(`\n📝 Add this to your .env file:`);
    console.log(`   SOLANA_USDC_MINT=${mint.toString()}`);
    
    return mint;
  } catch (error) {
    console.error('❌ Error creating mint:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

createTestUsdcMint();

