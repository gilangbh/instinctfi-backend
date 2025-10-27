import { config } from './config';

/**
 * Chaos-as-a-Feature utilities for Instinct.fi
 * Implements randomized trading parameters to make outcomes unpredictable and engaging
 */

export interface ChaosModifiers {
  leverage: number;
  positionSize: number; // percentage of pool
}

/**
 * Generate random chaos modifiers for a trading round
 * @returns ChaosModifiers object with randomized leverage and position size
 */
export const generateChaosModifiers = (): ChaosModifiers => {
  const leverage = generateRandomLeverage();
  const positionSize = generateRandomPositionSize();
  
  return {
    leverage,
    positionSize,
  };
};

/**
 * Generate random leverage between min and max values
 * @returns Random leverage value
 */
export const generateRandomLeverage = (): number => {
  const min = config.minLeverage;
  const max = config.maxLeverage;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Generate random position size percentage
 * @returns Random position size percentage
 */
export const generateRandomPositionSize = (): number => {
  const min = config.minPositionSizePercent;
  const max = config.maxPositionSizePercent;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Calculate actual position size in USDC based on pool size and percentage
 * @param poolSize - Total pool size in cents
 * @param positionSizePercent - Position size percentage
 * @returns Position size in cents
 */
export const calculatePositionSize = (poolSize: number, positionSizePercent: number): number => {
  return Math.floor((poolSize * positionSizePercent) / 100);
};

/**
 * Calculate potential PnL based on price change and position parameters
 * @param entryPrice - Entry price
 * @param exitPrice - Exit price
 * @param positionSize - Position size in cents
 * @param leverage - Leverage multiplier
 * @param direction - Trade direction ('long' or 'short')
 * @returns Potential PnL in cents
 */
export const calculatePotentialPnL = (
  entryPrice: number,
  exitPrice: number,
  positionSize: number,
  leverage: number,
  direction: 'long' | 'short'
): number => {
  const priceChange = (exitPrice - entryPrice) / entryPrice;
  const leveragedChange = direction === 'long' ? priceChange : -priceChange;
  return Math.floor(positionSize * leverage * leveragedChange);
};

/**
 * Apply platform fee to profitable trades
 * @param pnl - Profit and loss in cents
 * @returns PnL after platform fee deduction
 */
export const applyPlatformFee = (pnl: number): number => {
  if (pnl <= 0) {
    return pnl; // No fee on losses
  }
  
  const fee = Math.floor((pnl * config.platformFeePercentage) / 100);
  return pnl - fee;
};

/**
 * Distribute PnL among participants based on their deposit amounts
 * @param totalPnL - Total PnL in cents
 * @param participants - Array of participants with deposit amounts
 * @returns Array of PnL shares for each participant
 */
export const distributePnL = (
  totalPnL: number,
  participants: Array<{ depositAmount: number }>
): number[] => {
  const totalDeposits = participants.reduce((sum, p) => sum + p.depositAmount, 0);
  
  if (totalDeposits === 0) {
    return participants.map(() => 0);
  }
  
  return participants.map(participant => {
    const share = (participant.depositAmount / totalDeposits) * totalPnL;
    return Math.floor(share);
  });
};

/**
 * Calculate final share for each participant
 * @param depositAmount - Original deposit amount in cents
 * @param pnlShare - PnL share in cents
 * @returns Final share amount in cents
 */
export const calculateFinalShare = (depositAmount: number, pnlShare: number): number => {
  return Math.max(0, depositAmount + pnlShare); // Ensure non-negative
};

/**
 * Generate random trading pair for new runs
 * @returns Random trading pair string
 */
export const generateRandomTradingPair = (): string => {
  const pairs = [
    'SOL/USDC',
    'BTC/USDC',
    'ETH/USDC',
    'RAY/USDC',
    'SRM/USDC',
    'ORCA/USDC',
    'MNGO/USDC',
    'COPE/USDC',
    'STEP/USDC',
    'MEDIA/USDC',
  ];
  
  return pairs[Math.floor(Math.random() * pairs.length)];
};

/**
 * Get coin symbol from trading pair
 * @param tradingPair - Trading pair string (e.g., 'SOL/USDC')
 * @returns Coin symbol (e.g., 'SOL')
 */
export const getCoinFromPair = (tradingPair: string): string => {
  return tradingPair.split('/')[0];
};

/**
 * Validate chaos modifiers
 * @param modifiers - Chaos modifiers to validate
 * @returns True if valid, false otherwise
 */
export const validateChaosModifiers = (modifiers: ChaosModifiers): boolean => {
  return (
    modifiers.leverage >= config.minLeverage &&
    modifiers.leverage <= config.maxLeverage &&
    modifiers.positionSize >= config.minPositionSizePercent &&
    modifiers.positionSize <= config.maxPositionSizePercent
  );
};

/**
 * Format chaos modifiers for display
 * @param modifiers - Chaos modifiers to format
 * @returns Formatted string for display
 */
export const formatChaosModifiers = (modifiers: ChaosModifiers): string => {
  return `Leverage: ${modifiers.leverage}x, Position Size: ${modifiers.positionSize}%`;
};

/**
 * Get chaos intensity level based on modifiers
 * @param modifiers - Chaos modifiers
 * @returns Intensity level (1-5)
 */
export const getChaosIntensity = (modifiers: ChaosModifiers): number => {
  const leverageIntensity = (modifiers.leverage - config.minLeverage) / (config.maxLeverage - config.minLeverage);
  const positionIntensity = (modifiers.positionSize - config.minPositionSizePercent) / (config.maxPositionSizePercent - config.minPositionSizePercent);
  
  const avgIntensity = (leverageIntensity + positionIntensity) / 2;
  return Math.ceil(avgIntensity * 5);
};

/**
 * Get chaos emoji based on intensity
 * @param intensity - Chaos intensity level (1-5)
 * @returns Emoji representing chaos level
 */
export const getChaosEmoji = (intensity: number): string => {
  const emojis = ['😌', '😐', '😮', '😲', '🤯'];
  const index = Math.min(Math.max(intensity - 1, 0), emojis.length - 1);
  return emojis[index];
};

