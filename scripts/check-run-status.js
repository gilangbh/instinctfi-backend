#!/usr/bin/env node

/**
 * Script to check run status on-chain
 * 
 * Usage:
 *   node scripts/check-run-status.js <runId>
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { AnchorProvider, Wallet, BN } = require('@coral-xyz/anchor');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

// Configuration
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || 'devnet';
const SOLANA_PROGRAM_ID = process.env.SOLANA_PROGRAM_ID || '83TVAu61Hv4v7zvPszszYFJLTwARG5LPhoTbGnkEmaQD';

const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
const programId = new PublicKey(SOLANA_PROGRAM_ID);

// PDA helpers
function getRunPDA(runId) {
  const runIdBuf = Buffer.alloc(8);
  new BN(runId).toArrayLike(Buffer, 'le', 8).copy(runIdBuf);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('run'), runIdBuf],
    programId
  );
}

/**
 * Decode run account data
 * Based on the Run struct in lib.rs:
 * - run_id: u64 (8 bytes)
 * - authority: Pubkey (32 bytes)
 * - status: RunStatus enum (1 byte: 0=Waiting, 1=Active, 2=Settled)
 * - total_deposited: u64 (8 bytes)
 * - final_balance: u64 (8 bytes)
 * - platform_fee_amount: u64 (8 bytes)
 * - total_withdrawn: u64 (8 bytes)
 * - withdrawn_count: u16 (2 bytes)
 * - participant_count: u16 (2 bytes)
 * - min_deposit: u64 (8 bytes)
 * - max_deposit: u64 (8 bytes)
 * - max_participants: u16 (2 bytes)
 * - created_at: i64 (8 bytes)
 * - started_at: i64 (8 bytes)
 * - ended_at: i64 (8 bytes)
 * - bump: u8 (1 byte)
 */
function decodeRunAccount(data) {
  const offset = 8; // Skip discriminator
  let pos = offset;
  
  const runId = data.readBigUInt64LE(pos);
  pos += 8;
  
  const authority = new PublicKey(data.slice(pos, pos + 32));
  pos += 32;
  
  const statusByte = data.readUInt8(pos);
  pos += 1;
  let status;
  if (statusByte === 0) status = 'Waiting';
  else if (statusByte === 1) status = 'Active';
  else if (statusByte === 2) status = 'Settled';
  else status = `Unknown(${statusByte})`;
  
  const totalDeposited = data.readBigUInt64LE(pos);
  pos += 8;
  
  const finalBalance = data.readBigUInt64LE(pos);
  pos += 8;
  
  const platformFeeAmount = data.readBigUInt64LE(pos);
  pos += 8;
  
  const totalWithdrawn = data.readBigUInt64LE(pos);
  pos += 8;
  
  const withdrawnCount = data.readUInt16LE(pos);
  pos += 2;
  
  const participantCount = data.readUInt16LE(pos);
  pos += 2;
  
  const minDeposit = data.readBigUInt64LE(pos);
  pos += 8;
  
  const maxDeposit = data.readBigUInt64LE(pos);
  pos += 8;
  
  const maxParticipants = data.readUInt16LE(pos);
  pos += 2;
  
  const createdAt = Number(data.readBigInt64LE(pos));
  pos += 8;
  
  const startedAt = Number(data.readBigInt64LE(pos));
  pos += 8;
  
  const endedAt = Number(data.readBigInt64LE(pos));
  pos += 8;
  
  const bump = data.readUInt8(pos);
  
  return {
    runId: runId.toString(),
    authority: authority.toString(),
    status,
    totalDeposited: Number(totalDeposited),
    finalBalance: Number(finalBalance),
    platformFeeAmount: Number(platformFeeAmount),
    totalWithdrawn: Number(totalWithdrawn),
    withdrawnCount,
    participantCount,
    minDeposit: Number(minDeposit),
    maxDeposit: Number(maxDeposit),
    maxParticipants,
    createdAt: new Date(createdAt * 1000).toISOString(),
    startedAt: startedAt > 0 ? new Date(startedAt * 1000).toISOString() : null,
    endedAt: endedAt > 0 ? new Date(endedAt * 1000).toISOString() : null,
    bump,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const runId = args[0];

  if (!runId) {
    console.error('❌ Please provide a run ID');
    console.error('Usage: node scripts/check-run-status.js <runId>');
    process.exit(1);
  }

  try {
    console.log('🔗 Connecting to Solana...');
    console.log(`   Network: ${SOLANA_NETWORK}`);
    console.log(`   RPC: ${SOLANA_RPC_URL}`);
    console.log(`   Program ID: ${SOLANA_PROGRAM_ID}\n`);

    // Get run from database
    const run = await prisma.run.findUnique({
      where: { id: runId },
    });

    if (!run) {
      console.error(`❌ Run not found in database: ${runId}`);
      process.exit(1);
    }

    console.log(`📋 Run from database: ${run.id}`);
    console.log(`   Status: ${run.status}`);
    console.log(`   Created at: ${run.createdAt}`);
    console.log(`   Started at: ${run.startedAt || 'N/A'}\n`);

    // Calculate numeric run ID (same logic as backend)
    const runNumericId = parseInt(run.id) || new Date(run.createdAt).getTime();
    console.log(`   Numeric Run ID: ${runNumericId}\n`);

    // Get run PDA
    const [runPDA] = getRunPDA(runNumericId);
    console.log(`🔍 Checking run on-chain:`);
    console.log(`   Run PDA: ${runPDA.toString()}`);

    // Check if run exists on-chain
    const runAccount = await connection.getAccountInfo(runPDA);
    if (!runAccount) {
      console.log(`   ❌ Run does NOT exist on-chain`);
      console.log(`\n💡 Solution: Run the sync script to create it:`);
      console.log(`   node scripts/sync-runs-onchain.js ${runId}`);
      process.exit(1);
    }

    console.log(`   ✅ Run exists on-chain`);
    console.log(`   Account size: ${runAccount.data.length} bytes\n`);

    // Decode run account
    const runData = decodeRunAccount(runAccount.data);
    console.log(`📊 Run Account Data:`);
    console.log(`   Run ID: ${runData.runId}`);
    console.log(`   Authority: ${runData.authority}`);
    console.log(`   Status: ${runData.status} ${runData.status === 'Active' ? '✅' : '❌'}`);
    console.log(`   Total Deposited: ${runData.totalDeposited / 1_000_000} USDC`);
    console.log(`   Final Balance: ${runData.finalBalance / 1_000_000} USDC`);
    console.log(`   Participant Count: ${runData.participantCount}`);
    console.log(`   Min Deposit: ${runData.minDeposit / 1_000_000} USDC`);
    console.log(`   Max Deposit: ${runData.maxDeposit / 1_000_000} USDC`);
    console.log(`   Max Participants: ${runData.maxParticipants}`);
    console.log(`   Created At: ${runData.createdAt}`);
    console.log(`   Started At: ${runData.startedAt || 'Not started'}`);
    console.log(`   Ended At: ${runData.endedAt || 'Not ended'}\n`);

    // Check if status matches
    if (runData.status !== 'Active') {
      console.log(`⚠️  WARNING: Run status is "${runData.status}" but needs to be "Active" to record trades!`);
      console.log(`\n💡 Solution: The run needs to be started on-chain.`);
      console.log(`   This should happen automatically when the lobby phase ends.`);
      console.log(`   Check your RunSchedulerService logs for errors.`);
      
      if (run.status === 'ACTIVE' && runData.status === 'Waiting') {
        console.log(`\n   The run is ACTIVE in the database but WAITING on-chain.`);
        console.log(`   This means start_run() was not called successfully.`);
      }
    } else {
      console.log(`✅ Run is Active on-chain - trades can be recorded!`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

