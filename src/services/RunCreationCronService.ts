import { PrismaClient, RunStatus } from '@prisma/client';
import nodeCron from 'node-cron';
import logger from '@/utils/logger';
import { RunService } from './RunService';
import { UserService } from './UserService';
import { config } from '@/utils/config';

/**
 * Run Creation Cron Service
 * Automatically creates new runs on a schedule
 * 
 * Features:
 * - Ensures only 1 active run at a time (checks WAITING, ACTIVE, SETTLING, COOLDOWN)
 * - Auto-generates and refreshes admin tokens
 * - Configurable via environment variables
 * 
 * Example schedules:
 * - 0 * * * *        -> Every hour at minute 0
 * - 0 star/2 * * *      -> Every 2 hours
 * - 0 0,12 * * *     -> At 12:00 AM and 12:00 PM
 * - 0 9,17 * * 1-5   -> At 9 AM and 5 PM on weekdays
 * - star * * * *        -> Every minute (testing only)
 */
export class RunCreationCronService {
  private cronJob: nodeCron.ScheduledTask | null = null;
  private isRunning: boolean = false;
  private adminToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private userService: UserService;

  constructor(
    private prisma: PrismaClient,
    private runService: RunService,
    private schedule: string = '0 */2 * * *', // Default: every 2 hours
  ) {
    this.userService = new UserService(prisma);
  }

  /**
   * Start the cron job
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Run creation cron service is already running');
      return;
    }

    logger.info('🔄 Starting run creation cron service');
    logger.info(`   Schedule: ${this.schedule}`);

    // Generate initial admin token
    await this.refreshAdminToken();

    this.cronJob = nodeCron.schedule(this.schedule, async () => {
      await this.createScheduledRun();
    });

    this.isRunning = true;
    logger.info('✅ Run creation cron service started');
  }

  /**
   * Stop the cron job
   */
  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      this.isRunning = false;
      logger.info('Run creation cron service stopped');
    }
  }

  /**
   * Create a scheduled run
   */
  private async createScheduledRun(): Promise<void> {
    try {
      logger.info('⏰ Cron triggered: Creating new scheduled run...');

      // Refresh admin token if needed
      await this.ensureValidToken();

      // Check if there are any runs in progress
      // Only allow 1 run at a time (WAITING, ACTIVE, SETTLING, or COOLDOWN)
      const existingRuns = await this.prisma.run.findMany({
        where: {
          status: {
            in: [RunStatus.WAITING, RunStatus.ACTIVE, RunStatus.SETTLING, RunStatus.COOLDOWN],
          },
        },
      });

      // Skip creation if there's already a run in any active state
      if (existingRuns.length > 0) {
        const statusCounts = existingRuns.reduce((acc, run) => {
          acc[run.status] = (acc[run.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        const statusSummary = Object.entries(statusCounts)
          .map(([status, count]) => `${count} ${status}`)
          .join(', ');
        
        logger.info(`⏭️  Skipping run creation: Existing runs found (${statusSummary})`);
        logger.info(`   ℹ️  Only 1 run allowed at a time to ensure focused gameplay`);
        return;
      }

      // Configure your run parameters here
      // Default: 2 hour run duration with 5-minute voting intervals = 24 rounds
      const votingInterval = parseInt(process.env.AUTO_RUN_VOTING_INTERVAL || '5'); // minutes
      const runDurationMinutes = parseInt(process.env.AUTO_RUN_DURATION_MINUTES || '120'); // 2 hours
      const totalRounds = parseInt(process.env.AUTO_RUN_TOTAL_ROUNDS || String(Math.floor(runDurationMinutes / votingInterval)));
      
      const runConfig = {
        minDeposit: parseInt(process.env.AUTO_RUN_MIN_DEPOSIT || '500'), // $5.00 in cents
        maxDeposit: parseInt(process.env.AUTO_RUN_MAX_DEPOSIT || '10000'), // $100.00 in cents
        maxParticipants: parseInt(process.env.AUTO_RUN_MAX_PARTICIPANTS || '100'),
        lobbyDuration: parseInt(process.env.AUTO_RUN_LOBBY_DURATION || '10'), // minutes
        votingInterval,
        totalRounds,
      };

      logger.info('📝 Creating run with config:', {
        ...runConfig,
        minDepositUSD: `$${runConfig.minDeposit / 100}`,
        maxDepositUSD: `$${runConfig.maxDeposit / 100}`,
        totalDurationMinutes: votingInterval * totalRounds,
        totalDurationHours: (votingInterval * totalRounds) / 60,
      });

      // Create the run
      const newRun = await this.prisma.run.create({
        data: {
          status: RunStatus.WAITING,
          minDeposit: runConfig.minDeposit,
          maxDeposit: runConfig.maxDeposit,
          maxParticipants: runConfig.maxParticipants,
          lobbyDuration: runConfig.lobbyDuration,
          votingInterval: runConfig.votingInterval,
          totalRounds: runConfig.totalRounds,
          totalPool: 0,
          countdown: runConfig.lobbyDuration * 60, // Convert to seconds
        },
      });

      logger.info(`✅ Scheduled run created successfully`);
      logger.info(`   Run ID: ${newRun.id}`);
      logger.info(`   Status: ${newRun.status}`);
      logger.info(`   Lobby Duration: ${newRun.lobbyDuration} minutes`);
      logger.info(`   Min Deposit: $${newRun.minDeposit / 100}`);
      logger.info(`   Max Deposit: $${newRun.maxDeposit / 100}`);
      logger.info(`   Max Participants: ${newRun.maxParticipants}`);

      // Optional: Create run on-chain immediately
      // Uncomment if you want to create on-chain during cron creation
      /*
      const runNumericId = parseInt(newRun.id) || new Date(newRun.createdAt).getTime();
      const solanaService = new SolanaService();
      
      try {
        const minDepositUsdc = newRun.minDeposit / 100;
        const maxDepositUsdc = newRun.maxDeposit / 100;
        
        const createTx = await solanaService.createRun(
          runNumericId,
          minDepositUsdc,
          maxDepositUsdc,
          newRun.maxParticipants
        );
        logger.info(`✅ Run created on-chain: ${createTx}`);
        
        const vaultTx = await solanaService.createRunVault(runNumericId);
        logger.info(`✅ Vault created on-chain: ${vaultTx}`);
      } catch (solanaError) {
        logger.error('⚠️  Failed to create run on-chain:', solanaError);
        // Continue anyway - will be created when run starts
      }
      */

    } catch (error) {
      logger.error('❌ Error creating scheduled run:', error);
      logger.error('   Error type:', error instanceof Error ? error.constructor.name : typeof error);
      logger.error('   Error message:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        logger.error('   Stack trace:', error.stack);
      }
    }
  }

  /**
   * Manually trigger run creation (for testing)
   */
  public async triggerManually(): Promise<void> {
    logger.info('🔧 Manually triggering run creation...');
    await this.createScheduledRun();
  }

  /**
   * Update the schedule
   */
  public updateSchedule(newSchedule: string): void {
    logger.info(`📅 Updating cron schedule from "${this.schedule}" to "${newSchedule}"`);
    
    // Stop current job
    this.stop();
    
    // Update schedule
    this.schedule = newSchedule;
    
    // Start with new schedule
    this.start();
  }

  /**
   * Get current status
   */
  public getStatus(): { isRunning: boolean; schedule: string; tokenValid: boolean } {
    return {
      isRunning: this.isRunning,
      schedule: this.schedule,
      tokenValid: this.isTokenValid(),
    };
  }

  /**
   * Generate or refresh admin token
   */
  private async refreshAdminToken(): Promise<void> {
    try {
      logger.info('🔑 Generating admin token for cron service...');

      // Find admin user
      const adminUser = await this.prisma.user.findFirst({
        where: {
          OR: [
            { username: 'admin' },
            { walletAddress: 'admin' },
          ],
        },
      });

      if (!adminUser) {
        logger.error('❌ No admin user found! Cannot create runs.');
        logger.error('   Please create an admin user with username="admin" or walletAddress="admin"');
        throw new Error('Admin user not found');
      }

      // Generate new token
      this.adminToken = await this.userService.generateAuthToken(adminUser.id);
      
      // Calculate token expiration time
      // Parse JWT_EXPIRES_IN (e.g., "7d" -> 7 days)
      const expiresIn = config.jwtExpiresIn;
      let expirationMs = 7 * 24 * 60 * 60 * 1000; // Default: 7 days
      
      if (typeof expiresIn === 'string') {
        const match = expiresIn.match(/^(\d+)([dhms])$/);
        if (match) {
          const value = parseInt(match[1]);
          const unit = match[2];
          
          switch (unit) {
            case 'd': expirationMs = value * 24 * 60 * 60 * 1000; break;
            case 'h': expirationMs = value * 60 * 60 * 1000; break;
            case 'm': expirationMs = value * 60 * 1000; break;
            case 's': expirationMs = value * 1000; break;
          }
        }
      } else if (typeof expiresIn === 'number') {
        expirationMs = expiresIn * 1000; // Assume seconds
      }
      
      this.tokenExpiresAt = new Date(Date.now() + expirationMs);
      
      logger.info('✅ Admin token generated successfully');
      logger.info(`   User ID: ${adminUser.id}`);
      logger.info(`   Username: ${adminUser.username || 'N/A'}`);
      logger.info(`   Expires: ${this.tokenExpiresAt.toISOString()}`);
      logger.info(`   Valid for: ${Math.floor(expirationMs / (24 * 60 * 60 * 1000))} days`);

    } catch (error) {
      logger.error('❌ Failed to generate admin token:', error);
      throw error;
    }
  }

  /**
   * Ensure token is valid, refresh if needed
   */
  private async ensureValidToken(): Promise<void> {
    if (!this.isTokenValid()) {
      logger.info('🔄 Admin token expired or missing, refreshing...');
      await this.refreshAdminToken();
    }
  }

  /**
   * Check if current token is valid
   */
  private isTokenValid(): boolean {
    if (!this.adminToken || !this.tokenExpiresAt) {
      return false;
    }

    // Refresh token if it expires within the next hour (buffer time)
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
    return this.tokenExpiresAt > oneHourFromNow;
  }

  /**
   * Get admin token (for debugging/testing)
   */
  public getAdminToken(): string | null {
    return this.adminToken;
  }
}

