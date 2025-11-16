/**
 * Chaos Modifier - Randomized Trade Parameters
 * 
 * Per InstinctFi PRD:
 * - Position sizing: 10% - 100% of pool (randomized)
 * - Leverage: 1x - 20x (randomized)
 * - Market orders only
 * - 0.1% slippage tolerance
 */

import logger from './logger';

export interface ChaosModifiers {
  positionSizePercentage: number; // 10-100
  leverage: number; // 1-20
  slippageTolerance: number; // Fixed at 0.1%
}

/**
 * Generate randomized chaos modifiers for a trade
 * 
 * @returns {ChaosModifiers} Randomized position size (10-100%) and leverage (1-20x)
 */
export function generateChaosModifiers(): ChaosModifiers {
  // Position sizing: 10% - 100% of pool
  const positionSizePercentage = Math.random() * 90 + 10; // 10 + (0-90)
  
  // Leverage: 1x - 20x
  const leverage = Math.random() * 19 + 1; // 1 + (0-19)
  
  // Slippage: Fixed at 0.1%
  const slippageTolerance = 0.001; // 0.1%

  const modifiers = {
    positionSizePercentage: Math.round(positionSizePercentage * 10) / 10, // Round to 1 decimal
    leverage: Math.round(leverage * 10) / 10, // Round to 1 decimal
    slippageTolerance,
  };

  logger.info('🎲 Chaos modifiers generated:', {
    positionSize: `${modifiers.positionSizePercentage.toFixed(1)}%`,
    leverage: `${modifiers.leverage.toFixed(1)}x`,
    slippage: `${(modifiers.slippageTolerance * 100).toFixed(1)}%`,
  });

  return modifiers;
}

/**
 * Calculate actual position size based on pool and chaos modifier
 * 
 * @param totalPoolUsdc - Total pool in USDC
 * @param positionSizePercentage - Percentage of pool to use (10-100)
 * @returns Position size in USDC
 */
export function calculatePositionSize(
  totalPoolUsdc: number,
  positionSizePercentage: number
): number {
  return (totalPoolUsdc * positionSizePercentage) / 100;
}

/**
 * Calculate base asset amount for Drift order
 * 
 * Given:
 * - Available collateral in Drift account
 * - Desired leverage (1-20x)
 * - Position size percentage (10-100%)
 * - Current asset price
 * 
 * Returns the base asset amount to achieve target leverage
 * 
 * @param availableCollateralUsdc - Available collateral in Drift account (USDC)
 * @param targetLeverage - Desired leverage (1-20x)
 * @param positionSizePercentage - Percentage of pool to use (10-100%)
 * @param currentAssetPrice - Current price of the asset (e.g., SOL price in USDC)
 * @returns Base asset amount (e.g., amount of SOL to trade)
 */
export function calculateBaseAssetAmount(
  availableCollateralUsdc: number,
  targetLeverage: number,
  positionSizePercentage: number,
  currentAssetPrice: number
): number {
  // Calculate position size in USDC
  const positionSizeUsdc = calculatePositionSize(
    availableCollateralUsdc,
    positionSizePercentage
  );

  // Apply leverage
  const leveragedPositionUsdc = positionSizeUsdc * targetLeverage;

  // Convert to base asset amount (e.g., SOL)
  const baseAssetAmount = leveragedPositionUsdc / currentAssetPrice;

  logger.debug('Position calculation:', {
    availableCollateral: `$${availableCollateralUsdc.toFixed(2)}`,
    targetLeverage: `${targetLeverage.toFixed(1)}x`,
    positionSizePercentage: `${positionSizePercentage.toFixed(1)}%`,
    positionSizeUsdc: `$${positionSizeUsdc.toFixed(2)}`,
    leveragedPositionUsdc: `$${leveragedPositionUsdc.toFixed(2)}`,
    currentAssetPrice: `$${currentAssetPrice.toFixed(2)}`,
    baseAssetAmount: baseAssetAmount.toFixed(4),
  });

  return baseAssetAmount;
}

/**
 * Validate chaos modifiers are within allowed ranges
 */
export function validateChaosModifiers(modifiers: ChaosModifiers): void {
  if (modifiers.positionSizePercentage < 10 || modifiers.positionSizePercentage > 100) {
    throw new Error(`Position size must be between 10-100%, got ${modifiers.positionSizePercentage}%`);
  }

  if (modifiers.leverage < 1 || modifiers.leverage > 20) {
    throw new Error(`Leverage must be between 1-20x, got ${modifiers.leverage}x`);
  }

  if (modifiers.slippageTolerance !== 0.001) {
    throw new Error(`Slippage tolerance must be 0.1% (0.001), got ${modifiers.slippageTolerance}`);
  }
}

/**
 * Create deterministic chaos modifiers from a seed
 * Useful for testing or demo purposes
 * 
 * @param seed - Seed value (e.g., round number, run ID hash)
 * @returns {ChaosModifiers} Deterministic modifiers based on seed
 */
export function generateDeterministicChaosModifiers(seed: number): ChaosModifiers {
  // Simple deterministic random using seed
  const random1 = (Math.sin(seed * 12.9898) + 1) / 2; // 0-1
  const random2 = (Math.sin(seed * 78.233) + 1) / 2; // 0-1

  const positionSizePercentage = Math.round((random1 * 90 + 10) * 10) / 10;
  const leverage = Math.round((random2 * 19 + 1) * 10) / 10;

  return {
    positionSizePercentage,
    leverage,
    slippageTolerance: 0.001,
  };
}

