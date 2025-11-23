#!/usr/bin/env node

/**
 * Script to mint test USDC to a wallet
 * 
 * Usage:
 *   node scripts/mint-test-usdc.js <mint-address> <amount> [wallet-address]
 * 
 * Examples:
 *   node scripts/mint-test-usdc.js 3BX1YXiemxoQe9WjeTWzstkFstXr6XyAEzvheDwSyceY 1000
 *   node scripts/mint-test-usdc.js 3BX1YXiemxoQe9WjeTWzstkFstXr6XyAEzvheDwSyceY 1000 <wallet-address>
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { 
  getOrCreateAssociatedTokenAccount, 
  mintTo,
  getMint,
  TOKEN_PROGRAM_ID
} = require('@solana/spl-token');
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
    return require('@solana/web3.js').Keypair.fromSecretKey(Uint8Array.from(parsed));
  } catch {
    const bs58 = require('bs58');
    const decoded = bs58.decode(keypairStr);
    return require('@solana/web3.js').Keypair.fromSecretKey(decoded);
  }
}

const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
const keypair = parseKeypair(SOLANA_PRIVATE_KEY);
const wallet = new Wallet(keypair);
const provider = new AnchorProvider(connection, wallet, {
  commitment: 'confirmed',
  preflightCommitment: 'confirmed',
});

async function mintTestUsdc(mintAddress, amount, recipientAddress) {
  const mint = new PublicKey(mintAddress);
  const recipient = recipientAddress ? new PublicKey(recipientAddress) : wallet.publicKey;

  console.log('💰 Minting test USDC...');
  console.log(`   Mint: ${mint.toString()}`);
  console.log(`   Amount: ${amount} USDC`);
  console.log(`   Recipient: ${recipient.toString()}\n`);

  try {
    // Check if mint exists
    const mintInfo = await getMint(connection, mint);
    console.log(`   ✅ Mint exists`);
    console.log(`   Decimals: ${mintInfo.decimals}`);
    console.log(`   Mint Authority: ${mintInfo.mintAuthority?.toString() || 'None'}\n`);

    // Check if we're the mint authority
    if (mintInfo.mintAuthority && !mintInfo.mintAuthority.equals(wallet.publicKey)) {
      console.error(`   ❌ You are not the mint authority!`);
      console.error(`   Mint authority: ${mintInfo.mintAuthority.toString()}`);
      console.error(`   Your wallet: ${wallet.publicKey.toString()}`);
      console.error(`\n   You need to use the mint authority wallet to mint tokens.`);
      process.exit(1);
    }

    // Get or create recipient's token account
    console.log('   Creating/getting token account...');
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      mint,
      recipient
    );
    console.log(`   ✅ Token account: ${tokenAccount.address.toString()}\n`);

    // Convert amount to raw units (with decimals)
    const amountRaw = BigInt(amount * Math.pow(10, mintInfo.decimals));
    console.log(`   Minting ${amount} USDC (${amountRaw.toString()} raw units)...`);

    // Mint tokens
    const signature = await mintTo(
      connection,
      keypair,
      mint,
      tokenAccount.address,
      wallet.publicKey, // mint authority
      Number(amountRaw)
    );

    console.log(`\n✅ Successfully minted ${amount} USDC!`);
    console.log(`   Transaction: ${signature}`);
    console.log(`   Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    console.log(`   Token Account: ${tokenAccount.address.toString()}`);
    console.log(`   View account: https://explorer.solana.com/address/${tokenAccount.address.toString()}?cluster=devnet`);

    // Check balance
    const balance = await connection.getTokenAccountBalance(tokenAccount.address);
    console.log(`   Balance: ${balance.value.uiAmount} USDC`);

  } catch (error) {
    console.error('❌ Error minting tokens:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

async function main() {
  const mintAddress = process.argv[2];
  const amount = parseFloat(process.argv[3]);
  const recipientAddress = process.argv[4];

  if (!mintAddress || isNaN(amount) || amount <= 0) {
    console.error('❌ Usage: node scripts/mint-test-usdc.js <mint-address> <amount> [recipient-address]');
    console.error('\nExamples:');
    console.error('  node scripts/mint-test-usdc.js 3BX1YXiemxoQe9WjeTWzstkFstXr6XyAEzvheDwSyceY 1000');
    console.error('  node scripts/mint-test-usdc.js 3BX1YXiemxoQe9WjeTWzstkFstXr6XyAEzvheDwSyceY 1000 <wallet-address>');
    process.exit(1);
  }

  await mintTestUsdc(mintAddress, amount, recipientAddress);
}

main();

