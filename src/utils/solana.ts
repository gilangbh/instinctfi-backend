import { PublicKey, Keypair } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import bs58 from 'bs58';

/**
 * Convert USDC amount to smallest unit (6 decimals)
 */
export function usdcToLamports(usdc: number): BN {
  return new BN(Math.floor(usdc * 1_000_000));
}

/**
 * Convert smallest unit to USDC
 */
export function lamportsToUsdc(lamports: BN | number): number {
  const value = typeof lamports === 'number' ? lamports : lamports.toNumber();
  return value / 1_000_000;
}

/**
 * Validate Solana public key
 */
export function isValidPublicKey(key: string): boolean {
  try {
    new PublicKey(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse keypair from various formats
 */
export function parseKeypair(privateKey: string): Keypair {
  try {
    // Try parsing as JSON array first
    const parsed = JSON.parse(privateKey);
    const secretKey = Uint8Array.from(parsed);
    return Keypair.fromSecretKey(secretKey);
  } catch {
    // If not JSON, try as base58
    const secretKey = bs58.decode(privateKey);
    return Keypair.fromSecretKey(secretKey);
  }
}

/**
 * Shorten public key for display
 */
export function shortenPublicKey(key: PublicKey | string, chars = 4): string {
  const keyStr = typeof key === 'string' ? key : key.toString();
  return `${keyStr.slice(0, chars)}...${keyStr.slice(-chars)}`;
}

/**
 * Convert BN to number safely
 */
export function bnToNumber(bn: BN): number {
  return bn.toNumber();
}

/**
 * Wait for transaction confirmation
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format Solana transaction URL
 */
export function getExplorerUrl(signature: string, network: string = 'devnet'): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${network}`;
}

/**
 * Format account URL
 */
export function getAccountExplorerUrl(address: string, network: string = 'devnet'): string {
  return `https://explorer.solana.com/address/${address}?cluster=${network}`;
}
















