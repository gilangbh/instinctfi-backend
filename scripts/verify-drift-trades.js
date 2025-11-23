#!/usr/bin/env node

/**
 * Script to verify if trades are actually being executed on Drift Protocol
 * 
 * Usage:
 *   node scripts/verify-drift-trades.js <runId>
 * 
 * Examples:
 *   node scripts/verify-drift-trades.js cmi5rjojs0006u1udbhi2tt3q
 *   node scripts/verify-drift-trades.js 1234567890
 */

const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

// Import DriftIntegrationService to check positions
// We'll need to create a simple version that can check positions
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { 
  DriftClient, 
  User, 
  initialize,
  PositionDirection,
  MarketType,
  BN
} = require('@drift-labs/sdk');
const { Wallet } = require('@coral-xyz/anchor');

// Configuration
const DRIFT_RPC_URL = process.env.DRIFT_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const DRIFT_ENV = process.env.DRIFT_ENVIRONMENT || 'devnet';
const DRIFT_TRADING_KEYPAIR = process.env.DRIFT_TRADING_KEYPAIR;

/**
 * Parse keypair from string (JSON array or base58)
 */
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

/**
 * Get open positions from Drift
 */
async function getDriftPositions() {
  if (!DRIFT_TRADING_KEYPAIR) {
    console.warn('⚠️  DRIFT_TRADING_KEYPAIR not set - cannot check Drift positions');
    return [];
  }

  try {
    const connection = new Connection(DRIFT_RPC_URL, 'confirmed');
    const keypair = parseKeypair(DRIFT_TRADING_KEYPAIR);
    const wallet = new Wallet(keypair);

    console.log('🔗 Connecting to Drift Protocol...');
    console.log(`   Wallet: ${wallet.publicKey.toString()}`);
    console.log(`   Environment: ${DRIFT_ENV}`);

    // Initialize Drift client
    const driftClient = new DriftClient({
      connection,
      wallet,
      env: DRIFT_ENV,
    });

    await driftClient.subscribe();

    // Get user account
    const user = new User({
      driftClient,
      userAccountPublicKey: await driftClient.getUserAccountPublicKey(),
    });

    await user.subscribe();

    // Get user account
    const userAccount = user.getUserAccount();
    if (!userAccount) {
      console.log('   No user account found');
      return [];
    }

    // Get all perp positions
    const perpPositions = userAccount.perpPositions || [];
    
    const positions = [];
    for (const pos of perpPositions) {
      // Skip closed positions
      if (!pos.baseAssetAmount || pos.baseAssetAmount.isZero()) {
        continue;
      }

      try {
        const marketIndex = pos.marketIndex;
        const market = driftClient.getPerpMarketAccount(marketIndex);
        const oraclePrice = driftClient.getOracleDataForPerpMarket(marketIndex);
        
        const baseAmount = pos.baseAssetAmount ? pos.baseAssetAmount.abs().toNumber() / 1e9 : 0;
        const entryPrice = pos.entryPrice ? pos.entryPrice.toNumber() / 1e6 : 0;
        const currentPrice = oraclePrice?.price ? oraclePrice.price.toNumber() / 1e6 : 0;
        const unrealizedPnl = pos.unrealizedPnl ? pos.unrealizedPnl.toNumber() / 1e6 : 0;
        const leverage = pos.leverage ? pos.leverage.toNumber() / 10 : 0;
        
        positions.push({
          marketIndex,
          marketName: market?.name || `Market ${marketIndex}`,
          direction: pos.baseAssetAmount.gt(new BN(0)) ? 'LONG' : 'SHORT',
          baseAssetAmount: baseAmount,
          entryPrice,
          currentPrice,
          unrealizedPnl,
          leverage,
        });
      } catch (error) {
        console.warn(`   Warning: Could not process position at market ${pos.marketIndex}:`, error.message);
        continue;
      }
    }

    return positions;
  } catch (error) {
    console.error('❌ Error fetching Drift positions:', error.message);
    if (error.stack) {
      console.error('   Stack:', error.stack.split('\n').slice(0, 3).join('\n'));
    }
    console.error('   This might indicate:');
    console.error('   - Drift SDK initialization issue');
    console.error('   - User account not found');
    console.error('   - Network/RPC connection problem');
    return [];
  }
}

/**
 * Get numeric run ID from database ID
 */
async function getNumericRunId(inputId) {
  const numericId = parseInt(inputId);
  if (!isNaN(numericId)) {
    return numericId;
  }

  try {
    const run = await prisma.run.findUnique({
      where: { id: inputId },
      select: { id: true, createdAt: true },
    });

    if (!run) {
      throw new Error(`Run not found: ${inputId}`);
    }

    return new Date(run.createdAt).getTime();
  } catch (error) {
    throw new Error(`Could not get numeric run ID: ${error.message}`);
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node scripts/verify-drift-trades.js <runId>');
    console.error('');
    console.error('Examples:');
    console.error('  node scripts/verify-drift-trades.js cmi5rjojs0006u1udbhi2tt3q');
    console.error('  node scripts/verify-drift-trades.js 1234567890');
    process.exit(1);
  }

  const inputId = args[0];

  try {
    console.log('📊 Verifying Drift trades for run...\n');

    // Get run from database
    const run = await prisma.run.findUnique({
      where: { id: inputId },
      include: {
        trades: {
          orderBy: { round: 'asc' },
        },
        votingRounds: {
          orderBy: { round: 'asc' },
        },
      },
    });

    if (!run) {
      console.error(`❌ Run not found: ${inputId}`);
      process.exit(1);
    }

    console.log(`📋 Run Information:`);
    console.log(`   ID: ${run.id}`);
    console.log(`   Status: ${run.status}`);
    console.log(`   Trading Pair: ${run.tradingPair}`);
    console.log(`   Total Rounds: ${run.totalRounds}`);
    console.log(`   Current Round: ${run.currentRound}`);
    console.log(`   Total Pool: ${run.totalPool / 100} USDC`);
    console.log(`   Created: ${run.createdAt}`);
    console.log('');

    // Get trades from database
    console.log(`📈 Database Trades (${run.trades.length} total):`);
    console.log('─'.repeat(80));
    
    if (run.trades.length === 0) {
      console.log('   No trades found in database');
    } else {
      run.trades.forEach((trade, index) => {
        const status = trade.exitPrice ? '✅ Closed' : '⏳ Open';
        const pnl = trade.pnl ? (trade.pnl >= 0 ? '+' : '') + (trade.pnl / 100).toFixed(2) : '0.00';
        
        console.log(`   Round ${trade.round}: ${trade.direction} - ${status}`);
        console.log(`      Entry: $${(trade.entryPrice / 100).toFixed(2)}`);
        if (trade.exitPrice) {
          console.log(`      Exit: $${(trade.exitPrice / 100).toFixed(2)}`);
        } else {
          console.log(`      Exit: N/A (still open)`);
        }
        console.log(`      PnL: ${pnl} USDC`);
        console.log(`      Leverage: ${(trade.leverage / 10).toFixed(1)}x`);
        console.log(`      Position Size: ${trade.positionSizePercent}%`);
        console.log(`      Executed: ${trade.executedAt}`);
        console.log('');
      });
    }

    // Get positions from Drift
    console.log(`🔍 Drift Protocol Positions:`);
    console.log('─'.repeat(80));
    
    const driftPositions = await getDriftPositions();
    
    if (driftPositions.length === 0) {
      console.log('   No open positions found on Drift Protocol');
      console.log('');
      console.log('   Possible reasons:');
      console.log('   - All positions have been closed');
      console.log('   - DRIFT_TRADING_KEYPAIR is not configured');
      console.log('   - Trades are not being executed on Drift');
      console.log('   - Using mock/fallback trading mode');
    } else {
      console.log(`   Found ${driftPositions.length} open position(s) on Drift:`);
      console.log('');
      
      driftPositions.forEach((pos, index) => {
        console.log(`   Position ${index + 1}:`);
        console.log(`      Market: ${pos.marketName} (Index: ${pos.marketIndex})`);
        console.log(`      Direction: ${pos.direction}`);
        console.log(`      Size: ${pos.baseAssetAmount.toFixed(4)} ${pos.marketName.includes('SOL') ? 'SOL' : 'base asset'}`);
        console.log(`      Entry Price: $${pos.entryPrice.toFixed(2)}`);
        console.log(`      Current Price: $${pos.currentPrice.toFixed(2)}`);
        console.log(`      Unrealized PnL: ${pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)} USDC`);
        console.log(`      Leverage: ${pos.leverage.toFixed(1)}x`);
        console.log('');
      });
    }

    // Compare database trades with Drift positions
    console.log(`🔗 Verification Summary:`);
    console.log('─'.repeat(80));
    
    // Filter out SKIP trades (they don't create positions on Drift)
    const openTrades = run.trades.filter(t => !t.exitPrice && t.direction !== 'SKIP');
    const skipTrades = run.trades.filter(t => !t.exitPrice && t.direction === 'SKIP');
    const openDriftPositions = driftPositions.length;
    
    console.log(`   Database open trades (excluding SKIP): ${openTrades.length}`);
    if (skipTrades.length > 0) {
      console.log(`   SKIP trades (no position expected): ${skipTrades.length}`);
    }
    console.log(`   Drift open positions: ${openDriftPositions}`);
    console.log('');

    if (openTrades.length === 0 && openDriftPositions === 0) {
      if (skipTrades.length > 0) {
        console.log('   ✅ Only SKIP trades - no positions expected on Drift');
      } else {
        console.log('   ✅ No open positions - all trades are closed');
      }
    } else if (openTrades.length > 0 && openDriftPositions === 0) {
      console.log('   ⚠️  WARNING: Database shows open trades but Drift has no positions!');
      console.log('      This suggests trades are NOT being executed on Drift Protocol.');
      console.log('      Possible reasons:');
      console.log('      - DRIFT_ENABLE_REAL_TRADING is false');
      console.log('      - Trading failed silently');
      console.log('      - Using mock/fallback trading mode');
      console.log('      - Check backend logs for trade execution errors');
    } else if (openTrades.length === 0 && openDriftPositions > 0) {
      console.log('   ⚠️  WARNING: Drift has open positions but database shows no open trades!');
      console.log('      This suggests a data sync issue.');
    } else {
      console.log('   ✅ Open trades match open positions');
      console.log('      Verifying details...');
      
      // Try to match trades with positions
      if (openTrades.length === 1 && openDriftPositions === 1) {
        const trade = openTrades[0];
        const pos = driftPositions[0];
        
        const directionMatch = (
          (trade.direction === 'LONG' && pos.direction === 'LONG') ||
          (trade.direction === 'SHORT' && pos.direction === 'SHORT')
        );
        
        const priceMatch = Math.abs((trade.entryPrice / 100) - pos.entryPrice) < 1.0; // Within $1
        
        console.log(`      Round ${trade.round}:`);
        console.log(`         Direction match: ${directionMatch ? '✅' : '❌'}`);
        console.log(`         Entry price match: ${priceMatch ? '✅' : '❌'} (DB: $${(trade.entryPrice / 100).toFixed(2)}, Drift: $${pos.entryPrice.toFixed(2)})`);
        
        if (directionMatch && priceMatch) {
          console.log('      ✅ Trade verified on Drift Protocol!');
        } else {
          console.log('      ⚠️  Trade details do not match exactly');
        }
      } else if (openTrades.length > 1 || openDriftPositions > 1) {
        console.log(`   ⚠️  Multiple positions detected - manual verification recommended`);
        console.log(`      Database: ${openTrades.length} trades, Drift: ${openDriftPositions} positions`);
      }
    }

    // Check if real trading is enabled
    console.log('');
    console.log(`⚙️  Configuration Check:`);
    console.log('─'.repeat(80));
    const realTradingEnabled = process.env.DRIFT_ENABLE_REAL_TRADING === 'true';
    console.log(`   DRIFT_ENABLE_REAL_TRADING: ${realTradingEnabled ? '✅ true' : '❌ false'}`);
    if (!realTradingEnabled) {
      console.log('   ⚠️  Real trading is DISABLED - trades are using mock/fallback mode');
    }
    
    if (!DRIFT_TRADING_KEYPAIR) {
      console.log('   ⚠️  DRIFT_TRADING_KEYPAIR: Not set');
    } else {
      console.log('   ✅ DRIFT_TRADING_KEYPAIR: Set');
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

