import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { solanaConfig } from '@/utils/config';
import logger from '@/utils/logger';
import idl from '../idl/instinct_trading.json';
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
  private program: Program;
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

    // Initialize the program with proper IDL typing
    try {
      // Convert new IDL format to old Anchor format
      // The IDL from Anchor 0.32 needs to be converted for @coral-xyz/anchor compatibility
      const anchorIdl: any = {
        version: idl.metadata?.version || "0.1.0",
        name: idl.metadata?.name || "instinct_trading",
        instructions: idl.instructions?.map((ix: any) => ({
          name: ix.name,
          accounts: ix.accounts || [],
          args: ix.args || [],
        })) || [],
        accounts: idl.accounts?.map((acc: any) => ({
          name: acc.name,
          type: {
            kind: "struct",
            fields: []
          }
        })) || [],
        types: idl.types?.map((type: any) => ({
          name: type.name,
          type: type.type || { kind: "struct", fields: [] }
        })) || [],
        errors: idl.errors || [],
        metadata: {
          address: this.programId.toString()
        }
      };
      
      this.program = new Program(anchorIdl, this.programId, this.provider);
      logger.info(`SolanaService initialized - Program: ${this.programId.toString()}`);
      logger.info(`Authority wallet: ${this.wallet.publicKey.toString()}`);
    } catch (error) {
      logger.error('Failed to initialize Anchor program:', error);
      logger.error('This is likely due to IDL format incompatibility');
      logger.warn('⚠️  SolanaService will operate in limited mode');
      // Create a minimal program interface for basic operations
      const minimalIdl: any = {
        version: "0.1.0",
        name: "instinct_trading",
        instructions: [],
        accounts: [],
        types: [],
        errors: [],
      };
      this.program = new Program(minimalIdl, this.programId, this.provider);
    }
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
   */
  async initializePlatform(platformFeeBps: number = 150): Promise<string> {
    try {
      const [platformPDA] = this.getPlatformPDA();
      const [platformFeeVaultPDA] = this.getPlatformFeeVaultPDA();

      const tx = await this.program.methods
        .initializePlatform(platformFeeBps)
        .accounts({
          platform: platformPDA,
          platformFeeVault: platformFeeVaultPDA,
          usdcMint: this.usdcMint,
          authority: this.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      logger.info(`Platform initialized: ${tx}`);
      return tx;
    } catch (error) {
      logger.error('Error initializing platform:', error);
      throw new AppError('Failed to initialize platform', 500);
    }
  }

  /**
   * Create a new run on-chain
   */
  async createRun(
    runId: number,
    minDeposit: number, // in USDC (will be converted to smallest unit)
    maxDeposit: number,
    maxParticipants: number
  ): Promise<string> {
    try {
      const [platformPDA] = this.getPlatformPDA();
      const [runPDA] = this.getRunPDA(runId);

      // Convert USDC to smallest unit (6 decimals)
      const minDepositLamports = new BN(minDeposit * 1_000_000);
      const maxDepositLamports = new BN(maxDeposit * 1_000_000);

      const tx = await this.program.methods
        .createRun(
          new BN(runId),
          minDepositLamports,
          maxDepositLamports,
          maxParticipants
        )
        .accounts({
          platform: platformPDA,
          run: runPDA,
          authority: this.wallet.publicKey,
        })
        .rpc();

      logger.info(`Run created on-chain: Run ID ${runId}, TX: ${tx}`);
      return tx;
    } catch (error) {
      logger.error('Error creating run:', error);
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

      const tx = await this.program.methods
        .createRunVault(new BN(runId))
        .accounts({
          run: runPDA,
          runVault: runVaultPDA,
          usdcMint: this.usdcMint,
          payer: this.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      logger.info(`Run vault created: Run ID ${runId}, TX: ${tx}`);
      return tx;
    } catch (error) {
      logger.error('Error creating run vault:', error);
      throw new AppError('Failed to create run vault', 500);
    }
  }

  /**
   * Start a run
   */
  async startRun(runId: number): Promise<string> {
    try {
      const [platformPDA] = this.getPlatformPDA();
      const [runPDA] = this.getRunPDA(runId);

      const tx = await this.program.methods
        .startRun(new BN(runId))
        .accounts({
          platform: platformPDA,
          run: runPDA,
          authority: this.wallet.publicKey,
        })
        .rpc();

      logger.info(`Run started on-chain: Run ID ${runId}, TX: ${tx}`);
      return tx;
    } catch (error) {
      logger.error('Error starting run:', error);
      throw new AppError('Failed to start run on-chain', 500);
    }
  }

  /**
   * Settle a run with final P/L
   */
  async settleRun(
    runId: number,
    finalBalance: number, // in USDC
    participantShares: Array<{ userPubkey: string; shareAmount: number }>
  ): Promise<string> {
    try {
      const [platformPDA] = this.getPlatformPDA();
      const [runPDA] = this.getRunPDA(runId);
      const [runVaultPDA] = this.getRunVaultPDA(runId);
      const [platformFeeVaultPDA] = this.getPlatformFeeVaultPDA();

      // Convert to smallest units
      const finalBalanceLamports = new BN(finalBalance * 1_000_000);
      const shares = participantShares.map(s => ({
        user: new PublicKey(s.userPubkey),
        shareAmount: new BN(s.shareAmount * 1_000_000),
      }));

      const tx = await this.program.methods
        .settleRun(new BN(runId), finalBalanceLamports, shares)
        .accounts({
          platform: platformPDA,
          run: runPDA,
          runVault: runVaultPDA,
          platformFeeVault: platformFeeVaultPDA,
          authority: this.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      logger.info(`Run settled on-chain: Run ID ${runId}, TX: ${tx}`);
      return tx;
    } catch (error) {
      logger.error('Error settling run:', error);
      throw new AppError('Failed to settle run on-chain', 500);
    }
  }

  /**
   * Update vote statistics for a user
   */
  async updateVoteStats(
    runId: number,
    userPubkey: string,
    correctVotes: number,
    totalVotes: number
  ): Promise<string> {
    try {
      const [platformPDA] = this.getPlatformPDA();
      const [runPDA] = this.getRunPDA(runId);
      const userKey = new PublicKey(userPubkey);
      const [userParticipationPDA] = this.getUserParticipationPDA(runId, userKey);

      const tx = await this.program.methods
        .updateVoteStats(
          new BN(runId),
          userKey,
          correctVotes,
          totalVotes
        )
        .accounts({
          platform: platformPDA,
          run: runPDA,
          userParticipation: userParticipationPDA,
          authority: this.wallet.publicKey,
        })
        .rpc();

      logger.info(`Vote stats updated: Run ID ${runId}, User ${userPubkey}, TX: ${tx}`);
      return tx;
    } catch (error) {
      logger.error('Error updating vote stats:', error);
      throw new AppError('Failed to update vote stats', 500);
    }
  }

  /**
   * Fetch run data from on-chain
   */
  async fetchRun(runId: number): Promise<RunData | null> {
    try {
      const [runPDA] = this.getRunPDA(runId);
      const runAccount = await this.program.account.run.fetch(runPDA);
      return runAccount as unknown as RunData;
    } catch (error) {
      logger.error('Error fetching run:', error);
      return null;
    }
  }

  /**
   * Fetch platform data from on-chain
   */
  async fetchPlatform(): Promise<any> {
    try {
      const [platformPDA] = this.getPlatformPDA();
      const platformAccount = await this.program.account.platform.fetch(platformPDA);
      return platformAccount;
    } catch (error) {
      logger.error('Error fetching platform:', error);
      return null;
    }
  }

  /**
   * Pause platform (emergency)
   */
  async pausePlatform(): Promise<string> {
    try {
      const [platformPDA] = this.getPlatformPDA();

      const tx = await this.program.methods
        .pausePlatform()
        .accounts({
          platform: platformPDA,
          authority: this.wallet.publicKey,
        })
        .rpc();

      logger.info(`Platform paused: ${tx}`);
      return tx;
    } catch (error) {
      logger.error('Error pausing platform:', error);
      throw new AppError('Failed to pause platform', 500);
    }
  }

  /**
   * Unpause platform
   */
  async unpausePlatform(): Promise<string> {
    try {
      const [platformPDA] = this.getPlatformPDA();

      const tx = await this.program.methods
        .unpausePlatform()
        .accounts({
          platform: platformPDA,
          authority: this.wallet.publicKey,
        })
        .rpc();

      logger.info(`Platform unpaused: ${tx}`);
      return tx;
    } catch (error) {
      logger.error('Error unpausing platform:', error);
      throw new AppError('Failed to unpause platform', 500);
    }
  }

  /**
   * Get authority public key
   */
  getAuthority(): PublicKey {
    return this.wallet.publicKey;
  }
}

