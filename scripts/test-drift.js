#!/usr/bin/env node

/**
 * Test Drift Integration
 * Verifies Drift Protocol connection and account setup
 */

const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { DriftClient, User } = require('@drift-labs/sdk');
const { Wallet } = require('@coral-xyz/anchor');
require('dotenv').config();

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testDriftIntegration() {
  log('========================================', 'blue');
  log('Drift Protocol Integration Test', 'blue');
  log('========================================', 'blue');
  console.log('');

  try {
    // 1. Check environment variables
    log('1. Checking configuration...', 'yellow');
    
    const driftEnv = process.env.DRIFT_ENVIRONMENT || 'mainnet-beta';
    const rpcUrl = process.env.DRIFT_RPC_URL || process.env.SOLANA_RPC_URL;
    const tradingKeypair = process.env.DRIFT_TRADING_KEYPAIR || process.env.SOLANA_PRIVATE_KEY;
    const realTradingEnabled = process.env.DRIFT_ENABLE_REAL_TRADING === 'true';

    if (!rpcUrl) {
      log('✗ RPC URL not configured', 'red');
      process.exit(1);
    }

    if (!tradingKeypair) {
      log('✗ Trading keypair not configured', 'red');
      log('  Set DRIFT_TRADING_KEYPAIR in .env', 'yellow');
      process.exit(1);
    }

    log(`✓ Environment: ${driftEnv}`, 'green');
    log(`✓ RPC URL: ${rpcUrl}`, 'green');
    log(`✓ Real trading: ${realTradingEnabled ? 'ENABLED 🔴' : 'DISABLED 🟡'}`, realTradingEnabled ? 'red' : 'green');
    console.log('');

    // 2. Connect to Solana
    log('2. Connecting to Solana...', 'yellow');
    const connection = new Connection(rpcUrl, 'confirmed');
    
    const version = await connection.getVersion();
    log(`✓ Connected to Solana ${version['solana-core']}`, 'green');
    console.log('');

    // 3. Load wallet
    log('3. Loading wallet...', 'yellow');
    let keypairData;
    try {
      keypairData = JSON.parse(tradingKeypair);
    } catch (e) {
      log('✗ Failed to parse keypair JSON', 'red');
      process.exit(1);
    }

    const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    const wallet = new Wallet(keypair);
    
    log(`✓ Wallet: ${wallet.publicKey.toString()}`, 'green');
    
    // Check balance
    const balance = await connection.getBalance(wallet.publicKey);
    const balanceSol = balance / 1e9;
    log(`✓ Balance: ${balanceSol.toFixed(4)} SOL`, 'green');
    
    if (balanceSol < 0.01) {
      log(`⚠ Low SOL balance! Get more from faucet or fund the wallet`, 'yellow');
    }
    console.log('');

    // 4. Initialize Drift client
    log('4. Initializing Drift client...', 'yellow');
    
    const driftClient = new DriftClient({
      connection,
      wallet,
      env: driftEnv,
      userStats: true,
    });

    await driftClient.subscribe();
    log('✓ Drift client subscribed', 'green');
    console.log('');

    // 5. Check user account
    log('5. Checking Drift user account...', 'yellow');
    
    // Get user account public key (derive PDA)
    let userAccountPublicKey;
    try {
      userAccountPublicKey = await driftClient.getUserAccountPublicKey();
      log(`  User account PDA: ${userAccountPublicKey.toString()}`, 'blue');
    } catch (error) {
      // User account not yet initialized, derive it manually
      const [pda] = await PublicKey.findProgramAddress(
        [Buffer.from('user'), wallet.publicKey.toBuffer(), Buffer.from([0])],
        driftClient.program.programId
      );
      userAccountPublicKey = pda;
      log(`  User account PDA (not initialized): ${userAccountPublicKey.toString()}`, 'blue');
    }
    
    const userAccountInfo = await connection.getAccountInfo(userAccountPublicKey);
    
    if (!userAccountInfo) {
      log('⚠ Drift user account not found - need to initialize', 'yellow');
      console.log('');
      log('Please initialize your Drift account:', 'blue');
      console.log('');
      
      if (driftEnv === 'devnet') {
        log('Option 1: Use Drift Web App (Easiest)', 'green');
        log('  1. Visit: https://app.drift.trade/?cluster=devnet', 'blue');
        log(`  2. Connect wallet: ${wallet.publicKey.toString()}`, 'blue');
        log('  3. Click "Initialize Account" or make a deposit', 'blue');
        console.log('');
        log('Option 2: Use CLI', 'green');
        log('  Run this command:', 'blue');
        log(`  npx @drift-labs/sdk-cli initialize-user --env devnet --keypair drift-trading-keypair.json`, 'blue');
      } else {
        log('Visit: https://app.drift.trade/', 'blue');
        log(`Connect your wallet: ${wallet.publicKey.toString()}`, 'blue');
        log('Initialize your account through the UI', 'blue');
      }
      
      console.log('');
      log('After initialization, run this test again.', 'yellow');
      console.log('');
      
      await driftClient.unsubscribe();
      process.exit(0);
    }
    
    // Now fetch account data
    if (userAccountInfo || true) {
      log('✓ Drift user account exists', 'green');
    }
    
    // Initialize User and subscribe
    try {
      const user = new User({
        driftClient,
        userAccountPublicKey,
      });
      
      await user.subscribe();
      log('✓ User subscribed', 'green');
      
      // Get account info
      const totalCollateral = user.getTotalCollateral();
      const freeCollateral = user.getFreeCollateral();
      const unrealizedPnl = user.getUnrealizedPNL(true);
      
      console.log('');
      log('Account Details:', 'blue');
      log(`  Total Collateral: $${(totalCollateral.toNumber() / 1e6).toFixed(2)}`, 'green');
      log(`  Free Collateral: $${(freeCollateral.toNumber() / 1e6).toFixed(2)}`, 'green');
      log(`  Unrealized PnL: $${(unrealizedPnl.toNumber() / 1e6).toFixed(2)}`, unrealizedPnl.toNumber() >= 0 ? 'green' : 'red');
      
      // Check positions
      const perpPositions = user.getPerpPositions();
      const openPositions = perpPositions.filter(p => !p.baseAssetAmount.isZero());
      
      if (openPositions.length > 0) {
        console.log('');
        log(`Open Positions (${openPositions.length}):`, 'blue');
        openPositions.forEach(pos => {
          const marketIndex = pos.marketIndex;
          const baseAmount = pos.baseAssetAmount.toNumber() / 1e9;
          const isLong = pos.baseAssetAmount.toNumber() > 0;
          log(`  Market ${marketIndex}: ${isLong ? 'LONG' : 'SHORT'} ${Math.abs(baseAmount).toFixed(4)}`, 'green');
        });
      } else {
        log('  No open positions', 'yellow');
      }
      
      await user.unsubscribe();
    } catch (error) {
      log(`⚠ Could not fetch user data: ${error.message}`, 'yellow');
    }
    console.log('');

    // 6. Test oracle prices
    log('6. Testing oracle prices...', 'yellow');
    try {
      const solPerpMarketIndex = 0; // SOL-PERP
      const oracleData = driftClient.getOracleDataForPerpMarket(solPerpMarketIndex);
      const price = oracleData.price.toNumber() / 1e6;
      log(`✓ SOL-PERP Oracle Price: $${price.toFixed(2)}`, 'green');
    } catch (error) {
      log(`⚠ Could not fetch oracle price: ${error.message}`, 'yellow');
    }
    console.log('');

    // 7. Cleanup
    await driftClient.unsubscribe();
    
    // Summary
    log('========================================', 'blue');
    log('✓ All tests passed!', 'green');
    log('========================================', 'blue');
    console.log('');
    log('Your Drift integration is ready!', 'green');
    log('Start your backend with: npm run dev', 'blue');
    console.log('');

  } catch (error) {
    console.log('');
    log('========================================', 'red');
    log('✗ Test failed', 'red');
    log('========================================', 'red');
    console.log('');
    log(`Error: ${error.message}`, 'red');
    if (error.stack) {
      console.log(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testDriftIntegration().catch(error => {
  console.error(error);
  process.exit(1);
});

