import { PrismaClient } from '@prisma/client';
import logger from '@/utils/logger';

export enum LogType {
  CONSENSUS_REACHED = 'CONSENSUS_REACHED',
  USER_JOIN = 'USER_JOIN',
  USER_LEAVE = 'USER_LEAVE',
  SIGNAL_DETECTED = 'SIGNAL_DETECTED',
  TRADE_EXECUTED = 'TRADE_EXECUTED',
  ROUND_START = 'ROUND_START',
  ROUND_END = 'ROUND_END',
  RUN_START = 'RUN_START',
  RUN_END = 'RUN_END',
  SYSTEM = 'SYSTEM',
}

export interface SystemLogData {
  runId?: string;
  type: LogType;
  message: string;
  metadata?: Record<string, any>;
}

/**
 * System Log Service
 * Handles creation and retrieval of system activity logs
 */
export class SystemLogService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a system log entry
   */
  async createLog(data: SystemLogData): Promise<void> {
    try {
      await this.prisma.systemLog.create({
        data: {
          runId: data.runId,
          type: data.type,
          message: data.message,
          metadata: data.metadata || {},
        },
      });

      logger.info(`[SystemLog] ${data.type}: ${data.message}`);
    } catch (error) {
      logger.error('Error creating system log:', error);
      // Don't throw - logging should never crash the app
    }
  }

  /**
   * Get logs for a specific run
   */
  async getRunLogs(runId: string, limit: number = 50): Promise<any[]> {
    try {
      const logs = await this.prisma.systemLog.findMany({
        where: { runId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return logs.reverse(); // Return in chronological order
    } catch (error) {
      logger.error('Error fetching run logs:', error);
      return [];
    }
  }

  /**
   * Get recent system logs (all runs)
   */
  async getRecentLogs(limit: number = 100): Promise<any[]> {
    try {
      const logs = await this.prisma.systemLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return logs.reverse();
    } catch (error) {
      logger.error('Error fetching recent logs:', error);
      return [];
    }
  }

  /**
   * Clean up old logs (keep last 7 days)
   */
  async cleanupOldLogs(): Promise<void> {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const result = await this.prisma.systemLog.deleteMany({
        where: {
          createdAt: {
            lt: sevenDaysAgo,
          },
        },
      });

      logger.info(`Cleaned up ${result.count} old system logs`);
    } catch (error) {
      logger.error('Error cleaning up old logs:', error);
    }
  }

  /**
   * Helper methods for common log types
   */

  async logUserJoin(runId: string, username: string, walletAddress: string): Promise<void> {
    await this.createLog({
      runId,
      type: LogType.USER_JOIN,
      message: `${username} (${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}) initialized uplink`,
      metadata: { username, walletAddress },
    });
  }

  async logUserLeave(runId: string, username: string): Promise<void> {
    await this.createLog({
      runId,
      type: LogType.USER_LEAVE,
      message: `${username} disconnected from network`,
      metadata: { username },
    });
  }

  async logConsensusReached(runId: string, round: number, direction: string, pnl: number): Promise<void> {
    const result = pnl >= 0 ? 'WIN' : 'LOSS';
    const pnlFormatted = pnl >= 0 ? `+${(pnl / 100).toFixed(2)}` : (pnl / 100).toFixed(2);
    
    await this.createLog({
      runId,
      type: LogType.CONSENSUS_REACHED,
      message: `Round ${round} Result: ${result} (${pnlFormatted} USDC)`,
      metadata: { round, direction, pnl, result },
    });
  }

  async logTradeExecuted(runId: string, round: number, direction: string, leverage: number, positionSize: number, price: number): Promise<void> {
    await this.createLog({
      runId,
      type: LogType.TRADE_EXECUTED,
      message: `Trade executed: ${direction} ${leverage}x @ $${price.toFixed(2)} (${positionSize}% of pool)`,
      metadata: { round, direction, leverage, positionSize, price },
    });
  }

  async logSignalDetected(runId: string, signal: string): Promise<void> {
    await this.createLog({
      runId,
      type: LogType.SIGNAL_DETECTED,
      message: `Signal detected: ${signal}`,
      metadata: { signal },
    });
  }

  async logRoundStart(runId: string, round: number, leverage: number, positionSize: number): Promise<void> {
    await this.createLog({
      runId,
      type: LogType.ROUND_START,
      message: `Round ${round} started - Chaos parameters: ${leverage}x leverage, ${positionSize}% position size`,
      metadata: { round, leverage, positionSize },
    });
  }

  async logRoundEnd(runId: string, round: number): Promise<void> {
    await this.createLog({
      runId,
      type: LogType.ROUND_END,
      message: `Round ${round} voting closed - executing trade...`,
      metadata: { round },
    });
  }

  async logRunStart(runId: string, participants: number, totalPool: number): Promise<void> {
    await this.createLog({
      runId,
      type: LogType.RUN_START,
      message: `Run started with ${participants} participants and ${(totalPool / 100).toFixed(2)} USDC pool`,
      metadata: { participants, totalPool },
    });
  }

  async logRunEnd(runId: string, finalPool: number, profitLoss: number): Promise<void> {
    const result = profitLoss >= 0 ? 'profit' : 'loss';
    await this.createLog({
      runId,
      type: LogType.RUN_END,
      message: `Run completed - Final pool: ${(finalPool / 100).toFixed(2)} USDC (${result}: ${(profitLoss / 100).toFixed(2)} USDC)`,
      metadata: { finalPool, profitLoss, result },
    });
  }
}

