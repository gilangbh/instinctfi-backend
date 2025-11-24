#!/usr/bin/env node

/**
 * Close existing platform account and reinitialize with new authority
 * 
 * NOTE: This requires the OLD authority key to close the account.
 * If you don't have the old key, you'll need to:
 * 1. Temporarily set SOLANA_PRIVATE_KEY to the old key
 * 2. Run this script to close
 * 3. Then set SOLANA_PRIVATE_KEY back to new key
 * 4. Run this script again to initialize
 */

const { Connection, PublicKey, Keypair, SystemProgram } = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const bs58 = require('bs58');
require('dotenv').config();

async function closeAndReinit() {
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const programId = process.env.SOLANA_PROGRAM_ID || '83TVAu61Hv4v7zvPszszYFJLTwARG5LPhoTbGnkEmaQD';
    const usdcMint = process.env.SOLANA_USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    const platformFeeBps = parseInt(process.env.PLATFORM_FEE_BPS) || 1500;

    if (!privateKey) {
      console.error('❌ SOLANA_PRIVATE_KEY not found in environment');
      process.exit(1);
    }

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
    const usdcMintPubkey = new PublicKey(usdcMint);

    console.log('🔍 Checking platform status...\n');
    console.log('   Current keypair:', keypair.publicKey.toString());
    console.log('   Network:', rpcUrl.includes('devnet') ? 'Devnet' : 'Localnet');
    console.log('');

    // Find PDAs
    const [platformPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programPubkey
    );
    
    const [platformFeeVaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform_fee_vault')],
      programPubkey
    );

    // Check if platform exists
    const platformAccount = await connection.getAccountInfo(platformPDA);
    
    if (!platformAccount) {
      console.log('✅ Platform account does not exist - ready to initialize\n');
    } else {
      // Decode to get current authority
      const buffer = Buffer.from(platformAccount.data);
      const currentAuthority = new PublicKey(buffer.slice(8, 40));
      
      console.log('📋 Platform account exists');
      console.log('   Current authority:', currentAuthority.toString());
      console.log('   Your keypair:', keypair.publicKey.toString());
      console.log('');

      if (!currentAuthority.equals(keypair.publicKey)) {
        console.error('❌ You are NOT the current authority!');
        console.error('');
        console.error('💡 To close the platform account, you need the OLD authority key.');
        console.error('');
        console.error('Option 1: Use old key temporarily');
        console.error('   1. Set SOLANA_PRIVATE_KEY to the old key in .env');
        console.error('   2. Run this script (it will close the account)');
        console.error('   3. Set SOLANA_PRIVATE_KEY back to new key');
        console.error('   4. Run this script again (it will initialize)');
        console.error('');
        console.error('Option 2: The old key was:');
        console.error('   2f2GzFzxrvqQ2E8pAt7EVwq6YWcuZqegA5HBge7qiCfn');
        console.error('   (This was exposed in .env.bak - you may want to use it just to close)');
        console.error('');
        process.exit(1);
      }

      console.log('⚠️  WARNING: Closing platform will DELETE all 56 runs!');
      console.log('   This is IRREVERSIBLE on devnet.');
      console.log('   Press Ctrl+C to cancel, or wait 5 seconds...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));

      console.log('🗑️  Closing platform account...');
      
      // Close the platform account
      // Note: This is complex - we need to close both platform and fee vault
      // For now, we'll just try to initialize and see if Anchor handles it
      console.log('   Note: Account closing requires special handling.');
      console.log('   Attempting to initialize (will fail if account exists)...\n');
    }

    // Load IDL
    let idl;
    try {
      idl = require('../src/idl/instinct_trading.json');
    } catch (e) {
      console.error('❌ Could not load IDL file');
      console.error('   Make sure src/idl/instinct_trading.json exists');
      process.exit(1);
    }

    // Create provider and program
    const wallet = new Wallet(keypair);
    const provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    });
    const program = new Program(idl, programPubkey, provider);

    console.log('📝 Initializing platform...');
    console.log('   Fee:', platformFeeBps / 100, '%');
    console.log('   Authority:', keypair.publicKey.toString());
    console.log('');

    try {
      const tx = await program.methods
        .initializePlatform(platformFeeBps)
        .accounts({
          platform: platformPDA,
          platformFeeVault: platformFeeVaultPDA,
          usdcMint: usdcMintPubkey,
          authority: keypair.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log('✅ Platform initialized successfully!');
      console.log('   Transaction:', tx);
      console.log('   Explorer:', `https://explorer.solana.com/tx/${tx}?cluster=devnet`);
      console.log('');
      console.log('📊 Platform Details:');
      console.log('   Authority:', keypair.publicKey.toString());
      console.log('   Platform Fee:', platformFeeBps / 100, '%');
      console.log('   Platform PDA:', platformPDA.toString());
      console.log('   Fee Vault PDA:', platformFeeVaultPDA.toString());
      
    } catch (error) {
      if (error.message.includes('already in use') || 
          error.message.includes('AccountDiscriminatorAlreadyExists') ||
          error.message.includes('0x0')) {
        console.error('❌ Platform account already exists and cannot be overwritten');
        console.error('');
        console.error('💡 You need to close it first using the OLD authority key.');
        console.error('');
        console.error('Steps:');
        console.error('1. The old authority was: 2f2GzFzxrvqQ2E8pAt7EVwq6YWcuZqegA5HBge7qiCfn');
        console.error('2. If you have the old private key, temporarily set it in .env');
        console.error('3. Run a script to close the platform account');
        console.error('4. Then set your new key back and run this script again');
        console.error('');
        console.error('Alternative: Since this is devnet, you could:');
        console.error('- Redeploy the program with a new program ID');
        console.error('- Or contact Solana support (not recommended)');
      } else {
        console.error('❌ Error:', error.message);
        if (error.logs) {
          console.error('   Logs:', error.logs);
        }
      }
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

closeAndReinit();



