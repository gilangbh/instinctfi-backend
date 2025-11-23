// Core Types for Instinct.fi API

// JWT Payload
export interface JwtPayload {
  id: string;
  userId: string;
  walletAddress: string;
  username: string;
  isBanned: boolean;
  banExpiresAt?: Date;
  iat?: number;
  exp?: number;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: JwtPayload;
    }
  }
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// User Types
export interface User {
  id: string;
  walletAddress: string;
  username: string;
  email?: string;
  xp: number;
  totalRuns: number;
  winRate: number;
  reputation: number;
  isBanned: boolean;
  banReason?: string;
  banExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserRequest {
  walletAddress: string;
  username: string;
  email?: string;
}

export interface UpdateUserRequest {
  username?: string;
  email?: string;
}

export interface UserStats {
  totalRuns: number;
  activeRuns: number;
  completedRuns: number;
  totalProfit: number;
  winRate: number;
  totalVotes: number;
  correctVotes: number;
  consecutiveWins: number;
  consecutiveParticipation: number;
  totalXp: number;
  xp: number;
  level: number;
  badges: UserBadge[];
  rank?: number;
}

// Badge Types
export interface Badge {
  id: string;
  name: string;
  emoji: string;
  description: string;
  xpReward: number;
  createdAt: Date;
}

export interface UserBadge {
  id: string;
  userId: string;
  badgeId: string;
  earnedAt: Date;
  badge: Badge;
}

// Run Types
export interface Run {
  id: string;
  status: RunStatus;
  tradingPair: string;
  coin: string;
  duration: number;
  votingInterval: number;
  minDeposit: number;
  maxDeposit: number;
  maxParticipants: number;
  totalPool: number;
  startingPool: number;
  currentRound: number;
  totalRounds: number;
  countdown?: number;
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  participants?: RunParticipant[];
  trades?: Trade[];
  votingRounds?: VotingRound[];
}

export interface CreateRunRequest {
  tradingPair: string;
  coin: string;
  duration?: number;
  votingInterval?: number;
  lobbyDuration?: number; // in minutes (lobby phase duration)
  minDeposit?: number;
  maxDeposit?: number;
  maxParticipants?: number;
}

export interface JoinRunRequest {
  depositAmount: number;
  walletSignature?: string;
  userWalletAddress?: string; // Solana wallet address for on-chain deposit
}

// Run Participant Types
export interface RunParticipant {
  id: string;
  runId: string;
  userId: string;
  depositAmount: number;
  withdrawn: boolean;
  finalShare?: number;
  votesCorrect: number;
  totalVotes: number;
  joinedAt: Date;
  withdrawnAt?: Date;
  user?: User;
}

// Trade Types
export interface Trade {
  id: string;
  runId: string;
  round: number;
  direction: TradeDirection;
  leverage: number;
  positionSize: number;
  entryPrice: number;
  exitPrice?: number;
  pnl: number;
  pnlPercentage: number;
  executedAt: Date;
  settledAt?: Date;
}

// Vote Types
export interface Vote {
  id: string;
  runId: string;
  userId: string;
  round: number;
  choice: VoteChoice;
  votedAt: Date;
  user?: User;
}

export interface CastVoteRequest {
  choice: VoteChoice;
}

// Voting Round Types
export interface VotingRound {
  id: string;
  runId: string;
  round: number;
  status: RoundStatus;
  timeRemaining: number;
  leverage: number;
  positionSize: number;
  currentPrice: number;
  priceChange24h: number;
  voteDistribution?: VoteDistribution;
  startedAt: Date;
  closedAt?: Date;
  executedAt?: Date;
}

export interface VoteDistribution {
  long: number;
  short: number;
  skip: number;
}

// Chat Types
export interface ChatMessage {
  id: string;
  runId: string;
  userId: string;
  message: string;
  downvotes: number;
  isDeleted: boolean;
  createdAt: Date;
  user?: User;
}

export interface SendMessageRequest {
  message: string;
}

// XP Types
export interface XpHistory {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  runId?: string;
  createdAt: Date;
}

// Price Data Types
export interface PriceData {
  id: string;
  symbol: string;
  price: number;
  high: number;
  low: number;
  volume: number;
  change24h?: number;
  timestamp: Date;
}

// WebSocket Types
export interface WebSocketMessage {
  type: WebSocketMessageType;
  data: any;
  timestamp: Date;
}

export interface RunUpdateMessage extends WebSocketMessage {
  type: WebSocketMessageType.RUN_UPDATE;
  data: {
    runId: string;
    status: RunStatus;
    currentRound: number;
    countdown?: number;
    totalPool: number;
  };
}

export interface VoteUpdateMessage extends WebSocketMessage {
  type: WebSocketMessageType.VOTE_UPDATE;
  data: {
    runId: string;
    round: number;
    voteDistribution: VoteDistribution;
    timeRemaining: number;
  };
}

export interface TradeUpdateMessage extends WebSocketMessage {
  type: WebSocketMessageType.TRADE_UPDATE;
  data: {
    runId: string;
    trade: Trade;
  };
}

export interface ChatMessageUpdateMessage extends WebSocketMessage {
  type: WebSocketMessageType.CHAT_MESSAGE;
  data: {
    runId: string;
    message: ChatMessage;
  };
}

export interface PriceUpdateMessage extends WebSocketMessage {
  type: WebSocketMessageType.PRICE_UPDATE;
  data: {
    symbol: string;
    price: number;
    change24h: number;
  };
}

// Enums
export enum RunStatus {
  WAITING = 'WAITING',
  ACTIVE = 'ACTIVE',
  SETTLING = 'SETTLING',
  COOLDOWN = 'COOLDOWN',
  ENDED = 'ENDED'
}

export enum TradeDirection {
  LONG = 'LONG',
  SHORT = 'SHORT',
  SKIP = 'SKIP'
}

export enum VoteChoice {
  LONG = 'LONG',
  SHORT = 'SHORT',
  SKIP = 'SKIP'
}

export enum RoundStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  EXECUTING = 'EXECUTING',
  SETTLED = 'SETTLED'
}

export enum WebSocketMessageType {
  RUN_UPDATE = 'RUN_UPDATE',
  VOTE_UPDATE = 'VOTE_UPDATE',
  TRADE_UPDATE = 'TRADE_UPDATE',
  CHAT_MESSAGE = 'CHAT_MESSAGE',
  PRICE_UPDATE = 'PRICE_UPDATE',
  ERROR = 'ERROR',
  PONG = 'PONG',
  AUTHENTICATED = 'AUTHENTICATED',
  SUBSCRIBED = 'SUBSCRIBED'
}

// Configuration Types
export interface AppConfig {
  port: number;
  wsPort: number;
  nodeEnv: string;
  apiVersion: string;
  corsOrigin: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptRounds: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  minDepositUsdc: number;
  maxDepositUsdc: number;
  maxParticipantsPerRun: number;
  platformFeePercentage: number;
  defaultRunDurationMinutes: number;
  defaultVotingIntervalMinutes: number;
  minLeverage: number;
  maxLeverage: number;
  minPositionSizePercent: number;
  maxPositionSizePercent: number;
}

// Drift Protocol Types
export interface DriftConfig {
  rpcUrl: string;
  apiKey: string;
  programId: string;
  marketId: string;
}

export interface DriftTradeRequest {
  direction: 'long' | 'short';
  leverage: number;
  positionSize: number; // in USDC
  slippage: number;
}

export interface DriftTradeResponse {
  success: boolean;
  transactionId?: string;
  error?: string;
  pnl?: number;
  entryPrice?: number;
  exitPrice?: number;
}

// Error Types
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}
