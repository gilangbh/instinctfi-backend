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
  rpcUrl: process.env.DRIFT_RPC_URL || 'https://drift-api.example.com',
  apiKey: process.env.DRIFT_API_KEY || 'your-drift-api-key',
  programId: process.env.DRIFT_PROGRAM_ID || 'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH',
  marketId: process.env.DRIFT_MARKET_ID || 'SOL-PERP',
  enableWebSocket: process.env.ENABLE_PRICE_WEBSOCKET !== 'false', // Set to 'false' to disable WebSocket
};

export const solanaConfig = {
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  wsUrl: process.env.SOLANA_WS_URL || 'wss://api.mainnet-beta.solana.com',
  privateKey: process.env.SOLANA_PRIVATE_KEY || '',
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
