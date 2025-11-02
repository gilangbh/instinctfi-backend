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
      const signature = await this.provider.sendAndConfirm(tx);

      logger.info(`✅ Run created on-chain: Run ID ${runId}, TX: ${signature}`);
      logger.info(`   Run PDA: ${runPDA.toString()}`);
      return signature;
    } catch (error) {
      logger.error('Error creating run on-chain:', error);
      throw new AppError('Failed to create run on-chain', 500);
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

