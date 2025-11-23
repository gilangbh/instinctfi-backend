#!/usr/bin/env node

/**
 * Script to list all Run accounts on-chain for a program
 * 
 * This helps find runs that exist on-chain but we can't find by ID
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { AnchorProvider, Wallet, BN } = require('@coral-xyz/anchor');
require('dotenv').config();

// Configuration
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const SOLANA_PROGRAM_ID = process.env.SOLANA_PROGRAM_ID || '83TVAu61Hv4v7zvPszszYFJLTwARG5LPhoTbGnkEmaQD';
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
const programId = new PublicKey(SOLANA_PROGRAM_ID);

async function listAllRuns() {
  console.log('🔍 Searching for all Run accounts on-chain...');
  console.log(`   Program ID: ${programId.toString()}\n`);

  try {
    // Get all program accounts
    const accounts = await connection.getProgramAccounts(programId, {
      filters: [
        {
          memcmp: {
            offset: 0, // Discriminator is at offset 0
            bytes: Buffer.from([0x8a, 0x8b, 0x8c, 0x8d, 0x8e, 0x8f, 0x90, 0x91]) // Run account discriminator
          }
        }
      ]
    });

    console.log(`✅ Found ${accounts.length} Run account(s) on-chain:\n`);

    if (accounts.length === 0) {
      console.log('   No runs found. The program may not have any runs created yet.');
      return;
    }

    // Try to decode run accounts
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      console.log(`Run #${i + 1}:`);
      console.log(`   PDA: ${account.pubkey.toString()}`);
      console.log(`   Data length: ${account.account.data.length} bytes`);
      console.log(`   Explorer: https://explorer.solana.com/address/${account.pubkey.toString()}?cluster=devnet`);
      
      // Try to extract run_id from the account data
      // Run account structure: discriminator (8) + run_id (8) + ...
      if (account.account.data.length >= 16) {
        const runIdBuffer = account.account.data.slice(8, 16);
        const runId = runIdBuffer.readBigUInt64LE(0);
        console.log(`   Run ID (u64): ${runId.toString()}`);
        console.log(`   Run ID (hex): 0x${runIdBuffer.toString('hex')}`);
        
        // Try to interpret as timestamp
        const asTimestampMs = Number(runId);
        const asTimestampSec = Number(runId) * 1000;
        const dateMs = new Date(asTimestampMs);
        const dateSec = new Date(asTimestampSec);
        
        console.log(`   As timestamp (ms): ${asTimestampMs} = ${dateMs.toISOString()}`);
        console.log(`   As timestamp (sec): ${asTimestampSec} = ${dateSec.toISOString()}`);
      }
      console.log('');
    }

    // Also try to find by searching for accounts with "run" seed
    console.log('\n🔍 Alternative: Searching by PDA derivation...\n');
    
    // Try a few common run IDs to see if we can find matches
    const testRunIds = [
      1, 2, 3, 100, 1000,
      Math.floor(Date.now() / 1000), // Current timestamp in seconds
      Date.now(), // Current timestamp in milliseconds
    ];

    for (const testId of testRunIds) {
      const runIdBuffer = Buffer.alloc(8);
      runIdBuffer.writeBigUInt64LE(BigInt(testId), 0);
      const [runPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('run'), runIdBuffer],
        programId
      );
      
      const accountInfo = await connection.getAccountInfo(runPDA);
      if (accountInfo) {
        console.log(`✅ Found run with ID ${testId}: ${runPDA.toString()}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

listAllRuns();

