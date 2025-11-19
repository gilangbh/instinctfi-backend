#!/usr/bin/env node

/**
 * Initialize Platform on Solana Devnet
 * 
 * This script initializes the platform account (one-time setup)
 * Required before creating runs on-chain
 */

const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { BN } = require('@coral-xyz/anchor');
require('dotenv').config();

async function initializePlatform() {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 Initializing Platform on Solana Devnet');
  console.log('='.repeat(50) + '\n');

  try {
    // 1. Setup connection
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    console.log('✓ Connected to:', rpcUrl);

    // 2. Load keypair
    const privateKeyStr = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKeyStr) {
      throw new Error('SOLANA_PRIVATE_KEY not found in .env');
    }

    // Try parsing as JSON array first, then fall back to base58
    let keypair;
    try {
      const privateKeyData = JSON.parse(privateKeyStr);
      keypair = Keypair.fromSecretKey(Uint8Array.from(privateKeyData));
    } catch {
      // If not JSON, try as base58
      const bs58 = require('bs58');
      const privateKeyData = bs58.decode(privateKeyStr);
      keypair = Keypair.fromSecretKey(privateKeyData);
    }
    console.log('✓ Authority:', keypair.publicKey.toString());

    // Check balance
    const balance = await connection.getBalance(keypair.publicKey);
    console.log('✓ Balance:', (balance / 1e9).toFixed(4), 'SOL');
    
    if (balance < 0.01 * 1e9) {
      throw new Error('Insufficient SOL balance. Please fund your wallet with devnet SOL.');
    }

    // 3. Get program ID
    const programId = new PublicKey(process.env.SOLANA_PROGRAM_ID || '83TVAu61Hv4v7zvPszszYFJLTwARG5LPhoTbGnkEmaQD');
    console.log('✓ Program ID:', programId.toString());

    // 4. Derive PDAs
    const [platformPDA, platformBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );
    console.log('✓ Platform PDA:', platformPDA.toString());

    const [platformFeeVaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform_fee_vault')],
      programId
    );
    console.log('✓ Platform Fee Vault:', platformFeeVaultPDA.toString());

    // 5. Check if already initialized
    console.log('\n📝 Checking if platform is already initialized...');
    const platformAccount = await connection.getAccountInfo(platformPDA);
    
    if (platformAccount) {
      console.log('✅ Platform is already initialized!');
      console.log('   Account size:', platformAccount.data.length, 'bytes');
      console.log('   Owner:', platformAccount.owner.toString());
      return;
    }

    console.log('⚠️  Platform not initialized. Initializing now...\n');

    // 6. Build initialize_platform instruction
    // Discriminator for initialize_platform: [119,201,101,45,75,122,89,3]
    const discriminator = Buffer.from([119, 201, 101, 45, 75, 122, 89, 3]);
    
    // Platform fee: 1500 basis points = 15%
    const platformFeeBps = 1500;
    const feeBuffer = Buffer.alloc(2);
    feeBuffer.writeUInt16LE(platformFeeBps, 0);
    
    const data = Buffer.concat([discriminator, feeBuffer]);

    // Get USDC mint (SPL token mint on devnet/mainnet)
    const usdcMint = new PublicKey(process.env.SOLANA_USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    console.log('✓ Using USDC mint:', usdcMint.toString());

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: platformPDA, isSigner: false, isWritable: true },
        { pubkey: platformFeeVaultPDA, isSigner: false, isWritable: true },
        { pubkey: usdcMint, isSigner: false, isWritable: false },
        { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data,
    });

    // 7. Send transaction
    console.log('📤 Sending transaction...');
    const tx = new Transaction().add(instruction);
    const signature = await connection.sendTransaction(tx, [keypair], {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    console.log('⏳ Confirming transaction...');
    console.log('   TX:', signature);
    
    await connection.confirmTransaction(signature, 'confirmed');

    const network = process.env.SOLANA_NETWORK || 'devnet';
    const cluster = network === 'mainnet-beta' ? 'mainnet' : network;
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ Platform initialized successfully!');
    console.log('='.repeat(50));
    console.log('Platform Fee: 15%');
    console.log('Platform PDA:', platformPDA.toString());
    console.log('Platform Fee Vault:', platformFeeVaultPDA.toString());
    console.log('Transaction:', `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`);
    console.log('\n✅ You can now create runs on the blockchain!');

  } catch (error) {
    console.error('\n' + '='.repeat(50));
    console.error('❌ Failed to initialize platform');
    console.error('='.repeat(50));
    console.error(error);
    console.error('\nTroubleshooting:');
    console.error('1. Make sure your wallet has SOL on devnet');
    console.error('2. Get devnet SOL: https://faucet.solana.com/');
    console.error('3. Check that the program is deployed on devnet');
    process.exit(1);
  }
}

initializePlatform();

