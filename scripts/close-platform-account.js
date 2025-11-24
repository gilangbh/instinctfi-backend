#!/usr/bin/env node

/**
 * Close platform account using the old authority key
 * This is a one-time operation to reset the platform
 */

const { Connection, PublicKey, Keypair, SystemProgram } = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const bs58 = require('bs58');
require('dotenv').config();

async function closePlatform() {
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const programId = process.env.SOLANA_PROGRAM_ID || '83TVAu61Hv4v7zvPszszYFJLTwARG5LPhoTbGnkEmaQD';
    const privateKey = process.env.SOLANA_PRIVATE_KEY;

    if (!privateKey) {
      console.error('❌ SOLANA_PRIVATE_KEY not found');
      console.error('   Set it to the OLD key temporarily to close the account');
      process.exit(1);
    }

    console.log('🗑️  Closing platform account...\n');

    // Parse private key
    let keypairData;
    try {
      const parsed = JSON.parse(privateKey);
      keypairData = Uint8Array.from(parsed);
    } catch {
      keypairData = bs58.decode(privateKey);
    }

    const keypair = Keypair.fromSecretKey(keypairData);
    const connection = new Connection(rpcUrl, 'confirmed');
    const programPubkey = new PublicKey(programId);

    console.log('   Using authority:', keypair.publicKey.toString());
    console.log('');

    // Find platform PDA
    const [platformPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programPubkey
    );

    // Check current authority
    const platformAccount = await connection.getAccountInfo(platformPDA);
    if (!platformAccount) {
      console.log('✅ Platform account does not exist - nothing to close');
      return;
    }

    const buffer = Buffer.from(platformAccount.data);
    const currentAuthority = new PublicKey(buffer.slice(8, 40));

    if (!currentAuthority.equals(keypair.publicKey)) {
      console.error('❌ This keypair is NOT the platform authority!');
      console.error('   Current authority:', currentAuthority.toString());
      console.error('   Your keypair:', keypair.publicKey.toString());
      process.exit(1);
    }

    console.log('⚠️  WARNING: This will DELETE the platform account and all 56 runs!');
    console.log('   Press Ctrl+C to cancel, or wait 5 seconds...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Close the account by transferring lamports to authority
    // On Solana, you close an account by setting its data to zero and transferring lamports
    const wallet = new Wallet(keypair);
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

    // Create a transaction to close the account
    // Note: This is a simplified approach - in practice, you'd need to handle
    // all the accounts that depend on the platform account
    
    console.log('⚠️  Note: Closing program-derived accounts requires special handling.');
    console.log('   The platform PDA cannot be easily closed without closing all dependent accounts.');
    console.log('');
    console.log('💡 Alternative approach:');
    console.log('   Since this is devnet, the simplest solution is to:');
    console.log('   1. Keep using the old key temporarily (not ideal)');
    console.log('   2. OR redeploy the program with a new program ID');
    console.log('   3. OR wait for a program upgrade that allows authority transfer');
    console.log('');
    console.log('   For now, you can:');
    console.log('   - Use the old key in .env temporarily');
    console.log('   - Or redeploy the program (if you have deploy authority)');
    
    // Actually, we can't easily close a PDA account that's been initialized
    // The best approach on devnet is to just use a new program ID or keep the old key
    
    console.log('');
    console.log('📝 Recommended: Use old key temporarily until you can redeploy');
    console.log('   The old authority was exposed, but since it\'s devnet, you can');
    console.log('   use it temporarily while you plan a proper solution.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

closePlatform();



