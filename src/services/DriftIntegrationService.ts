import { RealDriftService, DriftTradeParams } from './RealDriftService';
import { DriftService as MockDriftService } from './DriftService';
import { driftConfig } from '@/utils/config';
import logger from '@/utils/logger';

/**
 * Drift Integration Service
 * Switches between real and mock Drift trading based on configuration
 */
export class DriftIntegrationService {
  private realDriftService: RealDriftService | null = null;
  private mockDriftService: MockDriftService;
  private isRealTradingEnabled: boolean;

  constructor() {
    this.isRealTradingEnabled = driftConfig.enableRealTrading;
    this.mockDriftService = new MockDriftService();

    if (this.isRealTradingEnabled) {
      logger.info('🔴 REAL TRADING MODE ENABLED - Drift Protocol');
      this.realDriftService = new RealDriftService();
    } else {
      logger.info('🟡 MOCK TRADING MODE - Simulated trades only');
    }
  }

  /**
   * Initialize Drift services
   */
  async initialize(): Promise<void> {
    if (this.isRealTradingEnabled && this.realDriftService) {
      await this.realDriftService.initialize();
      logger.info('✅ Real Drift service initialized');
    } else {
      logger.info('✅ Mock Drift service active');
    }
  }

  /**
   * Execute a trade (real or mock based on config)
   */
  async executeTrade(params: DriftTradeParams): Promise<{
    success: boolean;
    transactionId?: string;
    pnl?: number;
    entryPrice?: number;
    exitPrice?: number;
    error?: string;
  }> {
    try {
      if (this.isRealTradingEnabled && this.realDriftService) {
        // Execute real trade on Drift
        const tx = await this.realDriftService.openPosition(params);
        
        return {
          success: true,
          transactionId: tx,
          entryPrice: await this.realDriftService.getOraclePrice(params.marketSymbol),
        };
      } else {
        // Execute mock trade
        const mockResult = await this.mockDriftService.executeTrade({
          direction: params.direction,
          positionSize: params.baseAmount,
          leverage: params.leverage || 1,
          slippage: 0.01, // 1% default slippage for mock
        });

        return mockResult;
      }
    } catch (error) {
      logger.error('Trade execution failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Close a position
   */
  async closePosition(marketSymbol: string): Promise<{
    success: boolean;
    transactionId?: string;
    pnl?: number;
    error?: string;
  }> {
    try {
      if (this.isRealTradingEnabled && this.realDriftService) {
        // Get position info before closing for PnL
        const positions = await this.realDriftService.getPositions();
        const position = positions.find(p => p.marketSymbol === marketSymbol);
        
        const tx = await this.realDriftService.closePosition(marketSymbol);
        
        return {
          success: true,
          transactionId: tx,
          pnl: position?.unrealizedPnl || 0,
        };
      } else {
        // Mock close
        const mockResult = await this.mockDriftService.closePosition('account', marketSymbol);
        return mockResult;
      }
    } catch (error) {
      logger.error('Close position failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get current market price
   */
  async getMarketPrice(symbol: string): Promise<number> {
    if (this.isRealTradingEnabled && this.realDriftService) {
      try {
        return await this.realDriftService.getOraclePrice(symbol);
      } catch (error) {
        logger.warn('Failed to get Drift oracle price, falling back to Binance');
      }
    }
    
    // Fallback to Binance prices
    return await this.mockDriftService.getMarketPrice(symbol);
  }

  /**
   * Get account information
   */
  async getAccountInfo() {
    if (this.isRealTradingEnabled && this.realDriftService) {
      return await this.realDriftService.getAccountInfo();
    }
    
    return {
      equity: 10000,
      totalCollateral: 10000,
      freeCollateral: 10000,
      marginUsed: 0,
      totalPositionValue: 0,
      leverage: 0,
      positions: [],
    };
  }

  /**
   * Get all open positions
   */
  async getOpenPositions() {
    if (this.isRealTradingEnabled && this.realDriftService) {
      return await this.realDriftService.getPositions();
    }
    
    return [];
  }

  /**
   * Get unrealized PnL
   */
  async getUnrealizedPnL(): Promise<number> {
    if (this.isRealTradingEnabled && this.realDriftService) {
      return await this.realDriftService.getUnrealizedPnL();
    }
    
    return 0;
  }

  /**
   * Check if real trading is enabled
   */
  isRealTrading(): boolean {
    return this.isRealTradingEnabled;
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    if (this.realDriftService) {
      await this.realDriftService.cleanup();
    }
  }
}


