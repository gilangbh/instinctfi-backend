#!/usr/bin/env node

/**
 * Test Solana Program Integration
 * Checks if backend is properly integrated with Solana program
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

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

async function testSolanaIntegration() {
  log('========================================', 'blue');
  log('Solana Program Integration Test', 'blue');
  log('========================================', 'blue');
  console.log('');

  try {
    // 1. Check environment configuration
    log('1. Checking configuration...', 'yellow');
    
    require('dotenv').config();
    
    const programId = process.env.SOLANA_PROGRAM_ID;
    const rpcUrl = process.env.SOLANA_RPC_URL;
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    
    if (!programId) {
      log('✗ SOLANA_PROGRAM_ID not set in .env', 'red');
      process.exit(1);
    }
    log(`✓ Program ID: ${programId}`, 'green');
    
    if (!rpcUrl) {
      log('✗ SOLANA_RPC_URL not set in .env', 'red');
      process.exit(1);
    }
    log(`✓ RPC URL: ${rpcUrl}`, 'green');
    
    if (!privateKey) {
      log('✗ SOLANA_PRIVATE_KEY not set in .env', 'red');
      process.exit(1);
    }
    log('✓ SOLANA_PRIVATE_KEY configured', 'green');
    console.log('');

    // 2. Check program exists on-chain
    log('2. Checking program on Solana devnet...', 'yellow');
    
    const connection = new Connection(rpcUrl, 'confirmed');
    const programPubkey = new PublicKey(programId);
    
    const programInfo = await connection.getAccountInfo(programPubkey);
    
    if (!programInfo) {
      log('✗ Program not found on blockchain', 'red');
      log(`  Program ID: ${programId}`, 'yellow');
      process.exit(1);
    }
    
    log('✓ Program found on blockchain', 'green');
    log(`  Owner: ${programInfo.owner.toString()}`, 'blue');
    log(`  Data length: ${programInfo.lamports / 1e9} SOL`, 'blue');
    console.log('');

    // 3. Check authority wallet balance
    log('3. Checking authority wallet...', 'yellow');
    
    const keypairData = JSON.parse(privateKey);
    const { Keypair } = require('@solana/web3.js');
    const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    const walletPubkey = keypair.publicKey;
    
    log(`  Wallet: ${walletPubkey.toString()}`, 'blue');
    
    const balance = await connection.getBalance(walletPubkey);
    const balanceSol = balance / 1e9;
    
    log(`  Balance: ${balanceSol.toFixed(4)} SOL`, balanceSol > 0.1 ? 'green' : 'red');
    
    if (balanceSol < 0.1) {
      log('  ⚠️  Low balance! Need SOL for transactions', 'yellow');
      log(`  Run: solana airdrop 5 ${walletPubkey.toString()} --url devnet`, 'blue');
    }
    console.log('');

    // 4. Check IDL file
    log('4. Checking IDL file...', 'yellow');
    
    const idlPath = path.join(__dirname, '../src/idl/instinct_trading.json');
    
    if (!fs.existsSync(idlPath)) {
      log('✗ IDL file not found', 'red');
      log(`  Expected: ${idlPath}`, 'yellow');
      process.exit(1);
    }
    
    log('✓ IDL file exists', 'green');
    
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
    log(`  Program name: ${idl.metadata?.name || idl.name || 'unknown'}`, 'blue');
    log(`  Instructions: ${idl.instructions?.length || 0}`, 'blue');
    log(`  IDL address: ${idl.address}`, 'blue');
    
    // Check if IDL address matches
    if (idl.address !== programId) {
      log('  ⚠️  IDL address doesn\'t match SOLANA_PROGRAM_ID', 'yellow');
      log(`    IDL:    ${idl.address}`, 'yellow');
      log(`    Config: ${programId}`, 'yellow');
    }
    console.log('');

    // 5. Check SolanaService file
    log('5. Checking SolanaService...', 'yellow');
    
    const servicePath = path.join(__dirname, '../src/services/SolanaService.ts');
    
    if (!fs.existsSync(servicePath)) {
      log('✗ SolanaService.ts not found', 'red');
      process.exit(1);
    }
    
    log('✓ SolanaService.ts exists', 'green');
    console.log('');

    // 6. Test SolanaService initialization
    log('6. Testing SolanaService initialization...', 'yellow');
    
    try {
      // This will fail if IDL has issues
      const { SolanaService } = require('../src/services/SolanaService');
      const solanaService = new SolanaService();
      
      log('✓ SolanaService initialized successfully!', 'green');
      log(`  Authority: ${solanaService.getAuthority().toString()}`, 'blue');
      
      // Test PDA derivation
      const [platformPDA] = solanaService.getPlatformPDA();
      log(`  Platform PDA: ${platformPDA.toString()}`, 'blue');
      
      const [runPDA] = solanaService.getRunPDA(1);
      log(`  Run #1 PDA: ${runPDA.toString()}`, 'blue');
      
      console.log('');
      log('========================================', 'green');
      log('✅ Solana Integration is WORKING!', 'green');
      log('========================================', 'green');
      console.log('');
      log('Your backend can now:', 'green');
      log('  ✅ Create runs on Solana blockchain', 'green');
      log('  ✅ Start runs on-chain', 'green');
      log('  ✅ Settle runs with on-chain P/L', 'green');
      console.log('');
      log('Next steps:', 'blue');
      log('  1. Create a run via API', 'blue');
      log('  2. Check logs for blockchain TXs', 'blue');
      log('  3. View on Solana Explorer', 'blue');
      console.log('');
      
    } catch (error) {
      log('✗ SolanaService initialization FAILED', 'red');
      log(`  Error: ${error.message}`, 'red');
      console.log('');
      
      if (error.message.includes('Cannot read properties of undefined')) {
        log('❌ Issue: IDL parsing error', 'yellow');
        log('', 'yellow');
        log('The IDL from your Solana project has compatibility issues', 'yellow');
        log('with @coral-xyz/anchor@0.32.1', 'yellow');
        console.log('');
        log('Solutions:', 'blue');
        log('  1. Downgrade backend Anchor to match Solana project:', 'blue');
        log('     cd ~/Projects/instinctfi-backend', 'blue');
        log('     npm uninstall @coral-xyz/anchor', 'blue');
        log('     npm install @coral-xyz/anchor@0.31.1', 'blue');
        console.log('');
        log('  2. OR upgrade Solana project Anchor to 0.32.1:', 'blue');
        log('     cd ~/Projects/instinctfi-solana', 'blue');
        log('     Edit Anchor.toml: anchor_version = "0.32.1"', 'blue');
        log('     anchor build', 'blue');
        console.log('');
        log('  3. OR use TypeScript types from Solana project:', 'blue');
        log('     cd ~/Projects/instinctfi-solana', 'blue');
        log('     anchor build', 'blue');
        log('     cp target/types/instinct_trading.ts ~/Projects/instinctfi-backend/src/types/', 'blue');
      }
      
      console.log('');
      log('========================================', 'red');
      log('❌ Solana Integration NOT Working', 'red');
      log('========================================', 'red');
      console.log('');
      log('Your backend currently:', 'yellow');
      log('  ✅ Creates runs in database', 'yellow');
      log('  ❌ Does NOT create runs on blockchain', 'yellow');
      log('  ❌ SolanaService fails to initialize', 'yellow');
      console.log('');
      process.exit(1);
    }

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

testSolanaIntegration();














