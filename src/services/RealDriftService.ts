import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { 
  DriftClient, 
  User, 
  initialize,
  PositionDirection,
  MarketType,
  OrderType,
  UserAccount,
  PerpPosition,
  QUOTE_PRECISION,
  BASE_PRECISION
} from '@drift-labs/sdk';
import { Wallet, BN } from '@coral-xyz/anchor';
import { driftConfig, solanaConfig } from '@/utils/config';
import logger from '@/utils/logger';
import { parseKeypair } from '@/utils/solana';

export interface DriftTradeParams {
  marketSymbol: string; // e.g., 'SOL-PERP'
  direction: 'long' | 'short';
  baseAmount: number; // Amount in base asset (e.g., SOL)
  leverage?: number;
  reduceOnly?: boolean;
}

export interface DriftPositionInfo {
  marketSymbol: string;
  marketIndex: number;
  direction: 'long' | 'short';
  baseAssetAmount: number;
  quoteAssetAmount: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  leverage: number;
}

export interface DriftAccountInfo {
  equity: number;
  totalCollateral: number;
  freeCollateral: number;
  marginUsed: number;
  totalPositionValue: number;
  leverage: number;
  positions: DriftPositionInfo[];
}

/**
 * Real Drift Protocol Integration Service
 * Manages actual trading on Drift Protocol
 */
export class RealDriftService {
  private connection: Connection;
  private wallet: Wallet;
  private driftClient: DriftClient | null = null;
  private user: User | null = null;
  private isInitialized: boolean = false;
  private marketCache: Map<string, number> = new Map(); // symbol -> market index

  constructor() {
    // Initialize connection
    this.connection = new Connection(
      driftConfig.rpcUrl || solanaConfig.rpcUrl,
      'confirmed'
    );

    // Parse and load wallet
    if (!driftConfig.tradingKeypair) {
      throw new Error('DRIFT_TRADING_KEYPAIR is required for Drift integration');
    }

    try {
      const keypair = parseKeypair(driftConfig.tradingKeypair);
      this.wallet = new Wallet(keypair);
      logger.info(`Drift wallet initialized: ${this.wallet.publicKey.toString()}`);
    } catch (error) {
      logger.error('Failed to parse Drift trading keypair:', error);
      throw new Error('Invalid DRIFT_TRADING_KEYPAIR');
    }

    // Initialize market cache
    this.initializeMarketCache();
  }

  /**
   * Initialize Drift client and subscribe
   * Following official Drift SDK documentation: https://drift-labs.github.io/v2-teacher/
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('Drift client already initialized');
      return;
    }

    try {
      logger.info('Initializing Drift client...');

      // Initialize Drift client (official pattern from docs)
      this.driftClient = new DriftClient({
        connection: this.connection,
        wallet: this.wallet,
        env: driftConfig.environment as any,
      });

      // Subscribe to drift client
      await this.driftClient.subscribe();
      logger.info('✅ Drift client subscribed');

      // Check if user account exists
      const userAccountPublicKey = await this.driftClient.getUserAccountPublicKey(0); // subAccountId = 0
      const userAccountExists = await this.checkUserAccountExists(userAccountPublicKey);

      if (!userAccountExists) {
        logger.warn('⚠️  Drift user account not initialized');
        logger.warn('Please initialize your Drift account:');
        logger.warn(`  1. Visit: https://app.drift.trade/?cluster=${driftConfig.environment}`);
        logger.warn(`  2. Connect wallet: ${this.wallet.publicKey.toString()}`);
        logger.warn('  3. Initialize your account');
        
        // Don't throw error - allow read-only operations
        this.isInitialized = true;
        return;
      }

      // Initialize User (official pattern from docs)
      this.user = new User({
        driftClient: this.driftClient,
        userAccountPublicKey,
      });

      await this.user.subscribe();
      logger.info('✅ Drift user subscribed');

      this.isInitialized = true;
      logger.info('🚀 Drift integration fully initialized');

      // Log account info
      try {
        const accountInfo = await this.getAccountInfo();
        logger.info(`Drift Account - Equity: $${accountInfo.equity.toFixed(2)}, Free Collateral: $${accountInfo.freeCollateral.toFixed(2)}`);
      } catch (error) {
        logger.debug('Could not fetch account info (account may be empty)');
      }

    } catch (error) {
      logger.error('Failed to initialize Drift client:', error);
      throw error;
    }
  }

  /**
   * Initialize market symbol to index mapping
   */
  private initializeMarketCache(): void {
    // Common Drift perp markets
    this.marketCache.set('SOL-PERP', 0);
    this.marketCache.set('BTC-PERP', 1);
    this.marketCache.set('ETH-PERP', 2);
    // Add more as needed
  }

  /**
   * Check if user account exists
   */
  private async checkUserAccountExists(userAccountPublicKey: PublicKey): Promise<boolean> {
    try {
      const accountInfo = await this.connection.getAccountInfo(userAccountPublicKey);
      return accountInfo !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get market index from symbol
   */
  private getMarketIndex(marketSymbol: string): number {
    const index = this.marketCache.get(marketSymbol);
    if (index === undefined) {
      throw new Error(`Unknown market symbol: ${marketSymbol}. Add it to market cache.`);
    }
    return index;
  }

  /**
   * Ensure client is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.driftClient || !this.user) {
      throw new Error('Drift client not initialized. Call initialize() first.');
    }
  }

  /**
   * Open a position on Drift
   * Following official Drift SDK documentation for placing perp orders
   * 
   * If leverage is provided, calculates position size to achieve target leverage
   */
  async openPosition(params: DriftTradeParams): Promise<string> {
    this.ensureInitialized();

    if (!this.user) {
      throw new Error('Drift user account not initialized. Please initialize via Drift app first.');
    }

    try {
      const marketIndex = this.getMarketIndex(params.marketSymbol);
      const direction = params.direction === 'long' 
        ? PositionDirection.LONG 
        : PositionDirection.SHORT;

      let baseAssetAmount: BN;

      // If leverage is specified, calculate position size to achieve target leverage
      if (params.leverage && params.leverage > 1) {
        // Get available collateral
        const freeCollateral = this.user.getFreeCollateral().toNumber() / 1e6; // QUOTE_PRECISION
        
        // Get current price
        const currentPrice = await this.getOraclePrice(params.marketSymbol);
        
        // Calculate leveraged position value
        const leveragedPositionValue = freeCollateral * params.leverage;
        
        // Convert to base asset amount
        const calculatedBaseAmount = leveragedPositionValue / currentPrice;
        baseAssetAmount = new BN(calculatedBaseAmount * 1e9);
        
        logger.info(`Opening ${params.direction} position with ${params.leverage}x leverage:`, {
          freeCollateral: `$${freeCollateral.toFixed(2)}`,
          currentPrice: `$${currentPrice.toFixed(2)}`,
          leveragedValue: `$${leveragedPositionValue.toFixed(2)}`,
          baseAmount: calculatedBaseAmount.toFixed(4),
          marketSymbol: params.marketSymbol,
        });
      } else {
        // Use specified base amount directly (for backward compatibility)
        baseAssetAmount = new BN(params.baseAmount * 1e9);
        logger.info(`Opening ${params.direction} position: ${params.baseAmount} ${params.marketSymbol}`);
      }

      // Place market order (official pattern from Drift docs)
      const tx = await this.driftClient!.placePerpOrder({
        orderType: OrderType.MARKET,
        marketIndex,
        direction,
        baseAssetAmount,
        reduceOnly: params.reduceOnly || false,
      });

      logger.info(`✅ Position opened: ${tx}`);
      return tx;

    } catch (error) {
      logger.error('Failed to open position on Drift:', error);
      throw error;
    }
  }

  /**
   * Close a position on Drift
   * Using reduce-only market order to close position
   */
  async closePosition(marketSymbol: string): Promise<string> {
    this.ensureInitialized();

    if (!this.user) {
      throw new Error('Drift user account not initialized');
    }

    try {
      const marketIndex = this.getMarketIndex(marketSymbol);
      
      // Get current position to determine direction and size
      const userAccount = this.user.getUserAccount();
      const position = userAccount.perpPositions.find(p => p.marketIndex === marketIndex);
      
      if (!position || position.baseAssetAmount.isZero()) {
        throw new Error(`No open position on ${marketSymbol}`);
      }

      // Determine opposite direction to close
      const isLong = position.baseAssetAmount.gt(new BN(0));
      const closeDirection = isLong ? PositionDirection.SHORT : PositionDirection.LONG;
      const positionSize = position.baseAssetAmount.abs();
      
      logger.info(`Closing position on ${marketSymbol}: ${isLong ? 'LONG' : 'SHORT'} ${positionSize.toString()}`);

      // Place reduce-only market order to close
      const tx = await this.driftClient!.placePerpOrder({
        orderType: OrderType.MARKET,
        marketIndex,
        direction: closeDirection,
        baseAssetAmount: positionSize,
        reduceOnly: true, // Important: this ensures we're closing, not opening opposite
      });

      logger.info(`✅ Position closed: ${tx}`);
      return tx;

    } catch (error) {
      logger.error('Failed to close position on Drift:', error);
      throw error;
    }
  }

  /**
   * Get all open positions
   * Following official Drift SDK pattern for getting perp positions
   */
  async getPositions(): Promise<DriftPositionInfo[]> {
    this.ensureInitialized();

    if (!this.user) {
      return []; // No user account = no positions
    }

    try {
      // Get user account to access positions
      const userAccount = this.user.getUserAccount();
      const perpPositions = userAccount.perpPositions;
      const positions: DriftPositionInfo[] = [];

      for (const position of perpPositions) {
        if (position.baseAssetAmount.isZero()) {
          continue; // Skip closed positions
        }

        const marketIndex = position.marketIndex;
        const marketSymbol = this.getMarketSymbolFromIndex(marketIndex);
        
        // Get current market price from oracle
        const oracleData = this.driftClient!.getOracleDataForPerpMarket(marketIndex);
        const currentPrice = oracleData.price.toNumber() / 1e6; // QUOTE_PRECISION

        // Base amount uses 9 decimals (BASE_PRECISION)
        const baseAmount = position.baseAssetAmount.toNumber() / 1e9;
        // Quote amount uses 6 decimals (QUOTE_PRECISION)
        const quoteAmount = position.quoteAssetAmount.toNumber() / 1e6;
        
        const isLong = position.baseAssetAmount.gt(new BN(0));
        const entryPrice = Math.abs(quoteAmount / baseAmount);

        // Calculate unrealized PnL (official method from Drift SDK)
        const unrealizedPnl = this.user.getUnrealizedPNL(true, marketIndex);

        positions.push({
          marketSymbol,
          marketIndex,
          direction: isLong ? 'long' : 'short',
          baseAssetAmount: Math.abs(baseAmount),
          quoteAssetAmount: Math.abs(quoteAmount),
          entryPrice,
          currentPrice,
          unrealizedPnl: unrealizedPnl.toNumber() / 1e6,
          leverage: this.calculatePositionLeverage(position),
        });
      }

      return positions;

    } catch (error) {
      logger.error('Failed to get positions from Drift:', error);
      throw error;
    }
  }

  /**
   * Get account information
   * Using official Drift SDK methods for user account data
   */
  async getAccountInfo(): Promise<DriftAccountInfo> {
    this.ensureInitialized();

    if (!this.user) {
      throw new Error('Drift user account not initialized');
    }

    try {
      // Get collateral info (official Drift SDK methods)
      const totalCollateral = this.user.getTotalCollateral().toNumber() / 1e6; // QUOTE_PRECISION
      const freeCollateral = this.user.getFreeCollateral().toNumber() / 1e6;
      
      // Equity is same as total collateral
      const equity = totalCollateral;
      
      // Calculate margin used
      const marginUsed = totalCollateral - freeCollateral;
      
      // Get positions
      const positions = await this.getPositions();
      
      // Calculate total position value
      const totalPositionValue = positions.reduce((sum, pos) => 
        sum + (pos.baseAssetAmount * pos.currentPrice), 0
      );
      
      // Calculate account leverage
      const leverage = totalCollateral > 0 ? totalPositionValue / totalCollateral : 0;

      return {
        equity,
        totalCollateral,
        freeCollateral,
        marginUsed,
        totalPositionValue,
        leverage,
        positions,
      };

    } catch (error) {
      logger.error('Failed to get account info from Drift:', error);
      throw error;
    }
  }

  /**
   * Get unrealized PnL for all positions
   * Official Drift SDK method for getting unrealized PnL
   */
  async getUnrealizedPnL(): Promise<number> {
    this.ensureInitialized();

    if (!this.user) {
      return 0;
    }

    try {
      // getUnrealizedPNL(withFunding, marketIndex?)
      const pnl = this.user.getUnrealizedPNL(true); // Include funding
      return pnl.toNumber() / 1e6; // QUOTE_PRECISION
    } catch (error) {
      logger.error('Failed to get unrealized PnL:', error);
      throw error;
    }
  }

  /**
   * Get current oracle price for a market
   * Returns the real-time on-chain oracle price used by Drift
   */
  async getOraclePrice(marketSymbol: string): Promise<number> {
    this.ensureInitialized();

    try {
      const marketIndex = this.getMarketIndex(marketSymbol);
      const oracleData = this.driftClient!.getOracleDataForPerpMarket(marketIndex);
      
      // Drift oracle prices are in 1e6 precision (QUOTE_PRECISION)
      return oracleData.price.toNumber() / 1e6;
    } catch (error) {
      logger.error(`Failed to get oracle price for ${marketSymbol}:`, error);
      throw error;
    }
  }

  /**
   * Deposit collateral to Drift account
   * Following official Drift SDK depositing pattern
   */
  async depositCollateral(amount: number, userTokenAccount?: PublicKey): Promise<string> {
    this.ensureInitialized();

    if (!this.user) {
      throw new Error('Drift user account not initialized');
    }

    try {
      // USDC has 6 decimals, convert to smallest unit
      const amountBN = new BN(amount * 1e6);
      logger.info(`Depositing ${amount} USDC to Drift account`);
      
      const spotMarketIndex = 0; // USDC spot market
      const userTokenAccountPubkey = userTokenAccount || this.wallet.publicKey;
      
      const tx = await this.driftClient!.deposit(
        amountBN,
        spotMarketIndex,
        userTokenAccountPubkey
      );

      logger.info(`✅ Collateral deposited: ${tx}`);
      return tx;

    } catch (error) {
      logger.error('Failed to deposit collateral:', error);
      throw error;
    }
  }

  /**
   * Withdraw collateral from Drift account
   * Following official Drift SDK withdrawing pattern
   */
  async withdrawCollateral(amount: number, userTokenAccount?: PublicKey): Promise<string> {
    this.ensureInitialized();

    if (!this.user) {
      throw new Error('Drift user account not initialized');
    }

    try {
      // USDC has 6 decimals
      const amountBN = new BN(amount * 1e6);
      logger.info(`Withdrawing ${amount} USDC from Drift account`);
      
      const spotMarketIndex = 0; // USDC spot market
      const userTokenAccountPubkey = userTokenAccount || this.wallet.publicKey;
      
      const tx = await this.driftClient!.withdraw(
        amountBN,
        spotMarketIndex,
        userTokenAccountPubkey
      );

      logger.info(`✅ Collateral withdrawn: ${tx}`);
      return tx;

    } catch (error) {
      logger.error('Failed to withdraw collateral:', error);
      throw error;
    }
  }

  /**
   * Helper: Get market symbol from index
   */
  private getMarketSymbolFromIndex(marketIndex: number): string {
    for (const [symbol, index] of this.marketCache.entries()) {
      if (index === marketIndex) {
        return symbol;
      }
    }
    return `UNKNOWN-${marketIndex}`;
  }

  /**
   * Helper: Calculate position leverage
   */
  private calculatePositionLeverage(position: PerpPosition): number {
    const baseAmount = position.baseAssetAmount.toNumber() / 1e9; // BASE_PRECISION
    const quoteAmount = position.quoteAssetAmount.toNumber() / 1e6; // QUOTE_PRECISION
    
    if (baseAmount === 0 || quoteAmount === 0) {
      return 0;
    }
    
    return Math.abs(quoteAmount / baseAmount);
  }

  /**
   * Cleanup and unsubscribe
   */
  async cleanup(): Promise<void> {
    try {
      if (this.user) {
        await this.user.unsubscribe();
      }
      if (this.driftClient) {
        await this.driftClient.unsubscribe();
      }
      this.isInitialized = false;
      logger.info('Drift client cleaned up');
    } catch (error) {
      logger.error('Error cleaning up Drift client:', error);
    }
  }
}

