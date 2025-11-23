import dotenv from 'dotenv';
import { AppConfig } from '@/types';

dotenv.config();

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3001', 10),
  wsPort: parseInt(process.env.WS_PORT || '3002', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiVersion: process.env.API_VERSION || 'v1',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:8081',
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-here',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  minDepositUsdc: parseInt(process.env.MIN_DEPOSIT_USDC || '10', 10),
  maxDepositUsdc: parseInt(process.env.MAX_DEPOSIT_USDC || '100', 10),
  maxParticipantsPerRun: parseInt(process.env.MAX_PARTICIPANTS_PER_RUN || '100', 10),
  platformFeePercentage: parseInt(process.env.PLATFORM_FEE_PERCENTAGE || '15', 10),
  defaultRunDurationMinutes: parseInt(process.env.DEFAULT_RUN_DURATION_MINUTES || '120', 10),
  defaultVotingIntervalMinutes: parseInt(process.env.DEFAULT_VOTING_INTERVAL_MINUTES || '10', 10),
  minLeverage: parseInt(process.env.MIN_LEVERAGE || '1', 10),
  maxLeverage: parseInt(process.env.MAX_LEVERAGE || '20', 10),
  minPositionSizePercent: parseInt(process.env.MIN_POSITION_SIZE_PERCENT || '10', 10),
  maxPositionSizePercent: parseInt(process.env.MAX_POSITION_SIZE_PERCENT || '100', 10),
};

export const driftConfig = {
  // RPC URL for Drift operations (can use same as Solana RPC)
  rpcUrl: process.env.DRIFT_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  
  // Drift environment: 'mainnet-beta' | 'devnet'
  environment: process.env.DRIFT_ENVIRONMENT || 'mainnet-beta',
  
  // Trading keypair for Drift operations (JSON array format)
  tradingKeypair: process.env.DRIFT_TRADING_KEYPAIR || process.env.SOLANA_PRIVATE_KEY || '',
  
  // Default market for trading
  defaultMarket: process.env.DRIFT_DEFAULT_MARKET || 'SOL-PERP',
  
  // Enable real trading (set to 'false' to use mock mode)
  enableRealTrading: process.env.DRIFT_ENABLE_REAL_TRADING === 'true',
  
  // Enable WebSocket for price feeds
  enableWebSocket: process.env.ENABLE_PRICE_WEBSOCKET !== 'false',
  
  // Drift program ID (usually doesn't need to change)
  programId: process.env.DRIFT_PROGRAM_ID || 'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH',
  
  // Trading limits
  maxLeveragePerTrade: parseInt(process.env.DRIFT_MAX_LEVERAGE || '10', 10),
  maxPositionSizeUsd: parseInt(process.env.DRIFT_MAX_POSITION_SIZE_USD || '10000', 10),
};

export const solanaConfig = {
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  wsUrl: process.env.SOLANA_WS_URL || 'wss://api.devnet.solana.com',
  network: process.env.SOLANA_NETWORK || 'devnet',
  privateKey: process.env.SOLANA_PRIVATE_KEY || '',
  programId: process.env.SOLANA_PROGRAM_ID || '7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc',
  usdcMint: process.env.SOLANA_USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // Devnet USDC (valid token mint)
};

export const redisConfig = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
};

export const databaseConfig = {
  url: process.env.DATABASE_URL || 'postgresql://username:password@localhost:5432/instinct_fi?schema=public',
};

export const loggingConfig = {
  level: process.env.LOG_LEVEL || 'info',
  file: process.env.LOG_FILE || 'logs/app.log',
};
