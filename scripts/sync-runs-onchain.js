#!/usr/bin/env node

/**
 * Script to sync runs to on-chain
 * 
 * This script will:
 * 1. Check which runs exist in database but not on-chain
 * 2. Create missing runs on-chain
 * 3. Create missing vaults on-chain
 * 4. Verify all runs are properly synced
 * 
 * Usage:
 *   node scripts/sync-runs-onchain.js [runId]
 * 
 * Examples:
 *   node scripts/sync-runs-onchain.js                    # Sync all runs
 *   node scripts/sync-runs-onchain.js cmi5u9ugy0000112ugh040st9  # Sync specific run
 */

const { PrismaClient } = require('@prisma/client');
const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } = require('@solana/web3.js');
const { AnchorProvider, Wallet, BN } = require('@coral-xyz/anchor');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
require('dotenv').config();

const prisma = new PrismaClient();

// Configuration
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || 'devnet';
const SOLANA_PROGRAM_ID = process.env.SOLANA_PROGRAM_ID || '83TVAu61Hv4v7zvPszszYFJLTwARG5LPhoTbGnkEmaQD';
// Standard devnet USDC mint (valid token mint on devnet)
const STANDARD_DEVNET_USDC = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const SOLANA_USDC_MINT = process.env.SOLANA_USDC_MINT || STANDARD_DEVNET_USDC;
const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY;

if (!SOLANA_PRIVATE_KEY) {
  console.error('❌ SOLANA_PRIVATE_KEY is required');
  process.exit(1);
}

// Validate USDC mint
if (!SOLANA_USDC_MINT || SOLANA_USDC_MINT.trim() === '') {
  console.error('❌ SOLANA_USDC_MINT is required');
  console.error('   Set it in your .env file or use the valid devnet USDC mint:');
  console.error(`   SOLANA_USDC_MINT=${STANDARD_DEVNET_USDC}`);
  process.exit(1);
}

// Warn if using non-standard mint
if (SOLANA_USDC_MINT !== STANDARD_DEVNET_USDC) {
  console.warn('⚠️  WARNING: Using non-standard USDC mint!');
  console.warn(`   Current: ${SOLANA_USDC_MINT}`);
  console.warn(`   Standard: ${STANDARD_DEVNET_USDC}`);
  console.warn('   Users will need USDC from this specific mint to deposit.');
  console.warn('   Consider using the standard devnet USDC for better compatibility.');
}

// Validate USDC mint format (should be a valid base58 public key)
try {
  new PublicKey(SOLANA_USDC_MINT);
} catch (error) {
  console.error('❌ Invalid SOLANA_USDC_MINT format:', SOLANA_USDC_MINT);
  console.error('   Error:', error.message);
  console.error('   USDC mint must be a valid Solana public key (base58)');
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
// Validate and create PublicKeys
let programId, usdcMint;
try {
  programId = new PublicKey(SOLANA_PROGRAM_ID);
  console.log('✅ Program ID:', programId.toString());
} catch (error) {
  console.error('❌ Invalid SOLANA_PROGRAM_ID:', SOLANA_PROGRAM_ID);
  console.error('   Error:', error.message);
  process.exit(1);
}

try {
  usdcMint = new PublicKey(SOLANA_USDC_MINT);
  console.log('✅ USDC Mint:', usdcMint.toString());
  if (SOLANA_USDC_MINT === STANDARD_DEVNET_USDC) {
    console.log('   ✅ Using standard devnet USDC (recommended)');
  } else {
    console.log('   ⚠️  Using custom USDC mint (users will need tokens from this mint)');
  }
} catch (error) {
  console.error('❌ Invalid SOLANA_USDC_MINT:', SOLANA_USDC_MINT);
  console.error('   Error:', error.message);
  process.exit(1);
}

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

function getRunVaultPDA(runId) {
  const runIdBuf = Buffer.alloc(8);
  new BN(runId).toArrayLike(Buffer, 'le', 8).copy(runIdBuf);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), runIdBuf],
    programId
  );
}

/**
 * Check if run exists on-chain
 */
async function checkRunOnChain(runId) {
  try {
    const [runPDA] = getRunPDA(runId);
    const accountInfo = await connection.getAccountInfo(runPDA);
    return {
      exists: !!accountInfo,
      pda: runPDA,
    };
  } catch (error) {
    return {
      exists: false,
      pda: null,
      error: error.message,
    };
  }
}

/**
 * Check if vault exists on-chain and verify its mint
 */
async function checkVaultOnChain(runId) {
  try {
    const [vaultPDA] = getRunVaultPDA(runId);
    const accountInfo = await connection.getAccountInfo(vaultPDA);
    
    if (!accountInfo) {
      return {
        exists: false,
        pda: vaultPDA,
        mint: null,
        mintMatches: false,
      };
    }

    // Check if it's a token account and get its mint
    const { getAccount } = require('@solana/spl-token');
    try {
      const tokenAccount = await getAccount(connection, vaultPDA);
      const mintMatches = tokenAccount.mint.equals(usdcMint);
      
      return {
        exists: true,
        pda: vaultPDA,
        mint: tokenAccount.mint.toString(),
        mintMatches: mintMatches,
      };
    } catch (tokenError) {
      // Not a token account or error reading it
      return {
        exists: true,
        pda: vaultPDA,
        mint: null,
        mintMatches: false,
        error: 'Vault exists but is not a valid token account',
      };
    }
  } catch (error) {
    return {
      exists: false,
      pda: null,
      mint: null,
      mintMatches: false,
      error: error.message,
    };
  }
}

/**
 * Create run on-chain
 */
async function createRunOnChain(runId, minDeposit, maxDeposit, maxParticipants) {
  try {
    const [platformPDA] = getPlatformPDA();
    const [runPDA] = getRunPDA(runId);

    // Check if platform exists
    const platformAccount = await connection.getAccountInfo(platformPDA);
    if (!platformAccount) {
      throw new Error(`Platform account does not exist. Please run: node scripts/init-platform.js`);
    }

    // Check if run already exists
    const runAccount = await connection.getAccountInfo(runPDA);
    if (runAccount) {
      console.log(`   ⚠️  Run already exists on-chain, skipping...`);
      return null;
    }

    // Convert to micro-USDC
    const minDepositMicro = new BN(minDeposit * 1_000_000);
    const maxDepositMicro = new BN(maxDeposit * 1_000_000);

    // Build instruction
    const discriminator = Buffer.from([195, 241, 245, 139, 101, 109, 209, 237]);
    const runIdBuf = Buffer.alloc(8);
    new BN(runId).toArrayLike(Buffer, 'le', 8).copy(runIdBuf);
    const minDepositBuf = Buffer.alloc(8);
    minDepositMicro.toArrayLike(Buffer, 'le', 8).copy(minDepositBuf);
    const maxDepositBuf = Buffer.alloc(8);
    maxDepositMicro.toArrayLike(Buffer, 'le', 8).copy(maxDepositBuf);
    const maxParticipantsBuf = Buffer.alloc(2);
    maxParticipantsBuf.writeUInt16LE(maxParticipants, 0);

    const data = Buffer.concat([
      discriminator,
      runIdBuf,
      minDepositBuf,
      maxDepositBuf,
      maxParticipantsBuf,
    ]);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: platformPDA, isSigner: false, isWritable: true },
        { pubkey: runPDA, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data,
    });

    const tx = new Transaction().add(instruction);
    const signature = await provider.sendAndConfirm(tx, [], {
      commitment: 'confirmed',
      skipPreflight: false,
    });

    return signature;
  } catch (error) {
    throw new Error(`Failed to create run on-chain: ${error.message}`);
  }
}

/**
 * Create vault on-chain
 */
async function createVaultOnChain(runId) {
  try {
    const [runPDA] = getRunPDA(runId);
    const [vaultPDA] = getRunVaultPDA(runId);

    // Check if vault already exists and verify its mint
    const vaultCheck = await checkVaultOnChain(runId);
    if (vaultCheck.exists) {
      if (vaultCheck.mintMatches) {
        console.log(`   ✅ Vault exists with correct mint (${vaultCheck.mint}), skipping...`);
        return null;
      } else {
        console.log(`   ⚠️  Vault exists but with wrong mint!`);
        console.log(`      Current mint: ${vaultCheck.mint || 'unknown'}`);
        console.log(`      Expected mint: ${usdcMint.toString()}`);
        console.log(`   ❌ Cannot recreate vault - PDA is deterministic.`);
        console.log(`   💡 Solution: Delete the run and create a new one, or use the existing mint.`);
        throw new Error(`Vault exists with wrong mint. Cannot recreate.`);
      }
    }

    // Check if run exists
    const runAccount = await connection.getAccountInfo(runPDA);
    if (!runAccount) {
      throw new Error(`Run account does not exist. Create run first.`);
    }

    // Build instruction
    // Discriminator from IDL: [17, 101, 136, 210, 255, 95, 202, 141]
    const discriminator = Buffer.from([17, 101, 136, 210, 255, 95, 202, 141]);
    const runIdBuf = Buffer.alloc(8);
    new BN(runId).toArrayLike(Buffer, 'le', 8).copy(runIdBuf);

    const data = Buffer.concat([discriminator, runIdBuf]);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: runPDA, isSigner: false, isWritable: false },
        { pubkey: vaultPDA, isSigner: false, isWritable: true },
        { pubkey: usdcMint, isSigner: false, isWritable: false },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data,
    });

    const tx = new Transaction().add(instruction);
    const signature = await provider.sendAndConfirm(tx, [], {
      commitment: 'confirmed',
      skipPreflight: false,
    });

    return signature;
  } catch (error) {
    throw new Error(`Failed to create vault on-chain: ${error.message}`);
  }
}

/**
 * Sync a single run
 */
async function syncRun(run) {
  const runNumericId = parseInt(run.id) || new Date(run.createdAt).getTime();
  
  console.log(`\n📋 Run: ${run.id}`);
  console.log(`   Numeric ID: ${runNumericId}`);
  console.log(`   Status: ${run.status}`);
  console.log(`   Trading Pair: ${run.tradingPair}`);
  console.log(`   Min Deposit: ${run.minDeposit / 100} USDC`);
  console.log(`   Max Deposit: ${run.maxDeposit / 100} USDC`);
  console.log(`   Max Participants: ${run.maxParticipants}`);

  // Check run
  const runCheck = await checkRunOnChain(runNumericId);
  console.log(`   Run on-chain: ${runCheck.exists ? '✅ Exists' : '❌ Missing'}`);
  if (runCheck.exists) {
    console.log(`   Run PDA: ${runCheck.pda.toString()}`);
  }

  // Check vault
  const vaultCheck = await checkVaultOnChain(runNumericId);
  if (vaultCheck.exists) {
    if (vaultCheck.mintMatches) {
      console.log(`   ✅ Vault exists with correct mint: ${vaultCheck.pda.toString()}`);
      console.log(`      Mint: ${vaultCheck.mint}`);
    } else {
      console.log(`   ⚠️  Vault exists but with WRONG mint!`);
      console.log(`      Vault: ${vaultCheck.pda.toString()}`);
      console.log(`      Current mint: ${vaultCheck.mint || 'unknown'}`);
      console.log(`      Expected mint: ${usdcMint.toString()}`);
      console.log(`   ❌ This vault cannot be used with standard devnet USDC.`);
      console.log(`   💡 Users will need USDC from mint ${vaultCheck.mint} to deposit.`);
    }
  } else {
    console.log(`   ❌ Vault missing`);
  }

  // Create run if missing
  if (!runCheck.exists) {
    try {
      console.log(`   📝 Creating run on-chain...`);
      const tx = await createRunOnChain(
        runNumericId,
        run.minDeposit / 100,
        run.maxDeposit / 100,
        run.maxParticipants
      );
      if (tx) {
        console.log(`   ✅ Run created: ${tx}`);
        console.log(`   View: https://explorer.solana.com/tx/${tx}?cluster=${SOLANA_NETWORK}`);
      }
    } catch (error) {
      console.error(`   ❌ Failed to create run: ${error.message}`);
      return false;
    }
  }

  // Create vault if missing
  if (!vaultCheck.exists) {
    try {
      console.log(`   📝 Creating vault on-chain with standard devnet USDC mint...`);
      console.log(`      Mint: ${usdcMint.toString()}`);
      const tx = await createVaultOnChain(runNumericId);
      if (tx) {
        console.log(`   ✅ Vault created: ${tx}`);
        const [vaultPDA] = getRunVaultPDA(runNumericId);
        console.log(`      Vault PDA: ${vaultPDA.toString()}`);
        console.log(`      Mint: ${usdcMint.toString()}`);
        console.log(`   View: https://explorer.solana.com/tx/${tx}?cluster=${SOLANA_NETWORK}`);
      }
    } catch (error) {
      console.error(`   ❌ Failed to create vault: ${error.message}`);
      if (error.message.includes('wrong mint')) {
        console.error(`   💡 This run's vault was created with a different mint.`);
        console.error(`   💡 You may need to delete this run and create a new one.`);
      }
      return false;
    }
  }

  return true;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const specificRunId = args[0];

  try {
    console.log('🔗 Connecting to Solana...');
    console.log(`   Network: ${SOLANA_NETWORK}`);
    console.log(`   RPC: ${SOLANA_RPC_URL}`);
    console.log(`   Program ID: ${SOLANA_PROGRAM_ID}`);
    console.log(`   Wallet: ${wallet.publicKey.toString()}`);

    // Check platform
    const [platformPDA] = getPlatformPDA();
    const platformAccount = await connection.getAccountInfo(platformPDA);
    if (!platformAccount) {
      console.error('\n❌ Platform account does not exist!');
      console.error('   Please run: node scripts/init-platform.js');
      process.exit(1);
    }
    console.log(`   ✅ Platform account exists: ${platformPDA.toString()}`);

    // Get runs from database
    let runs;
    if (specificRunId) {
      const run = await prisma.run.findUnique({
        where: { id: specificRunId },
      });
      runs = run ? [run] : [];
    } else {
      runs = await prisma.run.findMany({
        orderBy: { createdAt: 'desc' },
      });
    }

    if (runs.length === 0) {
      console.log('\n❌ No runs found');
      process.exit(1);
    }

    console.log(`\n📊 Found ${runs.length} run(s) to sync\n`);

    let successCount = 0;
    let failCount = 0;

    for (const run of runs) {
      const success = await syncRun(run);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    console.log(`\n📈 Summary:`);
    console.log(`   ✅ Successfully synced: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`   Total: ${runs.length}`);

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

