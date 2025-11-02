import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { SolanaService } from '@/services/SolanaService';
import logger from '@/utils/logger';
import { getExplorerUrl, getAccountExplorerUrl } from '@/utils/solana';

const prisma = new PrismaClient();

// Lazy initialization of SolanaService to avoid module-level errors
let solanaServiceInstance: SolanaService | null = null;

function getSolanaService(): SolanaService {
  if (!solanaServiceInstance) {
    solanaServiceInstance = new SolanaService();
  }
  return solanaServiceInstance;
}

export class SolanaController {
  /**
   * Initialize platform (admin only - one time setup)
   */
  static async initializePlatform(req: Request, res: Response) {
    try {
      const { platformFeeBps } = req.body;
      const solanaService = getSolanaService();
      
      const tx = await solanaService.initializePlatform(platformFeeBps || 150); // 1.5% default
      
      res.status(200).json({
        success: true,
        message: 'Platform initialized successfully',
        transaction: tx,
        explorerUrl: getExplorerUrl(tx),
      });
    } catch (error) {
      logger.error('Error initializing platform:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initialize platform',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get platform info
   */
  static async getPlatformInfo(req: Request, res: Response) {
    try {
      const solanaService = getSolanaService();
      const platformData = await solanaService.fetchPlatform();
      const [platformPDA] = solanaService.getPlatformPDA();
      
      res.status(200).json({
        success: true,
        data: {
          address: platformPDA.toString(),
          authority: platformData?.authority?.toString(),
          platformFeeBps: platformData?.platformFeeBps,
          totalRuns: platformData?.totalRuns?.toString(),
          isPaused: platformData?.isPaused,
          totalFeesCollected: platformData?.totalFeesCollected?.toString(),
          explorerUrl: getAccountExplorerUrl(platformPDA.toString()),
        },
      });
    } catch (error) {
      logger.error('Error fetching platform info:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch platform info',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get run info from blockchain
   */
  static async getRunInfo(req: Request, res: Response) {
    try {
      const { runId } = req.params;
      const runNumericId = parseInt(runId);
      
      if (isNaN(runNumericId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid run ID',
        });
      }

      const solanaService = getSolanaService();
      const runData = await solanaService.fetchRun(runNumericId);
      const [runPDA] = solanaService.getRunPDA(runNumericId);
      const [runVaultPDA] = solanaService.getRunVaultPDA(runNumericId);
      
      if (!runData) {
        return res.status(404).json({
          success: false,
          message: 'Run not found on blockchain',
        });
      }

      res.status(200).json({
        success: true,
        data: {
          runId: runData.runId.toString(),
          address: runPDA.toString(),
          vaultAddress: runVaultPDA.toString(),
          authority: runData.authority.toString(),
          status: runData.status,
          totalDeposited: runData.totalDeposited.toString(),
          finalBalance: runData.finalBalance.toString(),
          platformFeeAmount: runData.platformFeeAmount.toString(),
          participantCount: runData.participantCount,
          minDeposit: runData.minDeposit.toString(),
          maxDeposit: runData.maxDeposit.toString(),
          maxParticipants: runData.maxParticipants,
          createdAt: new Date(runData.createdAt.toNumber() * 1000).toISOString(),
          explorerUrl: getAccountExplorerUrl(runPDA.toString()),
        },
      });
    } catch (error) {
      logger.error('Error fetching run info:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch run info',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get PDAs for a run
   */
  static async getRunPDAs(req: Request, res: Response) {
    try {
      const { runId } = req.params;
      const runNumericId = parseInt(runId);
      
      if (isNaN(runNumericId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid run ID',
        });
      }

      const solanaService = getSolanaService();
      const [platformPDA, platformBump] = solanaService.getPlatformPDA();
      const [runPDA, runBump] = solanaService.getRunPDA(runNumericId);
      const [runVaultPDA, vaultBump] = solanaService.getRunVaultPDA(runNumericId);
      const [platformFeeVaultPDA, feeVaultBump] = solanaService.getPlatformFeeVaultPDA();

      res.status(200).json({
        success: true,
        data: {
          platform: {
            address: platformPDA.toString(),
            bump: platformBump,
            explorerUrl: getAccountExplorerUrl(platformPDA.toString()),
          },
          run: {
            address: runPDA.toString(),
            bump: runBump,
            explorerUrl: getAccountExplorerUrl(runPDA.toString()),
          },
          runVault: {
            address: runVaultPDA.toString(),
            bump: vaultBump,
            explorerUrl: getAccountExplorerUrl(runVaultPDA.toString()),
          },
          platformFeeVault: {
            address: platformFeeVaultPDA.toString(),
            bump: feeVaultBump,
            explorerUrl: getAccountExplorerUrl(platformFeeVaultPDA.toString()),
          },
        },
      });
    } catch (error) {
      logger.error('Error getting run PDAs:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get run PDAs',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Pause platform (admin only)
   */
  static async pausePlatform(req: Request, res: Response) {
    try {
      const solanaService = getSolanaService();
      const tx = await solanaService.pausePlatform();
      
      res.status(200).json({
        success: true,
        message: 'Platform paused successfully',
        transaction: tx,
        explorerUrl: getExplorerUrl(tx),
      });
    } catch (error) {
      logger.error('Error pausing platform:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to pause platform',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Unpause platform (admin only)
   */
  static async unpausePlatform(req: Request, res: Response) {
    try {
      const solanaService = getSolanaService();
      const tx = await solanaService.unpausePlatform();
      
      res.status(200).json({
        success: true,
        message: 'Platform unpaused successfully',
        transaction: tx,
        explorerUrl: getExplorerUrl(tx),
      });
    } catch (error) {
      logger.error('Error unpausing platform:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to unpause platform',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get authority wallet address
   */
  static async getAuthority(req: Request, res: Response) {
    try {
      const solanaService = getSolanaService();
      const authority = solanaService.getAuthority();
      
      res.status(200).json({
        success: true,
        data: {
          address: authority.toString(),
          explorerUrl: getAccountExplorerUrl(authority.toString()),
        },
      });
    } catch (error) {
      logger.error('Error getting authority:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get authority',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

