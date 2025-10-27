import { DriftService } from './DriftService';
import { WebSocketService } from './WebSocketService';
import { PriceData } from '@/types';
import { PrismaClient } from '@prisma/client';
import logger from '@/utils/logger';
import nodeCron from 'node-cron';

export class PriceService {
  private driftService: DriftService;
  private wsService: WebSocketService;
  private prisma: PrismaClient;
  private priceCache: Map<string, PriceData> = new Map();
  private priceHistoryCache: Map<string, PriceData[]> = new Map(); // Rolling buffer of real prices
  private isRunning: boolean = false;

  constructor(prisma: PrismaClient, wsService: WebSocketService) {
    this.driftService = new DriftService();
    this.wsService = wsService;
    this.prisma = prisma;
  }

  /**
   * Start price monitoring service
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn('Price service is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting price monitoring service (WebSocket + memory-only, no database storage)');

    // Update prices every 10 seconds (WebSocket provides real-time updates)
    nodeCron.schedule('*/10 * * * * *', () => {
      this.updatePrices();
    });

    // Note: Removed database storage to prevent database bloat
    // Prices are kept in memory cache only
    // WebSocket provides real-time updates from Binance
  }

  /**
   * Stop price monitoring service
   */
  public stop(): void {
    this.isRunning = false;
    // Clean up WebSocket connection
    this.driftService.destroy();
    logger.info('Price monitoring service stopped');
  }

  /**
   * Update prices for SOL/USDC from Drift Protocol
   */
  private async updatePrices(): Promise<void> {
    try {
      // Only track SOL/USDC from Drift Protocol
      const symbols = ['SOL'];
      
      const pricePromises = symbols.map(symbol => this.updateSymbolPrice(symbol));
      await Promise.allSettled(pricePromises);
    } catch (error) {
      logger.error('Error updating prices:', error);
    }
  }

  /**
   * Update price for a specific symbol
   */
  private async updateSymbolPrice(symbol: string): Promise<void> {
    try {
      const marketData = await this.driftService.getMarketData(symbol);
      
      const priceData: PriceData = {
        id: `${symbol}_${Date.now()}`,
        symbol,
        price: marketData.price,
        high: marketData.high24h,
        low: marketData.low24h,
        volume: marketData.volume24h,
        change24h: marketData.change24h,
        timestamp: new Date(),
      };

      // Update current price cache
      this.priceCache.set(symbol, priceData);

      // Add to rolling history buffer (keep last 300 points = 25 minutes of data)
      const history = this.priceHistoryCache.get(symbol) || [];
      history.push(priceData);
      
      // Keep only last 300 data points (25 minutes at 5-second intervals)
      if (history.length > 300) {
        history.shift(); // Remove oldest
      }
      
      this.priceHistoryCache.set(symbol, history);

      // Broadcast price update via WebSocket
      this.wsService.broadcastPriceUpdate({
        symbol,
        price: marketData.price,
        change24h: marketData.change24h,
      });

      logger.debug(`Updated ${symbol}: $${marketData.price.toFixed(2)} (${history.length} history points)`);

    } catch (error) {
      logger.error(`Error updating price for ${symbol}:`, error);
    }
  }

  // Note: Removed storePrices() method - no longer storing in database

  /**
   * Get current price for a symbol
   */
  public getCurrentPrice(symbol: string): PriceData | null {
    return this.priceCache.get(symbol) || null;
  }

  /**
   * Get price history for a symbol (returns real rolling buffer data)
   */
  public async getPriceHistory(symbol: string, hours: number = 24): Promise<PriceData[]> {
    try {
      const history = this.priceHistoryCache.get(symbol) || [];
      
      if (history.length === 0) {
        logger.warn(`No price history available for ${symbol} yet`);
        return [];
      }

      // Return the rolling buffer (last 300 real price points = 25 minutes)
      logger.debug(`Returning ${history.length} real price history points for ${symbol}`);
      return [...history]; // Return a copy to prevent mutation
    } catch (error) {
      logger.error(`Error getting price history for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Get price change for a symbol over a period (uses current cached data)
   */
  public async getPriceChange(symbol: string, hours: number = 24): Promise<number> {
    try {
      const currentPriceData = this.priceCache.get(symbol);
      if (!currentPriceData) {
        return 0;
      }

      // For now, return the cached 24h change
      // In a real implementation, you might want to calculate this differently
      return currentPriceData.change24h || 0;
    } catch (error) {
      logger.error(`Error calculating price change for ${symbol}:`, error);
      return 0;
    }
  }

  /**
   * Get all current prices
   */
  public getAllCurrentPrices(): Map<string, PriceData> {
    return new Map(this.priceCache);
  }

  /**
   * Get price statistics
   */
  public getStats(): {
    trackedSymbols: number;
    lastUpdate: Date | null;
    isRunning: boolean;
  } {
    const lastUpdate = this.priceCache.size > 0 
      ? new Date(Math.max(...Array.from(this.priceCache.values()).map(p => p.timestamp.getTime())))
      : null;

    return {
      trackedSymbols: this.priceCache.size,
      lastUpdate,
      isRunning: this.isRunning,
    };
  }
}

