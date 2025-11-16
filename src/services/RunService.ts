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

// Type for Run with included relations
type RunWithParticipants = Run & {
  participants?: (RunParticipant & { user?: User })[];
  trades?: Trade[];
  votingRounds?: VotingRound[];
};

export class RunService {
  private solanaService: SolanaService | null = null;
  private wsService: WebSocketService | null = null;

  constructor(private prisma: PrismaClient, solanaService?: SolanaService, wsService?: WebSocketService) {
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
  }

  /**
   * Create a new run
   */
  async createRun(data: CreateRunRequest): Promise<Run> {
    try {
      const totalRounds = Math.floor((data.duration || config.defaultRunDurationMinutes) / (data.votingInterval || config.defaultVotingIntervalMinutes));

      // Set lobby phase duration (10 minutes from now)
      // Countdown will be calculated dynamically based on createdAt + 10 minutes

      // First create in database to get the ID
      const run = await this.prisma.run.create({
        data: {
          tradingPair: data.tradingPair,
          coin: data.coin,
          duration: data.duration || config.defaultRunDurationMinutes,
          votingInterval: data.votingInterval || config.defaultVotingIntervalMinutes,
          minDeposit: (data.minDeposit || config.minDepositUsdc) * 100, // Convert to cents
          maxDeposit: (data.maxDeposit || config.maxDepositUsdc) * 100, // Convert to cents
          maxParticipants: data.maxParticipants || config.maxParticipantsPerRun,
          totalRounds,
        },
      });

      // Extract numeric ID for Solana (assuming auto-increment or convert)
      // If your ID is a string UUID, you'll need a separate numeric ID field
      const runNumericId = parseInt(run.id) || Date.now(); // Fallback to timestamp if not numeric

      // Only interact with blockchain if Solana service is available
      if (this.solanaService) {
        try {
          // Create run on-chain
          const createTx = await this.solanaService.createRun(
            runNumericId,
            data.minDeposit || config.minDepositUsdc,
            data.maxDeposit || config.maxDepositUsdc,
            data.maxParticipants || config.maxParticipantsPerRun
          );

        // Create vault for the run
        const vaultTx = await this.solanaService.createRunVault(runNumericId);

        // Log blockchain transaction info (blockchainTxHash field doesn't exist in schema yet)
        logger.info(`✅ Run created: ${run.id} (${run.tradingPair})`);
        logger.info(`   Run PDA derived for ID: ${runNumericId}`);
        logger.info(`   Create TX: ${createTx}`);
        logger.info(`   Vault TX: ${vaultTx}`);
        } catch (solanaError) {
          // If blockchain creation fails, we should handle it
          logger.error('Failed to create run on-chain, but DB entry created:', solanaError);
          // Optionally: Delete the DB entry or mark as failed
          // For now, we'll let it exist but log the error
        }
      } else {
        logger.info(`Run created: ${run.id} (${run.tradingPair}) - Blockchain integration disabled`);
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
          orderBy: {
            endedAt: 'desc',
          },
          skip,
          take: limit,
        }),
        this.prisma.run.count({
          where: {
            status: RunStatus.ENDED,
          },
        }),
      ]);

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

      // Check for walletSignature property (optional field)
      const walletSignature = (data as JoinRunRequest & { walletSignature?: string }).walletSignature;
      if (walletSignature) {
        logger.info(
          `Deposit signature recorded for run ${runId} / user ${userId}: ${walletSignature}`
        );
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

      // Start run on-chain (if blockchain is enabled)
      if (this.solanaService) {
        const runNumericId = parseInt(run.id) || Date.now();
        try {
          const startTx = await this.solanaService.startRun(runNumericId);
          logger.info(`Run started on-chain: ${getExplorerUrl(startTx)}`);
        } catch (solanaError) {
          logger.error('Failed to start run on-chain:', solanaError);
          // Continue anyway - the DB state is source of truth
        }
      }

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

      logger.info(`Run started: ${runId}`);
      return updatedRun;
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
      
      // Get current price (mock for now)
      const currentPrice = 150.0; // TODO: Get real price from price feed
      const priceChange24h = 2.5; // TODO: Get real 24h change

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

      // Execute trade
      const entryPrice = Number(votingRound.currentPrice);
      let exitPrice = entryPrice;
      let pnl = 0;
      
      if (direction !== 'SKIP') {
        // Calculate position size in USDC
        const positionSizeUsdc = (run.totalPool / 100) * chaosModifiers.positionSizePercentage / 100;
        
        // Simulate price change (replace with real Drift execution later)
        exitPrice = entryPrice * (1 + (Math.random() - 0.5) * 0.1); // ±5% random change
        
        // Calculate PnL
        pnl = calculatePotentialPnL(
          entryPrice,
          exitPrice,
          positionSizeUsdc,
          chaosModifiers.leverage,
          direction.toLowerCase() as 'long' | 'short'
        );
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
          exitPrice: direction !== 'SKIP' ? exitPrice : null,
          pnl,
          pnlPercentage: run.totalPool > 0 ? (pnl / run.totalPool) * 100 : 0,
          executedAt: new Date(),
        },
      });

      // Update run total pool
      await this.prisma.run.update({
        where: { id: runId },
        data: {
          totalPool: run.totalPool + pnl,
        },
      });

      logger.info(`Trade executed: ${runId} - Round ${round} - ${direction} - ${chaosModifiers.leverage.toFixed(1)}x leverage - ${chaosModifiers.positionSizePercentage.toFixed(1)}% position - PnL: ${pnl.toFixed(2)} cents`);
      return trade;
    } catch (error) {
      logger.error('Error executing trade:', error);
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

        // Prepare participant shares for on-chain settlement
        // NOTE: You need to have wallet addresses stored in your User model
        if (participant.user?.walletAddress) {
          participantShares.push({
            userPubkey: participant.user.walletAddress,
            shareAmount: finalShare / 100, // Convert from cents to USDC
          });
        }
      }

      // Settle run on-chain (if blockchain is enabled)
      if (this.solanaService) {
        const runNumericId = parseInt(runId) || Date.now();
        try {
          const settleTx = await this.solanaService.settleRun(
            runNumericId,
            run.totalPool / 100, // Convert from cents to USDC
            participantShares
          );
          logger.info(`Run settled on-chain: ${getExplorerUrl(settleTx)}`);
        } catch (solanaError) {
          logger.error('Failed to settle run on-chain:', solanaError);
          // Continue anyway - participants can still withdraw based on DB state
        }
      }

      const updatedRun = await this.prisma.run.update({
        where: { id: runId },
        data: {
          status: RunStatus.ENDED,
          endedAt: new Date(),
        },
      });

      logger.info(`Run ended: ${runId}`);
      return updatedRun;
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

