#!/usr/bin/env node

/**
 * Script to investigate why all trades are SKIP
 * 
 * Usage:
 *   node scripts/check-why-skip.js <runId>
 */

const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node scripts/check-why-skip.js <runId>');
    process.exit(1);
  }

  const runId = args[0];

  try {
    console.log('🔍 Investigating why trades are SKIP for run:', runId);
    console.log('');

    // Get run with voting rounds and trades
    const run = await prisma.run.findUnique({
      where: { id: runId },
      include: {
        votingRounds: {
          orderBy: { round: 'asc' },
        },
        trades: {
          orderBy: { round: 'asc' },
        },
      },
    });

    if (!run) {
      console.error(`❌ Run not found: ${runId}`);
      process.exit(1);
    }

    console.log(`📋 Run: ${run.id}`);
    console.log(`   Status: ${run.status}`);
    console.log(`   Trading Pair: ${run.tradingPair}`);
    console.log(`   Total Rounds: ${run.totalRounds}`);
    console.log('');

    // Check each voting round
    console.log('📊 Voting Analysis:');
    console.log('─'.repeat(80));

    for (const votingRound of run.votingRounds) {
      // Get votes for this round
      const votes = await prisma.vote.findMany({
        where: {
          runId: runId,
          round: votingRound.round,
        },
        select: {
          choice: true,
          userId: true,
        },
      });
      
      const voteDistribution = {
        long: votes.filter(v => v.choice === 'LONG').length,
        short: votes.filter(v => v.choice === 'SHORT').length,
        skip: votes.filter(v => v.choice === 'SKIP').length,
      };

      const totalVotes = voteDistribution.long + voteDistribution.short + voteDistribution.skip;
      
      // Determine what direction should have been executed
      let expectedDirection = 'SKIP';
      if (voteDistribution.long > voteDistribution.short && voteDistribution.long > voteDistribution.skip) {
        expectedDirection = 'LONG';
      } else if (voteDistribution.short > voteDistribution.long && voteDistribution.short > voteDistribution.skip) {
        expectedDirection = 'SHORT';
      }

      const trade = run.trades.find(t => t.round === votingRound.round);
      const actualDirection = trade?.direction || 'N/A';

      console.log(`Round ${votingRound.round}:`);
      console.log(`   Votes: LONG=${voteDistribution.long}, SHORT=${voteDistribution.short}, SKIP=${voteDistribution.skip} (Total: ${totalVotes})`);
      console.log(`   Expected Direction: ${expectedDirection} (based on majority vote)`);
      console.log(`   Actual Direction: ${actualDirection}`);
      
      if (expectedDirection !== actualDirection) {
        console.log(`   ⚠️  MISMATCH: Expected ${expectedDirection} but got ${actualDirection}`);
        if (expectedDirection !== 'SKIP' && actualDirection === 'SKIP') {
          console.log(`   🔍 Possible reasons:`);
          console.log(`      - DEX trade failed and fell back to SKIP`);
          console.log(`      - Drift service was unavailable`);
          console.log(`      - Trade execution error occurred`);
        }
      } else if (expectedDirection === 'SKIP' && actualDirection === 'SKIP') {
        console.log(`   ✅ SKIP is correct - majority voted SKIP`);
      }
      console.log('');
    }

    // Check configuration
    console.log('⚙️  Configuration:');
    console.log('─'.repeat(80));
    const realTradingEnabled = process.env.DRIFT_ENABLE_REAL_TRADING === 'true';
    console.log(`   DRIFT_ENABLE_REAL_TRADING: ${realTradingEnabled ? '✅ true' : '❌ false'}`);
    
    if (!realTradingEnabled) {
      console.log('   ⚠️  Real trading is DISABLED - all trades will be SKIP (mock mode)');
    }

    const driftKeypair = process.env.DRIFT_TRADING_KEYPAIR;
    console.log(`   DRIFT_TRADING_KEYPAIR: ${driftKeypair ? '✅ Set' : '❌ Not set'}`);

    const driftRpc = process.env.DRIFT_RPC_URL || process.env.SOLANA_RPC_URL;
    console.log(`   RPC URL: ${driftRpc || 'Not set'}`);

    // Summary
    console.log('');
    console.log('📝 Summary:');
    console.log('─'.repeat(80));
    
    const skipTrades = run.trades.filter(t => t.direction === 'SKIP').length;
    const longTrades = run.trades.filter(t => t.direction === 'LONG').length;
    const shortTrades = run.trades.filter(t => t.direction === 'SHORT').length;
    
    console.log(`   Total Trades: ${run.trades.length}`);
    console.log(`   SKIP: ${skipTrades}`);
    console.log(`   LONG: ${longTrades}`);
    console.log(`   SHORT: ${shortTrades}`);

    if (skipTrades === run.trades.length) {
      console.log('');
      console.log('   ⚠️  ALL trades are SKIP. Possible causes:');
      console.log('   1. Users voted SKIP for all rounds (check voting analysis above)');
      console.log('   2. DEX trades failed and fell back to SKIP (check backend logs)');
      console.log('   3. Drift service was unavailable during run execution');
      console.log('   4. DRIFT_ENABLE_REAL_TRADING is false (mock mode)');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

