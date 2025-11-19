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
  private provider: AnchorProvider;
  private programId: PublicKey;
  private usdcMint: PublicKey;

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

    const keypair = Keypair.fromSecretKey(keypairData);
    this.wallet = new Wallet(keypair);
    
    this.provider = new AnchorProvider(this.connection, this.wallet, {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    });

    this.programId = new PublicKey(solanaConfig.programId);
    this.usdcMint = new PublicKey(solanaConfig.usdcMint);

    logger.info(`✅ SolanaService initialized successfully!`);
    logger.info(`   Program ID: ${this.programId.toString()}`);
    logger.info(`   Authority: ${this.wallet.publicKey.toString()}`);
    logger.info(`   Network: ${solanaConfig.network}`);
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
   * Get PDA for run account
   */
  getRunPDA(runId: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('run'), new BN(runId).toArrayLike(Buffer, 'le', 8)],
      this.programId
    );
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
   * Get PDA for platform fee vault
   */
  getPlatformFeeVaultPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('platform_fee_vault')],
      this.programId
    );
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
    try {
      const [runPDA] = this.getRunPDA(runId);
      const [runVaultPDA] = this.getRunVaultPDA(runId);

      // Build instruction for create_run_vault
      // Discriminator: [17,101,136,210,255,95,202,141]
      const discriminator = Buffer.from([17, 101, 136, 210, 255, 95, 202, 141]);
      
      const runIdBuf = Buffer.alloc(8);
      new BN(runId).toArrayLike(Buffer, 'le', 8).copy(runIdBuf);
      
      const data = Buffer.concat([discriminator, runIdBuf]);

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
      const signature = await this.provider.sendAndConfirm(tx);

      logger.info(`✅ Run vault created on-chain: Run ID ${runId}, TX: ${signature}`);
      logger.info(`   Vault PDA: ${runVaultPDA.toString()}`);
      return signature;
    } catch (error) {
      logger.error('Error creating run vault:', error);
      throw new AppError('Failed to create run vault', 500);
    }
  }

  /**
   * Start a run
   * NOTE: Not currently used - manual transaction building would be needed
   */
  async startRun(runId: number): Promise<string> {
    throw new AppError('startRun not implemented with manual transactions', 501);
  }

  /**
   * Settle a run with final P/L
   * NOTE: Not implemented with manual transactions
   */
  async settleRun(
    runId: number,
    finalBalance: number,
    participantShares: Array<{ userPubkey: string; shareAmount: number }>
  ): Promise<string> {
    throw new AppError('settleRun not implemented with manual transactions', 501);
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
      const [platformPDA] = this.getPlatformPDA();
      const [runPDA] = this.getRunPDA(params.runId);
      const [tradeRecordPDA] = this.getTradeRecordPDA(params.runId, params.round);

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

      const tx = new Transaction().add(instruction);
      const signature = await this.provider.sendAndConfirm(tx);

      logger.info(`✅ Trade recorded on-chain: Run ID ${params.runId}, Round ${params.round}, TX: ${signature}`);
      logger.info(`   Direction: ${params.direction}, Entry: $${params.entryPrice}, Exit: $${params.exitPrice || 'Open'}, PnL: $${params.pnl}`);
      return signature;
    } catch (error) {
      logger.error('Error recording trade on-chain:', error);
      // Don't throw - allow trading to continue even if on-chain recording fails
      logger.warn('⚠️  Trade execution succeeded but on-chain recording failed. Trade will continue.');
      throw error; // Re-throw for now, but you might want to make this non-blocking
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
   * Get authority public key
   */
  getAuthority(): PublicKey {
    return this.wallet.publicKey;
  }
}

