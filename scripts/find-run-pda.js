#!/usr/bin/env node

/**
 * Script to find the actual Run PDA on-chain
 * 
 * This helps debug run ID calculation mismatches
 * 
 * Usage:
 *   node scripts/find-run-pda.js <runId> [createdAt]
 * 
 * Examples:
 *   node scripts/find-run-pda.js cmi5u9ugy0000112ugh040st9
 *   node scripts/find-run-pda.js cmi5u9ugy0000112ugh040st9 "2024-01-15T10:30:00Z"
 */

const { PrismaClient } = require('@prisma/client');
const { Connection, PublicKey } = require('@solana/web3.js');
require('dotenv').config();

const prisma = new PrismaClient();

// Configuration
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const SOLANA_PROGRAM_ID = process.env.SOLANA_PROGRAM_ID || '83TVAu61Hv4v7zvPszszYFJLTwARG5LPhoTbGnkEmaQD';

const programId = new PublicKey(SOLANA_PROGRAM_ID);
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

async function findRunPDA(runId, createdAt) {
  console.log('🔍 Finding Run PDA for:');
  console.log(`   Database Run ID: ${runId}`);
  console.log(`   Created At: ${createdAt || 'Not provided'}`);
  console.log(`   Program ID: ${programId.toString()}\n`);

  // Calculate numeric run ID (same as backend/frontend)
  const parsed = parseInt(runId);
  let numericRunId;
  
  if (!isNaN(parsed)) {
    numericRunId = parsed;
    console.log(`   ✅ Parsed as number: ${numericRunId}`);
  } else if (createdAt) {
    const date = new Date(createdAt);
    numericRunId = date.getTime(); // milliseconds
    console.log(`   ✅ Using timestamp (ms): ${numericRunId}`);
    console.log(`   Timestamp (seconds): ${Math.floor(numericRunId / 1000)}`);
  } else {
    console.error('   ❌ Cannot calculate numeric ID without createdAt');
    return;
  }

  // Derive PDA with milliseconds
  const runIdBufferMs = Buffer.alloc(8);
  runIdBufferMs.writeBigUInt64LE(BigInt(numericRunId), 0);
  const [runPDAMs] = PublicKey.findProgramAddressSync(
    [Buffer.from('run'), runIdBufferMs],
    programId
  );

  console.log(`\n📊 Calculated PDAs:`);
  console.log(`   Run PDA (milliseconds): ${runPDAMs.toString()}`);
  console.log(`   Buffer (hex): ${runIdBufferMs.toString('hex')}`);

  // Check if account exists
  const accountInfoMs = await connection.getAccountInfo(runPDAMs);
  if (accountInfoMs) {
    console.log(`   ✅ Account EXISTS at this PDA!`);
    console.log(`   Data length: ${accountInfoMs.data.length} bytes`);
    console.log(`   Owner: ${accountInfoMs.owner.toString()}`);
    console.log(`   Explorer: https://explorer.solana.com/address/${runPDAMs.toString()}?cluster=devnet`);
    return runPDAMs;
  } else {
    console.log(`   ❌ Account NOT FOUND at this PDA`);
  }

  // Try with seconds
  const timestampSec = Math.floor(numericRunId / 1000);
  const runIdBufferSec = Buffer.alloc(8);
  runIdBufferSec.writeBigUInt64LE(BigInt(timestampSec), 0);
  const [runPDASec] = PublicKey.findProgramAddressSync(
    [Buffer.from('run'), runIdBufferSec],
    programId
  );

  console.log(`\n   Run PDA (seconds): ${runPDASec.toString()}`);
  console.log(`   Buffer (hex): ${runIdBufferSec.toString('hex')}`);

  const accountInfoSec = await connection.getAccountInfo(runPDASec);
  if (accountInfoSec) {
    console.log(`   ✅ Account EXISTS at this PDA!`);
    console.log(`   Data length: ${accountInfoSec.data.length} bytes`);
    console.log(`   Owner: ${accountInfoSec.owner.toString()}`);
    console.log(`   Explorer: https://explorer.solana.com/address/${runPDASec.toString()}?cluster=devnet`);
    return runPDASec;
  } else {
    console.log(`   ❌ Account NOT FOUND at this PDA either`);
  }

  console.log(`\n❌ Run account not found with either calculation method.`);
  console.log(`\n💡 Suggestions:`);
  console.log(`   1. Check if the run was actually created on-chain`);
  console.log(`   2. Verify the program ID is correct: ${programId.toString()}`);
  console.log(`   3. Check Solana Explorer for the run manually`);
  
  return null;
}

async function main() {
  const runId = process.argv[2];
  const createdAt = process.argv[3];

  if (!runId) {
    console.error('❌ Usage: node scripts/find-run-pda.js <runId> [createdAt]');
    process.exit(1);
  }

  try {
    // If no createdAt provided, try to get it from database
    let runCreatedAt = createdAt;
    if (!runCreatedAt) {
      const run = await prisma.run.findUnique({
        where: { id: runId },
        select: { createdAt: true }
      });
      
      if (run) {
        runCreatedAt = run.createdAt.toISOString();
        console.log(`   Found in database, createdAt: ${runCreatedAt}`);
      }
    }

    await findRunPDA(runId, runCreatedAt);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

