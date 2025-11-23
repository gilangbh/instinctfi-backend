import { DriftTradeRequest, DriftTradeResponse } from '@/types';
import { driftConfig } from '@/utils/config';
import logger from '@/utils/logger';
import { Connection, PublicKey } from '@solana/web3.js';
import { DriftClient, OraclePriceData } from '@drift-labs/sdk';
import { Wallet } from '@coral-xyz/anchor';

interface PriceHistoryPoint {
  price: number;
  timestamp: number;
}

export class DriftService {
  private priceCache: Map<string, { price: number; timestamp: number; change24h: number }> = new Map();
  private priceHistory: Map<string, PriceHistoryPoint[]> = new Map(); // Store price history for 24h change calculation
  private cacheTTL: number = 5000; // 5 seconds cache
  private onPriceUpdate: ((data: any) => void) | null = null;
  
  // Drift integration
  private driftClient: DriftClient | null = null;
  private driftConnection: Connection | null = null;
  private useDriftOracle: boolean = true; // Use Drift oracle by default
  private oraclePollInterval: NodeJS.Timeout | null = null;
  private retryInterval: NodeJS.Timeout | null = null;
  private retryAttempts: number = 0;
  private maxRetryAttempts: number = Infinity; // Retry indefinitely
  private retryDelay: number = 30000; // 30 seconds between retries

  constructor() {
    logger.info('🔵 Drift Service initializing - Drift oracle ONLY (Binance disabled)');
    // Initialize asynchronously - don't block constructor
    this.initializeDriftOracle().catch((error) => {
      logger.error('❌ Failed to initialize Drift oracle in constructor:', error);
      logger.error('   Error details:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        logger.error('   Stack trace:', error.stack);
      }
      // Start retry mechanism
      this.startRetryInitialization();
    });
  }

  /**
   * Initialize Drift oracle connection for real-time prices
   */
  private async initializeDriftOracle(): Promise<void> {
    try {
      logger.info('Initializing Drift oracle connection...');
      logger.info(`   RPC URL: ${driftConfig.rpcUrl}`);
      logger.info(`   Environment: ${driftConfig.environment}`);
      
      // Create connection
      this.driftConnection = new Connection(
        driftConfig.rpcUrl,
        'confirmed'
      );
      logger.info('   ✅ Solana connection created');

      // Create a read-only wallet (we don't need to sign transactions for price data)
      const dummyKeypair = new Uint8Array(64); // Dummy keypair for read-only
      const wallet = {
        publicKey: new PublicKey('11111111111111111111111111111111'),
        signTransaction: async (tx: any) => tx,
        signAllTransactions: async (txs: any[]) => txs,
      } as any;
      logger.info('   ✅ Read-only wallet created');

      // Initialize Drift client (read-only for oracle access)
      logger.info('   Creating DriftClient...');
      this.driftClient = new DriftClient({
        connection: this.driftConnection,
        wallet,
        env: driftConfig.environment as any,
      });
      logger.info('   ✅ DriftClient created');

      logger.info('   Subscribing to Drift accounts...');
      await this.driftClient.subscribe();
      logger.info('✅ Drift oracle connected - using on-chain prices');
      
      // Mark oracle as ready
      this.useDriftOracle = true;
      
      // Start polling oracle prices
      this.startOraclePricePolling();
      logger.info('   ✅ Oracle price polling started');
      
      // Stop any retry mechanism since we succeeded
      this.stopRetryInitialization();
      this.retryAttempts = 0;
      
    } catch (error: any) {
      logger.error('❌ Failed to initialize Drift oracle:');
      if (error) {
        logger.error('   Error type:', error instanceof Error ? error.constructor.name : typeof error);
        logger.error('   Error message:', error instanceof Error ? error.message : String(error));
        if (error instanceof Error && error.stack) {
          logger.error('   Stack trace:', error.stack);
        }
        // Check for specific error types
        if (error.code === 429) {
          logger.error('   ⚠️  Rate limit error (429) - RPC endpoint is rate limiting requests');
          logger.error('   💡 Consider using a different RPC endpoint or adding rate limiting delays');
        }
        if (error.message && error.message.includes('429')) {
          logger.error('   ⚠️  Rate limit detected in error message');
        }
      } else {
        logger.error('   Unknown error (error object is null/undefined)');
      }
      logger.error('   RPC URL:', driftConfig.rpcUrl || 'NOT SET');
      logger.error('   Environment:', driftConfig.environment || 'NOT SET');
      logger.error('⚠️  Drift oracle is required. Service will not function without it.');
      this.useDriftOracle = false;
      this.driftClient = null;
      this.driftConnection = null;
      // Don't throw - let the service continue but mark oracle as unavailable
      // Retry mechanism will be started by the caller if needed
      throw error; // Re-throw to trigger retry mechanism
    }
  }

  /**
   * Start retrying oracle initialization if it failed
   */
  private startRetryInitialization(): void {
    // Don't start multiple retry intervals
    if (this.retryInterval) {
      return;
    }

    logger.info(`🔄 Starting retry mechanism for Drift oracle initialization (retrying every ${this.retryDelay / 1000}s)`);
    
    this.retryInterval = setInterval(async () => {
      // If oracle is already ready, stop retrying
      if (this.isOracleReady()) {
        logger.info('✅ Drift oracle is now ready. Stopping retry mechanism.');
        this.stopRetryInitialization();
        return;
      }

      // Check if we've exceeded max retry attempts
      if (this.retryAttempts >= this.maxRetryAttempts) {
        logger.error(`❌ Max retry attempts (${this.maxRetryAttempts}) reached. Stopping retry mechanism.`);
        this.stopRetryInitialization();
        return;
      }

      this.retryAttempts++;
      logger.info(`🔄 Retrying Drift oracle initialization (attempt ${this.retryAttempts})...`);
      
      try {
        await this.initializeDriftOracle();
        // If successful, stop retrying
        logger.info('✅ Drift oracle initialized successfully after retry.');
        this.stopRetryInitialization();
        this.retryAttempts = 0; // Reset counter
      } catch (error) {
        logger.warn(`⚠️  Retry attempt ${this.retryAttempts} failed. Will retry again in ${this.retryDelay / 1000}s.`);
        // Continue retrying
      }
    }, this.retryDelay);
  }

  /**
   * Stop retrying oracle initialization
   */
  private stopRetryInitialization(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
      this.retryAttempts = 0;
    }
  }

  /**
   * Manually trigger oracle reinitialization (useful for recovery)
   */
  public async reinitializeOracle(): Promise<void> {
    logger.info('🔄 Manually triggering Drift oracle reinitialization...');
    this.stopRetryInitialization();
    this.useDriftOracle = false;
    this.driftClient = null;
    this.driftConnection = null;
    
    try {
      await this.initializeDriftOracle();
      logger.info('✅ Oracle reinitialized successfully');
    } catch (error) {
      logger.error('❌ Failed to reinitialize oracle:', error);
      this.startRetryInitialization();
      throw error;
    }
  }

  /**
   * Cleanup all intervals and connections
   */
  public cleanup(): void {
    logger.info('🧹 Cleaning up DriftService...');
    this.stopRetryInitialization();
    if (this.oraclePollInterval) {
      clearInterval(this.oraclePollInterval);
      this.oraclePollInterval = null;
    }
    // Note: DriftClient cleanup would go here if needed
  }

  /**
   * Poll Drift oracle for price updates
   */
  private startOraclePricePolling(): void {
    // Poll every 2 seconds
    this.oraclePollInterval = setInterval(async () => {
      try {
        await this.updateDriftOraclePrices();
      } catch (error) {
        logger.debug('Error polling Drift oracle:', error);
      }
    }, 2000);
  }

  /**
   * Update prices from Drift oracle
   */
  private async updateDriftOraclePrices(): Promise<void> {
    if (!this.isOracleReady()) {
      logger.debug('Skipping oracle price update - oracle not ready');
      return;
    }

    try {
      // Get SOL-PERP oracle data (market index 0)
      const oracleData = this.driftClient!.getOracleDataForPerpMarket(0);
      
      if (oracleData && oracleData.price) {
        const price = oracleData.price.toNumber() / 1e6; // Convert to decimal
        const now = Date.now();
        
        // Store price in history for 24h change calculation
        const history = this.priceHistory.get('SOL') || [];
        history.push({ price, timestamp: now });
        
        // Keep only last 24 hours of data (clean up old entries)
        const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
        const filteredHistory = history.filter(p => p.timestamp >= twentyFourHoursAgo);
        this.priceHistory.set('SOL', filteredHistory);
        
        // Calculate 24h change: compare current price to price 24 hours ago
        let change24h = 0;
        if (filteredHistory.length > 1) {
          const price24hAgo = filteredHistory[0].price; // Oldest price in filtered history (closest to 24h ago)
          if (price24hAgo > 0) {
            change24h = ((price - price24hAgo) / price24hAgo) * 100;
          }
        } else if (filteredHistory.length === 1) {
          // If we only have one data point, we can't calculate 24h change yet
          // Will calculate once we have 24h of price history from Drift oracle
          change24h = 0;
          logger.debug('Not enough price history yet. 24h change will be calculated once we have 24h of data from Drift oracle.');
        }
            
            this.priceCache.set('SOL', {
              price,
          timestamp: now,
          change24h,
            });
            
        // Broadcast to WebSocket clients
            if (this.onPriceUpdate) {
              this.onPriceUpdate({
            symbol: 'SOL-PERP',
                price,
                change24h,
            source: 'drift-oracle',
            timestamp: new Date(),
          });
        }

        logger.debug(`📊 Drift Oracle SOL: $${price.toFixed(2)} (${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%)`);
      }
    } catch (error) {
      logger.debug('Error fetching from Drift oracle:', error);
    }
  }

  // WebSocket connection removed - using Drift oracle only (no Binance)

  // clearReconnectInterval removed - WebSocket no longer used

  /**
   * Check if Drift oracle is initialized and ready
   */
  private isOracleReady(): boolean {
    if (!this.useDriftOracle) {
      logger.debug('Drift oracle is disabled (useDriftOracle = false)');
      return false;
    }
    if (!this.driftClient) {
      logger.debug('Drift client is null - oracle not initialized yet');
      return false;
    }
    if (!this.driftConnection) {
      logger.debug('Drift connection is null - oracle not initialized yet');
      return false;
    }
    return true;
  }

  /**
   * Execute a trade on Drift Protocol
   */
  async executeTrade(tradeRequest: DriftTradeRequest): Promise<DriftTradeResponse> {
    try {
      logger.info(`Executing trade on Drift: ${JSON.stringify(tradeRequest)}`);

      // TODO: Implement actual Drift Protocol integration
      // This is a mock implementation for now
      
      const mockResponse = await this.mockDriftTrade(tradeRequest);
      
      logger.info(`Trade executed successfully: ${mockResponse.transactionId}`);
      return mockResponse;
    } catch (error) {
      logger.error('Error executing trade on Drift:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get current market price from Drift oracle only
   */
  async getMarketPrice(symbol: string): Promise<number> {
    // Normalize symbol: 'SOL-PERP' -> 'SOL', 'SOL/USDC' -> 'SOL'
    // The oracle only supports SOL (market index 0)
    const normalizedSymbol = symbol.replace('-PERP', '').split('/')[0].toUpperCase();
    
    if (normalizedSymbol !== 'SOL') {
      throw new Error(`Only SOL is supported via Drift oracle. Symbol: ${symbol} (normalized: ${normalizedSymbol})`);
    }

    // Check if oracle is ready
    if (!this.isOracleReady()) {
      const errorMsg = `Drift oracle is not available. Cannot fetch SOL-PERP price (requested as: ${symbol}).`;
      logger.error(errorMsg);
      logger.error(`   useDriftOracle: ${this.useDriftOracle}`);
      logger.error(`   driftClient: ${this.driftClient ? 'exists' : 'null'}`);
      logger.error(`   driftConnection: ${this.driftConnection ? 'exists' : 'null'}`);
      throw new Error(errorMsg);
    }

    // Get from cache first using normalized symbol (oracle stores as 'SOL')
    const cached = this.priceCache.get(normalizedSymbol);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      logger.debug(`✅ Returning cached price for ${symbol} (${normalizedSymbol}): $${cached.price.toFixed(2)}`);
      return cached.price;
    }

    // If cache is stale, try to get fresh data from oracle
    // Market index 0 is SOL-PERP on Drift
    try {
      const oracleData = this.driftClient!.getOracleDataForPerpMarket(0);
      if (oracleData && oracleData.price) {
        const price = oracleData.price.toNumber() / 1e6;
        logger.debug(`✅ Fetched fresh price from Drift oracle for ${symbol} (${normalizedSymbol}): $${price.toFixed(2)}`);
        
        // Update cache with normalized symbol
        const now = Date.now();
        this.priceCache.set(normalizedSymbol, {
          price,
          timestamp: now,
          change24h: cached?.change24h || 0,
        });
        
        return price;
      }
    } catch (error) {
      logger.debug(`⚠️ Error fetching from Drift oracle for ${symbol}, using cache if available:`, error);
    }
    
    // Return cached price even if stale (oracle polling will update it)
    if (cached) {
      logger.debug(`⚠️ Returning slightly stale price from cache for ${symbol} (${normalizedSymbol}). Oracle polling will update soon.`);
      return cached.price;
    }

    // No cached price available - throw error instead of using fallback
    // Note: We're fetching SOL-PERP (market index 0) from Drift oracle
    const errorMsg = `No price data available from Drift oracle for SOL-PERP (requested as: ${symbol}). Oracle may not be initialized or no price data has been collected yet.`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // getMarketPriceFromRest removed - using Drift oracle only (no Binance)

  /**
   * Get 24h price change (calculated from Drift oracle data)
   */
  async getPriceChange24h(symbol: string): Promise<number> {
    try {
      // First try to get from cache (updated by oracle polling)
      const cached = this.priceCache.get(symbol);
      if (cached && cached.change24h !== undefined && cached.change24h !== 0) {
        return cached.change24h;
      }

      // If cache doesn't have 24h change yet, calculate from history
      const history = this.priceHistory.get(symbol) || [];
      if (history.length > 1) {
        const now = Date.now();
        const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
        const filteredHistory = history.filter(p => p.timestamp >= twentyFourHoursAgo);
        
        if (filteredHistory.length > 1) {
          const currentPrice = filteredHistory[filteredHistory.length - 1].price;
          const price24hAgo = filteredHistory[0].price;
          if (price24hAgo > 0) {
            const change24h = ((currentPrice - price24hAgo) / price24hAgo) * 100;
            // Update cache with calculated value
            if (cached) {
              cached.change24h = change24h;
            }
            return change24h;
          }
        }
      }

      // If we don't have enough history, return 0
      // 24h change will be calculated once we have 24h of price history from Drift oracle
      if (history.length === 0 || history.length === 1) {
        logger.debug('Not enough price history yet. 24h change will be calculated once we have 24h of data from Drift oracle.');
        return 0;
      }

      // Return 0 if no data available
      return 0;
    } catch (error) {
      logger.error(`Error getting 24h price change for ${symbol}:`, error);
      return 0;
    }
  }

  // getPriceChange24hFromRest removed - using Drift oracle only

  // getFallbackPrice removed - no hardcoded prices. Service will throw errors if oracle is unavailable.

  /**
   * Get market data for SOL/USDC from Drift oracle only
   */
  async getMarketData(symbol: string): Promise<{
    price: number;
    change24h: number;
    volume24h: number;
    high24h: number;
    low24h: number;
  }> {
    try {
      // Get price from Drift oracle only
      const price = await this.getMarketPrice(symbol);
      
      // Get 24h change (calculated from Drift oracle history)
      const change24h = await this.getPriceChange24h(symbol);

      // Calculate high/low from price history if available
      const history = this.priceHistory.get(symbol) || [];
      const now = Date.now();
      const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
      const filteredHistory = history.filter(p => p.timestamp >= twentyFourHoursAgo);
      
      let high24h = price;
      let low24h = price;
      if (filteredHistory.length > 0) {
        const prices = filteredHistory.map(p => p.price);
        high24h = Math.max(...prices);
        low24h = Math.min(...prices);
      } else {
        // Fallback: estimate from current price and change
        const absChange = Math.abs(change24h) / 100;
        high24h = price * (1 + absChange);
        low24h = price * (1 - absChange);
      }

      // Volume: Drift oracle doesn't provide volume data, so we return 0
      // In production, you might fetch this from a separate source if needed
      const volume24h = 0;

      return {
        price,
        change24h,
        volume24h,
        high24h,
        low24h,
      };
    } catch (error) {
      logger.error('Error fetching market data:', error);
      throw error;
    }
  }

  /**
   * Check if market is open
   */
  async isMarketOpen(): Promise<boolean> {
    try {
      // Drift markets are 24/7, so market is always open
      return true;
    } catch (error) {
      logger.error('Error checking market status:', error);
      return false;
    }
  }

  /**
   * Get account balance
   */
  async getAccountBalance(accountId: string): Promise<number> {
    try {
      // TODO: Implement actual balance fetching from Drift
      // This is a mock implementation for now
      
      return 10000; // Mock balance in USDC
    } catch (error) {
      logger.error('Error fetching account balance:', error);
      throw error;
    }
  }

  /**
   * Get open positions
   */
  async getOpenPositions(accountId: string): Promise<Array<{
    symbol: string;
    size: number;
    entryPrice: number;
    markPrice: number;
    pnl: number;
  }>> {
    try {
      // TODO: Implement actual positions fetching from Drift
      // This is a mock implementation for now
      
      return [];
    } catch (error) {
      logger.error('Error fetching open positions:', error);
      throw error;
    }
  }

  /**
   * Close a position
   */
  async closePosition(accountId: string, symbol: string): Promise<DriftTradeResponse> {
    try {
      // TODO: Implement actual position closing on Drift
      // This is a mock implementation for now
      
      return {
        success: true,
        transactionId: `close_${Date.now()}`,
        pnl: Math.random() * 1000 - 500, // Random PnL
      };
    } catch (error) {
      logger.error('Error closing position:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Mock trade execution for development
   */
  private async mockDriftTrade(tradeRequest: DriftTradeRequest): Promise<DriftTradeResponse> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Simulate random success/failure
    const success = Math.random() > 0.1; // 90% success rate

    if (!success) {
      return {
        success: false,
        error: 'Mock trade execution failed',
      };
    }

    // Simulate trade execution
    // NOTE: In mock mode, we should still try to get real prices if possible
    // For now, we'll use a placeholder that should be replaced with real price fetching
    logger.warn('⚠️ Using mock trade execution - entry price should come from real market data');
    let entryPrice = 150.0; // Placeholder - should be fetched from market
    try {
      // Try to get real price even in mock mode
      const realPrice = await this.getMarketPrice('SOL');
      if (realPrice && realPrice > 0) {
        entryPrice = realPrice;
        logger.info(`✅ Using real market price for mock trade: $${entryPrice.toFixed(2)}`);
      } else {
        logger.warn(`⚠️ Could not fetch real price, using placeholder $${entryPrice.toFixed(2)}`);
      }
    } catch (error) {
      logger.warn(`⚠️ Error fetching real price for mock trade, using placeholder: ${error}`);
    }
    
    const priceChange = (Math.random() - 0.5) * 0.1; // Random price change
    const exitPrice = entryPrice * (1 + priceChange);
    
    const pnl = tradeRequest.direction === 'long' 
      ? tradeRequest.positionSize * tradeRequest.leverage * priceChange
      : tradeRequest.positionSize * tradeRequest.leverage * -priceChange;

    return {
      success: true,
      transactionId: `mock_tx_${Date.now()}`,
      pnl,
      entryPrice,
      exitPrice,
    };
  }

  /**
   * Validate trade request
   */
  private validateTradeRequest(tradeRequest: DriftTradeRequest): boolean {
    if (!tradeRequest.direction || !['long', 'short'].includes(tradeRequest.direction)) {
      return false;
    }

    if (tradeRequest.leverage < 1 || tradeRequest.leverage > 20) {
      return false;
    }

    if (tradeRequest.positionSize <= 0) {
      return false;
    }

    if (tradeRequest.slippage < 0 || tradeRequest.slippage > 1) {
      return false;
    }

    return true;
  }

  /**
   * Get trading fees
   */
  async getTradingFees(): Promise<{
    maker: number;
    taker: number;
  }> {
    try {
      // TODO: Implement actual fee fetching from Drift
      // This is a mock implementation for now
      
      return {
        maker: 0.0002, // 0.02%
        taker: 0.0005, // 0.05%
      };
    } catch (error) {
      logger.error('Error fetching trading fees:', error);
      throw error;
    }
  }

  /**
   * Get market depth
   */
  async getMarketDepth(symbol: string): Promise<{
    bids: Array<{ price: number; size: number }>;
    asks: Array<{ price: number; size: number }>;
  }> {
    try {
      // TODO: Implement actual market depth fetching from Drift
      // This is a mock implementation for now
      
      const basePrice = await this.getMarketPrice(symbol);
      const bids = [];
      const asks = [];

      for (let i = 0; i < 10; i++) {
        bids.push({
          price: basePrice * (1 - (i + 1) * 0.001),
          size: Math.random() * 1000,
        });
        asks.push({
          price: basePrice * (1 + (i + 1) * 0.001),
          size: Math.random() * 1000,
        });
      }

      return { bids, asks };
    } catch (error) {
      logger.error('Error fetching market depth:', error);
      throw error;
    }
  }

  /**
   * Set callback for price updates (for broadcasting to WebSocket clients)
   */
  public setPriceUpdateCallback(callback: (data: any) => void): void {
    this.onPriceUpdate = callback;
    logger.info('Price update callback registered');
  }

  /**
   * Get connection status
   */
  public getConnectionStatus(): {
    isConnected: boolean;
    symbol: string;
    lastUpdate: number | null;
  } {
    const cached = this.priceCache.get('SOL');
    return {
      isConnected: this.useDriftOracle && this.driftClient !== null,
      symbol: 'SOL/USDC',
      lastUpdate: cached ? cached.timestamp : null,
    };
  }

  // Cleanup method
  public destroy(): void {
    // Stop oracle polling
    if (this.oraclePollInterval) {
      clearInterval(this.oraclePollInterval);
      this.oraclePollInterval = null;
    }
    this.onPriceUpdate = null;
    logger.info('DriftService cleaned up');
  }

  /**
   * Check if using Drift oracle
   */
  isUsingDriftOracle(): boolean {
    return this.useDriftOracle && this.driftClient !== null;
  }

  /**
   * Get oracle source being used
   */
  getOracleSource(): string {
    if (this.useDriftOracle && this.driftClient) {
      return 'drift-oracle';
    }
    return 'drift-oracle-fallback';
  }
}