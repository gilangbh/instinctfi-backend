#!/usr/bin/env node

/**
 * Transfer platform authority from old key to new key
 * 
 * Steps:
 * 1. Set SOLANA_PRIVATE_KEY to OLD key in .env
 * 2. Run this script
 * 3. It will transfer authority to the NEW key (from .env or as parameter)
 */

const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const bs58 = require('bs58');
require('dotenv').config();

async function transferAuthority() {
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const programId = process.env.SOLANA_PROGRAM_ID || '83TVAu61Hv4v7zvPszszYFJLTwARG5LPhoTbGnkEmaQD';
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    
    // New authority - can be passed as argument or set in env
    const newAuthorityArg = process.argv[2];
    const newAuthorityEnv = process.env.NEW_AUTHORITY_PUBKEY;
    const newAuthorityPubkey = newAuthorityArg || newAuthorityEnv;

    if (!privateKey) {
      console.error('❌ SOLANA_PRIVATE_KEY not found in environment');
      console.error('   Set it to the OLD authority key');
      process.exit(1);
    }

    if (!newAuthorityPubkey) {
      console.error('❌ New authority not specified');
      console.error('   Usage: node transfer-authority.js <new-authority-pubkey>');
      console.error('   Or set NEW_AUTHORITY_PUBKEY in .env');
      console.error('');
      console.error('   Your new keypair address: 5ZoFwrEQEARgGoa3XepbHBzE8RtCVvfJPoiRJmikQjGh');
      process.exit(1);
    }

    console.log('🔄 Transferring platform authority...\n');

    // Parse OLD private key (current authority)
    let keypairData;
    try {
      const parsed = JSON.parse(privateKey);
      keypairData = Uint8Array.from(parsed);
    } catch {
      keypairData = bs58.decode(privateKey);
    }

    const oldKeypair = Keypair.fromSecretKey(keypairData);
    const connection = new Connection(rpcUrl, 'confirmed');
    const programPubkey = new PublicKey(programId);
    const newAuthority = new PublicKey(newAuthorityPubkey);

    console.log('📋 Details:');
    console.log('   Old Authority (current):', oldKeypair.publicKey.toString());
    console.log('   New Authority (target):', newAuthority.toString());
    console.log('   Network:', rpcUrl.includes('devnet') ? 'Devnet' : 'Localnet');
    console.log('');

    // Verify old keypair is the current authority
    const [platformPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programPubkey
    );

    const platformAccount = await connection.getAccountInfo(platformPDA);
    if (!platformAccount) {
      console.error('❌ Platform account not found');
      process.exit(1);
    }

    const buffer = Buffer.from(platformAccount.data);
    const currentAuthority = new PublicKey(buffer.slice(8, 40));

    if (!currentAuthority.equals(oldKeypair.publicKey)) {
      console.error('❌ The keypair in SOLANA_PRIVATE_KEY is NOT the current authority!');
      console.error('   Current authority:', currentAuthority.toString());
      console.error('   Your keypair:', oldKeypair.publicKey.toString());
      console.error('');
      console.error('   Make sure SOLANA_PRIVATE_KEY is set to the OLD authority key');
      process.exit(1);
    }

    console.log('✅ Verified: You are the current authority');
    console.log('');

    // Load IDL
    let idl;
    try {
      idl = require('../src/idl/instinct_trading.json');
    } catch (e) {
      console.error('❌ Could not load IDL file');
      console.error('   Make sure src/idl/instinct_trading.json exists');
      console.error('   You may need to copy it from the Solana program:');
      console.error('   cp ../instinctfi-solana/target/idl/instinct_trading.json src/idl/');
      process.exit(1);
    }

    // Create provider and program
    const wallet = new Wallet(oldKeypair);
    const provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    });

    console.log('📝 Transferring authority...');
    console.log('   From:', oldKeypair.publicKey.toString());
    console.log('   To:', newAuthority.toString());
    console.log('');

    try {
      // Build transaction manually to avoid IDL parsing issues
      const { Transaction, SystemProgram } = require('@solana/web3.js');
      const { BN } = require('@coral-xyz/anchor');
      
      // Get the instruction discriminator from IDL
      const transferAuthorityInstruction = idl.instructions.find(
        (ix) => ix.name === 'transfer_authority'
      );
      
      if (!transferAuthorityInstruction) {
        throw new Error('transfer_authority instruction not found in IDL');
      }

      const discriminator = Buffer.from(transferAuthorityInstruction.discriminator);
      const newAuthorityBuffer = newAuthority.toBuffer();
      
      const data = Buffer.concat([discriminator, newAuthorityBuffer]);

      const instruction = {
        programId: programPubkey,
        keys: [
          { pubkey: platformPDA, isSigner: false, isWritable: true },
          { pubkey: oldKeypair.publicKey, isSigner: true, isWritable: false },
        ],
        data: data,
      };

      const transaction = new Transaction().add(instruction);
      transaction.feePayer = oldKeypair.publicKey;
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      // Sign and send
      transaction.sign(oldKeypair);
      const tx = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
      });
      
      // Wait for confirmation
      await connection.confirmTransaction(tx, 'confirmed');

      console.log('✅ Authority transferred successfully!');
      console.log('   Transaction:', tx);
      console.log('   Explorer:', `https://explorer.solana.com/tx/${tx}?cluster=devnet`);
      console.log('');
      console.log('📝 Next steps:');
      console.log('   1. Update SOLANA_PRIVATE_KEY in .env to the NEW key');
      console.log('   2. Restart your backend');
      console.log('   3. Verify with: node scripts/check-platform-status.js');
      
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('unknown instruction')) {
        console.error('❌ transfer_authority instruction not found in program');
        console.error('   The program needs to be upgraded first!');
        console.error('');
        console.error('   Steps:');
        console.error('   1. Build the Solana program: cd ../instinctfi-solana && anchor build');
        console.error('   2. Deploy the upgrade: anchor deploy --provider.cluster devnet');
        console.error('   3. Copy new IDL: cp target/idl/instinct_trading.json ../instinctfi-backend/src/idl/');
        console.error('   4. Run this script again');
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

transferAuthority();

