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
      
      // Get current price from Drift service - required, no fallback
      // Get the run to determine trading pair
      const run = await this.getRunById(runId);
      if (!run) {
        throw new AppError('Run not found', 404);
      }
      
      if (!this.driftService) {
        throw new AppError('Drift service not available - cannot fetch price', 500);
      }
      
      // Get market symbol from trading pair (e.g., "SOL/USDC" -> "SOL-PERP")
      const marketSymbol = run.tradingPair?.split('/')[0] + '-PERP' || 'SOL-PERP';
      const currentPrice = await this.driftService.getMarketPrice(marketSymbol);
      
      if (!currentPrice || currentPrice <= 0) {
        throw new AppError(`Invalid price fetched for ${marketSymbol}: ${currentPrice}`, 500);
      }
      
      logger.info(`📊 Fetched real price for ${marketSymbol}: $${currentPrice.toFixed(2)}`);
      
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
        // Calculate position size in USDC
        const positionSizeUsdc = (run.totalPool / 100) * chaosModifiers.positionSizePercentage / 100;
        
        // Execute trade on Drift Protocol (or simulate if not enabled)
        if (this.driftService) {
          try {
            // Get market symbol from trading pair (e.g., "SOL/USDC" -> "SOL-PERP")
            const marketSymbol = run.tradingPair?.split('/')[0] + '-PERP' || 'SOL-PERP';
            
            logger.info(`🚀 Opening position on Drift: ${direction} ${positionSizeUsdc / 100} USDC at ${chaosModifiers.leverage}x leverage`);
            logger.info(`   Position will stay open until next round's voting ends (${run.votingInterval} minutes)`);
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
              logger.error(`❌ Trade execution failed: ${tradeResult.error}`);
              // Fallback to simulation if real trade fails
              // For simulation, we'll still keep it "open" conceptually
              logger.warn('⚠️ Falling back to simulated trade');
            }
          } catch (error) {
            logger.error('Error executing trade on Drift, falling back to simulation:', error);
            // Fallback to simulation - position stays "open" conceptually
          }
        } else {
          // No Drift service - simulate trade (but keep it "open" conceptually)
          logger.warn('⚠️ Drift service not available - simulating trade');
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
          await this.solanaService.recordTrade({
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
        } catch (error) {
          logger.error(`⚠️  Failed to record trade on-chain (non-blocking):`, error);
          // Continue - don't fail the trade execution
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

