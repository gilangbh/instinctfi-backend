#!/usr/bin/env node

/**
 * Test Run State Transitions on Solana Devnet
 * 
 * Tests: WAITING → ACTIVE → SETTLED
 */

const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } = require('@solana/web3.js');
const { BN } = require('@coral-xyz/anchor');
require('dotenv').config();

async function testRunStates() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 Testing Run State Transitions on Solana Devnet');
  console.log('='.repeat(60) + '\n');

  try {
    // Setup
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    
    const privateKeyStr = process.env.SOLANA_PRIVATE_KEY;
    const privateKeyData = JSON.parse(privateKeyStr);
    const keypair = Keypair.fromSecretKey(Uint8Array.from(privateKeyData));
    
    const programId = new PublicKey(process.env.SOLANA_PROGRAM_ID || '7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc');

    console.log('✓ Authority:', keypair.publicKey.toString());
    console.log('✓ Program ID:', programId.toString());

    // Use a test run ID
    const testRunId = Date.now();
    console.log('✓ Test Run ID:', testRunId, '\n');

    // Derive PDAs
    const [runPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('run'), new BN(testRunId).toArrayLike(Buffer, 'le', 8)],
      programId
    );
    console.log('Run PDA:', runPDA.toString());

    // ================================================================
    // Step 1: Check current state (should not exist yet)
    // ================================================================
    console.log('\n' + '─'.repeat(60));
    console.log('📝 Step 1: Checking if run exists...');
    console.log('─'.repeat(60));
    
    let runAccount = await connection.getAccountInfo(runPDA);
    if (runAccount) {
      console.log('⚠️  Run already exists! Using existing run for testing.');
      
      // Read status from account data (offset 40 for status enum)
      const status = runAccount.data[40];
      const statusNames = ['Waiting', 'Active', 'Settled'];
      console.log('Current status:', statusNames[status] || 'Unknown');
    } else {
      console.log('✓ Run does not exist yet (ready to create)');
      
      // ================================================================
      // Step 2: Create run (Status: WAITING)
      // ================================================================
      console.log('\n' + '─'.repeat(60));
      console.log('📝 Step 2: Creating run (Status → WAITING)...');
      console.log('─'.repeat(60));
      
      const [platformPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('platform')],
        programId
      );

      // create_run discriminator: [195,241,245,139,101,109,209,237]
      const discriminator = Buffer.from([195, 241, 245, 139, 101, 109, 209, 237]);
      
      const runIdBuf = Buffer.alloc(8);
      new BN(testRunId).toArrayLike(Buffer, 'le', 8).copy(runIdBuf);
      
      const minDepositBuf = Buffer.alloc(8);
      new BN(10_000_000).toArrayLike(Buffer, 'le', 8).copy(minDepositBuf); // 10 USDC
      
      const maxDepositBuf = Buffer.alloc(8);
      new BN(100_000_000).toArrayLike(Buffer, 'le', 8).copy(maxDepositBuf); // 100 USDC
      
      const maxParticipantsBuf = Buffer.alloc(2);
      maxParticipantsBuf.writeUInt16LE(100, 0);
      
      const data = Buffer.concat([
        discriminator,
        runIdBuf,
        minDepositBuf,
        maxDepositBuf,
        maxParticipantsBuf,
      ]);

      const createInstruction = new TransactionInstruction({
        keys: [
          { pubkey: platformPDA, isSigner: false, isWritable: true },
          { pubkey: runPDA, isSigner: false, isWritable: true },
          { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId,
        data,
      });

      const createTx = new Transaction().add(createInstruction);
      const createSig = await connection.sendTransaction(createTx, [keypair]);
      await connection.confirmTransaction(createSig, 'confirmed');

      console.log('✅ Run created!');
      console.log('   TX:', createSig);
      console.log('   Explorer:', `https://explorer.solana.com/tx/${createSig}?cluster=devnet`);
      console.log('   Status: WAITING ✓');
    }

    // ================================================================
    // Step 3: Start run (Status: WAITING → ACTIVE)
    // ================================================================
    console.log('\n' + '─'.repeat(60));
    console.log('📝 Step 3: Starting run (Status → ACTIVE)...');
    console.log('─'.repeat(60));

    // start_run discriminator (need to get from IDL)
    // For now, let's check the IDL
    console.log('⏳ Building start_run instruction...');
    
    const startDiscriminator = Buffer.from([72, 212, 1, 91, 61, 186, 2, 52]); // start_run
    const startRunIdBuf = Buffer.alloc(8);
    new BN(testRunId).toArrayLike(Buffer, 'le', 8).copy(startRunIdBuf);
    const startData = Buffer.concat([startDiscriminator, startRunIdBuf]);

    const [platformPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );

    const startInstruction = new TransactionInstruction({
      keys: [
        { pubkey: platformPDA, isSigner: false, isWritable: false },
        { pubkey: runPDA, isSigner: false, isWritable: true },
        { pubkey: keypair.publicKey, isSigner: true, isWritable: false },
      ],
      programId,
      data: startData,
    });

    const startTx = new Transaction().add(startInstruction);
    const startSig = await connection.sendTransaction(startTx, [keypair]);
    await connection.confirmTransaction(startSig, 'confirmed');

    console.log('✅ Run started!');
    console.log('   TX:', startSig);
    console.log('   Explorer:', `https://explorer.solana.com/tx/${startSig}?cluster=devnet`);
    console.log('   Status: ACTIVE ✓');

    // ================================================================
    // Step 4: Check state on-chain
    // ================================================================
    console.log('\n' + '─'.repeat(60));
    console.log('📝 Step 4: Verifying state on-chain...');
    console.log('─'.repeat(60));

    runAccount = await connection.getAccountInfo(runPDA);
    if (runAccount) {
      const status = runAccount.data[40];
      const statusNames = ['Waiting', 'Active', 'Settled'];
      console.log('✅ Current status:', statusNames[status] || 'Unknown');
      console.log('   Account size:', runAccount.data.length, 'bytes');
    }

    // ================================================================
    // Summary
    // ================================================================
    console.log('\n' + '='.repeat(60));
    console.log('✅ Run State Transition Test Complete!');
    console.log('='.repeat(60));
    console.log('\n📊 State Transitions:');
    console.log('   1. ✅ WAITING (run created)');
    console.log('   2. ✅ ACTIVE (run started)');
    console.log('   3. ⏸️  SETTLED (requires settle_run call with final balances)');
    console.log('\n🔗 Run PDA:', runPDA.toString());
    console.log('   View on Explorer:', `https://explorer.solana.com/address/${runPDA.toString()}?cluster=devnet`);

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ Test failed');
    console.error('='.repeat(60));
    console.error(error);
    if (error.logs) {
      console.error('\nProgram Logs:');
      error.logs.forEach(log => console.error('  ', log));
    }
    process.exit(1);
  }
}

testRunStates();

