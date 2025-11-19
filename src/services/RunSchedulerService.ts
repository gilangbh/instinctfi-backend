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

  constructor(
    private prisma: PrismaClient,
    private runService: RunService
  ) {}

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
      const scheduledStartTime = new Date(createdAt.getTime() + this.LOBBY_DURATION_MS);
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
      await this.runService.createVotingRound(run.id, 1);

      logger.info(`✅ Run ${run.id} started successfully`);
      logger.info(`   Participants: ${run.participants?.length}`);
      logger.info(`   Starting pool: ${run.totalPool / 100} USDC`);

      // TODO: Start run on-chain via SolanaService
      // await this.solanaService.startRun(runNumericId);

    } catch (error) {
      logger.error(`Error starting run ${run.id}:`, error);
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
        const totalRounds = Math.floor((run.duration || config.defaultRunDurationMinutes) / (run.votingInterval || config.defaultVotingIntervalMinutes));
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

      // Check if this was the last round
      const totalRounds = Math.floor((run.duration || config.defaultRunDurationMinutes) / (run.votingInterval || config.defaultVotingIntervalMinutes));
      
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
      select: { countdown: true, status: true, createdAt: true },
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
    const scheduledStartTime = new Date(createdAt.getTime() + this.LOBBY_DURATION_MS);
    const timeUntilStart = scheduledStartTime.getTime() - Date.now();
    return Math.max(0, Math.floor(timeUntilStart / 1000));
  }
}

