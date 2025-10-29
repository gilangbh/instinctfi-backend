import { Request, Response } from 'express';
import { DriftService } from '@/services/DriftService';
import logger from '@/utils/logger';

// Singleton instance
let driftServiceInstance: DriftService | null = null;

export class DriftPriceController {
  /**
   * Get current market price from Drift oracle
   */
  static async getCurrentPrice(req: Request, res: Response) {
    try {
      const { symbol } = req.params;
      const marketSymbol = symbol || 'SOL';

      if (!driftServiceInstance) {
        driftServiceInstance = new DriftService();
      }

      const price = await driftServiceInstance.getMarketPrice(marketSymbol);
      const change24h = await driftServiceInstance.getPriceChange24h(marketSymbol);
      const oracleSource = driftServiceInstance.getOracleSource();

      res.status(200).json({
        success: true,
        data: {
          symbol: marketSymbol,
          price,
          change24h,
          source: oracleSource,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error fetching Drift price:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch price',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get market data for a symbol
   */
  static async getMarketData(req: Request, res: Response) {
    try {
      const { symbol } = req.params;
      const marketSymbol = symbol || 'SOL';

      if (!driftServiceInstance) {
        driftServiceInstance = new DriftService();
      }

      const marketData = await driftServiceInstance.getMarketData(marketSymbol);
      const oracleSource = driftServiceInstance.getOracleSource();

      res.status(200).json({
        success: true,
        data: {
          symbol: marketSymbol,
          ...marketData,
          source: oracleSource,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error fetching market data:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch market data',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get oracle source being used
   */
  static async getOracleInfo(req: Request, res: Response) {
    try {
      if (!driftServiceInstance) {
        driftServiceInstance = new DriftService();
      }

      const source = driftServiceInstance.getOracleSource();
      const usingDrift = driftServiceInstance.isUsingDriftOracle();

      res.status(200).json({
        success: true,
        data: {
          source,
          usingDriftOracle: usingDrift,
          description: usingDrift 
            ? 'Using Drift Protocol on-chain oracle prices'
            : 'Using Binance prices as fallback',
        },
      });
    } catch (error) {
      logger.error('Error fetching oracle info:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch oracle info',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

