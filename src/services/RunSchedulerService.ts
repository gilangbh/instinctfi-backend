import { PrismaClient, RunStatus, RoundStatus } from '@prisma/client';
import { RunService } from './RunService';
import { SolanaService } from './SolanaService';
import logger from '@/utils/logger';
import { config } from '@/utils/config';

/**
 * Run Scheduler Service
 * Handles automatic run lifecycle management:
 * - Auto-start runs after lobby phase (configurable, default 10 minutes)
 * - Auto-cancel runs with no participants
 * - Countdown management
 * - Execute trades when voting rounds expire
 * - Create next voting rounds automatically
 */
export class RunSchedulerService {
  private schedulerInterval: NodeJS.Timeout | null = null;
  private readonly LOBBY_DURATION_MS = (parseInt(process.env.LOBBY_DURATION_MINUTES || '10')) * 60 * 1000; // Configurable via env
  private readonly CHECK_INTERVAL_MS = 5 * 1000; // Check every 5 seconds

  private solanaService: SolanaService | null = null;

  constructor(
    private prisma: PrismaClient,
    private runService: RunService,
    solanaService?: SolanaService
  ) {
    this.solanaService = solanaService || null;
  }

  /**
   * Start the scheduler
   */
  start() {
    if (this.schedulerInterval) {
      logger.warn('Run scheduler already running');
      return;
    }

    logger.info('🕒 Starting run scheduler service');
    logger.info(`   Lobby duration: ${this.LOBBY_DURATION_MS / 60000} minutes`);
    logger.info(`   Check interval: 5 seconds`);

    // Run immediately on start
    this.processRuns();

    // Then run periodically
    this.schedulerInterval = setInterval(() => {
      this.processRuns();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
      logger.info('Run scheduler service stopped');
    }
  }

  /**
   * Process all waiting runs
   */
  private async processRuns() {
    try {
      // Get all WAITING runs
      const waitingRuns = await this.prisma.run.findMany({
        where: {
          status: RunStatus.WAITING,
        },
        include: {
          participants: true,
        },
      });

      for (const run of waitingRuns) {
        await this.processRun(run);
      }

      // Also process ACTIVE runs to check for expired voting rounds
      const activeRuns = await this.prisma.run.findMany({
        where: {
          status: RunStatus.ACTIVE,
        },
      });

      for (const run of activeRuns) {
        await this.processActiveRun(run);
      }
    } catch (error) {
      logger.error('Error processing runs:', error);
    }
  }

  /**
   * Process a single run
   */
  private async processRun(run: any) {
    try {
      const now = new Date();
      const createdAt = new Date(run.createdAt);
      // Use per-run lobby duration if available, otherwise fall back to env var
      const lobbyDurationMinutes = run.lobbyDuration || parseInt(process.env.LOBBY_DURATION_MINUTES || '10', 10);
      const lobbyDurationMs = lobbyDurationMinutes * 60 * 1000;
      const scheduledStartTime = new Date(createdAt.getTime() + lobbyDurationMs);
      const timeUntilStart = scheduledStartTime.getTime() - now.getTime();

      // Calculate countdown in seconds
      const countdownSeconds = Math.max(0, Math.floor(timeUntilStart / 1000));

      // Update countdown in database
      await this.prisma.run.update({
        where: { id: run.id },
        data: { countdown: countdownSeconds },
      });

      // Check if lobby phase is over
      if (timeUntilStart <= 0) {
        await this.handleLobbyPhaseEnd(run);
      }
    } catch (error) {
      logger.error(`Error processing run ${run.id}:`, error);
    }
  }

  /**
   * Handle lobby phase end - either start or cancel run
   */
  private async handleLobbyPhaseEnd(run: any) {
    const participantCount = run.participants?.length || 0;

    if (participantCount === 0) {
      // No participants - cancel the run
      await this.cancelRun(run);
    } else {
      // Has participants - start the run
      await this.startRun(run);
    }
  }

  /**
   * Auto-start a run
   */
  private async startRun(run: any) {
    try {
      logger.info(`🚀 Auto-starting run ${run.id} (${run.participants?.length || 0} participants)`);
      logger.info(`   ⚠️  On-chain start is REQUIRED - DB status will only be updated after successful on-chain start`);

      // Start run on-chain FIRST (before updating DB status)
      const runNumericId = parseInt(run.id) || new Date(run.createdAt).getTime();
      let onChainStartSucceeded = false;
      
      if (this.solanaService) {
        try {
          // Check if run exists on-chain, if not, try to create it
          const runExists = await this.solanaService.runExistsOnChain(runNumericId);
          
          if (!runExists) {
            logger.warn(`⚠️  Run ${run.id} does not exist on-chain. Creating it now...`);
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
          logger.info(`✅ Run started on-chain successfully: ${startTx}`);
          
          // Verify the run status changed to Active
          try {
            const [runPDA] = this.solanaService.getRunPDA(runNumericId);
            let startedRun: any = null;
            
            if (this.solanaService.program && this.solanaService.program.account && this.solanaService.program.account.run) {
              startedRun = await this.solanaService.program.account.run.fetch(runPDA);
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
          throw new Error(`Failed to start run on-chain: ${solanaError instanceof Error ? solanaError.message : String(solanaError)}. Run status will remain WAITING until on-chain start succeeds.`);
        }
      } else {
        // If Solana service is not available, log a warning but allow DB update
        logger.warn(`⚠️  SolanaService is not available - skipping on-chain start for run ${run.id}`);
        logger.warn(`   Run will be marked as ACTIVE in DB, but on-chain status will not be updated`);
        onChainStartSucceeded = true; // Allow DB update if Solana is not configured
      }

      // Only update DB status to ACTIVE if on-chain start succeeded
      if (onChainStartSucceeded) {
        // Update run status to ACTIVE
        await this.prisma.run.update({
          where: { id: run.id },
          data: {
            status: RunStatus.ACTIVE,
            startedAt: new Date(),
            startingPool: run.totalPool,
            countdown: null,
          },
        });

        // Create first voting round with chaos modifiers generated
        try {
          logger.info(`🎲 Creating first voting round for run ${run.id}...`);
          await this.runService.createVotingRound(run.id, 1);
          logger.info(`✅ First voting round created successfully`);
        } catch (roundError) {
          logger.error(`❌ CRITICAL: Failed to create first voting round:`, roundError);
          logger.error(`   Error type:`, roundError instanceof Error ? roundError.constructor.name : typeof roundError);
          logger.error(`   Error message:`, roundError instanceof Error ? roundError.message : String(roundError));
          // Don't throw - the run is already started, but log the error
          // The frontend will show "Waiting for Next Round" until a round is created
        }

        logger.info(`✅ Run ${run.id} started successfully`);
        logger.info(`   Database status: ACTIVE`);
        if (this.solanaService) {
          logger.info(`   On-chain status: Active`);
        }
        logger.info(`   Participants: ${run.participants?.length}`);
        logger.info(`   Starting pool: ${run.totalPool / 100} USDC`);
      } else {
        // This should not happen due to error handling above, but just in case
        throw new Error('On-chain start did not succeed. Run status remains WAITING.');
      }

    } catch (error) {
      logger.error(`Error starting run ${run.id}:`, error);
      // Re-throw to prevent DB update
      throw error;
    }
  }

  /**
   * Auto-cancel a run with no participants
   */
  private async cancelRun(run: any) {
    try {
      logger.info(`❌ Auto-canceling run ${run.id} (no participants)`);

      // Update run status to ENDED (or CANCELLED if you add that status)
      await this.prisma.run.update({
        where: { id: run.id },
        data: {
          status: RunStatus.ENDED,
          endedAt: new Date(),
          countdown: null,
        },
      });

      logger.info(`✅ Run ${run.id} canceled due to no participants`);

    } catch (error) {
      logger.error(`Error canceling run ${run.id}:`, error);
    }
  }

  /**
   * Process active runs - check for expired voting rounds
   */
  private async processActiveRun(run: any) {
    try {
      // Get the current open voting round
      const currentRound = await this.prisma.votingRound.findFirst({
        where: {
          runId: run.id,
          status: RoundStatus.OPEN,
        },
        orderBy: {
          round: 'desc',
        },
      });

      if (!currentRound) {
        // No open round - check if we need to end the run
        // Use totalRounds from database (now set to 3)
        const totalRounds = run.totalRounds || 3;
        const completedRounds = await this.prisma.votingRound.count({
          where: {
            runId: run.id,
            status: RoundStatus.EXECUTING,
          },
        });

        if (completedRounds >= totalRounds) {
          // All rounds completed - end the run
          await this.endRun(run);
        }
        return;
      }

      // Check if voting round timer has expired
      const now = new Date();
      const startedAt = new Date(currentRound.startedAt);
      const votingIntervalMs = (run.votingInterval || config.defaultVotingIntervalMinutes) * 60 * 1000;
      const elapsed = now.getTime() - startedAt.getTime();

      if (elapsed >= votingIntervalMs) {
        // Timer expired - execute trade and create next round
        await this.handleVotingRoundExpired(run, currentRound);
      }
    } catch (error) {
      logger.error(`Error processing active run ${run.id}:`, error);
    }
  }

  /**
   * Handle expired voting round - close previous position, execute new trade, and create next round
   */
  private async handleVotingRoundExpired(run: any, votingRound: any) {
    try {
      logger.info(`⏰ Voting round ${votingRound.round} expired for run ${run.id}`);

      // Close the previous round's position (if it exists and is still open)
      if (votingRound.round > 1) {
        const previousRound = votingRound.round - 1;
        try {
          const previousTrade = await this.prisma.trade.findFirst({
            where: {
              runId: run.id,
              round: previousRound,
            },
          });

          if (previousTrade && previousTrade.exitPrice === null) {
            logger.info(`🔒 Closing position from round ${previousRound} (stayed open for ${run.votingInterval} minutes)`);
            await this.runService.closePosition(run.id, previousRound);
            logger.info(`✅ Position from round ${previousRound} closed`);
          }
        } catch (error) {
          logger.error(`Error closing previous round's position:`, error);
          // Continue anyway - don't block new trade execution
        }
      }

      // Execute the trade for this round (opens new position)
      await this.runService.executeTrade(run.id, votingRound.round);
      logger.info(`✅ Trade opened for run ${run.id} round ${votingRound.round}`);

      // Check if this was the last round (use totalRounds from database, now set to 3)
      const totalRounds = run.totalRounds || 3;
      
      if (votingRound.round >= totalRounds) {
        // Last round completed - end the run (will close last position in endRun)
        logger.info(`🏁 All rounds completed for run ${run.id} - ending run`);
        await this.endRun(run);
      } else {
        // Create next voting round
        const nextRound = votingRound.round + 1;
        logger.info(`🔄 Creating next voting round ${nextRound} for run ${run.id}`);
        await this.runService.createVotingRound(run.id, nextRound);
        logger.info(`✅ Next voting round ${nextRound} created for run ${run.id}`);
        logger.info(`   Current position will close when round ${nextRound} voting ends`);
      }
    } catch (error) {
      logger.error(`Error handling expired voting round for run ${run.id}:`, error);
    }
  }

  /**
   * End a run after all rounds are completed
   */
  private async endRun(run: any) {
    try {
      logger.info(`🏁 Ending run ${run.id} - all rounds completed`);

      await this.runService.endRun(run.id);

      logger.info(`✅ Run ${run.id} ended successfully`);
    } catch (error) {
      logger.error(`Error ending run ${run.id}:`, error);
    }
  }

  /**
   * Get countdown for a run
   */
  async getCountdown(runId: string): Promise<number> {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      select: { countdown: true, status: true, createdAt: true, lobbyDuration: true },
    });

    if (!run || run.status !== RunStatus.WAITING) {
      return 0;
    }

    // Return stored countdown or calculate it
    if (run.countdown !== null) {
      return run.countdown;
    }

    // Fallback: calculate from createdAt
    const createdAt = new Date(run.createdAt);
    // Use per-run lobby duration if available, otherwise fall back to env var
    const lobbyDurationMinutes = run.lobbyDuration || parseInt(process.env.LOBBY_DURATION_MINUTES || '10', 10);
    const lobbyDurationMs = lobbyDurationMinutes * 60 * 1000;
    const scheduledStartTime = new Date(createdAt.getTime() + lobbyDurationMs);
    const timeUntilStart = scheduledStartTime.getTime() - Date.now();
    return Math.max(0, Math.floor(timeUntilStart / 1000));
  }
}

