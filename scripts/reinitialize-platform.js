#!/usr/bin/env node

const { Connection, PublicKey, Keypair, SystemProgram, Transaction } = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createCloseAccountInstruction, getAccount } = require('@solana/spl-token');
const bs58 = require('bs58');
require('dotenv').config();

async function reinitializePlatform() {
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const programId = process.env.SOLANA_PROGRAM_ID || '83TVAu61Hv4v7zvPszszYFJLTwARG5LPhoTbGnkEmaQD';
    const usdcMint = process.env.SOLANA_USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    const platformFeeBps = parseInt(process.env.PLATFORM_FEE_BPS) || 1500; // 15%

    if (!privateKey) {
      console.error('❌ SOLANA_PRIVATE_KEY not found in environment');
      process.exit(1);
    }

    console.log('🔄 Re-initializing platform...\n');

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

    console.log('✅ Keypair loaded');
    console.log('   Authority:', keypair.publicKey.toString());
    console.log('   Network:', rpcUrl.includes('devnet') ? 'Devnet' : 'Localnet');
    console.log('');

    // Check balance
    const balance = await connection.getBalance(keypair.publicKey);
    const solBalance = balance / 1e9;
    console.log('💰 Wallet balance:', solBalance, 'SOL');
    
    if (solBalance < 0.5) {
      console.error('❌ Insufficient balance! Need at least 0.5 SOL');
      console.log('   Run: solana airdrop 2', keypair.publicKey.toString(), '--url devnet');
      process.exit(1);
    }
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

    console.log('📋 Platform PDA:', platformPDA.toString());
    console.log('📋 Platform Fee Vault PDA:', platformFeeVaultPDA.toString());
    console.log('');

    // Check if platform exists
    const platformAccount = await connection.getAccountInfo(platformPDA);
    const feeVaultAccount = await connection.getAccountInfo(platformFeeVaultPDA);

    if (platformAccount) {
      console.log('⚠️  Platform account exists. Attempting to close it...');
      
      // Try to close the platform account
      // Note: This will only work if the account is empty and we have the authority
      // Since we don't have the old authority, we might need to use a different approach
      
      // Check if we can close it (only works if we're the authority)
      const buffer = Buffer.from(platformAccount.data);
      const currentAuthority = new PublicKey(buffer.slice(8, 40));
      
      if (!currentAuthority.equals(keypair.publicKey)) {
        console.error('❌ Cannot close platform account - you are not the current authority');
        console.error('   Current authority:', currentAuthority.toString());
        console.error('   Your keypair:', keypair.publicKey.toString());
        console.error('');
        console.error('💡 Options:');
        console.error('   1. Use the old keypair to close the account first');
        console.error('   2. Deploy a new program version that allows authority transfer');
        console.error('   3. Use a different program ID (not recommended)');
        process.exit(1);
      }

      // Close fee vault if it exists and has funds
      if (feeVaultAccount) {
        try {
          const vaultInfo = await getAccount(connection, platformFeeVaultPDA);
          if (vaultInfo.amount > 0) {
            console.log('⚠️  Fee vault has', vaultInfo.amount.toString(), 'tokens');
            console.log('   You may want to withdraw these first');
          }
        } catch (e) {
          // Vault might not be a token account yet
        }
      }

      console.log('⚠️  WARNING: Closing platform will DELETE all existing runs and data!');
      console.log('   This is IRREVERSIBLE on devnet.');
      console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...');
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Close accounts (this is complex and may not work without proper setup)
      // For now, we'll just try to initialize and see what happens
      console.log('   Attempting to initialize (may fail if account exists)...');
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

    console.log('📝 Initializing platform with fee:', platformFeeBps / 100, '%');
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
      if (error.message.includes('already in use') || error.message.includes('AccountDiscriminatorAlreadyExists')) {
        console.error('❌ Platform account already exists and cannot be overwritten');
        console.error('');
        console.error('💡 Solutions:');
        console.error('   1. Close the account first using the old authority keypair');
        console.error('   2. Use a different program ID (requires redeployment)');
        console.error('   3. Contact the team to coordinate');
        console.error('');
        console.error('   To close with old key:');
        console.error('   - Set SOLANA_PRIVATE_KEY to the old key temporarily');
        console.error('   - Run a script to close the platform account');
        console.error('   - Then run this script again');
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

reinitializePlatform();



