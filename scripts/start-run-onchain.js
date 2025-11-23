#!/usr/bin/env node

/**
 * Script to manually start a run on-chain
 * 
 * This script will call start_run() to change the run status from Waiting to Active.
 * 
 * Note: The start_run instruction requires participant_count > 0.
 * If the run has 0 participants on-chain, this will fail.
 * 
 * Usage:
 *   node scripts/start-run-onchain.js <runId>
 */

const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } = require('@solana/web3.js');
const { AnchorProvider, Wallet, BN } = require('@coral-xyz/anchor');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

// Configuration
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || 'devnet';
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
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  } catch {
    const bs58 = require('bs58');
    const decoded = bs58.decode(keypairStr);
    return Keypair.fromSecretKey(decoded);
  }
}

// Initialize Solana connection
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
const keypair = parseKeypair(SOLANA_PRIVATE_KEY);
const wallet = new Wallet(keypair);
const provider = new AnchorProvider(connection, wallet, {
  commitment: 'confirmed',
  preflightCommitment: 'confirmed',
});
const programId = new PublicKey(SOLANA_PROGRAM_ID);

// PDA helpers
function getPlatformPDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('platform')],
    programId
  );
}

function getRunPDA(runId) {
  const runIdBuf = Buffer.alloc(8);
  new BN(runId).toArrayLike(Buffer, 'le', 8).copy(runIdBuf);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('run'), runIdBuf],
    programId
  );
}

/**
 * Decode run status from account data
 */
function getRunStatus(data) {
  const offset = 8; // Skip discriminator
  let pos = offset + 8; // Skip run_id (u64)
  pos += 32; // Skip authority (Pubkey)
  const statusByte = data.readUInt8(pos);
  if (statusByte === 0) return 'Waiting';
  if (statusByte === 1) return 'Active';
  if (statusByte === 2) return 'Settled';
  return `Unknown(${statusByte})`;
}

function getParticipantCount(data) {
  const offset = 8; // Skip discriminator
  let pos = offset + 8; // Skip run_id (u64)
  pos += 32; // Skip authority (Pubkey)
  pos += 1; // Skip status
  pos += 8; // Skip total_deposited (u64)
  pos += 8; // Skip final_balance (u64)
  pos += 8; // Skip platform_fee_amount (u64)
  pos += 8; // Skip total_withdrawn (u64)
  pos += 2; // Skip withdrawn_count (u16)
  const participantCount = data.readUInt16LE(pos);
  return participantCount;
}

async function main() {
  const args = process.argv.slice(2);
  const runId = args[0];

  if (!runId) {
    console.error('❌ Please provide a run ID');
    console.error('Usage: node scripts/start-run-onchain.js <runId>');
    process.exit(1);
  }

  try {
    console.log('🔗 Connecting to Solana...');
    console.log(`   Network: ${SOLANA_NETWORK}`);
    console.log(`   RPC: ${SOLANA_RPC_URL}`);
    console.log(`   Program ID: ${SOLANA_PROGRAM_ID}`);
    console.log(`   Wallet: ${wallet.publicKey.toString()}\n`);

    // Get run from database
    const run = await prisma.run.findUnique({
      where: { id: runId },
      include: {
        participants: true,
      },
    });

    if (!run) {
      console.error(`❌ Run not found in database: ${runId}`);
      process.exit(1);
    }

    console.log(`📋 Run from database: ${run.id}`);
    console.log(`   Status: ${run.status}`);
    console.log(`   Participants (DB): ${run.participants?.length || 0}`);
    console.log(`   Created at: ${run.createdAt}`);
    console.log(`   Started at: ${run.startedAt || 'N/A'}\n`);

    // Calculate numeric run ID (same logic as backend)
    const runNumericId = parseInt(run.id) || new Date(run.createdAt).getTime();
    console.log(`   Numeric Run ID: ${runNumericId}\n`);

    // Get PDAs
    const [platformPDA] = getPlatformPDA();
    const [runPDA] = getRunPDA(runNumericId);

    console.log(`🔍 Checking run on-chain:`);
    console.log(`   Platform PDA: ${platformPDA.toString()}`);
    console.log(`   Run PDA: ${runPDA.toString()}`);

    // Check if platform exists
    const platformAccount = await connection.getAccountInfo(platformPDA);
    if (!platformAccount) {
      console.error(`\n❌ Platform account does not exist!`);
      console.error(`   Please run: node scripts/init-platform.js`);
      process.exit(1);
    }
    console.log(`   ✅ Platform account exists`);

    // Check if run exists
    const runAccount = await connection.getAccountInfo(runPDA);
    if (!runAccount) {
      console.error(`\n❌ Run account does not exist on-chain!`);
      console.error(`   Please run: node scripts/sync-runs-onchain.js ${runId}`);
      process.exit(1);
    }
    console.log(`   ✅ Run account exists`);

    // Check current status
    const currentStatus = getRunStatus(runAccount.data);
    const participantCount = getParticipantCount(runAccount.data);

    console.log(`   Current Status: ${currentStatus}`);
    console.log(`   Participant Count (on-chain): ${participantCount}\n`);

    if (currentStatus === 'Active') {
      console.log(`✅ Run is already Active on-chain!`);
      process.exit(0);
    }

    if (currentStatus !== 'Waiting') {
      console.error(`❌ Run status is "${currentStatus}", cannot start.`);
      console.error(`   Only runs with status "Waiting" can be started.`);
      process.exit(1);
    }

    if (participantCount === 0) {
      console.error(`❌ Run has 0 participants on-chain!`);
      console.error(`   The start_run instruction requires participant_count > 0.`);
      console.error(`\n💡 This means users have not deposited on-chain.`);
      console.error(`   The run has ${run.participants?.length || 0} participants in the database,`);
      console.error(`   but 0 participants on-chain.`);
      console.error(`\n   Possible causes:`);
      console.error(`   1. Users are depositing only in the database, not on-chain`);
      console.error(`   2. The deposit() instruction is not being called`);
      console.error(`   3. The numeric run ID mismatch between DB and on-chain`);
      console.error(`\n   For now, you can modify the Solana program to allow starting with 0 participants,`);
      console.error(`   or ensure deposits happen on-chain before starting.`);
      process.exit(1);
    }

    // Build instruction
    // Discriminator for start_run: [72, 212, 1, 91, 61, 186, 2, 52]
    const discriminator = Buffer.from([72, 212, 1, 91, 61, 186, 2, 52]);
    const runIdBuf = Buffer.alloc(8);
    new BN(runNumericId).toArrayLike(Buffer, 'le', 8).copy(runIdBuf);

    const data = Buffer.concat([discriminator, runIdBuf]);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: platformPDA, isSigner: false, isWritable: false },
        { pubkey: runPDA, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
      ],
      programId,
      data,
    });

    // Check wallet balance
    const balance = await connection.getBalance(wallet.publicKey);
    console.log(`💰 Wallet balance: ${balance / 1e9} SOL`);
    if (balance < 0.001 * 1e9) {
      console.warn(`   ⚠️  Low wallet balance! May not have enough for transaction fees.`);
    }

    console.log(`\n📝 Starting run on-chain...`);
    const tx = new Transaction().add(instruction);
    const signature = await provider.sendAndConfirm(tx, [], {
      commitment: 'confirmed',
      skipPreflight: false,
    });

    console.log(`\n✅ Run started on-chain successfully!`);
    console.log(`   Transaction: ${signature}`);
    console.log(`   View on Solana Explorer: https://explorer.solana.com/tx/${signature}?cluster=${SOLANA_NETWORK}`);

    // Verify status changed
    const updatedRunAccount = await connection.getAccountInfo(runPDA);
    if (updatedRunAccount) {
      const newStatus = getRunStatus(updatedRunAccount.data);
      console.log(`\n   New Status: ${newStatus}`);
      if (newStatus === 'Active') {
        console.log(`   ✅ Status successfully changed to Active!`);
      }
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.logs) {
      console.error('\nTransaction logs:');
      error.logs.forEach(log => console.error(`   ${log}`));
    }
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

