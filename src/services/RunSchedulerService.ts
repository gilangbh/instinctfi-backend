import { PrismaClient, RunStatus } from '@prisma/client';
import { RunService } from './RunService';
import { SolanaService } from './SolanaService';
import logger from '@/utils/logger';

/**
 * Run Scheduler Service
 * Handles automatic run lifecycle management:
 * - Auto-start runs after lobby phase (10 minutes)
 * - Auto-cancel runs with no participants
 * - Countdown management
 */
export class RunSchedulerService {
  private schedulerInterval: NodeJS.Timeout | null = null;
  private readonly LOBBY_DURATION_MS = 10 * 60 * 1000; // 10 minutes
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
    logger.info(`   Lobby duration: 10 minutes`);
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

      // Create first voting round
      await this.prisma.votingRound.create({
        data: {
          runId: run.id,
          round: 1,
          status: 'OPEN',
          timeRemaining: run.votingInterval * 60, // Convert to seconds
          leverage: 1.0, // Default, will be randomized later
          positionSize: 50.0, // Default 50% of pool
          currentPrice: 0, // Will be updated when voting opens
          priceChange24h: 0, // Will be updated
        },
      });

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

