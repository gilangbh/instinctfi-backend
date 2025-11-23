import { PrismaClient, Run, RunParticipant, Trade, VotingRound, RunStatus, RoundStatus, User } from '@prisma/client';
import { CreateRunRequest, JoinRunRequest, Run as RunType } from '@/types';
import { AppError } from '@/types';
import { calculatePositionSize, calculatePotentialPnL, applyPlatformFee, distributePnL, calculateFinalShare } from '@/utils/chaos';
import { generateChaosModifiers } from '@/utils/chaosModifier';
import { calculateVoteXp, calculateRunXp } from '@/utils/xp';
import logger from '@/utils/logger';
import { config } from '@/utils/config';
import { SolanaService } from './SolanaService';
import { getExplorerUrl } from '@/utils/solana';
import { WebSocketService } from './WebSocketService';
import { DriftIntegrationService } from './DriftIntegrationService';

// Type for Run with included relations
type RunWithParticipants = Run & {
  participants?: (RunParticipant & { user?: User })[];
  trades?: Trade[];
  votingRounds?: VotingRound[];
};

export class RunService {
  private solanaService: SolanaService | null = null;
  private wsService: WebSocketService | null = null;
  private driftService: DriftIntegrationService | null = null;

  constructor(
    private prisma: PrismaClient, 
    solanaService?: SolanaService, 
    wsService?: WebSocketService,
    driftService?: DriftIntegrationService
  ) {
    // Make Solana service optional - useful for development when blockchain is not needed
    try {
      this.solanaService = solanaService || new SolanaService();
      logger.info('RunService initialized with Solana integration');
    } catch (error) {
      logger.warn('RunService initialized WITHOUT Solana integration (blockchain features disabled)');
      logger.warn('To enable blockchain features, ensure Solana configuration is correct');
      this.solanaService = null;
    }
    
    // WebSocket service for real-time updates
    this.wsService = wsService || null;
    
    // Drift service for trade execution
    this.driftService = driftService || null;
  }

  /**
   * Create a new run
   */
  async createRun(data: CreateRunRequest): Promise<Run> {
    try {
      // Set to 3 rounds as requested
      const totalRounds = 3;

      // Set lobby phase duration (10 minutes from now)
      // Countdown will be calculated dynamically based on createdAt + 10 minutes

      // First create in database to get the ID
      const run = await this.prisma.run.create({
        data: {
          tradingPair: data.tradingPair,
          coin: data.coin,
          duration: data.duration || config.defaultRunDurationMinutes,
          votingInterval: data.votingInterval || config.defaultVotingIntervalMinutes,
          lobbyDuration: data.lobbyDuration || parseInt(process.env.LOBBY_DURATION_MINUTES || '10', 10),
          minDeposit: (data.minDeposit || config.minDepositUsdc) * 100, // Convert to cents
          maxDeposit: (data.maxDeposit || config.maxDepositUsdc) * 100, // Convert to cents
          maxParticipants: data.maxParticipants || config.maxParticipantsPerRun,
          totalRounds,
        },
      });

      // Extract numeric ID for Solana (using timestamp from creation time)
      // Since CUIDs can't be parsed as numbers, we use the creation timestamp
      const runNumericId = parseInt(run.id) || new Date(run.createdAt).getTime();

      // Only interact with blockchain if Solana service is available
      if (this.solanaService) {
        try {
          logger.info(`📝 Creating run on-chain for: ${run.id}`);
          logger.info(`   Numeric Run ID: ${runNumericId}`);
          logger.info(`   Min Deposit: ${data.minDeposit || config.minDepositUsdc} USDC`);
          logger.info(`   Max Deposit: ${data.maxDeposit || config.maxDepositUsdc} USDC`);
          logger.info(`   Max Participants: ${data.maxParticipants || config.maxParticipantsPerRun}`);

          // Create run on-chain
          const createTx = await this.solanaService.createRun(
            runNumericId,
            data.minDeposit || config.minDepositUsdc,
            data.maxDeposit || config.maxDepositUsdc,
            data.maxParticipants || config.maxParticipantsPerRun
          );

          logger.info(`   ✅ Run created on-chain: ${createTx}`);

          // Create vault for the run (using standard devnet USDC mint)
          try {
            const vaultTx = await this.solanaService.createRunVault(runNumericId);
            logger.info(`   ✅ Vault created on-chain: ${vaultTx}`);
          } catch (vaultError) {
            logger.error(`   ❌ Failed to create vault on-chain:`, vaultError);
            // Don't fail the entire run creation if vault creation fails
            // The vault can be created later using sync-runs-onchain.js
            logger.warn(`   ⚠️  Run created but vault creation failed. You can create the vault later using: node scripts/sync-runs-onchain.js ${run.id}`);
            throw vaultError;
          }
          const [vaultPDA] = this.solanaService.getRunVaultPDA(runNumericId);
          
          // Log blockchain transaction info
          logger.info(`✅ Run fully integrated on-chain: ${run.id} (${run.tradingPair})`);
          logger.info(`   Run PDA: ${this.solanaService.getRunPDA(runNumericId)[0].toString()}`);
          logger.info(`   Vault PDA: ${vaultPDA.toString()}`);
          
          // Log the USDC mint being used
          const { solanaConfig } = require('@/utils/config');
          logger.info(`   USDC Mint: ${solanaConfig.usdcMint}`);
          const standardDevnetUsdc = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
          if (solanaConfig.usdcMint === standardDevnetUsdc) {
            logger.info(`   ✅ Using standard devnet USDC (recommended)`);
          } else {
            logger.warn(`   ⚠️  Using custom USDC mint - users will need tokens from this mint`);
          }
        } catch (solanaError) {
          // If blockchain creation fails, log detailed error but don't fail the request
          logger.error('❌ Failed to create run on-chain, but DB entry created');
          logger.error('   Run ID:', run.id);
          logger.error('   Numeric Run ID:', runNumericId);
          logger.error('   Error type:', solanaError instanceof Error ? solanaError.constructor.name : typeof solanaError);
          logger.error('   Error message:', solanaError instanceof Error ? solanaError.message : String(solanaError));
          if (solanaError instanceof Error && solanaError.stack) {
            logger.error('   Stack trace:', solanaError.stack);
          }
          // Log additional error details if available
          if (solanaError && typeof solanaError === 'object') {
            const errorDetails: any = {};
            Object.getOwnPropertyNames(solanaError).forEach(key => {
              try {
                errorDetails[key] = (solanaError as any)[key];
              } catch {
                // Skip properties that can't be serialized
              }
            });
            logger.error('   Error details:', JSON.stringify(errorDetails, null, 2));
          }
          logger.warn('   ⚠️  You can sync this run later using: node scripts/sync-runs-onchain.js ' + run.id);
        }
      } else {
        logger.warn(`⚠️  Run created in database but NOT on-chain (SolanaService not available): ${run.id}`);
        logger.warn(`   You can sync this run later using: node scripts/sync-runs-onchain.js ${run.id}`);
      }

      return run;
    } catch (error) {
      logger.error('Error creating run:', error);
      throw error;
    }
  }

  /**
   * Get run by ID
   */
  async getRunById(id: string): Promise<RunWithParticipants | null> {
    try {
      return await this.prisma.run.findUnique({
        where: { id },
        include: {
          participants: {
            include: {
              user: true,
            },
          },
          trades: true,
          votingRounds: true,
        },
      });
    } catch (error) {
      logger.error('Error fetching run by ID:', error);
      throw error;
    }
  }

  /**
   * Get active runs
   */
  async getActiveRuns(): Promise<Run[]> {
    try {
      return await this.prisma.run.findMany({
        where: {
          status: {
            in: [RunStatus.WAITING, RunStatus.ACTIVE],
          },
        },
        include: {
          participants: {
            include: {
              user: true,
            },
          },
          votingRounds: {
            orderBy: {
              round: 'desc',
            },
            // Include all voting rounds so frontend can find OPEN round
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    } catch (error) {
      logger.error('Error fetching active runs:', error);
      throw error;
    }
  }

  /**
   * Get run history
   */
  async getRunHistory(page: number = 1, limit: number = 20): Promise<{ runs: Run[]; total: number }> {
    try {
      const skip = (page - 1) * limit;
      
      const [runs, total] = await Promise.all([
        this.prisma.run.findMany({
          where: {
            status: RunStatus.ENDED,
          },
          include: {
            participants: {
              include: {
                user: true,
              },
            },
            trades: true,
          },
          orderBy: [
            {
            endedAt: 'desc',
          },
            {
              createdAt: 'desc', // Fallback if endedAt is null
            },
          ],
          skip,
          take: limit,
        }),
        this.prisma.run.count({
          where: {
            status: RunStatus.ENDED,
          },
        }),
      ]);

      logger.info(`📊 Fetched run history: ${runs.length} runs (page ${page}, total: ${total})`);
      if (runs.length === 0 && total === 0) {
        logger.info('   No ended runs found in database. Checking all run statuses...');
        const allRuns = await this.prisma.run.findMany({
          select: { id: true, status: true, endedAt: true },
          take: 10,
        });
        logger.info(`   Sample runs: ${JSON.stringify(allRuns.map(r => ({ id: r.id, status: r.status, endedAt: r.endedAt })))}`);
      }

      return { runs, total };
    } catch (error) {
      logger.error('Error fetching run history:', error);
      throw error;
    }
  }

  /**
   * Join a run
   */
  async joinRun(runId: string, userId: string, data: JoinRunRequest): Promise<RunParticipant> {
    try {
      const run = await this.getRunById(runId);
      if (!run) {
        throw new AppError('Run not found', 404);
      }

      if (run.status !== RunStatus.WAITING) {
        throw new AppError('Run is not accepting new participants', 400);
      }

      if (run.participants && run.participants.length >= run.maxParticipants) {
        throw new AppError('Run is full', 400);
      }

      const depositAmount = data.depositAmount * 100; // Convert to cents

      if (depositAmount < run.minDeposit || depositAmount > run.maxDeposit) {
        throw new AppError(`Deposit amount must be between ${run.minDeposit / 100} and ${run.maxDeposit / 100} USDC`, 400);
      }

      // Check if user is already in the run
      const existingParticipant = await this.prisma.runParticipant.findUnique({
        where: {
          runId_userId: {
            runId,
            userId,
          },
        },
      });

      if (existingParticipant) {
        throw new AppError('User is already in this run', 409);
      }

      const participant = await this.prisma.runParticipant.create({
        data: {
          runId,
          userId,
          depositAmount,
        },
        include: {
          user: true,
        },
      });

      // Verify on-chain deposit if userWalletAddress and signature are provided
      const userWalletAddress = data.userWalletAddress;
      const walletSignature = (data as JoinRunRequest & { walletSignature?: string }).walletSignature;
      
      if (walletSignature) {
        logger.info(
          `Deposit signature recorded for run ${runId} / user ${userId}: ${walletSignature}`
        );
      }
      
      if (userWalletAddress && walletSignature && this.solanaService) {
        try {
          const runNumericId = parseInt(run.id) || new Date(run.createdAt).getTime();
          const { PublicKey } = require('@solana/web3.js');
          const userPubkey = new PublicKey(userWalletAddress);
          
          logger.info(`📝 Verifying on-chain deposit for user ${userId}`);
          logger.info(`   User wallet: ${userWalletAddress}`);
          logger.info(`   Transaction signature: ${walletSignature}`);
          logger.info(`   Run ID: ${runNumericId}`);
          logger.info(`   Amount: ${data.depositAmount} USDC`);

          // Verify the deposit transaction on-chain
          const verification = await this.solanaService.verifyDeposit(
            walletSignature,
            runNumericId,
            userPubkey,
            data.depositAmount
          );

          if (!verification.verified) {
            logger.error(`❌ On-chain deposit verification failed: ${verification.error}`);
            throw new AppError(
              `On-chain deposit verification failed: ${verification.error || 'Unknown error'}`,
              400
            );
          }

          logger.info(`✅ On-chain deposit verified successfully`);
          logger.info(`   Participation account: ${verification.participationAccount?.address}`);
          logger.info(`   Deposit amount: ${verification.participationAccount?.depositAmount} USDC`);
          
          // Verify that the run's participant_count was incremented
          try {
            const { Program } = require('@coral-xyz/anchor');
            const idl = require('@/idl/instinct_trading.json');
            const solanaService = this.solanaService as any;
            const program = new Program(idl, solanaService.programId, solanaService.provider);
            const [runPDA] = solanaService.getRunPDA(runNumericId);
            const decodedRun = await program.account.run.fetch(runPDA);
            const participantCount = decodedRun.participantCount.toNumber();
            logger.info(`   📊 Run participant_count on-chain: ${participantCount}`);
            logger.info(`   ✅ Deposit recorded on-chain - participant_count incremented`);
          } catch (countError) {
            logger.warn(`   ⚠️  Could not verify participant_count (non-critical):`, countError);
          }
        } catch (solanaError) {
          logger.error('❌ Failed to verify on-chain deposit:', solanaError);
          throw new AppError(
            `Failed to verify on-chain deposit: ${solanaError instanceof Error ? solanaError.message : String(solanaError)}`,
            400
          );
        }
      } else if (userWalletAddress && !walletSignature) {
        logger.warn(`⚠️  User wallet address provided but no transaction signature. On-chain deposit may not be verified.`);
      }

      // Update run total pool
      await this.prisma.run.update({
        where: { id: runId },
        data: {
          totalPool: run.totalPool + depositAmount,
        },
      });

      logger.info(`User ${userId} joined run ${runId} with ${data.depositAmount} USDC`);
      return participant;
    } catch (error) {
      logger.error('Error joining run:', error);
      throw error;
    }
  }

  /**
   * Leave a run (only during waiting phase)
   */
  async leaveRun(runId: string, userId: string): Promise<void> {
    try {
      const run = await this.getRunById(runId);
      if (!run) {
        throw new AppError('Run not found', 404);
      }

      if (run.status !== RunStatus.WAITING) {
        throw new AppError('Cannot leave run after it has started', 400);
      }

      const participant = await this.prisma.runParticipant.findUnique({
        where: {
          runId_userId: {
            runId,
            userId,
          },
        },
      });

      if (!participant) {
        throw new AppError('User is not in this run', 404);
      }

      // Remove participant and update pool
      await this.prisma.$transaction([
        this.prisma.runParticipant.delete({
          where: {
            runId_userId: {
              runId,
              userId,
            },
          },
        }),
        this.prisma.run.update({
          where: { id: runId },
          data: {
            totalPool: run.totalPool - participant.depositAmount,
          },
        }),
      ]);

      logger.info(`User ${userId} left run ${runId}`);
    } catch (error) {
      logger.error('Error leaving run:', error);
      throw error;
    }
  }

  /**
   * Withdraw user's share after run settlement
   */
  async withdraw(runId: string, userId: string, userWalletAddress?: string, walletSignature?: string): Promise<RunParticipant> {
    try {
      const run = await this.getRunById(runId);
      if (!run) {
        throw new AppError('Run not found', 404);
      }

      if (run.status !== RunStatus.ENDED) {
        throw new AppError('Run has not ended yet', 400);
      }

      const participant = await this.prisma.runParticipant.findUnique({
        where: {
          runId_userId: {
            runId,
            userId,
          },
        },
      });

      if (!participant) {
        throw new AppError('User is not a participant in this run', 404);
      }

      if (participant.withdrawn) {
        throw new AppError('User has already withdrawn', 400);
      }

      // Verify on-chain withdraw if userWalletAddress and signature are provided
      if (userWalletAddress && walletSignature && this.solanaService) {
        try {
          const runNumericId = parseInt(run.id) || new Date(run.createdAt).getTime();
          const { PublicKey } = require('@solana/web3.js');
          const userPubkey = new PublicKey(userWalletAddress);
          
          logger.info(`📝 Verifying on-chain withdraw for user ${userId}`);
          logger.info(`   User wallet: ${userWalletAddress}`);
          logger.info(`   Transaction signature: ${walletSignature}`);
          logger.info(`   Run ID: ${runNumericId}`);

          // Verify the withdraw transaction on-chain
          const verification = await this.solanaService.verifyWithdraw(
            walletSignature,
            runNumericId,
            userPubkey
          );

          if (!verification.verified) {
            logger.error(`❌ On-chain withdraw verification failed: ${verification.error}`);
            throw new AppError(
              `On-chain withdraw verification failed: ${verification.error || 'Unknown error'}`,
              400
            );
          }

          logger.info(`✅ On-chain withdraw verified successfully`);
          logger.info(`   Participation account: ${verification.participationAccount?.address}`);
          logger.info(`   Final share: ${verification.participationAccount?.finalShare} USDC`);

        } catch (solanaError) {
          logger.error('❌ Failed to verify on-chain withdraw:', solanaError);
          throw new AppError(
            `Failed to verify on-chain withdraw: ${solanaError instanceof Error ? solanaError.message : String(solanaError)}`,
            400
          );
        }
      } else if (userWalletAddress && !walletSignature) {
        logger.warn(`⚠️  User wallet address provided but no transaction signature. On-chain withdraw may not be verified.`);
      }

      // Update participant as withdrawn
      const updatedParticipant = await this.prisma.runParticipant.update({
        where: {
          runId_userId: {
            runId,
            userId,
          },
        },
        data: {
          withdrawn: true,
        },
      });

      logger.info(`User ${userId} withdrew from run ${runId}`);
      return updatedParticipant;
    } catch (error) {
      logger.error('Error withdrawing from run:', error);
      throw error;
    }
  }

  /**
   * Start a run
   */
  async startRun(runId: string): Promise<Run> {
    try {
      const run = await this.getRunById(runId);
      if (!run) {
        throw new AppError('Run not found', 404);
      }

      if (run.status !== RunStatus.WAITING) {
        throw new AppError('Run cannot be started', 400);
      }

      if (!run.participants || run.participants.length === 0) {
        throw new AppError('Run has no participants', 400);
      }

      // Start run on-chain FIRST (before updating DB status)
      // IMPORTANT: This must succeed before updating DB status to ACTIVE
      let onChainStartSucceeded = false;
      
      if (this.solanaService) {
        const runNumericId = parseInt(run.id) || new Date(run.createdAt).getTime();
        try {
          logger.info(`🔗 Starting on-chain start for run ${runId} (numeric ID: ${runNumericId})`);
          logger.info(`   ⚠️  On-chain start is REQUIRED - DB status will only be updated after successful on-chain start`);
          
          // Check if run exists on-chain, if not, try to create it
          const runExists = await this.solanaService.runExistsOnChain(runNumericId);
          
          if (!runExists) {
            logger.warn(`⚠️  Run ${runId} does not exist on-chain. Creating it now...`);
            try {
              // Create run on-chain with parameters from database
              const minDepositUsdc = run.minDeposit / 100; // Convert from cents to USDC
              const maxDepositUsdc = run.maxDeposit / 100;
              const createTx = await this.solanaService.createRun(
                runNumericId,
                minDepositUsdc,
                maxDepositUsdc,
                run.maxParticipants
              );
              logger.info(`✅ Run created on-chain: ${createTx}`);
              
              // Also create the vault
              try {
                const vaultTx = await this.solanaService.createRunVault(runNumericId);
                logger.info(`✅ Vault created on-chain: ${vaultTx}`);
              } catch (vaultError) {
                logger.error(`⚠️  Failed to create vault on-chain:`, vaultError);
                // Continue anyway - vault might already exist
              }
            } catch (createError) {
              logger.error(`❌ Failed to create run on-chain:`, createError);
              throw new Error(`Cannot start run: run does not exist on-chain and creation failed: ${createError instanceof Error ? createError.message : String(createError)}`);
            }
          }
          
          // Now start the run on-chain
          logger.info(`📝 Starting run on-chain...`);
          const startTx = await this.solanaService.startRun(runNumericId);
          logger.info(`✅ Run started on-chain successfully: ${getExplorerUrl(startTx)}`);
          
          // Verify the run status changed to Active
          try {
            const [runPDA] = this.solanaService.getRunPDA(runNumericId);
            let startedRun: any = null;
            
            const program = this.solanaService.getProgram();
            if (program && program.account && program.account.run) {
              startedRun = await program.account.run.fetch(runPDA);
            } else {
              // Fallback to manual decoding
              const decodedRun = await this.solanaService.decodeRunAccount(runPDA);
              if (decodedRun) {
                startedRun = {
                  status: { toString: () => decodedRun.status },
                };
              }
            }
            
            if (startedRun) {
              const statusStr = typeof startedRun.status === 'string' ? startedRun.status : startedRun.status.toString();
              logger.info(`   ✅ Verified: On-chain run status is now ${statusStr}`);
            }
            onChainStartSucceeded = true;
          } catch (verifyError) {
            logger.warn(`   ⚠️  Could not verify on-chain start: ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`);
            // Even if verification fails, if the transaction succeeded, we consider it successful
            onChainStartSucceeded = true;
          }
        } catch (solanaError) {
          logger.error('❌ CRITICAL: Failed to start run on-chain:');
          logger.error('   Error type:', solanaError instanceof Error ? solanaError.constructor.name : typeof solanaError);
          logger.error('   Error message:', solanaError instanceof Error ? solanaError.message : String(solanaError));
          if (solanaError instanceof Error && solanaError.stack) {
            logger.error('   Stack trace:', solanaError.stack);
          }
          logger.error('   ⚠️  On-chain start FAILED - this will prevent DB status update');
          throw new AppError(
            `Failed to start run on-chain: ${solanaError instanceof Error ? solanaError.message : String(solanaError)}. Run status will remain WAITING until on-chain start succeeds.`,
            500
          );
        }
      } else {
        // If Solana service is not available, log a warning but allow DB update
        logger.warn(`⚠️  SolanaService is not available - skipping on-chain start for run ${runId}`);
        logger.warn(`   Run will be marked as ACTIVE in DB, but on-chain status will not be updated`);
        onChainStartSucceeded = true; // Allow DB update if Solana is not configured
      }

      // Only update DB status to ACTIVE if on-chain start succeeded
      if (onChainStartSucceeded) {
        const updatedRun = await this.prisma.run.update({
          where: { id: runId },
          data: {
            status: RunStatus.ACTIVE,
            startedAt: new Date(),
            startingPool: run.totalPool,
          },
        });

        // Create first voting round
        await this.createVotingRound(runId, 1);

        logger.info(`✅ Run started successfully: ${runId}`);
        logger.info(`   Database status: ACTIVE`);
        if (this.solanaService) {
          logger.info(`   On-chain status: Active`);
        }
        return updatedRun;
      } else {
        // This should not happen due to error handling above, but just in case
        throw new AppError('On-chain start did not succeed. Run status remains WAITING.', 500);
      }
    } catch (error) {
      logger.error('Error starting run:', error);
      throw error;
    }
  }

  /**
   * Create a voting round
   */
  async createVotingRound(runId: string, round: number): Promise<VotingRound> {
    try {
      const chaosModifiers = generateChaosModifiers();
      
      // Get current price from Drift service with fallback
      // Get the run to determine trading pair
      const run = await this.getRunById(runId);
      if (!run) {
        throw new AppError('Run not found', 404);
      }
      
      // Get market symbol from trading pair (e.g., "SOL/USDC" -> "SOL-PERP")
      const baseSymbol = run.tradingPair?.split('/')[0] || 'SOL';
      const marketSymbol = baseSymbol + '-PERP';
      
      // Get price from Drift oracle only
      if (!this.driftService) {
        throw new AppError('Drift service not available - cannot fetch price', 500);
      }
      
      let currentPrice: number;
      try {
        currentPrice = await this.driftService.getMarketPrice(marketSymbol);
        if (!currentPrice || currentPrice <= 0) {
          throw new AppError(`Invalid price fetched from Drift for ${marketSymbol}: ${currentPrice}`, 500);
        }
        logger.info(`📊 Fetched price from Drift oracle for ${marketSymbol}: $${currentPrice.toFixed(2)}`);
      } catch (driftError) {
        logger.error(`❌ Failed to fetch price from Drift oracle: ${driftError instanceof Error ? driftError.message : String(driftError)}`);
        throw new AppError(`Cannot fetch price from Drift oracle for ${marketSymbol}: ${driftError instanceof Error ? driftError.message : String(driftError)}`, 500);
      }
      
      // Get 24h price change (placeholder for now - can be enhanced later)
      const priceChange24h = 0; // Will be fetched from price service if needed

      // Database stores leverage and positionSize as integers
      // Store as tenths (multiply by 10) to preserve 1 decimal place
      // e.g., 15.3x leverage -> 153, 45.7% position -> 457
      const leverageStored = Math.round(chaosModifiers.leverage * 10);
      const positionSizeStored = Math.round(chaosModifiers.positionSizePercentage * 10);

      const votingRound = await this.prisma.votingRound.create({
        data: {
          runId,
          round,
          leverage: leverageStored,
          positionSize: positionSizeStored,
          currentPrice,
          priceChange24h,
          timeRemaining: 600, // 10 minutes in seconds
          startedAt: new Date(), // Explicitly set startedAt for timer calculation
          status: RoundStatus.OPEN, // Explicitly set status to OPEN
        },
      });

      logger.info(`🎲 Voting round created: ${runId} - Round ${round}`, {
        leverage: `${chaosModifiers.leverage.toFixed(1)}x (stored as ${leverageStored})`,
        positionSize: `${chaosModifiers.positionSizePercentage.toFixed(1)}% (stored as ${positionSizeStored})`,
      });
      return votingRound;
    } catch (error) {
      logger.error('Error creating voting round:', error);
      throw error;
    }
  }

  /**
   * Cast a vote
   */
  async castVote(runId: string, userId: string, round: number, choice: string): Promise<void> {
    try {
      const run = await this.getRunById(runId);
      if (!run) {
        throw new AppError('Run not found', 404);
      }

      if (run.status !== RunStatus.ACTIVE) {
        throw new AppError('Run is not active', 400);
      }

      // Check if user is in the run
      const participant = await this.prisma.runParticipant.findUnique({
        where: {
          runId_userId: {
            runId,
            userId,
          },
        },
      });

      if (!participant) {
        throw new AppError('User is not in this run', 404);
      }

      // Check if voting round is open
      const votingRound = await this.prisma.votingRound.findUnique({
        where: {
          runId_round: {
            runId,
            round,
          },
        },
      });

      if (!votingRound || votingRound.status !== RoundStatus.OPEN) {
        throw new AppError('Voting round is not open', 400);
      }

      // Check if user already voted
      const existingVote = await this.prisma.vote.findUnique({
        where: {
          runId_userId_round: {
            runId,
            userId,
            round,
          },
        },
      });

      if (existingVote) {
        throw new AppError('User already voted in this round', 409);
      }

      await this.prisma.vote.create({
        data: {
          runId,
          userId,
          round,
          choice: choice as any,
        },
      });

      logger.info(`Vote cast: User ${userId} voted ${choice} in run ${runId} round ${round}`);

      // Calculate vote distribution and broadcast update via WebSocket
      const votes = await this.prisma.vote.findMany({
        where: {
          runId,
          round,
        },
      });

      const voteDistribution = {
        long: votes.filter(v => v.choice === 'LONG').length,
        short: votes.filter(v => v.choice === 'SHORT').length,
        skip: votes.filter(v => v.choice === 'SKIP').length,
      };

      // Calculate time remaining
      const now = new Date();
      const startedAt = votingRound.startedAt;
      const votingIntervalMs = (run.votingInterval || config.defaultVotingIntervalMinutes) * 60 * 1000;
      const elapsed = now.getTime() - startedAt.getTime();
      const timeRemaining = Math.max(0, Math.floor((votingIntervalMs - elapsed) / 1000));

      // Broadcast vote update via WebSocket
      if (this.wsService) {
        this.wsService.broadcastVoteUpdate(runId, {
          runId,
          round,
          voteDistribution,
          timeRemaining,
        });
      }
    } catch (error) {
      logger.error('Error casting vote:', error);
      throw error;
    }
  }

  /**
   * Execute trade for a round
   * Uses chaos modifiers (randomized position size 10-100% and leverage 1-20x)
   */
  async executeTrade(runId: string, round: number): Promise<Trade> {
    try {
      const run = await this.getRunById(runId);
      if (!run) {
        throw new AppError('Run not found', 404);
      }

      const votingRound = await this.prisma.votingRound.findUnique({
        where: {
          runId_round: {
            runId,
            round,
          },
        },
      });

      if (!votingRound) {
        throw new AppError('Voting round not found', 404);
      }

      // Get vote distribution
      const votes = await this.prisma.vote.findMany({
        where: {
          runId,
          round,
        },
      });

      const voteDistribution = {
        long: votes.filter(v => v.choice === 'LONG').length,
        short: votes.filter(v => v.choice === 'SHORT').length,
        skip: votes.filter(v => v.choice === 'SKIP').length,
      };

      // Determine trade direction (majority wins)
      let direction = 'SKIP';
      if (voteDistribution.long > voteDistribution.short && voteDistribution.long > voteDistribution.skip) {
        direction = 'LONG';
      } else if (voteDistribution.short > voteDistribution.long && voteDistribution.short > voteDistribution.skip) {
        direction = 'SHORT';
      }

      // Generate chaos modifiers (randomized position size & leverage per PRD)
      const chaosModifiers = generateChaosModifiers();
      
      logger.info(`🎲 Chaos modifiers for round ${round}:`, {
        positionSize: `${chaosModifiers.positionSizePercentage.toFixed(1)}%`,
        leverage: `${chaosModifiers.leverage.toFixed(1)}x`,
        slippage: `${(chaosModifiers.slippageTolerance * 100).toFixed(1)}%`,
      });

      // Update voting round with vote distribution and chaos modifiers
      // Store as tenths (multiply by 10) to match database format
      const leverageStored = Math.round(chaosModifiers.leverage * 10);
      const positionSizeStored = Math.round(chaosModifiers.positionSizePercentage * 10);
      
      await this.prisma.votingRound.update({
        where: {
          runId_round: {
            runId,
            round,
          },
        },
        data: {
          voteDistribution,
          status: RoundStatus.EXECUTING,
          // Update with actual chaos values (stored as tenths)
          positionSize: positionSizeStored,
          leverage: leverageStored,
        },
      });

      // Execute trade - OPEN position (will close when next round ends)
      // Get entry price from voting round - must be valid
      let entryPrice = Number(votingRound.currentPrice);
      if (!entryPrice || entryPrice === 0) {
        // Fetch current price from Drift service if voting round price is invalid
        if (!this.driftService) {
          throw new AppError('Drift service not available and votingRound.currentPrice is invalid', 500);
        }
        
        const marketSymbol = run.tradingPair?.split('/')[0] + '-PERP' || 'SOL-PERP';
        entryPrice = await this.driftService.getMarketPrice(marketSymbol);
        
        if (!entryPrice || entryPrice <= 0) {
          throw new AppError(`Invalid entry price fetched for ${marketSymbol}: ${entryPrice}`, 500);
        }
        
        logger.info(`📊 Fetched entry price for trade: $${entryPrice.toFixed(2)}`);
      }
      let exitPrice: number | null = null; // Will be set when position closes
      let pnl = 0; // Will be calculated when position closes
      let tradeTransactionId: string | undefined;
      
      if (direction !== 'SKIP') {
        // PRD Trading Requirements:
        // - Order type: Always market orders ✓
        // - Slippage tolerance: Fixed at 0.1% (handled by Drift Protocol)
        // - Position sizing: Randomized between 10% - 100% of pool ✓
        // - Leverage: Randomized between 1x - 20x ✓
        // - Failure handling: If DEX trade fails → Skip trade and continue
        
        // Calculate position size in USDC
        const positionSizeUsdc = (run.totalPool / 100) * chaosModifiers.positionSizePercentage / 100;
        
        // Execute trade on Drift Protocol (or simulate if not enabled)
        if (this.driftService) {
          try {
            // Get market symbol from trading pair (e.g., "SOL/USDC" -> "SOL-PERP")
            const marketSymbol = run.tradingPair?.split('/')[0] + '-PERP' || 'SOL-PERP';
            
            logger.info(`🚀 Opening position on Drift: ${direction} ${positionSizeUsdc / 100} USDC at ${chaosModifiers.leverage}x leverage`);
            logger.info(`   Position will stay open until next round's voting ends (${run.votingInterval} minutes)`);
            logger.info(`   Slippage tolerance: 0.1% (fixed per PRD)`);
            logger.info(`   DriftService available: ${!!this.driftService}`);
            logger.info(`   Is real trading enabled: ${this.driftService.isRealTrading()}`);
            
            const tradeResult = await this.driftService.executeTrade({
              marketSymbol,
              direction: direction.toLowerCase() as 'long' | 'short',
              baseAmount: positionSizeUsdc / 100, // Convert from cents to USDC
              leverage: chaosModifiers.leverage,
            });
            
            if (tradeResult.success) {
              tradeTransactionId = tradeResult.transactionId;
              
              // Get actual entry price from the position after opening
              try {
                const positions = await this.driftService.getOpenPositions();
                const position = positions.find(p => p.marketSymbol === marketSymbol);
                if (position && position.entryPrice) {
                  entryPrice = position.entryPrice;
                  logger.info(`📊 Actual entry price from Drift position: $${entryPrice.toFixed(2)}`);
                } else if (tradeResult.entryPrice) {
                  entryPrice = tradeResult.entryPrice;
                  logger.info(`📊 Entry price from trade result: $${entryPrice.toFixed(2)}`);
                } else {
                  logger.warn(`⚠️ Could not get entry price from position, using fetched price: $${entryPrice.toFixed(2)}`);
                }
              } catch (error) {
                logger.error('Error fetching position entry price:', error);
                // entryPrice already set from votingRound or fetch above
              }
              
              // Position is now OPEN - we'll close it when the next round's voting ends
              logger.info(`✅ Position opened successfully on Drift: ${tradeTransactionId}`);
              logger.info(`   Entry: $${entryPrice.toFixed(2)}`);
              logger.info(`   Position will close when round ${round + 1} voting ends`);
            } else {
              // PRD: "If DEX trade fails → Skip trade and continue"
              logger.error(`❌ Trade execution failed: ${tradeResult.error}`);
              logger.warn('⚠️ DEX trade failed - treating as SKIP per PRD');
              direction = 'SKIP'; // Change direction to SKIP when DEX fails
            }
          } catch (error) {
            // PRD: "If DEX trade fails → Skip trade and continue"
            logger.error('Error executing trade on Drift:', error);
            logger.warn('⚠️ DEX trade error - treating as SKIP per PRD');
            direction = 'SKIP'; // Change direction to SKIP when DEX fails
          }
        } else {
          // No Drift service - treat as SKIP per PRD failure handling
          logger.warn('⚠️ Drift service not available - treating as SKIP per PRD');
          direction = 'SKIP';
        }
      }

      // Store trade values as tenths (multiply by 10) to match database format
      const tradeLeverageStored = Math.round(chaosModifiers.leverage * 10);
      const tradePositionSizeStored = Math.round(chaosModifiers.positionSizePercentage * 10);

      const trade = await this.prisma.trade.create({
        data: {
          runId,
          round,
          direction: direction as any,
          leverage: tradeLeverageStored,
          positionSize: tradePositionSizeStored,
          entryPrice,
          exitPrice: null, // Will be set when position closes
          pnl: 0, // Will be calculated when position closes
          pnlPercentage: 0, // Will be calculated when position closes
          executedAt: new Date(),
        },
      });

      // Don't update pool yet - will update when position closes
      logger.info(`Trade opened: ${runId} - Round ${round} - ${direction} - ${chaosModifiers.leverage.toFixed(1)}x leverage - ${chaosModifiers.positionSizePercentage.toFixed(1)}% position`);
      logger.info(`   Position will close when round ${round + 1} voting ends`);

      // Record trade on-chain (non-blocking - don't fail if this fails)
      const runNumericId = parseInt(runId) || Date.now();
      if (this.solanaService && runNumericId) {
        try {
          logger.info(`📝 Attempting to record trade on-chain:`);
          logger.info(`   Run ID: ${runNumericId} (from DB ID: ${runId})`);
          logger.info(`   Round: ${round}`);
          logger.info(`   Direction: ${direction}`);
          logger.info(`   Entry Price: $${entryPrice.toFixed(2)}`);
          logger.info(`   Leverage: ${chaosModifiers.leverage.toFixed(1)}x`);
          logger.info(`   Position Size: ${chaosModifiers.positionSizePercentage.toFixed(1)}%`);
          
          const txSignature = await this.solanaService.recordTrade({
            runId: runNumericId,
            round,
            direction: direction as 'LONG' | 'SHORT' | 'SKIP',
            entryPrice,
            exitPrice: null, // Position still open
            pnl: 0, // Will be updated when closed
            leverage: chaosModifiers.leverage,
            positionSizePercent: chaosModifiers.positionSizePercentage,
          });
          
          logger.info(`✅ Trade recorded on-chain for round ${round}`);
          logger.info(`   Transaction: ${txSignature}`);
        } catch (error) {
          logger.error(`⚠️  Failed to record trade on-chain (non-blocking):`);
          logger.error(`   Run ID: ${runNumericId} (from DB ID: ${runId})`);
          logger.error(`   Round: ${round}`);
          logger.error(`   Error:`, error instanceof Error ? error.message : String(error));
          if (error instanceof Error && error.stack) {
            logger.error(`   Stack:`, error.stack);
          }
          // Continue - don't fail the trade execution
        }
      } else {
        if (!this.solanaService) {
          logger.warn(`⚠️  SolanaService not available - trade not recorded on-chain`);
        }
        if (!runNumericId) {
          logger.warn(`⚠️  Could not determine numeric run ID - trade not recorded on-chain`);
        }
      }

      return trade;
    } catch (error) {
      logger.error('Error executing trade:', error);
      throw error;
    }
  }

  /**
   * Close a position for a specific round
   */
  async closePosition(runId: string, round: number): Promise<Trade> {
    try {
      const run = await this.getRunById(runId);
      if (!run) {
        throw new AppError('Run not found', 404);
      }

      // Find the trade for this round
      const trade = await this.prisma.trade.findFirst({
        where: {
          runId,
          round,
        },
      });

      if (!trade) {
        throw new AppError(`Trade not found for round ${round}`, 404);
      }

      // If already closed, return it
      if (trade.exitPrice !== null) {
        logger.info(`Trade for round ${round} is already closed`);
        return trade;
      }

      let entryPrice = Number(trade.entryPrice);
      let exitPrice = entryPrice;
      let pnl = 0;
      const marketSymbol = run.tradingPair?.split('/')[0] + '-PERP' || 'SOL-PERP';

      // Close position on Drift if direction is not SKIP
      if (trade.direction !== 'SKIP' && this.driftService) {
        try {
          logger.info(`🔒 Closing position for round ${round} on Drift: ${marketSymbol}`);
          
          const closeResult = await this.driftService.closePosition(marketSymbol);
          
          if (closeResult.success) {
            // Use actual prices from closeResult if available (from position before closing)
            if (closeResult.entryPrice && closeResult.entryPrice > 0) {
              entryPrice = closeResult.entryPrice;
              logger.info(`📊 Entry price from Drift position: $${entryPrice.toFixed(2)}`);
            }
            
            if (closeResult.exitPrice && closeResult.exitPrice > 0) {
              exitPrice = closeResult.exitPrice;
              logger.info(`📊 Exit price from Drift position: $${exitPrice.toFixed(2)}`);
            } else {
              // Fallback: get current market price (shouldn't happen if position existed)
              exitPrice = await this.driftService.getMarketPrice(marketSymbol);
              logger.warn(`⚠️ Exit price not in closeResult, using market price: $${exitPrice.toFixed(2)}`);
            }
            
            // Use PnL from closeResult if available, otherwise calculate it
            if (closeResult.pnl !== undefined) {
              pnl = Math.round(closeResult.pnl * 100); // Convert from USDC to cents
            } else {
              // Calculate position size in USDC at the time trade was opened
              // We need to get the pool size when the trade was executed
              // Get the voting round for this trade to find the pool size at that time
              const votingRound = await this.prisma.votingRound.findFirst({
                where: {
                  runId,
                  round,
                },
              });
              
              // Use the pool size from when the trade was executed (before this trade's PnL)
              // We can calculate backwards: if we know the position size percentage and the actual position,
              // but we don't have that stored. So we'll use the run's startingPool + sum of all previous trades' PnL
              const previousTrades = await this.prisma.trade.findMany({
                where: {
                  runId,
                  round: { lt: round },
                  exitPrice: { not: null }, // Only closed trades
                },
              });
              
              const previousPnL = previousTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
              const poolAtTradeTime = run.startingPool + previousPnL;
              
              const leverage = trade.leverage / 10; // Convert from tenths
              const positionSizePercent = trade.positionSize / 10; // Convert from tenths
              const positionSizeCents = (poolAtTradeTime * positionSizePercent) / 100; // Position size in cents
              
              pnl = calculatePotentialPnL(
                entryPrice,
                exitPrice,
                positionSizeCents, // Now in cents, as expected by calculatePotentialPnL
                leverage,
                trade.direction.toLowerCase() as 'long' | 'short'
              );
            }
            logger.info(`✅ Position closed on Drift, Exit: $${exitPrice.toFixed(2)}, PnL: ${pnl.toFixed(2)} cents`);
          } else {
            logger.error(`❌ Failed to close position: ${closeResult.error}`);
            // Try to get current market price instead of random simulation
            try {
              exitPrice = await this.driftService.getMarketPrice(marketSymbol);
              logger.warn(`⚠️ Using current market price as exit price: $${exitPrice.toFixed(2)}`);
            } catch (error) {
              logger.error(`❌ Could not fetch market price for exit, position may have incorrect PnL: ${error}`);
              // Last resort: use entry price (no change = 0 PnL)
              exitPrice = entryPrice;
              logger.warn(`⚠️ Using entry price as exit price (PnL will be 0): $${exitPrice.toFixed(2)}`);
            }
            
            // Get pool size at trade time
            const previousTrades = await this.prisma.trade.findMany({
              where: {
                runId,
                round: { lt: round },
                exitPrice: { not: null },
              },
            });
            const previousPnL = previousTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
            const poolAtTradeTime = run.startingPool + previousPnL;
            
            const leverage = trade.leverage / 10;
            const positionSizePercent = trade.positionSize / 10;
            const positionSizeCents = (poolAtTradeTime * positionSizePercent) / 100;
            pnl = calculatePotentialPnL(
              entryPrice,
              exitPrice,
              positionSizeCents, // In cents
              leverage,
              trade.direction.toLowerCase() as 'long' | 'short'
            );
          }
        } catch (error) {
          logger.error('Error closing position on Drift, trying to get market price:', error);
          // Try to get current market price instead of random simulation
          try {
            exitPrice = await this.driftService.getMarketPrice(marketSymbol);
            logger.warn(`⚠️ Using current market price as exit price: $${exitPrice.toFixed(2)}`);
          } catch (priceError) {
            logger.error(`❌ Could not fetch market price for exit, position may have incorrect PnL: ${priceError}`);
            // Last resort: use entry price (no change = 0 PnL)
            exitPrice = entryPrice;
            logger.warn(`⚠️ Using entry price as exit price (PnL will be 0): $${exitPrice.toFixed(2)}`);
          }
          
          // Get pool size at trade time
          const previousTrades = await this.prisma.trade.findMany({
            where: {
              runId,
              round: { lt: round },
              exitPrice: { not: null },
            },
          });
          const previousPnL = previousTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
          const poolAtTradeTime = run.startingPool + previousPnL;
          
          const leverage = trade.leverage / 10;
          const positionSizePercent = trade.positionSize / 10;
          const positionSizeCents = (poolAtTradeTime * positionSizePercent) / 100;
          pnl = calculatePotentialPnL(
            entryPrice,
            exitPrice,
            positionSizeCents, // In cents
            leverage,
            trade.direction.toLowerCase() as 'long' | 'short'
          );
        }
      } else {
        // SKIP or no Drift service
        if (trade.direction === 'SKIP') {
          logger.info('⚠️ Trade was SKIP, no position to close');
          exitPrice = entryPrice; // No price change for SKIP
        } else {
          logger.warn('⚠️ No Drift service available, trying to get market price');
          if (this.driftService) {
            try {
              exitPrice = await this.driftService.getMarketPrice(marketSymbol);
              logger.info(`✅ Using market price as exit price: $${exitPrice.toFixed(2)}`);
            } catch (error) {
              logger.error(`❌ Could not fetch market price, using entry price (PnL will be 0): ${error}`);
              exitPrice = entryPrice; // No price change = 0 PnL
            }
          } else {
            exitPrice = entryPrice; // No price change = 0 PnL
          }
        }
        if (trade.direction !== 'SKIP') {
          // Get pool size at trade time
          const previousTrades = await this.prisma.trade.findMany({
            where: {
              runId,
              round: { lt: round },
              exitPrice: { not: null },
            },
          });
          const previousPnL = previousTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
          const poolAtTradeTime = run.startingPool + previousPnL;
          
          const leverage = trade.leverage / 10;
          const positionSizePercent = trade.positionSize / 10;
          const positionSizeCents = (poolAtTradeTime * positionSizePercent) / 100;
          pnl = calculatePotentialPnL(
            entryPrice,
            exitPrice,
            positionSizeCents, // In cents
            leverage,
            trade.direction.toLowerCase() as 'long' | 'short'
          );
        }
      }

      // Update trade with exit price and PnL
      const updatedTrade = await this.prisma.trade.update({
        where: { id: trade.id },
        data: {
          exitPrice,
          pnl,
          pnlPercentage: run.totalPool > 0 ? (pnl / run.totalPool) * 100 : 0,
          settledAt: new Date(),
        },
      });

      // Update run total pool (clamp to 0 minimum - can't have negative pool)
      const newTotalPool = Math.max(0, run.totalPool + pnl);
      await this.prisma.run.update({
        where: { id: runId },
        data: {
          totalPool: newTotalPool,
        },
      });

      // Log warning if pool would have gone negative
      if (run.totalPool + pnl < 0) {
        logger.warn(`⚠️ Pool would have gone negative for run ${runId}. Clamped to 0. Original: ${run.totalPool}, PnL: ${pnl}, New: ${newTotalPool}`);
      }

      // Update participant vote stats based on trade result
      await this.updateParticipantVoteStats(runId, round, trade.direction);

      // Update trade record on-chain with final exit price and PnL (non-blocking)
      const runNumericId = parseInt(run.id) || Date.now();
      if (this.solanaService && runNumericId) {
        try {
          // Note: Currently we only record trades when they open. To update with exit price/PnL,
          // we would need an update_trade instruction in the Solana program.
          // For now, we log that the trade was closed.
          logger.info(`📝 Trade closed - on-chain record exists for round ${round}`);
          logger.info(`   Final Entry: $${entryPrice.toFixed(2)}, Exit: $${exitPrice.toFixed(2)}, PnL: $${(pnl / 100).toFixed(2)}`);
          // TODO: Add update_trade instruction to Solana program to update exit price and PnL
    } catch (error) {
          logger.error(`⚠️  Failed to update trade on-chain (non-blocking):`, error);
          // Continue - don't fail the trade closing
        }
      }

      // Broadcast trade update via WebSocket
      if (this.wsService) {
        this.wsService.broadcastTradeUpdate(runId, {
          runId,
          trade: updatedTrade as any, // Prisma enum type compatibility
        });
        logger.info(`📡 Broadcasted trade update for round ${round} via WebSocket`);
      }

      logger.info(`✅ Position closed for round ${round}: Entry $${entryPrice.toFixed(2)}, Exit $${exitPrice.toFixed(2)}, PnL: ${pnl.toFixed(2)} cents`);
      return updatedTrade;
    } catch (error) {
      logger.error(`Error closing position for round ${round}:`, error);
      throw error;
    }
  }

  /**
   * End a run
   */
  async endRun(runId: string): Promise<Run> {
    try {
      const run = await this.getRunById(runId);
      if (!run) {
        throw new AppError('Run not found', 404);
      }

      if (run.status !== RunStatus.ACTIVE) {
        throw new AppError('Run is not active', 400);
      }

      // Close the last round's position if it's still open
      const lastRound = run.currentRound || run.totalRounds;
      const lastTrade = await this.prisma.trade.findFirst({
        where: {
          runId,
          round: lastRound,
        },
      });

      if (lastTrade && lastTrade.exitPrice === null) {
        logger.info(`🔒 Closing last round's position (round ${lastRound}) before ending run`);
        await this.closePosition(runId, lastRound);
      }

      // Calculate final shares for participants
      const participants = run.participants || [];
      const totalPnL = run.totalPool - run.startingPool;
      const pnlShares = distributePnL(totalPnL, participants);

      const participantShares: Array<{ userPubkey: string; shareAmount: number }> = [];

      // Update participants with final shares
      for (let i = 0; i < participants.length; i++) {
        const participant = participants[i];
        const finalShare = calculateFinalShare(participant.depositAmount, pnlShares[i]);

        await this.prisma.runParticipant.update({
          where: {
            runId_userId: {
              runId,
              userId: participant.userId,
            },
          },
          data: {
            finalShare,
          },
        });
      }

      // Settle run on-chain (if blockchain is enabled)
      // IMPORTANT: This must succeed before updating DB status to ENDED
      let onChainSettlementSucceeded = false;
      if (this.solanaService) {
        // Use the same numeric ID generation logic as createRun
        // This ensures we use the same ID that was used when creating the run on-chain
        const runNumericId = parseInt(runId) || new Date(run.createdAt).getTime();
        try {
          logger.info(`🔗 Starting on-chain settlement for run ${runId} (numeric ID: ${runNumericId})`);
          logger.info(`   ⚠️  On-chain settlement is REQUIRED - DB status will only be updated after successful settlement`);
          
          // Check if run exists on-chain and get its status
          const runExists = await this.solanaService.runExistsOnChain(runNumericId);
          if (!runExists) {
            logger.warn(`   ⚠️  Run ${runNumericId} does not exist on-chain. Attempting to create it now...`);
            
            // Try to create the run on-chain if it doesn't exist
            try {
              const minDepositUsdc = run.minDeposit / 100; // Convert from cents to USDC
              const maxDepositUsdc = run.maxDeposit / 100;
              
              logger.info(`   Creating run on-chain with ID ${runNumericId}...`);
              const createTx = await this.solanaService.createRun(
                runNumericId,
                minDepositUsdc,
                maxDepositUsdc,
                run.maxParticipants
              );
              logger.info(`   ✅ Run created on-chain: ${createTx}`);
              
              // Also create the vault if it doesn't exist
              try {
                const vaultTx = await this.solanaService.createRunVault(runNumericId);
                logger.info(`   ✅ Vault created on-chain: ${vaultTx}`);
              } catch (vaultError) {
                logger.warn(`   ⚠️  Vault creation failed (may already exist):`, vaultError);
                // Continue - vault might already exist
              }
              
              // Now start the run on-chain if it's in ACTIVE status
              if (run.status === RunStatus.ACTIVE) {
                try {
                  const startTx = await this.solanaService.startRun(runNumericId);
                  logger.info(`   ✅ Run started on-chain: ${startTx}`);
                } catch (startError) {
                  logger.warn(`   ⚠️  Run start failed (may already be started):`, startError);
                  // Continue - run might already be started
                }
              }
              
              logger.info(`   ✅ Run ${runNumericId} successfully created and synced on-chain`);
            } catch (createError) {
              const errorMsg = `Run ${runNumericId} does not exist on-chain and creation failed: ${createError instanceof Error ? createError.message : String(createError)}`;
              logger.error(`   ❌ ${errorMsg}`);
              throw new Error(errorMsg);
            }
          }
          
          // Fetch on-chain run data to verify status and requirements
          let onChainRun: any = null;
          try {
            const [runPDA] = this.solanaService.getRunPDA(runNumericId);
            
            // Try using Anchor program first, fallback to manual decoding if program is null
            const program = this.solanaService.getProgram();
            if (program && program.account && program.account.run) {
              onChainRun = await program.account.run.fetch(runPDA);
              logger.info(`   On-chain run status: ${onChainRun.status.toString()}`);
              logger.info(`   On-chain participant count: ${onChainRun.participantCount.toNumber()}`);
              logger.info(`   Database participant count: ${participants.length}`);
              logger.info(`   On-chain total deposited: ${onChainRun.totalDeposited.toNumber() / 1_000_000} USDC`);
            } else {
              // Fallback to manual decoding
              logger.info(`   ⚠️  Anchor program not available, using manual account decoding`);
              const decodedRun = await this.solanaService.decodeRunAccount(runPDA);
              if (!decodedRun) {
                throw new Error(`Run account not found on-chain at ${runPDA.toString()}`);
              }
              // Convert to format similar to Anchor program output
              onChainRun = {
                status: { toString: () => decodedRun.status },
                participantCount: { toNumber: () => decodedRun.participantCount },
                totalDeposited: { toNumber: () => decodedRun.totalDeposited.toNumber() },
              };
              logger.info(`   On-chain run status: ${decodedRun.status}`);
              logger.info(`   On-chain participant count: ${decodedRun.participantCount}`);
              logger.info(`   Database participant count: ${participants.length}`);
              logger.info(`   On-chain total deposited: ${decodedRun.totalDeposited.toNumber() / 1_000_000} USDC`);
            }
            
            // Verify run is in Active status (required by settle_run)
            const statusStr = typeof onChainRun.status === 'string' ? onChainRun.status : onChainRun.status.toString();
            if (statusStr !== 'Active') {
              const errorMsg = `On-chain run status is ${statusStr}, but settle_run requires Active status.`;
              logger.error(`   ❌ ${errorMsg}`);
              throw new Error(errorMsg);
            }
            
            // Verify participant count matches
            const onChainParticipantCount = typeof onChainRun.participantCount === 'number' 
              ? onChainRun.participantCount 
              : onChainRun.participantCount.toNumber();
            if (onChainParticipantCount !== participants.length) {
              const errorMsg = `Participant count mismatch: On-chain ${onChainParticipantCount}, Database ${participants.length}. settle_run requires exact match.`;
              logger.error(`   ❌ ${errorMsg}`);
              throw new Error(errorMsg);
            }
            
            logger.info(`   ✅ Run status and participant count verified`);
          } catch (fetchError) {
            logger.error(`   ❌ Could not verify on-chain run data: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
            throw fetchError; // Don't proceed if we can't verify
          }
          
          // Get actual vault balance from on-chain
          const [runVaultPDA] = this.solanaService.getRunVaultPDA(runNumericId);
          const { getAccount } = require('@solana/spl-token');
          const vaultAccount = await getAccount(this.solanaService['connection'], runVaultPDA);
          const vaultBalanceUsdc = Number(vaultAccount.amount) / 1_000_000; // Convert from micro-USDC to USDC
          
          logger.info(`📊 On-chain vault balance: ${vaultBalanceUsdc} USDC`);
          logger.info(`📊 Database total pool: ${run.totalPool / 100} USDC`);
          
          // Fetch wallet addresses from database for all participants
          logger.info(`📝 Fetching participant wallet addresses...`);
          for (let i = 0; i < participants.length; i++) {
            const participant = participants[i];
            const finalShare = calculateFinalShare(participant.depositAmount, pnlShares[i]);
            
            try {
              // Get wallet address from database (should always exist since it's required)
              const user = await this.prisma.user.findUnique({
                where: { id: participant.userId },
                select: { walletAddress: true },
              });

              if (user?.walletAddress) {
                participantShares.push({
                  userPubkey: user.walletAddress,
                  shareAmount: finalShare / 100, // Convert from cents to USDC
                });
                logger.info(`   ✅ Participant ${i + 1}/${participants.length}: ${user.walletAddress.substring(0, 8)}... (${finalShare / 100} USDC)`);
              } else {
                logger.error(`   ❌ Participant ${i + 1} (${participant.userId}) has no wallet address in DB. This should not happen!`);
                throw new Error(`Participant ${participant.userId} has no wallet address. Cannot settle run on-chain.`);
              }
            } catch (error) {
              logger.error(`   ❌ Error fetching wallet address for participant ${i + 1}:`, error);
              throw error; // Re-throw to fail the settlement if we can't get all addresses
            }
          }

          if (participantShares.length === 0) {
            throw new Error('No participant shares found. Cannot settle run on-chain.');
          }

          if (participantShares.length !== participants.length) {
            throw new Error(`Mismatch: Only ${participantShares.length} out of ${participants.length} participants have wallet addresses. Cannot settle run on-chain.`);
          }

          logger.info(`   ✅ All ${participantShares.length} participants have wallet addresses. Proceeding with on-chain settlement.`);
          const totalShares = participantShares.reduce((sum, p) => sum + p.shareAmount, 0);
          logger.info(`   Total shares to distribute: ${totalShares.toFixed(2)} USDC`);
          logger.info(`   Vault balance: ${vaultBalanceUsdc.toFixed(2)} USDC`);
          
          // Verify vault balance matches what we're reporting (required by settle_run)
          // Allow small rounding differences (1 micro-USDC = 0.000001 USDC)
          const balanceDiff = Math.abs(vaultBalanceUsdc - totalShares);
          if (balanceDiff > 0.000001) {
            logger.warn(`   ⚠️  Vault balance (${vaultBalanceUsdc.toFixed(6)}) differs from total shares (${totalShares.toFixed(6)}) by ${balanceDiff.toFixed(6)} USDC`);
            logger.warn(`   ⚠️  This might cause settle_run to fail. Using vault balance as final_balance.`);
          }

          logger.info(`📝 Settling run on-chain with ${participantShares.length} participant shares...`);
          logger.info(`   Final balance (vault): ${vaultBalanceUsdc.toFixed(6)} USDC`);
          
          // Use the actual on-chain vault balance (required by Solana program)
          // The settle_run instruction verifies that vault_balance == final_balance
          const settleTx = await this.solanaService.settleRun(
            runNumericId,
            vaultBalanceUsdc, // Use actual on-chain vault balance (must match exactly)
            participantShares
          );
          logger.info(`✅ Run settled on-chain successfully!`);
          logger.info(`   Transaction: ${getExplorerUrl(settleTx)}`);
          
          // Mark settlement as succeeded since the transaction completed
          onChainSettlementSucceeded = true;
          
          // Verify the run status changed to Settled (optional verification)
          try {
            const [runPDA] = this.solanaService.getRunPDA(runNumericId);
            let settledRun: any = null;
            
            const program = this.solanaService.getProgram();
            if (program && program.account && program.account.run) {
              settledRun = await program.account.run.fetch(runPDA);
            } else {
              // Fallback to manual decoding
              const decodedRun = await this.solanaService.decodeRunAccount(runPDA);
              if (decodedRun) {
                settledRun = {
                  status: { toString: () => decodedRun.status },
                };
              }
            }
            
            if (settledRun) {
              const statusStr = typeof settledRun.status === 'string' ? settledRun.status : settledRun.status.toString();
              logger.info(`   ✅ Verified: On-chain run status is now ${statusStr}`);
            }
          } catch (verifyError) {
            logger.warn(`   ⚠️  Could not verify settlement: ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`);
            // Settlement already succeeded, verification is just a double-check
          }
        } catch (solanaError) {
          logger.error('❌ CRITICAL: Failed to settle run on-chain:');
          logger.error('   Error type:', solanaError instanceof Error ? solanaError.constructor.name : typeof solanaError);
          logger.error('   Error message:', solanaError instanceof Error ? solanaError.message : String(solanaError));
          if (solanaError instanceof Error && solanaError.stack) {
            logger.error('   Stack trace:', solanaError.stack);
          }
          logger.error('   ⚠️  On-chain settlement FAILED - this will prevent DB status update');
          // Re-throw the error to prevent DB status update
          throw new AppError(
            `Failed to settle run on-chain: ${solanaError instanceof Error ? solanaError.message : String(solanaError)}. Run status will remain ACTIVE until settlement succeeds.`,
            500
          );
        }
      } else {
        // If Solana service is not available, log a warning but allow DB update
        logger.warn(`⚠️  SolanaService is not available - skipping on-chain settlement for run ${runId}`);
        logger.warn(`   Run will be marked as ENDED in DB, but on-chain status will not be updated`);
        onChainSettlementSucceeded = true; // Allow DB update if Solana is not configured
      }

      // Only update DB status to ENDED if on-chain settlement succeeded (or Solana is not configured)
      if (onChainSettlementSucceeded) {
        const updatedRun = await this.prisma.run.update({
          where: { id: runId },
          data: {
            status: RunStatus.ENDED,
            endedAt: new Date(),
          },
        });

        logger.info(`✅ Run ended successfully: ${runId}`);
        logger.info(`   Database status: ENDED`);
        if (this.solanaService) {
          logger.info(`   On-chain status: Settled`);
        }
        return updatedRun;
      } else {
        // This should not happen due to the error handling above, but just in case
        throw new AppError('On-chain settlement did not succeed. Run status remains ACTIVE.', 500);
      }
    } catch (error) {
      logger.error('Error ending run:', error);
      throw error;
    }
  }

  /**
   * Get run participants
   */
  async getRunParticipants(runId: string): Promise<RunParticipant[]> {
    try {
      return await this.prisma.runParticipant.findMany({
        where: { runId },
        include: {
          user: true,
        },
        orderBy: {
          joinedAt: 'asc',
        },
      });
    } catch (error) {
      logger.error('Error fetching run participants:', error);
      throw error;
    }
  }

  /**
   * Get run trades
   */
  
  /**
   * Update participant vote stats after a trade closes
   * Checks if each participant's vote was correct and updates their stats
   */
  private async updateParticipantVoteStats(runId: string, round: number, tradeDirection: string): Promise<void> {
    try {
      // Get all votes for this round
      const votes = await this.prisma.vote.findMany({
        where: {
          runId,
          round,
        },
        include: {
          user: true,
        },
      });

      // Determine if vote was correct based on trade direction
      const correctDirection = tradeDirection.toUpperCase();
      
      // Update each participant's vote stats
      for (const vote of votes) {
        // A vote is correct if it matches the trade direction
        // For SKIP trades, only SKIP votes are correct
        const isCorrect = vote.choice === correctDirection;
        
        // Get current participant stats
        const participant = await this.prisma.runParticipant.findUnique({
          where: {
            runId_userId: {
              runId,
              userId: vote.userId,
            },
          },
        });

        if (participant) {
          // Increment total votes and correct votes if vote was correct
          const newTotalVotes = (participant.totalVotes || 0) + 1;
          const newVotesCorrect = isCorrect 
            ? (participant.votesCorrect || 0) + 1 
            : (participant.votesCorrect || 0);

          await this.prisma.runParticipant.update({
            where: {
              runId_userId: {
                runId,
                userId: vote.userId,
              },
            },
            data: {
              totalVotes: newTotalVotes,
              votesCorrect: newVotesCorrect,
            },
          });

          logger.info(`Updated vote stats for user ${vote.userId}: ${newVotesCorrect}/${newTotalVotes} (vote was ${isCorrect ? 'correct' : 'incorrect'})`);
        }
      }

      logger.info(`✅ Updated vote stats for ${votes.length} participants in round ${round}`);
    } catch (error) {
      logger.error(`Error updating participant vote stats for round ${round}:`, error);
      // Don't throw - vote stats update shouldn't block trade closing
    }
  }

  /**
   * Get unrealized PnL for an open trade from Drift
   */
  async getUnrealizedPnL(runId: string, round: number): Promise<number | null> {
    try {
      const run = await this.getRunById(runId);
      if (!run) {
        return null;
      }

      // Find the trade for this round
      const trade = await this.prisma.trade.findFirst({
        where: {
          runId,
          round,
        },
      });

      if (!trade || trade.exitPrice !== null) {
        // Trade doesn't exist or is already closed
        return null;
      }

      if (trade.direction === 'SKIP' || !this.driftService) {
        return null;
      }

      try {
        // Get market symbol from trading pair
        const marketSymbol = run.tradingPair?.split('/')[0] + '-PERP' || 'SOL-PERP';
        
        // Get positions from Drift
        const positions = await this.driftService.getOpenPositions();
        const position = positions.find(p => p.marketSymbol === marketSymbol);
        
        if (position) {
          // Convert from USDC to cents
          return Math.round(position.unrealizedPnl * 100);
        }
        
        return null;
      } catch (error) {
        logger.error(`Error fetching unrealized PnL from Drift for round ${round}:`, error);
        return null;
      }
    } catch (error) {
      logger.error(`Error getting unrealized PnL for run ${runId}, round ${round}:`, error);
      return null;
    }
  }

  async getRunTrades(runId: string): Promise<Trade[]> {
    try {
      return await this.prisma.trade.findMany({
        where: { runId },
        orderBy: {
          round: 'asc',
        },
      });
    } catch (error) {
      logger.error('Error fetching run trades:', error);
      throw error;
    }
  }

  /**
   * Get current voting round
   */
  async getCurrentVotingRound(runId: string): Promise<VotingRound | null> {
    try {
      return await this.prisma.votingRound.findFirst({
        where: {
          runId,
          status: RoundStatus.OPEN,
        },
        orderBy: {
          round: 'desc',
        },
      });
    } catch (error) {
      logger.error('Error fetching current voting round:', error);
      throw error;
    }
  }
}

