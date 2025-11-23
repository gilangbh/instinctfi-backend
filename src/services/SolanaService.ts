import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction,
  SystemProgram,
  TransactionInstruction
} from '@solana/web3.js';
import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { solanaConfig } from '@/utils/config';
import logger from '@/utils/logger';
import { AppError } from '@/types';

// ParticipantShare type for settle_run instruction
export interface ParticipantShare {
  user: PublicKey;
  shareAmount: BN;
}

// Helper to convert ParticipantShare to the format expected by the program
function toParticipantShareArgs(share: ParticipantShare) {
  return {
    user: share.user,
    shareAmount: share.shareAmount,
  };
}

export interface RunData {
  runId: BN;
  authority: PublicKey;
  status: any;
  totalDeposited: BN;
  finalBalance: BN;
  platformFeeAmount: BN;
  totalWithdrawn: BN;
  withdrawnCount: number;
  participantCount: number;
  minDeposit: BN;
  maxDeposit: BN;
  maxParticipants: number;
  createdAt: BN;
  startedAt: BN;
  endedAt: BN;
  bump: number;
}

export class SolanaService {
  private connection: Connection;
  private wallet: Wallet;
  private keypair: Keypair;
  private provider: AnchorProvider;
  private programId: PublicKey;
  private usdcMint: PublicKey;
  private program: any; // Anchor Program instance

  constructor() {
    this.connection = new Connection(solanaConfig.rpcUrl, 'confirmed');
    
    if (!solanaConfig.privateKey) {
      throw new Error('SOLANA_PRIVATE_KEY is required');
    }

    // Parse private key from base58 string or JSON array
    let keypairData: Uint8Array;
    try {
      // Try parsing as JSON array first
      const parsed = JSON.parse(solanaConfig.privateKey);
      keypairData = Uint8Array.from(parsed);
    } catch {
      // If not JSON, try as base58 (using bs58)
      const bs58 = require('bs58');
      keypairData = bs58.decode(solanaConfig.privateKey);
    }

    this.keypair = Keypair.fromSecretKey(keypairData);
    this.wallet = new Wallet(this.keypair);
    
    this.provider = new AnchorProvider(this.connection, this.wallet, {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    });

    this.programId = new PublicKey(solanaConfig.programId);
    this.usdcMint = new PublicKey(solanaConfig.usdcMint);
    
    // Initialize Anchor Program for account decoding
    try {
      const { Program } = require('@coral-xyz/anchor');
      const idl = require('@/idl/instinct_trading.json');
      this.program = new Program(idl, this.programId, this.provider);
    } catch (error) {
      logger.warn('Could not initialize Anchor Program (account decoding may not work):', error);
      this.program = null;
    }

    logger.info(`✅ SolanaService initialized successfully!`);
    logger.info(`   Program ID: ${this.programId.toString()}`);
    logger.info(`   Authority: ${this.wallet.publicKey.toString()}`);
    logger.info(`   Network: ${solanaConfig.network}`);
    logger.info(`   USDC Mint: ${this.usdcMint.toString()}`);
    const standardDevnetUsdc = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
    if (solanaConfig.usdcMint === standardDevnetUsdc) {
      logger.info(`   ✅ Using standard devnet USDC (recommended)`);
    } else {
      logger.warn(`   ⚠️  Using custom USDC mint - users will need tokens from this mint`);
    }
    logger.info(`   Mode: Manual transaction building (Anchor IDL disabled)`);
  }

  /**
   * Get PDA for platform account
   */
  getPlatformPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      this.programId
    );
  }

  /**
   * Check if a trade record exists on-chain
   */
  async checkTradeRecord(runId: number, round: number): Promise<{
    exists: boolean;
    pda: PublicKey;
    data?: {
      runId: number;
      round: number;
      direction: string;
      entryPrice: number;
      exitPrice: number;
      pnl: number;
      leverage: number;
      positionSizePercent: number;
      executedAt: Date;
    };
  }> {
    try {
      const [tradeRecordPDA] = this.getTradeRecordPDA(runId, round);
      
      const accountInfo = await this.connection.getAccountInfo(tradeRecordPDA);
      
      if (!accountInfo) {
        return {
          exists: false,
          pda: tradeRecordPDA,
        };
      }

      // Decode TradeRecord account data
      // Skip Anchor discriminator (8 bytes)
      const buffer = Buffer.from(accountInfo.data);
      let offset = 8;
      
      const runIdBN = new BN(buffer.slice(offset, offset + 8), 'le');
      offset += 8;
      const roundNum = buffer[offset];
      offset += 1;
      const directionValue = buffer[offset];
      const direction = directionValue === 0 ? 'LONG' : directionValue === 1 ? 'SHORT' : 'SKIP';
      offset += 1;
      const entryPrice = new BN(buffer.slice(offset, offset + 8), 'le').toNumber() / 1e6;
      offset += 8;
      const exitPrice = new BN(buffer.slice(offset, offset + 8), 'le').toNumber() / 1e6;
      offset += 8;
      const pnl = new BN(buffer.slice(offset, offset + 8), 'le', true).toNumber() / 1e6; // signed
      offset += 8;
      const leverage = buffer[offset] / 10; // Convert from integer to decimal
      offset += 1;
      const positionSizePercent = buffer[offset];
      offset += 1;
      const executedAt = new BN(buffer.slice(offset, offset + 8), 'le', true).toNumber();
      offset += 8;
      
      return {
        exists: true,
        pda: tradeRecordPDA,
        data: {
          runId: runIdBN.toNumber(),
          round: roundNum,
          direction,
          entryPrice,
          exitPrice,
          pnl,
          leverage,
          positionSizePercent,
          executedAt: new Date(executedAt * 1000),
        },
      };
    } catch (error) {
      logger.error(`Error checking trade record for run ${runId}, round ${round}:`, error);
      const [tradeRecordPDA] = this.getTradeRecordPDA(runId, round);
      return {
        exists: false,
        pda: tradeRecordPDA,
      };
    }
  }

  /**
   * Get PDA for run account
   */
  getRunPDA(runId: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('run'), new BN(runId).toArrayLike(Buffer, 'le', 8)],
      this.programId
    );
  }

  /**
   * Manually decode Run account data (fallback when Anchor program is not available)
   */
  async decodeRunAccount(runPDA: PublicKey): Promise<RunData | null> {
    try {
      const accountInfo = await this.connection.getAccountInfo(runPDA);
      if (!accountInfo) {
        return null;
      }

      const buffer = Buffer.from(accountInfo.data);
      let offset = 8; // Skip Anchor discriminator (8 bytes)

      const runId = new BN(buffer.slice(offset, offset + 8), 'le');
      offset += 8;

      const authority = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const statusValue = buffer[offset];
      const status = statusValue === 0 ? 'Waiting' : statusValue === 1 ? 'Active' : 'Settled';
      offset += 1;

      const totalDeposited = new BN(buffer.slice(offset, offset + 8), 'le');
      offset += 8;

      const finalBalance = new BN(buffer.slice(offset, offset + 8), 'le');
      offset += 8;

      const platformFeeAmount = new BN(buffer.slice(offset, offset + 8), 'le');
      offset += 8;

      const totalWithdrawn = new BN(buffer.slice(offset, offset + 8), 'le');
      offset += 8;

      const withdrawnCount = buffer.readUInt16LE(offset);
      offset += 2;

      const participantCount = buffer.readUInt16LE(offset);
      offset += 2;

      const minDeposit = new BN(buffer.slice(offset, offset + 8), 'le');
      offset += 8;

      const maxDeposit = new BN(buffer.slice(offset, offset + 8), 'le');
      offset += 8;

      const maxParticipants = buffer.readUInt16LE(offset);
      offset += 2;

      const createdAt = new BN(buffer.slice(offset, offset + 8), 'le', true); // signed
      offset += 8;

      const startedAt = new BN(buffer.slice(offset, offset + 8), 'le', true); // signed
      offset += 8;

      const endedAt = new BN(buffer.slice(offset, offset + 8), 'le', true); // signed
      offset += 8;

      const bump = buffer[offset];

      return {
        runId,
        authority,
        status,
        totalDeposited,
        finalBalance,
        platformFeeAmount,
        totalWithdrawn,
        withdrawnCount,
        participantCount,
        minDeposit,
        maxDeposit,
        maxParticipants,
        createdAt,
        startedAt,
        endedAt,
        bump,
      };
    } catch (error) {
      logger.error(`Error decoding Run account:`, error);
      return null;
    }
  }

  /**
   * Get PDA for run vault
   */
  getRunVaultPDA(runId: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), new BN(runId).toArrayLike(Buffer, 'le', 8)],
      this.programId
    );
  }

  /**
   * Get PDA for user participation
   */
  getUserParticipationPDA(runId: number, userPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('participation'),
        new BN(runId).toArrayLike(Buffer, 'le', 8),
        userPubkey.toBuffer(),
      ],
      this.programId
    );
  }

  /**
   * Verify that a deposit transaction was successful on-chain
   */
  async verifyDeposit(
    transactionSignature: string,
    runId: number,
    userPubkey: PublicKey,
    expectedAmount: number // In USDC
  ): Promise<{ verified: boolean; participationAccount?: any; error?: string }> {
    try {
      logger.info(`🔍 Verifying on-chain deposit:`);
      logger.info(`   Transaction: ${transactionSignature}`);
      logger.info(`   Run ID: ${runId}`);
      logger.info(`   User: ${userPubkey.toString()}`);
      logger.info(`   Expected amount: ${expectedAmount} USDC`);

      // Verify transaction exists and is confirmed (with retry for pending transactions)
      let tx = null;
      let retries = 0;
      const maxRetries = 5;
      
      while (!tx && retries < maxRetries) {
        tx = await this.connection.getTransaction(transactionSignature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });
        
        if (!tx && retries < maxRetries - 1) {
          logger.info(`   ⏳ Transaction not found yet, retrying... (${retries + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
          retries++;
        } else {
          break;
        }
      }

      if (!tx) {
        return { verified: false, error: 'Transaction not found on-chain after multiple attempts. It may still be processing.' };
      }

      if (tx.meta?.err) {
        return { verified: false, error: `Transaction failed: ${JSON.stringify(tx.meta.err)}` };
      }

      logger.info(`   ✅ Transaction confirmed`);

      // Check if user participation account exists on-chain
      const [userParticipationPDA] = this.getUserParticipationPDA(runId, userPubkey);
      const participationAccount = await this.connection.getAccountInfo(userParticipationPDA);

      if (!participationAccount) {
        return { verified: false, error: 'User participation account not found on-chain' };
      }

      logger.info(`   ✅ User participation account exists: ${userParticipationPDA.toString()}`);

      // Decode participation account to verify deposit amount
      // UserParticipation structure: discriminator(8) + user(32) + run_id(8) + deposit_amount(8) + final_share(8) + withdrawn(1) + correct_votes(1) + total_votes(1) + bump(1)
      const data = participationAccount.data;
      if (data.length < 8 + 32 + 8 + 8 + 8 + 1 + 1 + 1 + 1) {
        return { verified: false, error: 'Invalid participation account data' };
      }

      const depositAmountOffset = 8 + 32 + 8; // Skip discriminator + user + run_id
      const depositAmountBytes = data.slice(depositAmountOffset, depositAmountOffset + 8);
      const depositAmount = new BN(depositAmountBytes, 'le').toNumber();
      const depositAmountUsdc = depositAmount / 1_000_000; // Convert from micro-USDC

      logger.info(`   On-chain deposit amount: ${depositAmountUsdc} USDC`);

      // Verify amount matches (allow small rounding differences)
      const expectedAmountMicro = expectedAmount * 1_000_000;
      if (Math.abs(depositAmount - expectedAmountMicro) > 1) {
        return {
          verified: false,
          error: `Deposit amount mismatch. Expected: ${expectedAmount} USDC, Found: ${depositAmountUsdc} USDC`,
        };
      }

      logger.info(`   ✅ Deposit amount verified`);
      logger.info(`   ✅ On-chain deposit verified successfully`);

      return {
        verified: true,
        participationAccount: {
          address: userParticipationPDA.toString(),
          depositAmount: depositAmountUsdc,
        },
      };
    } catch (error) {
      logger.error('Error verifying deposit:', error);
      return {
        verified: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get PDA for platform fee vault
   */
  getPlatformFeeVaultPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('platform_fee_vault')],
      this.programId
    );
  }

  /**
   * Check if a run exists on-chain
   */
  async runExistsOnChain(runId: number): Promise<boolean> {
    try {
      const [runPDA] = this.getRunPDA(runId);
      const runAccount = await this.connection.getAccountInfo(runPDA);
      return !!runAccount;
    } catch {
      return false;
    }
  }

  /**
   * Initialize platform (one-time setup)
   * NOTE: Use scripts/init-platform.js instead - this method is disabled due to IDL issues
   */
  async initializePlatform(platformFeeBps: number = 150): Promise<string> {
    throw new AppError('Use scripts/init-platform.js for platform initialization', 501);
  }

  /**
   * Create a new run on-chain
   */
  async createRun(
    runId: number,
    minDeposit: number,
    maxDeposit: number,
    maxParticipants: number
  ): Promise<string> {
    try {
      const [platformPDA] = this.getPlatformPDA();
      const [runPDA] = this.getRunPDA(runId);

      logger.info(`📝 Creating run on-chain:`);
      logger.info(`   Run ID: ${runId}`);
      logger.info(`   Platform PDA: ${platformPDA.toString()}`);
      logger.info(`   Run PDA: ${runPDA.toString()}`);
      logger.info(`   Program ID: ${this.programId.toString()}`);
      logger.info(`   Authority: ${this.wallet.publicKey.toString()}`);

      // Check if platform account exists
      try {
        const platformAccount = await this.connection.getAccountInfo(platformPDA);
        if (!platformAccount) {
          throw new AppError(
            `Platform account does not exist at ${platformPDA.toString()}. Please initialize the platform first using scripts/init-platform.js`,
            400
          );
        }
        logger.info(`   ✅ Platform account exists`);
      } catch (error) {
        logger.error(`   ❌ Platform account check failed:`, error);
        throw error;
      }

      // Convert USDC to smallest unit (6 decimals)
      const minDepositLamports = new BN(minDeposit * 1_000_000);
      const maxDepositLamports = new BN(maxDeposit * 1_000_000);

      // Build instruction data manually (8-byte discriminator + arguments)
      // Discriminator for create_run: [195,241,245,139,101,109,209,237]
      const discriminator = Buffer.from([195, 241, 245, 139, 101, 109, 209, 237]);
      
      // Encode arguments
      const runIdBuf = Buffer.alloc(8);
      new BN(runId).toArrayLike(Buffer, 'le', 8).copy(runIdBuf);
      
      const minDepositBuf = Buffer.alloc(8);
      minDepositLamports.toArrayLike(Buffer, 'le', 8).copy(minDepositBuf);
      
      const maxDepositBuf = Buffer.alloc(8);
      maxDepositLamports.toArrayLike(Buffer, 'le', 8).copy(maxDepositBuf);
      
      const maxParticipantsBuf = Buffer.alloc(2);
      maxParticipantsBuf.writeUInt16LE(maxParticipants, 0);
      
      const data = Buffer.concat([
        discriminator,
        runIdBuf,
        minDepositBuf,
        maxDepositBuf,
        maxParticipantsBuf,
      ]);

      // Build transaction
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: platformPDA, isSigner: false, isWritable: true },
          { pubkey: runPDA, isSigner: false, isWritable: true },
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: this.programId,
        data,
      });

      const tx = new Transaction().add(instruction);
      
      // Check wallet balance before sending
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      logger.info(`   Wallet balance: ${balance / 1e9} SOL`);
      if (balance < 0.001 * 1e9) {
        logger.warn(`   ⚠️  Low wallet balance! May not have enough for transaction fees.`);
      }

      logger.info(`   Sending transaction...`);
      const signature = await this.provider.sendAndConfirm(tx, [], {
        commitment: 'confirmed',
        skipPreflight: false,
      });

      logger.info(`✅ Run created on-chain: Run ID ${runId}, TX: ${signature}`);
      logger.info(`   Run PDA: ${runPDA.toString()}`);
      logger.info(`   View on Solana Explorer: https://explorer.solana.com/tx/${signature}?cluster=${solanaConfig.network}`);
      return signature;
    } catch (error) {
      logger.error('❌ Error creating run on-chain:');
      logger.error('   Error type:', error instanceof Error ? error.constructor.name : typeof error);
      logger.error('   Error message:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        logger.error('   Stack trace:', error.stack);
      }
      // Log additional error details if available
      if (error && typeof error === 'object') {
        const errorDetails: any = {};
        Object.getOwnPropertyNames(error).forEach(key => {
          try {
            errorDetails[key] = (error as any)[key];
          } catch {
            // Skip properties that can't be serialized
          }
        });
        logger.error('   Error details:', JSON.stringify(errorDetails, null, 2));
      }
      throw error instanceof AppError ? error : new AppError(
        `Failed to create run on-chain: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  /**
   * Create vault for a run
   */
  async createRunVault(runId: number): Promise<string> {
    const [runPDA] = this.getRunPDA(runId);
    const [runVaultPDA] = this.getRunVaultPDA(runId);
    
    try {
      logger.info(`📝 Creating vault on-chain:`);
      logger.info(`   Run ID: ${runId}`);

      logger.info(`   Run PDA: ${runPDA.toString()}`);
      logger.info(`   Vault PDA: ${runVaultPDA.toString()}`);
      logger.info(`   USDC Mint: ${this.usdcMint.toString()}`);
      logger.info(`   Program ID: ${this.programId.toString()}`);
      logger.info(`   Authority: ${this.wallet.publicKey.toString()}`);

      // Build instruction for create_run_vault
      // Discriminator: [17,101,136,210,255,95,202,141]
      const discriminator = Buffer.from([17, 101, 136, 210, 255, 95, 202, 141]);
      
      const runIdBuf = Buffer.alloc(8);
      new BN(runId).toArrayLike(Buffer, 'le', 8).copy(runIdBuf);
      
      const data = Buffer.concat([discriminator, runIdBuf]);

      // Check if run exists first
      const runAccount = await this.connection.getAccountInfo(runPDA);
      if (!runAccount) {
        throw new AppError(
          `Run account does not exist at ${runPDA.toString()}. Please create the run first.`,
          400
        );
      }
      logger.info(`   ✅ Run account exists`);

      // Check wallet balance
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      logger.info(`   Wallet balance: ${balance / 1e9} SOL`);
      if (balance < 0.001 * 1e9) {
        logger.warn(`   ⚠️  Low wallet balance! May not have enough for transaction fees.`);
      }

      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: runPDA, isSigner: false, isWritable: false },
          { pubkey: runVaultPDA, isSigner: false, isWritable: true },
          { pubkey: this.usdcMint, isSigner: false, isWritable: false },
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: this.programId,
        data,
      });

      const tx = new Transaction().add(instruction);
      
      // Simulate transaction first to catch errors early
      logger.info(`   Simulating transaction...`);
      try {
        // For Transaction objects, simulateTransaction needs signers array (empty for simulation)
        const simulation = await this.connection.simulateTransaction(tx, []);
        
        if (simulation.value.err) {
          logger.error(`   ❌ Simulation failed:`, simulation.value.err);
          logger.error(`   Logs:`, simulation.value.logs);
          throw new AppError(
            `Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`,
            400
          );
        }
        
        logger.info(`   ✅ Simulation successful`);
        logger.info(`   Compute units used: ${simulation.value.unitsConsumed || 'N/A'}`);
      } catch (simError) {
        logger.error(`   ❌ Simulation error:`, simError);
        // If simulation fails, log but don't throw - let the actual transaction attempt proceed
        // Sometimes simulation can fail even when the transaction would succeed
        logger.warn(`   ⚠️  Simulation failed, but proceeding with transaction attempt...`);
      }

      logger.info(`   Sending transaction...`);
      const signature = await this.provider.sendAndConfirm(tx, [], {
        commitment: 'confirmed',
        skipPreflight: false,
      });

      logger.info(`✅ Run vault created on-chain: Run ID ${runId}, TX: ${signature}`);
      logger.info(`   Vault PDA: ${runVaultPDA.toString()}`);
      logger.info(`   View on Solana Explorer: https://explorer.solana.com/tx/${signature}?cluster=${solanaConfig.network}`);
      return signature;
    } catch (error) {
      logger.error('❌ Error creating run vault:');
      logger.error('   Error type:', error instanceof Error ? error.constructor.name : typeof error);
      logger.error('   Error message:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        logger.error('   Stack trace:', error.stack);
      }
      
      // Check if vault already exists
      try {
        const vaultAccount = await this.connection.getAccountInfo(runVaultPDA);
        if (vaultAccount) {
          logger.warn(`   ⚠️  Vault already exists at ${runVaultPDA.toString()}`);
          throw new AppError(
            `Vault already exists for run ${runId}. Cannot create duplicate vault.`,
            400
          );
        }
      } catch (checkError) {
        // Ignore check errors, throw original error
      }
      
      throw error instanceof AppError ? error : new AppError(
        `Failed to create run vault: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  /**
   * Start a run on-chain (sets status to Active)
   */
  async startRun(runId: number): Promise<string> {
    try {
      const [platformPDA] = this.getPlatformPDA();
      const [runPDA] = this.getRunPDA(runId);

      logger.info(`📝 Starting run on-chain:`);
      logger.info(`   Run ID: ${runId}`);
      logger.info(`   Platform PDA: ${platformPDA.toString()}`);
      logger.info(`   Run PDA: ${runPDA.toString()}`);
      logger.info(`   Program ID: ${this.programId.toString()}`);
      logger.info(`   Authority: ${this.wallet.publicKey.toString()}`);

      // Check if platform account exists
      try {
        const platformAccount = await this.connection.getAccountInfo(platformPDA);
        if (!platformAccount) {
          throw new AppError(
            `Platform account does not exist at ${platformPDA.toString()}. Please initialize the platform first.`,
            400
          );
        }
        logger.info(`   ✅ Platform account exists`);
      } catch (error) {
        logger.error(`   ❌ Platform account check failed:`, error);
        throw error;
      }

      // Check if run account exists and decode its status
      try {
        const runAccount = await this.connection.getAccountInfo(runPDA);
        if (!runAccount) {
          logger.warn(`   ⚠️  Run account does not exist on-chain. Attempting to create it...`);
          
          // Try to create the run on-chain (we need the run parameters from the database)
          // Since we don't have them here, we'll throw an error with instructions
          throw new AppError(
            `Run account does not exist at ${runPDA.toString()}. ` +
            `The run was created in the database but not on-chain. ` +
            `Please sync the run using: node scripts/sync-runs-onchain.js <runId> ` +
            `or recreate the run.`,
            400
          );
        }
        logger.info(`   ✅ Run account exists`);
        
        // Try to decode the run account to check its status and participant count
        try {
          const decodedRun = await this.program.account.run.fetch(runPDA);
          const status = decodedRun.status;
          const participantCount = decodedRun.participantCount.toNumber();
          
          logger.info(`   📊 On-chain run status: ${status}`);
          logger.info(`   📊 On-chain participant count: ${participantCount}`);
          
          if (status.toString() !== 'waiting') {
            logger.warn(`   ⚠️  Run status is ${status}, but start_run requires 'waiting'`);
            logger.warn(`   💡 The run may have already been started on-chain.`);
          }
          
          if (participantCount === 0) {
            logger.error(`   ❌ Run has 0 participants on-chain!`);
            logger.error(`   💡 Make sure users have deposited on-chain before starting the run.`);
            logger.error(`   💡 Deposits must be recorded on-chain (not just in the database).`);
            throw new AppError(
              `Cannot start run: no participants on-chain. Participant count: ${participantCount}. ` +
              `Make sure deposits are recorded on-chain before starting.`,
              400
            );
          }
        } catch (decodeError) {
          logger.warn(`   ⚠️  Could not decode run account (non-critical):`, decodeError);
          // Continue anyway - the transaction will fail with a clear error if there's an issue
        }
      } catch (error) {
        logger.error(`   ❌ Run account check failed:`, error);
        throw error;
      }

      // Build instruction data manually
      // Discriminator for start_run: [72, 212, 1, 91, 61, 186, 2, 52]
      const discriminator = Buffer.from([72, 212, 1, 91, 61, 186, 2, 52]);
      
      const runIdBuf = Buffer.alloc(8);
      new BN(runId).toArrayLike(Buffer, 'le', 8).copy(runIdBuf);
      
      const data = Buffer.concat([discriminator, runIdBuf]);

      // Build transaction
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: platformPDA, isSigner: false, isWritable: false },
          { pubkey: runPDA, isSigner: false, isWritable: true },
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        ],
        programId: this.programId,
        data,
      });

      const tx = new Transaction().add(instruction);
      
      // Check wallet balance before sending
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      logger.info(`   Wallet balance: ${balance / 1e9} SOL`);
      if (balance < 0.001 * 1e9) {
        logger.warn(`   ⚠️  Low wallet balance! May not have enough for transaction fees.`);
      }

      // Simulate transaction first to catch errors early
      logger.info(`   Simulating transaction...`);
      try {
        const simulation = await this.connection.simulateTransaction(tx, []);
        
        if (simulation.value.err) {
          logger.error(`   ❌ Simulation failed:`, simulation.value.err);
          logger.error(`   Logs:`, simulation.value.logs);
          
          // Try to decode the error
          const errorStr = JSON.stringify(simulation.value.err);
          if (errorStr.includes('InvalidRunStatus') || errorStr.includes('0x3')) {
            // Check the actual run status on-chain
            try {
              const runAccount = await this.connection.getAccountInfo(runPDA);
              if (runAccount) {
                // Try to decode the run account to see its status
                logger.warn(`   ⚠️  Run status check failed. Run account exists but status may not be Waiting.`);
                logger.warn(`   💡 The run may already be Active or have a different status on-chain.`);
              }
            } catch (e) {
              // Ignore
            }
          }
          if (errorStr.includes('NoParticipants') || errorStr.includes('0x5')) {
            logger.error(`   ❌ Run has no participants on-chain!`);
            logger.error(`   💡 Make sure deposits are recorded on-chain before starting the run.`);
          }
          
          throw new AppError(
            `Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`,
            400
          );
        }
        
        logger.info(`   ✅ Simulation successful`);
        logger.info(`   Compute units used: ${simulation.value.unitsConsumed || 'N/A'}`);
      } catch (simError) {
        logger.error(`   ❌ Simulation error:`, simError);
        // If simulation fails, log but don't throw - let the actual transaction attempt proceed
        // Sometimes simulation can fail even when the transaction would succeed
        logger.warn(`   ⚠️  Simulation failed, but proceeding with transaction attempt...`);
      }

      logger.info(`   Sending transaction...`);
      const signature = await this.provider.sendAndConfirm(tx, [], {
        commitment: 'confirmed',
        skipPreflight: false,
      });

      logger.info(`✅ Run started on-chain: Run ID ${runId}, TX: ${signature}`);
      logger.info(`   Run PDA: ${runPDA.toString()}`);
      logger.info(`   View on Solana Explorer: https://explorer.solana.com/tx/${signature}?cluster=${solanaConfig.network}`);
      return signature;
    } catch (error) {
      logger.error('❌ Error starting run on-chain:');
      logger.error('   Error type:', error instanceof Error ? error.constructor.name : typeof error);
      logger.error('   Error message:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        logger.error('   Stack trace:', error.stack);
      }
      // Log additional error details if available
      if (error && typeof error === 'object') {
        const errorDetails: any = {};
        Object.getOwnPropertyNames(error).forEach(key => {
          try {
            errorDetails[key] = (error as any)[key];
          } catch {
            // Skip properties that can't be serialized
          }
        });
        logger.error('   Error details:', JSON.stringify(errorDetails, null, 2));
      }
      throw error instanceof AppError ? error : new AppError(
        `Failed to start run on-chain: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  /**
   * Settle a run with final P/L
   * NOTE: Not implemented with manual transactions
   */
  /**
   * Settle a run on-chain (sets status to Settled and transfers platform fee)
   */
  async settleRun(
    runId: number,
    finalBalance: number, // In USDC (will be converted to micro-USDC)
    participantShares: Array<{ userPubkey: string; shareAmount: number }> // In USDC (will be converted to micro-USDC)
  ): Promise<string> {
    try {
      const [platformPDA] = this.getPlatformPDA();
      const [runPDA] = this.getRunPDA(runId);
      const [runVaultPDA] = this.getRunVaultPDA(runId);
      const [platformFeeVaultPDA] = this.getPlatformFeeVaultPDA();

      logger.info(`📝 Settling run on-chain:`);
      logger.info(`   Run ID: ${runId}`);
      logger.info(`   Final Balance: ${finalBalance} USDC`);
      logger.info(`   Participant Shares: ${participantShares.length}`);
      logger.info(`   Platform PDA: ${platformPDA.toString()}`);
      logger.info(`   Run PDA: ${runPDA.toString()}`);
      logger.info(`   Run Vault PDA: ${runVaultPDA.toString()}`);
      logger.info(`   Platform Fee Vault PDA: ${platformFeeVaultPDA.toString()}`);
      logger.info(`   Program ID: ${this.programId.toString()}`);
      logger.info(`   Authority: ${this.wallet.publicKey.toString()}`);

      // Check if platform account exists
      try {
        const platformAccount = await this.connection.getAccountInfo(platformPDA);
        if (!platformAccount) {
          throw new AppError(
            `Platform account does not exist at ${platformPDA.toString()}. Please initialize the platform first.`,
            400
          );
        }
        logger.info(`   ✅ Platform account exists`);
      } catch (error) {
        logger.error(`   ❌ Platform account check failed:`, error);
        throw error;
      }

      // Check if run account exists
      try {
        const runAccount = await this.connection.getAccountInfo(runPDA);
        if (!runAccount) {
          throw new AppError(
            `Run account does not exist at ${runPDA.toString()}. Please create the run first.`,
            400
          );
        }
        logger.info(`   ✅ Run account exists`);
      } catch (error) {
        logger.error(`   ❌ Run account check failed:`, error);
        throw error;
      }

      // Check if vault exists
      try {
        const vaultAccount = await this.connection.getAccountInfo(runVaultPDA);
        if (!vaultAccount) {
          throw new AppError(
            `Run vault does not exist at ${runVaultPDA.toString()}. Please create the vault first.`,
            400
          );
        }
        logger.info(`   ✅ Run vault exists`);
      } catch (error) {
        logger.error(`   ❌ Run vault check failed:`, error);
        throw error;
      }

      // Convert USDC to micro-USDC (6 decimals)
      const finalBalanceMicro = new BN(Math.floor(finalBalance * 1_000_000));

      // Build ParticipantShare array
      const participantSharesData: ParticipantShare[] = participantShares.map(share => ({
        user: new PublicKey(share.userPubkey),
        shareAmount: new BN(Math.floor(share.shareAmount * 1_000_000)), // Convert to micro-USDC
      }));

      // Build instruction data manually
      // Discriminator for settle_run: [131, 162, 190, 83, 221, 20, 93, 149]
      const discriminator = Buffer.from([131, 162, 190, 83, 221, 20, 93, 149]);
      
      const runIdBuf = Buffer.alloc(8);
      new BN(runId).toArrayLike(Buffer, 'le', 8).copy(runIdBuf);
      
      const finalBalanceBuf = Buffer.alloc(8);
      finalBalanceMicro.toArrayLike(Buffer, 'le', 8).copy(finalBalanceBuf);

      // Encode participant shares vector
      // Vector encoding: 4 bytes length (u32) + data
      const sharesCount = participantSharesData.length;
      const sharesCountBuf = Buffer.alloc(4);
      sharesCountBuf.writeUInt32LE(sharesCount, 0);

      // Each ParticipantShare: 32 bytes (Pubkey) + 8 bytes (u64)
      const shareSize = 32 + 8; // 40 bytes per share
      const sharesDataBuf = Buffer.alloc(shareSize * sharesCount);
      let offset = 0;
      for (const share of participantSharesData) {
        share.user.toBuffer().copy(sharesDataBuf, offset);
        offset += 32;
        share.shareAmount.toArrayLike(Buffer, 'le', 8).copy(sharesDataBuf, offset);
        offset += 8;
      }

      const data = Buffer.concat([
        discriminator,
        runIdBuf,
        finalBalanceBuf,
        sharesCountBuf,
        sharesDataBuf,
      ]);

      // Build transaction
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: platformPDA, isSigner: false, isWritable: true },
          { pubkey: runPDA, isSigner: false, isWritable: true },
          { pubkey: runVaultPDA, isSigner: false, isWritable: true },
          { pubkey: platformFeeVaultPDA, isSigner: false, isWritable: true },
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: this.programId,
        data,
      });

      const tx = new Transaction().add(instruction);
      
      // Check wallet balance before sending
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      logger.info(`   Wallet balance: ${balance / 1e9} SOL`);
      if (balance < 0.001 * 1e9) {
        logger.warn(`   ⚠️  Low wallet balance! May not have enough for transaction fees.`);
      }

      // Simulate transaction first to catch errors early
      logger.info(`   Simulating transaction...`);
      try {
        const simulation = await this.connection.simulateTransaction(tx);
        if (simulation.value.err) {
          logger.error(`   ❌ Transaction simulation failed:`, simulation.value.err);
          logger.error(`   Logs:`, simulation.value.logs);
          throw new AppError(
            `Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`,
            400
          );
        }
        logger.info(`   ✅ Transaction simulation successful`);
        logger.info(`   Compute units: ${simulation.value.unitsConsumed || 'N/A'}`);
      } catch (simError) {
        logger.error(`   ❌ Transaction simulation error:`, simError);
        // Continue anyway - simulation might fail but transaction could still work
      }

      logger.info(`   Sending transaction...`);
      const signature = await this.provider.sendAndConfirm(tx, [], {
        commitment: 'confirmed',
        skipPreflight: false,
      });

      logger.info(`✅ Run settled on-chain: Run ID ${runId}, TX: ${signature}`);
      logger.info(`   Final Balance: ${finalBalance} USDC`);
      logger.info(`   View on Solana Explorer: https://explorer.solana.com/tx/${signature}?cluster=${solanaConfig.network}`);
      return signature;
    } catch (error) {
      logger.error('❌ Error settling run on-chain:');
      logger.error('   Error type:', error instanceof Error ? error.constructor.name : typeof error);
      logger.error('   Error message:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        logger.error('   Stack trace:', error.stack);
      }
      
      throw error instanceof AppError ? error : new AppError(
        `Failed to settle run on-chain: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  /**
   * Update vote statistics for a user
   * NOTE: Not implemented with manual transactions
   */
  async updateVoteStats(
    runId: number,
    userPubkey: string,
    correctVotes: number,
    totalVotes: number
  ): Promise<string> {
    throw new AppError('updateVoteStats not implemented with manual transactions', 501);
  }

  /**
   * Get PDA for trade record
   */
  getTradeRecordPDA(runId: number, round: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('trade'),
        new BN(runId).toArrayLike(Buffer, 'le', 8),
        Buffer.from([round]),
      ],
      this.programId
    );
  }

  /**
   * Record a trade on-chain
   */
  async recordTrade(params: {
    runId: number;
    round: number;
    direction: 'LONG' | 'SHORT' | 'SKIP';
    entryPrice: number;  // In USDC (will be converted to micro-USDC)
    exitPrice: number | null;  // In USDC (0 if still open)
    pnl: number;  // In USDC (will be converted to micro-USDC, can be negative)
    leverage: number;  // As decimal (e.g., 2.6x will be converted to 26)
    positionSizePercent: number;  // As decimal (e.g., 96.1% will be converted to 96)
  }): Promise<string> {
    try {
      logger.info(`📝 Recording trade on-chain:`);
      logger.info(`   Run ID: ${params.runId}`);
      logger.info(`   Round: ${params.round}`);
      logger.info(`   Direction: ${params.direction}`);
      logger.info(`   Entry Price: $${params.entryPrice.toFixed(2)}`);
      logger.info(`   Exit Price: ${params.exitPrice ? '$' + params.exitPrice.toFixed(2) : 'N/A (open)'}`);
      logger.info(`   PnL: $${params.pnl.toFixed(2)}`);
      logger.info(`   Leverage: ${params.leverage.toFixed(1)}x`);
      logger.info(`   Position Size: ${params.positionSizePercent.toFixed(1)}%`);

      const [platformPDA] = this.getPlatformPDA();
      const [runPDA] = this.getRunPDA(params.runId);
      const [tradeRecordPDA] = this.getTradeRecordPDA(params.runId, params.round);

      logger.info(`   Platform PDA: ${platformPDA.toString()}`);
      logger.info(`   Run PDA: ${runPDA.toString()}`);
      logger.info(`   TradeRecord PDA: ${tradeRecordPDA.toString()}`);
      logger.info(`   Program ID: ${this.programId.toString()}`);
      logger.info(`   Authority: ${this.wallet.publicKey.toString()}`);

      // Convert prices to micro-USDC (6 decimals)
      const entryPriceMicro = new BN(Math.floor(params.entryPrice * 1_000_000));
      const exitPriceMicro = new BN(params.exitPrice ? Math.floor(params.exitPrice * 1_000_000) : 0);
      
      // Convert PnL to micro-USDC (can be negative)
      const pnlMicro = new BN(Math.floor(params.pnl * 1_000_000));
      
      // Convert leverage from decimal to integer (e.g., 2.6 -> 26, 1.0 -> 10)
      const leverageInt = Math.round(params.leverage * 10);
      if (leverageInt < 10 || leverageInt > 200) {
        throw new AppError(`Invalid leverage: ${params.leverage} (must be between 1.0x and 20.0x)`, 400);
      }
      
      // Convert position size from decimal to integer (e.g., 96.1 -> 96, 50.0 -> 50)
      const positionSizeInt = Math.round(params.positionSizePercent);
      if (positionSizeInt < 10 || positionSizeInt > 100) {
        throw new AppError(`Invalid position size: ${params.positionSizePercent}% (must be between 10% and 100%)`, 400);
      }

      // Map direction string to enum variant (0 = Long, 1 = Short, 2 = Skip)
      let directionVariant: number;
      switch (params.direction.toUpperCase()) {
        case 'LONG':
          directionVariant = 0;
          break;
        case 'SHORT':
          directionVariant = 1;
          break;
        case 'SKIP':
          directionVariant = 2;
          break;
        default:
          throw new AppError(`Invalid direction: ${params.direction}`, 400);
      }

      // Build instruction data manually
      // Discriminator for record_trade from IDL: [83, 201, 2, 171, 223, 122, 186, 127]
      const discriminator = Buffer.from([83, 201, 2, 171, 223, 122, 186, 127]);
      
      const runIdBuf = Buffer.alloc(8);
      new BN(params.runId).toArrayLike(Buffer, 'le', 8).copy(runIdBuf);
      
      const roundBuf = Buffer.alloc(1);
      roundBuf.writeUInt8(params.round, 0);
      
      const directionBuf = Buffer.alloc(1);
      directionBuf.writeUInt8(directionVariant, 0);
      
      const entryPriceBuf = Buffer.alloc(8);
      entryPriceMicro.toArrayLike(Buffer, 'le', 8).copy(entryPriceBuf);
      
      const exitPriceBuf = Buffer.alloc(8);
      exitPriceMicro.toArrayLike(Buffer, 'le', 8).copy(exitPriceBuf);
      
      // PnL is i64 (signed), so we need to handle negative values
      const pnlBuf = Buffer.alloc(8);
      if (pnlMicro.isNeg()) {
        // For negative, we need to convert to two's complement
        const absValue = pnlMicro.abs();
        const complement = new BN(2).pow(new BN(64)).sub(absValue);
        complement.toArrayLike(Buffer, 'le', 8).copy(pnlBuf);
      } else {
        pnlMicro.toArrayLike(Buffer, 'le', 8).copy(pnlBuf);
      }
      
      const leverageBuf = Buffer.alloc(1);
      leverageBuf.writeUInt8(leverageInt, 0);
      
      const positionSizeBuf = Buffer.alloc(1);
      positionSizeBuf.writeUInt8(positionSizeInt, 0);
      
      const data = Buffer.concat([
        discriminator,
        runIdBuf,
        roundBuf,
        directionBuf,
        entryPriceBuf,
        exitPriceBuf,
        pnlBuf,
        leverageBuf,
        positionSizeBuf,
      ]);

      // Build transaction
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: platformPDA, isSigner: false, isWritable: false },
          { pubkey: runPDA, isSigner: false, isWritable: false },
          { pubkey: tradeRecordPDA, isSigner: false, isWritable: true },
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: this.programId,
        data,
      });

      // Check if run account exists and is Active (required by record_trade instruction)
      try {
        const runAccount = await this.connection.getAccountInfo(runPDA);
        if (!runAccount) {
          throw new AppError(
            `Run account does not exist at ${runPDA.toString()}. Please create and start the run on-chain first.`,
            400
          );
        }
        logger.info(`   ✅ Run account exists`);
        
        // Note: We can't easily decode the run status without the full account structure,
        // but the transaction will fail if the run is not Active, which will give us a clear error.
      } catch (error) {
        logger.error(`   ❌ Run account check failed:`, error);
        throw error;
      }

      // Check wallet balance
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      logger.info(`   Wallet balance: ${balance / 1e9} SOL`);
      if (balance < 0.001 * 1e9) {
        logger.warn(`   ⚠️  Low wallet balance! May not have enough for transaction fees.`);
      }

      logger.info(`   Sending transaction...`);
      const tx = new Transaction().add(instruction);
      const signature = await this.provider.sendAndConfirm(tx, [], {
        commitment: 'confirmed',
        skipPreflight: false,
      });

      logger.info(`✅ Trade recorded on-chain: Run ID ${params.runId}, Round ${params.round}, TX: ${signature}`);
      logger.info(`   TradeRecord PDA: ${tradeRecordPDA.toString()}`);
      logger.info(`   View transaction: https://explorer.solana.com/tx/${signature}?cluster=${solanaConfig.network}`);
      logger.info(`   View TradeRecord: https://explorer.solana.com/address/${tradeRecordPDA.toString()}?cluster=${solanaConfig.network}`);
      return signature;
    } catch (error) {
      logger.error('❌ Error recording trade on-chain:');
      logger.error('   Error type:', error instanceof Error ? error.constructor.name : typeof error);
      logger.error('   Error message:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        logger.error('   Stack trace:', error.stack);
      }
      // Log additional error details if available
      if (error && typeof error === 'object') {
        const errorDetails: any = {};
        Object.getOwnPropertyNames(error).forEach(key => {
          try {
            errorDetails[key] = (error as any)[key];
          } catch {
            // Skip properties that can't be serialized
          }
        });
        logger.error('   Error details:', JSON.stringify(errorDetails, null, 2));
      }
      throw error instanceof AppError ? error : new AppError(
        `Failed to record trade on-chain: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  /**
   * Fetch run data from on-chain
   * NOTE: Not implemented - use Solana RPC getAccountInfo instead
   */
  async fetchRun(runId: number): Promise<RunData | null> {
    logger.warn('fetchRun not implemented - use Solana Explorer to view run data');
    return null;
  }

  /**
   * Fetch platform data from on-chain
   * NOTE: Not implemented - use Solana RPC getAccountInfo instead
   */
  async fetchPlatform(): Promise<any> {
    logger.warn('fetchPlatform not implemented - use Solana Explorer to view platform data');
    return null;
  }

  /**
   * Pause platform (emergency)
   * NOTE: Not implemented with manual transactions
   */
  async pausePlatform(): Promise<string> {
    throw new AppError('pausePlatform not implemented with manual transactions', 501);
  }

  /**
   * Unpause platform
   * NOTE: Not implemented with manual transactions
   */
  async unpausePlatform(): Promise<string> {
    throw new AppError('unpausePlatform not implemented with manual transactions', 501);
  }

  /**
   * Build deposit transaction for a user to join a run
   * Returns the transaction that the user needs to sign
   */
  buildDepositTransaction(
    runId: number,
    userPubkey: PublicKey,
    amount: number // In USDC (will be converted to micro-USDC)
  ): Transaction {
    try {
      const [platformPDA] = this.getPlatformPDA();
      const [runPDA] = this.getRunPDA(runId);
      const [userParticipationPDA] = this.getUserParticipationPDA(runId, userPubkey);
      const [runVaultPDA] = this.getRunVaultPDA(runId);

      // Convert USDC to micro-USDC (6 decimals)
      const amountMicro = new BN(Math.floor(amount * 1_000_000));

      // Build instruction data manually
      // Discriminator for deposit: [242, 35, 198, 137, 82, 225, 242, 182]
      const discriminator = Buffer.from([242, 35, 198, 137, 82, 225, 242, 182]);
      
      const runIdBuf = Buffer.alloc(8);
      new BN(runId).toArrayLike(Buffer, 'le', 8).copy(runIdBuf);
      
      const amountBuf = Buffer.alloc(8);
      amountMicro.toArrayLike(Buffer, 'le', 8).copy(amountBuf);

      const data = Buffer.concat([discriminator, runIdBuf, amountBuf]);

      // Get user's USDC token account (associated token account)
      const userTokenAccount = getAssociatedTokenAddressSync(
        this.usdcMint,
        userPubkey
      );

      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: platformPDA, isSigner: false, isWritable: false },
          { pubkey: runPDA, isSigner: false, isWritable: true },
          { pubkey: userParticipationPDA, isSigner: false, isWritable: true },
          { pubkey: runVaultPDA, isSigner: false, isWritable: true },
          { pubkey: userTokenAccount, isSigner: false, isWritable: true },
          { pubkey: this.usdcMint, isSigner: false, isWritable: false },
          { pubkey: userPubkey, isSigner: true, isWritable: true }, // User must sign
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: this.programId,
        data,
      });

      const tx = new Transaction().add(instruction);
      tx.recentBlockhash = undefined; // Will be set by the client
      tx.feePayer = userPubkey; // User pays the fees

      return tx;
    } catch (error) {
      logger.error('Error building deposit transaction:', error);
      throw error instanceof AppError ? error : new AppError(
        `Failed to build deposit transaction: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  /**
   * Deposit USDC to join a run (requires user's keypair)
   * NOTE: This method requires the user's private key, which should only be used
   * in testing or if the user explicitly provides it. In production, use buildDepositTransaction
   * and have the frontend sign it.
   */
  async deposit(
    runId: number,
    userKeypair: Keypair,
    amount: number // In USDC
  ): Promise<string> {
    try {
      logger.info(`📝 Processing deposit on-chain:`);
      logger.info(`   Run ID: ${runId}`);
      logger.info(`   User: ${userKeypair.publicKey.toString()}`);
      logger.info(`   Amount: ${amount} USDC`);

      const [platformPDA] = this.getPlatformPDA();
      const [runPDA] = this.getRunPDA(runId);
      const [userParticipationPDA] = this.getUserParticipationPDA(runId, userKeypair.publicKey);
      const [runVaultPDA] = this.getRunVaultPDA(runId);

      // Convert USDC to micro-USDC (6 decimals)
      const amountMicro = new BN(Math.floor(amount * 1_000_000));

      logger.info(`   Platform PDA: ${platformPDA.toString()}`);
      logger.info(`   Run PDA: ${runPDA.toString()}`);
      logger.info(`   User Participation PDA: ${userParticipationPDA.toString()}`);
      logger.info(`   Run Vault PDA: ${runVaultPDA.toString()}`);
      logger.info(`   Amount (micro-USDC): ${amountMicro.toString()}`);

      // Check if run exists
      const runAccount = await this.connection.getAccountInfo(runPDA);
      if (!runAccount) {
        throw new AppError(
          `Run account does not exist at ${runPDA.toString()}. Please create the run first.`,
          400
        );
      }

      // Check if vault exists
      const vaultAccount = await this.connection.getAccountInfo(runVaultPDA);
      if (!vaultAccount) {
        throw new AppError(
          `Run vault does not exist at ${runVaultPDA.toString()}. Please create the vault first.`,
          400
        );
      }

      // Get user's USDC token account
      // We need to find the associated token account for the user
      const { getAssociatedTokenAddress } = require('@solana/spl-token');
      const userTokenAccount = await getAssociatedTokenAddress(
        this.usdcMint,
        userKeypair.publicKey
      );

      logger.info(`   User Token Account: ${userTokenAccount.toString()}`);

      // Check user's token account balance
      const tokenAccountInfo = await this.connection.getTokenAccountBalance(userTokenAccount);
      if (!tokenAccountInfo.value) {
        throw new AppError(
          `User does not have a USDC token account. Please create one first.`,
          400
        );
      }

      const userUsdcBalance = parseFloat(tokenAccountInfo.value.amount) / 1_000_000;
      logger.info(`   User USDC Balance: ${userUsdcBalance} USDC`);

      if (userUsdcBalance < amount) {
        throw new AppError(
          `Insufficient USDC balance. Required: ${amount} USDC, Available: ${userUsdcBalance} USDC`,
          400
        );
      }

      // Build instruction
      const discriminator = Buffer.from([242, 35, 198, 137, 82, 225, 242, 182]);
      const runIdBuf = Buffer.alloc(8);
      new BN(runId).toArrayLike(Buffer, 'le', 8).copy(runIdBuf);
      const amountBuf = Buffer.alloc(8);
      amountMicro.toArrayLike(Buffer, 'le', 8).copy(amountBuf);

      const data = Buffer.concat([discriminator, runIdBuf, amountBuf]);

      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: platformPDA, isSigner: false, isWritable: false },
          { pubkey: runPDA, isSigner: false, isWritable: true },
          { pubkey: userParticipationPDA, isSigner: false, isWritable: true },
          { pubkey: runVaultPDA, isSigner: false, isWritable: true },
          { pubkey: userTokenAccount, isSigner: false, isWritable: true },
          { pubkey: this.usdcMint, isSigner: false, isWritable: false },
          { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: this.programId,
        data,
      });

      const tx = new Transaction().add(instruction);

      // Check user's SOL balance for fees
      const userSolBalance = await this.connection.getBalance(userKeypair.publicKey);
      logger.info(`   User SOL balance: ${userSolBalance / 1e9} SOL`);
      if (userSolBalance < 0.001 * 1e9) {
        logger.warn(`   ⚠️  Low SOL balance! May not have enough for transaction fees.`);
      }

      logger.info(`   Sending transaction...`);
      const signature = await this.provider.sendAndConfirm(tx, [userKeypair], {
        commitment: 'confirmed',
        skipPreflight: false,
      });

      logger.info(`✅ Deposit successful: ${signature}`);
      logger.info(`   View on Solana Explorer: https://explorer.solana.com/tx/${signature}?cluster=${solanaConfig.network}`);
      return signature;
    } catch (error) {
      logger.error('❌ Error processing deposit on-chain:');
      logger.error('   Error type:', error instanceof Error ? error.constructor.name : typeof error);
      logger.error('   Error message:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        logger.error('   Stack trace:', error.stack);
      }
      throw error instanceof AppError ? error : new AppError(
        `Failed to process deposit on-chain: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  /**
   * Fetch all UserParticipation accounts for a run to get wallet addresses
   * This is useful when wallet addresses are not in the database
   */
  async fetchParticipantWalletAddresses(runId: number): Promise<Map<string, PublicKey>> {
    try {
      const walletAddressMap = new Map<string, PublicKey>();
      
      // We need to know which users participated, but we can't enumerate all possible PDAs
      // So this method requires the user IDs to be provided
      // For now, we'll return an empty map and let the caller handle it
      logger.warn('fetchParticipantWalletAddresses: This method requires user IDs to be provided. Use database wallet addresses instead.');
      
      return walletAddressMap;
    } catch (error) {
      logger.error('Error fetching participant wallet addresses:', error);
      throw error;
    }
  }

  /**
   * Build a withdraw transaction for a user to sign
   * This is the preferred method - the user signs the transaction on the frontend
   */
  buildWithdrawTransaction(
    runId: number,
    userPubkey: PublicKey
  ): Transaction {
    try {
      const [platformPDA] = this.getPlatformPDA();
      const [runPDA] = this.getRunPDA(runId);
      const [userParticipationPDA] = this.getUserParticipationPDA(runId, userPubkey);
      const [runVaultPDA] = this.getRunVaultPDA(runId);

      // Get user's USDC token account (associated token account)
      const { getAssociatedTokenAddressSync } = require('@solana/spl-token');
      const userTokenAccount = getAssociatedTokenAddressSync(
        this.usdcMint,
        userPubkey
      );

      // Build instruction data
      // Discriminator for withdraw: [183, 18, 70, 156, 148, 109, 161, 34]
      const discriminator = Buffer.from([183, 18, 70, 156, 148, 109, 161, 34]);
      
      const runIdBuf = Buffer.alloc(8);
      new BN(runId).toArrayLike(Buffer, 'le', 8).copy(runIdBuf);

      const data = Buffer.concat([discriminator, runIdBuf]);

      logger.info(`📝 Building withdraw transaction:`);
      logger.info(`   Run ID: ${runId}`);
      logger.info(`   User: ${userPubkey.toString()}`);
      logger.info(`   Platform PDA: ${platformPDA.toString()}`);
      logger.info(`   Run PDA: ${runPDA.toString()}`);
      logger.info(`   User Participation PDA: ${userParticipationPDA.toString()}`);
      logger.info(`   Run Vault PDA: ${runVaultPDA.toString()}`);
      logger.info(`   User Token Account: ${userTokenAccount.toString()}`);

      // Build instruction
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: platformPDA, isSigner: false, isWritable: false },
          { pubkey: runPDA, isSigner: false, isWritable: true },
          { pubkey: userParticipationPDA, isSigner: false, isWritable: true },
          { pubkey: runVaultPDA, isSigner: false, isWritable: true },
          { pubkey: userTokenAccount, isSigner: false, isWritable: true },
          { pubkey: userPubkey, isSigner: true, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: this.programId,
        data,
      });

      const transaction = new Transaction().add(instruction);
      transaction.feePayer = userPubkey;

      return transaction;
    } catch (error) {
      logger.error('❌ Error building withdraw transaction:', error);
      throw error instanceof AppError ? error : new AppError(
        `Failed to build withdraw transaction: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  /**
   * Verify a withdraw transaction on-chain
   * Checks if the transaction was successful and if the user's participation account was updated
   */
  async verifyWithdraw(
    signature: string,
    runId: number,
    userPubkey: PublicKey,
    retries: number = 5,
    delayMs: number = 2000
  ): Promise<{ verified: boolean; error?: string; participationAccount?: { address: PublicKey; withdrawn: boolean; finalShare: number } }> {
    logger.info(`🔍 Verifying on-chain withdraw for TX: ${signature}`);
    logger.info(`   Run ID: ${runId}, User: ${userPubkey.toString()}`);

    const [userParticipationPDA] = this.getUserParticipationPDA(runId, userPubkey);
    logger.info(`   Expected User Participation PDA: ${userParticipationPDA.toString()}`);

    for (let i = 0; i < retries; i++) {
      try {
        // 1. Check transaction status
        const txStatus = await this.connection.getSignatureStatus(signature, { searchTransactionHistory: true });
        if (!txStatus || !txStatus.value) {
          throw new Error(`Transaction status not found for ${signature}`);
        }

        if (txStatus.value.err) {
          return { verified: false, error: `Transaction failed on-chain: ${JSON.stringify(txStatus.value.err)}` };
        }

        if (txStatus.value.confirmationStatus !== 'confirmed' && txStatus.value.confirmationStatus !== 'finalized') {
          logger.warn(`   Transaction ${signature} is still ${txStatus.value.confirmationStatus}. Retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }

        logger.info(`   ✅ Transaction ${signature} is confirmed.`);

        // 2. Check if UserParticipation account exists and has been marked as withdrawn
        const participationAccountInfo = await this.connection.getAccountInfo(userParticipationPDA);
        if (!participationAccountInfo) {
          return { verified: false, error: `User participation account not found at ${userParticipationPDA.toString()}` };
        }

        // Decode the account data
        let withdrawn: boolean;
        let finalShareUsdc: number;
        
        if (this.program && this.program.account && this.program.account.userParticipation) {
          const decodedParticipation = await this.program.account.userParticipation.fetch(userParticipationPDA);
          withdrawn = decodedParticipation.withdrawn;
          const finalShareMicro = decodedParticipation.finalShare.toNumber();
          finalShareUsdc = finalShareMicro / 1_000_000;
        } else {
          // Fallback to manual decoding
          const buffer = Buffer.from(participationAccountInfo.data);
          let offset = 8; // Skip Anchor discriminator (8 bytes)
          
          offset += 32; // Skip user pubkey
          offset += 8; // Skip run_id
          offset += 8; // Skip deposit_amount
          
          const finalShareMicro = new BN(buffer.slice(offset, offset + 8), 'le').toNumber();
          offset += 8;
          
          withdrawn = buffer[offset] === 1;
          finalShareUsdc = finalShareMicro / 1_000_000;
        }

        if (!withdrawn) {
          return { verified: false, error: `User participation account exists but withdrawn flag is still false.` };
        }

        logger.info(`   ✅ User participation account found and marked as withdrawn: ${finalShareUsdc} USDC`);

        return {
          verified: true,
          participationAccount: {
            address: userParticipationPDA,
            withdrawn: true,
            finalShare: finalShareUsdc,
          },
        };
      } catch (error) {
        logger.error(`   Attempt ${i + 1} failed for TX ${signature}: ${error instanceof Error ? error.message : String(error)}`);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          return { verified: false, error: `Failed to verify withdraw after ${retries} retries: ${error instanceof Error ? error.message : String(error)}` };
        }
      }
    }
    return { verified: false, error: 'Verification process exhausted retries without success.' };
  }

  /**
   * Mint test USDC to a user's wallet
   * Quick fix for devnet/testing - mints test tokens to enable deposits
   */
  async mintTestUsdcToWallet(
    recipientAddress: string,
    amount: number = 1000
  ): Promise<string> {
    try {
      const { getOrCreateAssociatedTokenAccount, mintTo, getMint } = require('@solana/spl-token');
      
      const recipient = new PublicKey(recipientAddress);
      const amountRaw = BigInt(amount * 1_000_000); // Convert to micro-USDC (6 decimals)

      logger.info(`💰 Minting test USDC:`);
      logger.info(`   Recipient: ${recipient.toString()}`);
      logger.info(`   Amount: ${amount} USDC`);
      logger.info(`   Mint: ${this.usdcMint.toString()}`);

      // Check if we're the mint authority
      const mintInfo = await getMint(this.connection, this.usdcMint);
      if (mintInfo.mintAuthority && !mintInfo.mintAuthority.equals(this.wallet.publicKey)) {
        throw new AppError(
          `Backend wallet is not the mint authority. Mint authority: ${mintInfo.mintAuthority.toString()}`,
          403
        );
      }

      // Get or create recipient's token account
      const tokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.keypair,
        this.usdcMint,
        recipient
      );

      logger.info(`   Token account: ${tokenAccount.address.toString()}`);

      // Mint tokens
      const signature = await mintTo(
        this.connection,
        this.keypair,
        this.usdcMint,
        tokenAccount.address,
        this.wallet.publicKey,
        Number(amountRaw)
      );

      logger.info(`✅ Test USDC minted: ${signature}`);
      logger.info(`   View: https://explorer.solana.com/tx/${signature}?cluster=${solanaConfig.network}`);

      return signature;
    } catch (error) {
      logger.error('❌ Error minting test USDC:', error);
      throw error instanceof AppError ? error : new AppError(
        `Failed to mint test USDC: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  /**
   * Get authority public key
   */
  getAuthority(): PublicKey {
    return this.wallet.publicKey;
  }
}

