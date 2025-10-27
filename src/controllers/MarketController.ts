import { Request, Response } from 'express';
import { PriceService } from '@/services/PriceService';
import logger from '@/utils/logger';

export class MarketController {
  private priceService: PriceService;

  constructor(priceService: PriceService) {
    this.priceService = priceService;
  }

  /**
   * Get current price for a symbol
   */
  public getCurrentPrice = async (req: Request, res: Response): Promise<void> => {
    try {
      const { symbol } = req.params;
      const symbolUpper = symbol.toUpperCase();

      const priceData = this.priceService.getCurrentPrice(symbolUpper);

      if (!priceData) {
        res.status(404).json({
          success: false,
          error: `Price data not found for symbol: ${symbolUpper}`,
        });
        return;
      }

      res.json({
        success: true,
        data: priceData,
      });
    } catch (error) {
      logger.error('Error getting current price:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get current price',
      });
    }
  };

  /**
   * Get price history for a symbol
   */
  public getPriceHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const { symbol } = req.params;
      const symbolUpper = symbol.toUpperCase();
      
      // Parse timeframe query parameter (default to 1h)
      const timeframe = req.query.timeframe as string || '1h';
      
      // Convert timeframe to hours
      const hours = this.parseTimeframe(timeframe);

      const priceHistory = await this.priceService.getPriceHistory(symbolUpper, hours);

      res.json({
        success: true,
        data: priceHistory,
        metadata: {
          symbol: symbolUpper,
          timeframe,
          hours,
          count: priceHistory.length,
        },
      });
    } catch (error) {
      logger.error('Error getting price history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get price history',
      });
    }
  };

  /**
   * Get price change for a symbol
   */
  public getPriceChange = async (req: Request, res: Response): Promise<void> => {
    try {
      const { symbol } = req.params;
      const symbolUpper = symbol.toUpperCase();
      
      const hours = parseInt(req.query.hours as string) || 24;

      const priceChange = await this.priceService.getPriceChange(symbolUpper, hours);

      res.json({
        success: true,
        data: {
          symbol: symbolUpper,
          hours,
          changePercent: priceChange,
        },
      });
    } catch (error) {
      logger.error('Error getting price change:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get price change',
      });
    }
  };

  /**
   * Get all current prices
   */
  public getAllCurrentPrices = async (req: Request, res: Response): Promise<void> => {
    try {
      const allPrices = this.priceService.getAllCurrentPrices();
      const pricesArray = Array.from(allPrices.values());

      res.json({
        success: true,
        data: pricesArray,
        metadata: {
          count: pricesArray.length,
        },
      });
    } catch (error) {
      logger.error('Error getting all current prices:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get all current prices',
      });
    }
  };

  /**
   * Get price service statistics
   */
  public getStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = this.priceService.getStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error getting price service stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get price service stats',
      });
    }
  };

  /**
   * Parse timeframe string to hours
   */
  private parseTimeframe(timeframe: string): number {
    const value = parseInt(timeframe);
    const unit = timeframe.replace(value.toString(), '').toLowerCase();

    switch (unit) {
      case 'm':
      case 'min':
      case 'minute':
      case 'minutes':
        return value / 60;
      case 'h':
      case 'hour':
      case 'hours':
        return value;
      case 'd':
      case 'day':
      case 'days':
        return value * 24;
      case 'w':
      case 'week':
      case 'weeks':
        return value * 24 * 7;
      default:
        return 1; // Default to 1 hour
    }
  }
}



