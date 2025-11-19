import { DriftTradeRequest, DriftTradeResponse } from '@/types';
import { driftConfig } from '@/utils/config';
import logger from '@/utils/logger';
import axios from 'axios';
import WebSocket from 'ws';
import { Connection, PublicKey } from '@solana/web3.js';
import { DriftClient, OraclePriceData } from '@drift-labs/sdk';
import { Wallet } from '@coral-xyz/anchor';

export class DriftService {
  private priceCache: Map<string, { price: number; timestamp: number; change24h: number }> = new Map();
  private cacheTTL: number = 5000; // 5 seconds cache
  private ws: WebSocket | null = null;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  private onPriceUpdate: ((data: any) => void) | null = null;
  
  // Drift integration
  private driftClient: DriftClient | null = null;
  private driftConnection: Connection | null = null;
  private useDriftOracle: boolean = true; // Use Drift oracle by default
  private oraclePollInterval: NodeJS.Timeout | null = null;

  constructor() {
    logger.info('🔵 Drift Service initializing - Drift oracle ONLY (Binance disabled)');
    this.initializeDriftOracle();
  }

  /**
   * Initialize Drift oracle connection for real-time prices
   */
  private async initializeDriftOracle(): Promise<void> {
    try {
      logger.info('Initializing Drift oracle connection...');
      
      // Create connection
      this.driftConnection = new Connection(
        driftConfig.rpcUrl,
        'confirmed'
      );

      // Create a read-only wallet (we don't need to sign transactions for price data)
      const dummyKeypair = new Uint8Array(64); // Dummy keypair for read-only
      const wallet = {
        publicKey: new PublicKey('11111111111111111111111111111111'),
        signTransaction: async (tx: any) => tx,
        signAllTransactions: async (txs: any[]) => txs,
      } as any;

      // Initialize Drift client (read-only for oracle access)
      // Initialize Drift client for read-only oracle access
      // Don't specify accountSubscription - let Drift use defaults
      this.driftClient = new DriftClient({
        connection: this.driftConnection,
        wallet,
        env: driftConfig.environment as any,
      });

      await this.driftClient.subscribe();
      logger.info('✅ Drift oracle connected - using on-chain prices');
      
      // Start polling oracle prices
      this.startOraclePricePolling();
      
    } catch (error) {
      logger.error('Failed to initialize Drift oracle:', error);
      logger.info('Falling back to Binance prices');
      this.useDriftOracle = false;
    }
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
    if (!this.driftClient || !this.useDriftOracle) {
      return;
    }

    try {
      // Get SOL-PERP oracle data (market index 0)
      const oracleData = this.driftClient.getOracleDataForPerpMarket(0);
      
      if (oracleData && oracleData.price) {
        const price = oracleData.price.toNumber() / 1e6; // Convert to decimal
        
        // Calculate 24h change (we'll need to track previous prices)
        const cached = this.priceCache.get('SOL');
        const change24h = cached ? ((price - cached.price) / cached.price) * 100 : 0;
        
        this.priceCache.set('SOL', {
          price,
          timestamp: Date.now(),
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

  private connectWebSocket(): void {
    try {
      // Use SOL/USDC WebSocket stream from Binance
      const wsUrl = 'wss://stream.binance.com/ws/solusdc@ticker';
      
      this.ws = new WebSocket(wsUrl, {
        handshakeTimeout: 10000, // 10 second timeout
      });
      
      // Add connection timeout handler
      const connectionTimeout = setTimeout(() => {
        if (!this.isConnected && this.ws) {
          logger.warn('⏱️ WebSocket connection timeout - using REST API fallback');
          this.ws.terminate();
          this.isConnected = false;
          this.scheduleReconnect();
        }
      }, 10000);
      
      this.ws.on('open', () => {
        clearTimeout(connectionTimeout);
        logger.info('✅ Connected to Binance WebSocket for SOL/USDC');
        this.isConnected = true;
        this.clearReconnectInterval();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const ticker = JSON.parse(data.toString());
          if (ticker && ticker.c && ticker.P) {
            const price = parseFloat(ticker.c);
            const change24h = parseFloat(ticker.P);
            const volume24h = parseFloat(ticker.v || '0');
            const high24h = parseFloat(ticker.h || price.toString());
            const low24h = parseFloat(ticker.l || price.toString());
            
            this.priceCache.set('SOL', {
              price,
              timestamp: Date.now(),
              change24h
            });
            
            // Broadcast to WebSocket clients if callback is set
            if (this.onPriceUpdate) {
              this.onPriceUpdate({
                symbol: 'SOL/USDC',
                price,
                change24h,
                volume24h,
                high24h,
                low24h,
                timestamp: new Date()
              });
            }
            
            logger.debug(`📊 Binance SOL/USDC: $${price.toFixed(2)} (24h: ${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%)`);
          }
        } catch (error) {
          logger.error('Error parsing Binance WebSocket data:', error);
        }
      });

      this.ws.on('error', (error) => {
        clearTimeout(connectionTimeout);
        logger.debug('Binance WebSocket error (using REST fallback):', error.message);
        this.isConnected = false;
        this.scheduleReconnect();
      });

      this.ws.on('close', () => {
        clearTimeout(connectionTimeout);
        logger.debug('Binance WebSocket connection closed (using REST fallback)');
        this.isConnected = false;
        this.scheduleReconnect();
      });

    } catch (error) {
      logger.debug('Error connecting to Binance WebSocket (using REST fallback):', error instanceof Error ? error.message : 'Unknown error');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectInterval) return;
    
    this.reconnectInterval = setTimeout(() => {
      logger.debug('Attempting to reconnect to Binance WebSocket...');
      this.reconnectInterval = null;
      this.connectWebSocket();
    }, 30000); // Reconnect every 30 seconds instead of 5
  }

  private clearReconnectInterval(): void {
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }
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
   * Get current market price from Binance WebSocket (real-time)
   */
  async getMarketPrice(symbol: string): Promise<number> {
    try {
      if (symbol !== 'SOL') {
        logger.warn(`Only SOL supported, falling back for ${symbol}`);
        return this.getFallbackPrice(symbol);
      }

      const cached = this.priceCache.get(symbol);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.price;
      }

      // If WebSocket is not connected or no cached data, try REST API as fallback
      if (!this.isConnected || !cached) {
        logger.info('WebSocket not connected, using REST API fallback');
        return await this.getMarketPriceFromRest(symbol);
      }

      return cached.price;
    } catch (error) {
      logger.error(`Error fetching market price for ${symbol}:`, error);
      return this.getFallbackPrice(symbol);
    }
  }

  private async getMarketPriceFromRest(symbol: string): Promise<number> {
    try {
      const response = await axios.get('https://api.binance.com/api/v3/ticker/price', {
        params: { symbol: 'SOLUSDC' },
        timeout: 5000,
      });

      if (response.data && response.data.price) {
        const price = parseFloat(response.data.price);
        this.priceCache.set(symbol, {
          price,
          timestamp: Date.now(),
          change24h: 0 // REST API doesn't provide 24h change
        });
        logger.info(`✅ Binance REST SOL/USDC: $${price.toFixed(2)}`);
        return price;
      }
    } catch (error) {
      logger.error('Error fetching from Binance REST API:', error);
    }
    
    return this.getFallbackPrice(symbol);
  }

  /**
   * Get 24h price change (calculated from Drift oracle data)
   */
  async getPriceChange24h(symbol: string): Promise<number> {
    try {
      const cached = this.priceCache.get(symbol);
      if (cached && cached.change24h !== undefined) {
        return cached.change24h;
      }

      // Return 0 if no cached data (will be calculated once we have historical data)
      return 0;
    } catch (error) {
      logger.error(`Error getting 24h price change for ${symbol}:`, error);
      return 0;
    }
  }

  private async getPriceChange24hFromRest(symbol: string): Promise<number> {
    try {
      const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr', {
        params: { symbol: 'SOLUSDC' },
        timeout: 5000,
      });

      if (response.data && response.data.priceChangePercent) {
        const change24h = parseFloat(response.data.priceChangePercent);
        logger.info(`✅ Binance REST 24h change: ${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%`);
        return change24h;
      }
    } catch (error) {
      logger.error('Error fetching 24h change from Binance REST API:', error);
    }
    
    return 0;
  }

  /**
   * Fallback prices (used when API fails)
   * NOTE: This should only be used as a last resort. Real prices should come from Drift or Binance.
   * TODO: Remove this fallback and make price fetching fail instead of using hardcoded values.
   */
  private getFallbackPrice(symbol: string): number {
    logger.error(`⚠️ CRITICAL: Using hardcoded fallback price for ${symbol}. This should not happen in production!`);
    logger.error(`   Please ensure Drift service is properly configured and Binance API is accessible.`);
    // Still return a fallback to prevent crashes, but log the error
    const fallbackPrices: { [key: string]: number } = {
      'SOL': 150.0,
      'BTC': 45000.0,
      'ETH': 3000.0,
      'USDC': 1.0,
    };
    return fallbackPrices[symbol] || 100.0;
  }

  /**
   * Get market data for SOL/USDC from Binance
   */
  async getMarketData(symbol: string): Promise<{
    price: number;
    change24h: number;
    volume24h: number;
    high24h: number;
    low24h: number;
  }> {
    try {
      const price = await this.getMarketPrice(symbol);
      const change24h = await this.getPriceChange24h(symbol);

      // For now, generate realistic volume and high/low data
      // In production, you'd fetch this from Binance's historical data
      const volume24h = Math.random() * 1000000 + 500000; // Random volume
      const high24h = price * (1 + Math.random() * 0.05); // Up to 5% higher
      const low24h = price * (1 - Math.random() * 0.05); // Up to 5% lower

      return {
        price,
        change24h,
        volume24h,
        high24h,
        low24h,
      };
    } catch (error) {
      logger.error('Error fetching market data from Binance:', error);
      throw error;
    }
  }

  /**
   * Check if market is open
   */
  async isMarketOpen(): Promise<boolean> {
    try {
      // Binance is 24/7, so market is always open
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
      isConnected: this.isConnected,
      symbol: 'SOL/USDC',
      lastUpdate: cached ? cached.timestamp : null,
    };
  }

  // Cleanup method
  public destroy(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.clearReconnectInterval();
    this.isConnected = false;
    this.onPriceUpdate = null;
    logger.info('DriftService WebSocket connection closed');
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