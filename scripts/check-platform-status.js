#!/usr/bin/env node

const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
require('dotenv').config();

async function checkPlatformStatus() {
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const programId = process.env.SOLANA_PROGRAM_ID || '83TVAu61Hv4v7zvPszszYFJLTwARG5LPhoTbGnkEmaQD';
    const privateKey = process.env.SOLANA_PRIVATE_KEY;

    if (!privateKey) {
      console.error('❌ SOLANA_PRIVATE_KEY not found in environment');
      process.exit(1);
    }

    console.log('🔍 Checking platform status...\n');

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

    console.log('✅ New keypair loaded');
    console.log('   Public key (address):', keypair.publicKey.toString());
    console.log('   Network:', rpcUrl.includes('devnet') ? 'Devnet' : rpcUrl.includes('mainnet') ? 'Mainnet' : 'Localnet');
    console.log('   Program ID:', programId);
    console.log('');

    // Check wallet balance
    const balance = await connection.getBalance(keypair.publicKey);
    const solBalance = balance / 1e9;
    console.log('💰 Wallet balance:', solBalance, 'SOL');
    if (solBalance < 0.1) {
      console.log('   ⚠️  Low balance! You may need to fund this wallet.');
      if (rpcUrl.includes('devnet')) {
        console.log('   💡 Run: solana airdrop 2', keypair.publicKey.toString(), '--url devnet');
      }
    }
    console.log('');

    // Find platform PDA
    const [platformPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programPubkey
    );
    console.log('📋 Platform PDA:', platformPDA.toString());

    // Check if platform exists
    const platformAccount = await connection.getAccountInfo(platformPDA);
    
    if (!platformAccount) {
      console.log('❌ Platform is NOT initialized on-chain');
      console.log('');
      console.log('📝 Next steps:');
      console.log('   1. Platform needs to be initialized');
      console.log('   2. You can initialize it with your new keypair');
      console.log('   3. Run your backend initialization script or call initialize_platform');
      return;
    }

    console.log('✅ Platform IS initialized on-chain');
    console.log('');

    // Decode platform account
    const buffer = Buffer.from(platformAccount.data);
    let offset = 8; // Skip discriminator
    
    const authority = new PublicKey(buffer.slice(offset, offset + 32));
    offset += 32;
    
    const platformFeeBps = buffer.readUInt16LE(offset);
    offset += 2;
    
    const totalRuns = buffer.readBigUInt64LE(offset);
    offset += 8;
    
    const isPaused = buffer[offset] === 1;
    offset += 1;

    console.log('📊 Platform Details:');
    console.log('   Authority:', authority.toString());
    console.log('   Platform Fee:', platformFeeBps / 100, '%');
    console.log('   Total Runs:', totalRuns.toString());
    console.log('   Is Paused:', isPaused);
    console.log('');

    // Check if authority matches
    if (authority.equals(keypair.publicKey)) {
      console.log('✅ SUCCESS! Your new keypair matches the platform authority');
      console.log('   You can use this keypair for all admin operations');
    } else {
      console.log('⚠️  WARNING: Authority mismatch!');
      console.log('   Current authority:', authority.toString());
      console.log('   Your keypair:', keypair.publicKey.toString());
      console.log('');
      console.log('📝 Options:');
      console.log('   1. If on devnet: Re-initialize platform (will reset all data)');
      console.log('   2. Use the old keypair temporarily (not recommended)');
      console.log('   3. Contact team to coordinate authority transfer');
      console.log('');
      console.log('   ⚠️  Admin operations (start_run, settle_run, etc.) will FAIL');
      console.log('      with the new keypair until authority is updated.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

checkPlatformStatus();







