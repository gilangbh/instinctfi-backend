import { Request, Response } from 'express';
import { DriftIntegrationService } from '@/services/DriftIntegrationService';
import logger from '@/utils/logger';
import { driftConfig } from '@/utils/config';

// Singleton instance
let driftIntegrationService: DriftIntegrationService | null = null;

async function getDriftService(): Promise<DriftIntegrationService> {
  if (!driftIntegrationService) {
    driftIntegrationService = new DriftIntegrationService();
    await driftIntegrationService.initialize();
  }
  return driftIntegrationService;
}

export class DriftTradingController {
  /**
   * Place a perp order on Drift
   * Following: https://drift-labs.github.io/v2-teacher/#placing-perp-order
   */
  static async placePerpOrder(req: Request, res: Response) {
    try {
      const { marketSymbol, direction, baseAmount, leverage, reduceOnly } = req.body;

      // Validation
      if (!marketSymbol || !direction || !baseAmount) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: marketSymbol, direction, baseAmount',
        });
      }

      if (!['long', 'short'].includes(direction.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: 'Direction must be "long" or "short"',
        });
      }

      // Check if real trading is enabled
      const driftService = await getDriftService();
      const isRealTrading = driftService.isRealTrading();

      if (!isRealTrading) {
        // Mock mode
        logger.info(`[MOCK] Would place ${direction} order: ${baseAmount} ${marketSymbol}`);
        
        const result = await driftService.executeTrade({
          marketSymbol,
          direction: direction.toLowerCase(),
          baseAmount,
          leverage: leverage || 1,
          reduceOnly: reduceOnly || false,
        });

        return res.status(200).json({
          success: true,
          mode: 'mock',
          message: 'Mock trade executed (DRIFT_ENABLE_REAL_TRADING is false)',
          data: result,
        });
      }

      // Real trading mode
      logger.warn(`🔴 REAL TRADE: Placing ${direction} order for ${baseAmount} ${marketSymbol}`);
      
      const result = await driftService.executeTrade({
        marketSymbol,
        direction: direction.toLowerCase(),
        baseAmount,
        leverage: leverage || 1,
        reduceOnly: reduceOnly || false,
      });

      return res.status(200).json({
        success: true,
        mode: 'real',
        message: 'Real trade executed on Drift Protocol',
        data: result,
        explorerUrl: result.transactionId 
          ? `https://solscan.io/tx/${result.transactionId}?cluster=${driftConfig.environment}`
          : undefined,
      });

    } catch (error) {
      logger.error('Error placing perp order:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to place perp order',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Close a position
   */
  static async closePosition(req: Request, res: Response) {
    try {
      const { marketSymbol } = req.body;

      if (!marketSymbol) {
        return res.status(400).json({
          success: false,
          message: 'marketSymbol is required',
        });
      }

      const driftService = await getDriftService();
      const isRealTrading = driftService.isRealTrading();

      if (!isRealTrading) {
        logger.info(`[MOCK] Would close position on ${marketSymbol}`);
        return res.status(200).json({
          success: true,
          mode: 'mock',
          message: 'Mock position close (DRIFT_ENABLE_REAL_TRADING is false)',
        });
      }

      logger.warn(`🔴 REAL TRADE: Closing position on ${marketSymbol}`);
      
      const result = await driftService.closePosition(marketSymbol);

      return res.status(200).json({
        success: true,
        mode: 'real',
        message: 'Position closed on Drift',
        data: result,
        explorerUrl: result.transactionId 
          ? `https://solscan.io/tx/${result.transactionId}?cluster=${driftConfig.environment}`
          : undefined,
      });

    } catch (error) {
      logger.error('Error closing position:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to close position',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get account information
   */
  static async getAccount(req: Request, res: Response) {
    try {
      const driftService = await getDriftService();
      const accountInfo = await driftService.getAccountInfo();

      res.status(200).json({
        success: true,
        data: accountInfo,
      });

    } catch (error) {
      logger.error('Error getting account info:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get account info',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get all open positions
   */
  static async getPositions(req: Request, res: Response) {
    try {
      const driftService = await getDriftService();
      const positions = await driftService.getOpenPositions();

      res.status(200).json({
        success: true,
        data: {
          positions,
          count: positions.length,
        },
      });

    } catch (error) {
      logger.error('Error getting positions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get positions',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get trading mode status
   */
  static async getTradingMode(req: Request, res: Response) {
    try {
      const driftService = await getDriftService();
      const isRealTrading = driftService.isRealTrading();

      res.status(200).json({
        success: true,
        data: {
          mode: isRealTrading ? 'real' : 'mock',
          realTradingEnabled: isRealTrading,
          environment: driftConfig.environment,
          warning: isRealTrading 
            ? '🔴 REAL TRADING ACTIVE - Trades execute on Drift Protocol'
            : '🟡 MOCK MODE - Trades are simulated',
        },
      });

    } catch (error) {
      logger.error('Error getting trading mode:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get trading mode',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}



