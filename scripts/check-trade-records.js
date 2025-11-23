#!/usr/bin/env node

/**
 * Script to check if trade records exist on-chain
 * 
 * Usage:
 *   node scripts/check-trade-records.js <runId> [round]
 * 
 * Examples:
 *   node scripts/check-trade-records.js 1234567890        # Check all trades for run (numeric ID)
 *   node scripts/check-trade-records.js cmi5rjojs0006u1udbhi2tt3q  # Check using database ID
 *   node scripts/check-trade-records.js 1234567890 1      # Check specific round
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { BN } = require('@coral-xyz/anchor');
const { PrismaClient } = require('@prisma/client');
const bs58 = require('bs58');
require('dotenv').config();

const prisma = new PrismaClient();

// Configuration
const PROGRAM_ID = process.env.SOLANA_PROGRAM_ID || '83TVAu61Hv4v7zvPszszYFJLTwARG5LPhoTbGnkEmaQD';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const NETWORK = process.env.SOLANA_NETWORK || 'devnet';

// TradeRecord account structure (from lib.rs)
// TradeRecord::LEN = 8 + 8 + 1 + 1 + 8 + 8 + 8 + 1 + 1 + 8 + 1 = 51 bytes
// But Anchor adds 8 bytes discriminator, so total = 59 bytes
const TRADE_RECORD_SIZE = 59;

/**
 * Derive TradeRecord PDA
 */
function getTradeRecordPDA(runId, round, programId) {
  const programIdPubkey = new PublicKey(programId);
  
  // Seeds: ["trade", run_id (8 bytes), round (1 byte)]
  const runIdBuffer = Buffer.alloc(8);
  new BN(runId).toArrayLike(Buffer, 'le', 8).copy(runIdBuffer);
  const roundBuffer = Buffer.from([round]);
  
  const seeds = [
    Buffer.from('trade'),
    runIdBuffer,
    roundBuffer,
  ];
  
  const [pda, bump] = PublicKey.findProgramAddressSync(seeds, programIdPubkey);
  return { pda, bump };
}

/**
 * Decode TradeRecord account data
 */
function decodeTradeRecord(data) {
  // Skip Anchor discriminator (8 bytes)
  const buffer = Buffer.from(data);
  let offset = 8;
  
  // run_id: u64 (8 bytes)
  const runId = new BN(buffer.slice(offset, offset + 8), 'le').toNumber();
  offset += 8;
  
  // round: u8 (1 byte)
  const round = buffer[offset];
  offset += 1;
  
  // direction: TradeDirection enum (1 byte: 0=Long, 1=Short, 2=Skip)
  const directionValue = buffer[offset];
  const direction = directionValue === 0 ? 'Long' : directionValue === 1 ? 'Short' : 'Skip';
  offset += 1;
  
  // entry_price: u64 (8 bytes) - in micro-USDC
  const entryPrice = new BN(buffer.slice(offset, offset + 8), 'le').toNumber();
  offset += 8;
  
  // exit_price: u64 (8 bytes) - in micro-USDC
  const exitPrice = new BN(buffer.slice(offset, offset + 8), 'le').toNumber();
  offset += 8;
  
  // pnl: i64 (8 bytes, signed) - in micro-USDC
  const pnlBuffer = buffer.slice(offset, offset + 8);
  const pnl = new BN(pnlBuffer, 'le', true).toNumber(); // true = signed
  offset += 8;
  
  // leverage: u8 (1 byte) - stored as integer (10 = 1.0x, 20 = 2.0x)
  const leverage = buffer[offset];
  offset += 1;
  
  // position_size_percent: u8 (1 byte)
  const positionSizePercent = buffer[offset];
  offset += 1;
  
  // executed_at: i64 (8 bytes, signed) - Unix timestamp
  const executedAtBuffer = buffer.slice(offset, offset + 8);
  const executedAt = new BN(executedAtBuffer, 'le', true).toNumber();
  offset += 8;
  
  // bump: u8 (1 byte)
  const bump = buffer[offset];
  
  return {
    runId,
    round,
    direction,
    entryPrice: entryPrice / 1e6, // Convert from micro-USDC to USDC
    exitPrice: exitPrice / 1e6, // Convert from micro-USDC to USDC
    pnl: pnl / 1e6, // Convert from micro-USDC to USDC
    leverage: leverage / 10, // Convert from integer to decimal (e.g., 26 = 2.6x)
    positionSizePercent,
    executedAt: new Date(executedAt * 1000).toISOString(),
    bump,
  };
}

/**
 * Check a specific trade record
 */
async function checkTradeRecord(connection, runId, round, programId) {
  try {
    const { pda } = getTradeRecordPDA(runId, round, programId);
    
    console.log(`\n🔍 Checking TradeRecord for Run ${runId}, Round ${round}:`);
    console.log(`   PDA: ${pda.toString()}`);
    
    const accountInfo = await connection.getAccountInfo(pda);
    
    if (!accountInfo) {
      console.log(`   ❌ TradeRecord does NOT exist on-chain`);
      return null;
    }
    
    console.log(`   ✅ TradeRecord exists!`);
    console.log(`   Account size: ${accountInfo.lamports / 1e9} SOL (rent)`);
    
    const tradeData = decodeTradeRecord(accountInfo.data);
    
    console.log(`\n   📊 Trade Details:`);
    console.log(`   Run ID: ${tradeData.runId}`);
    console.log(`   Round: ${tradeData.round}`);
    console.log(`   Direction: ${tradeData.direction}`);
    console.log(`   Entry Price: $${tradeData.entryPrice.toFixed(2)}`);
    console.log(`   Exit Price: ${tradeData.exitPrice > 0 ? '$' + tradeData.exitPrice.toFixed(2) : 'N/A (still open)'}`);
    console.log(`   PnL: ${tradeData.pnl >= 0 ? '+' : ''}${tradeData.pnl.toFixed(2)} USDC`);
    console.log(`   Leverage: ${tradeData.leverage.toFixed(1)}x`);
    console.log(`   Position Size: ${tradeData.positionSizePercent}%`);
    console.log(`   Executed At: ${tradeData.executedAt}`);
    console.log(`   Bump: ${tradeData.bump}`);
    
    // Show Solana Explorer link
    const cluster = NETWORK === 'mainnet-beta' ? 'mainnet' : NETWORK;
    console.log(`\n   🔗 View on Solana Explorer:`);
    console.log(`   https://explorer.solana.com/address/${pda.toString()}?cluster=${cluster}`);
    
    return tradeData;
  } catch (error) {
    console.error(`   ❌ Error checking trade record:`, error.message);
    return null;
  }
}

/**
 * Check all trade records for a run (rounds 1-12)
 */
async function checkAllTradesForRun(connection, runId, programId) {
  console.log(`\n🔍 Checking all trade records for Run ${runId}...\n`);
  
  const trades = [];
  for (let round = 1; round <= 12; round++) {
    const trade = await checkTradeRecord(connection, runId, round, programId);
    if (trade) {
      trades.push(trade);
    }
  }
  
  console.log(`\n📈 Summary:`);
  console.log(`   Total trades found: ${trades.length}/12`);
  
  if (trades.length > 0) {
    console.log(`\n   Trades:`);
    trades.forEach(t => {
      const status = t.exitPrice > 0 ? '✅ Closed' : '⏳ Open';
      console.log(`   Round ${t.round}: ${t.direction} - ${status} - PnL: ${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)} USDC`);
    });
  }
  
  return trades;
}

/**
 * Get numeric run ID from database ID
 * The backend uses parseInt(run.id) || Date.now() to convert database IDs to Solana run IDs
 */
async function getNumericRunId(inputId) {
  // If it's already a number, return it
  const numericId = parseInt(inputId);
  if (!isNaN(numericId)) {
    return numericId;
  }
  
  // If it's a database ID (CUID), look it up in the database
  try {
    const run = await prisma.run.findUnique({
      where: { id: inputId },
      select: { id: true, createdAt: true },
    });
    
    if (!run) {
      throw new Error(`Run not found in database: ${inputId}`);
    }
    
    // The backend uses parseInt(run.id) || Date.now()
    // Since CUIDs can't be parsed, it falls back to Date.now() at creation time
    // Date.now() returns milliseconds, so we use that
    const createdAtTimestamp = new Date(run.createdAt).getTime();
    
    console.log(`📋 Found run in database: ${run.id}`);
    console.log(`   Created at: ${run.createdAt}`);
    console.log(`   Using timestamp (ms) as numeric run ID: ${createdAtTimestamp}`);
    console.log(`   ⚠️  Note: This assumes the run was created at this exact time.`);
    console.log(`   If trades don't appear, check your backend logs for the actual numeric run ID.`);
    
    return createdAtTimestamp;
  } catch (error) {
    // If database lookup fails, try to use a hash of the ID
    console.warn(`⚠️  Could not look up run in database: ${error.message}`);
    console.warn(`   Attempting to use hash of ID as numeric run ID...`);
    
    // Create a numeric ID from the string ID (simple hash)
    let hash = 0;
    for (let i = 0; i < inputId.length; i++) {
      const char = inputId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    const numericId = Math.abs(hash);
    
    console.warn(`   Generated numeric ID: ${numericId}`);
    console.warn(`   ⚠️  This may not match the actual Solana run ID!`);
    console.warn(`   Please use the numeric run ID from your backend logs instead.`);
    
    return numericId;
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node scripts/check-trade-records.js <runId> [round]');
    console.error('');
    console.error('Examples:');
    console.error('  node scripts/check-trade-records.js 1234567890        # Check all trades (numeric ID)');
    console.error('  node scripts/check-trade-records.js cmi5rjojs0006u1udbhi2tt3q  # Check using database ID');
    console.error('  node scripts/check-trade-records.js 1234567890 1      # Check round 1');
    process.exit(1);
  }
  
  const inputId = args[0];
  const round = args[1] ? parseInt(args[1]) : null;
  
  if (round !== null && (isNaN(round) || round < 1 || round > 12)) {
    console.error('Error: round must be a number between 1 and 12');
    process.exit(1);
  }
  
  console.log('🔗 Connecting to Solana...');
  console.log(`   Network: ${NETWORK}`);
  console.log(`   RPC: ${RPC_URL}`);
  console.log(`   Program ID: ${PROGRAM_ID}`);
  
  // Get numeric run ID (from database if needed)
  let runId;
  try {
    runId = await getNumericRunId(inputId);
  } catch (error) {
    console.error(`❌ Error getting numeric run ID: ${error.message}`);
    process.exit(1);
  }
  
  const connection = new Connection(RPC_URL, 'confirmed');
  
  try {
    if (round !== null) {
      // Check specific round
      await checkTradeRecord(connection, runId, round, PROGRAM_ID);
    } else {
      // Check all rounds
      await checkAllTradesForRun(connection, runId, PROGRAM_ID);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

