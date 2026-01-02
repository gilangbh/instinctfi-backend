import { PrismaClient } from '@prisma/client';
import { AppError } from '@/types';
import logger from '@/utils/logger';

// Temporary types until Prisma client is regenerated
export enum ItemType {
    PASSIVE = 'PASSIVE',
    ACTIVE = 'ACTIVE',
    ECONOMY = 'ECONOMY',
    OFFENSIVE = 'OFFENSIVE',
    DEFENSIVE = 'DEFENSIVE',
}

export enum BuffType {
    XP_BOOST = 'XP_BOOST',
    FEE_REDUCTION = 'FEE_REDUCTION',
    PROFIT_BOOST = 'PROFIT_BOOST',
    VOTE_ACCURACY = 'VOTE_ACCURACY',
    LEVERAGE_BOOST = 'LEVERAGE_BOOST',
    POSITION_SIZE = 'POSITION_SIZE',
    WIN_RATE_BOOST = 'WIN_RATE_BOOST',
    DEPOSIT_BONUS = 'DEPOSIT_BONUS',
    WITHDRAWAL_SPEED = 'WITHDRAWAL_SPEED',
    COOLDOWN_REDUCTION = 'COOLDOWN_REDUCTION',
}

export interface Item {
    id: string;
    name: string;
    description: string;
    type: ItemType;
    icon: string;
    rarity: string;
    buffType: BuffType;
    buffValue: number;
    unlockLevel: number;
    unlockXp: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserLoadout {
    id: string;
    userId: string;
    itemId: string;
    isActive: boolean;
    slot: number | null;
    equippedAt: Date;
}

export interface ItemWithLoadout extends Item {
    userLoadout?: UserLoadout | null;
}

export interface LoadoutItem {
    id: string;
    name: string;
    description: string;
    type: ItemType;
    icon: string;
    rarity: string;
    buffType: BuffType;
    buffValue: number;
    isActive: boolean;
    isEquipped: boolean;
    slot?: number | null;
    unlockLevel: number;
    unlockXp: number;
}

export class ItemService {
    constructor(private prisma: PrismaClient) { }

    /**
     * Initialize default items (seed data)
     */
    async initializeDefaultItems(): Promise<void> {
        try {
            const defaultItems = [
                // PASSIVE Items
                {
                    name: 'Neural Link I',
                    description: 'Increases XP gain by 10%',
                    type: 'PASSIVE' as ItemType,
                    icon: '🧠',
                    rarity: 'COMMON',
                    buffType: 'XP_BOOST' as BuffType,
                    buffValue: 10.0,
                    unlockLevel: 1,
                    unlockXp: 0,
                },
                {
                    name: 'Neural Link II',
                    description: 'Increases XP gain by 20%',
                    type: 'PASSIVE' as ItemType,
                    icon: '🧠',
                    rarity: 'RARE',
                    buffType: 'XP_BOOST' as BuffType,
                    buffValue: 20.0,
                    unlockLevel: 5,
                    unlockXp: 5000,
                },
                {
                    name: 'Neural Link III',
                    description: 'Increases XP gain by 35%',
                    type: 'PASSIVE' as ItemType,
                    icon: '🧠',
                    rarity: 'EPIC',
                    buffType: 'XP_BOOST' as BuffType,
                    buffValue: 35.0,
                    unlockLevel: 10,
                    unlockXp: 20000,
                },
                // ECONOMY Items
                {
                    name: 'Fee Override',
                    description: 'Reduces platform fees by 5%',
                    type: 'ECONOMY' as ItemType,
                    icon: '💰',
                    rarity: 'COMMON',
                    buffType: 'FEE_REDUCTION' as BuffType,
                    buffValue: 5.0,
                    unlockLevel: 2,
                    unlockXp: 1000,
                },
                {
                    name: 'Fee Eliminator',
                    description: 'Reduces platform fees by 15%',
                    type: 'ECONOMY' as ItemType,
                    icon: '💎',
                    rarity: 'RARE',
                    buffType: 'FEE_REDUCTION' as BuffType,
                    buffValue: 15.0,
                    unlockLevel: 7,
                    unlockXp: 15000,
                },
                {
                    name: 'Profit Multiplier',
                    description: 'Increases profit share by 10%',
                    type: 'ECONOMY' as ItemType,
                    icon: '📈',
                    rarity: 'EPIC',
                    buffType: 'PROFIT_BOOST' as BuffType,
                    buffValue: 10.0,
                    unlockLevel: 8,
                    unlockXp: 18000,
                },
                // ACTIVE Items
                {
                    name: 'Flash Loan',
                    description: 'Allows instant deposit without waiting period',
                    type: 'ACTIVE' as ItemType,
                    icon: '⚡',
                    rarity: 'RARE',
                    buffType: 'DEPOSIT_BONUS' as BuffType,
                    buffValue: 0.0, // Special ability
                    unlockLevel: 3,
                    unlockXp: 3000,
                },
                {
                    name: 'Oracle Sight',
                    description: 'Increases vote accuracy by 5%',
                    type: 'ACTIVE' as ItemType,
                    icon: '👁️',
                    rarity: 'COMMON',
                    buffType: 'VOTE_ACCURACY' as BuffType,
                    buffValue: 5.0,
                    unlockLevel: 2,
                    unlockXp: 2000,
                },
                {
                    name: 'Oracle Vision',
                    description: 'Increases vote accuracy by 12%',
                    type: 'ACTIVE' as ItemType,
                    icon: '🔮',
                    rarity: 'EPIC',
                    buffType: 'VOTE_ACCURACY' as BuffType,
                    buffValue: 12.0,
                    unlockLevel: 9,
                    unlockXp: 25000,
                },
                // OFFENSIVE Items
                {
                    name: 'Leverage Amplifier',
                    description: 'Increases max leverage by 2x',
                    type: 'OFFENSIVE' as ItemType,
                    icon: '⚔️',
                    rarity: 'RARE',
                    buffType: 'LEVERAGE_BOOST' as BuffType,
                    buffValue: 2.0,
                    unlockLevel: 4,
                    unlockXp: 8000,
                },
                {
                    name: 'Position Maximizer',
                    description: 'Increases position size by 15%',
                    type: 'OFFENSIVE' as ItemType,
                    icon: '🎯',
                    rarity: 'EPIC',
                    buffType: 'POSITION_SIZE' as BuffType,
                    buffValue: 15.0,
                    unlockLevel: 6,
                    unlockXp: 12000,
                },
                {
                    name: 'Win Streak Catalyst',
                    description: 'Increases win rate bonus by 8%',
                    type: 'OFFENSIVE' as ItemType,
                    icon: '🔥',
                    rarity: 'LEGENDARY',
                    buffType: 'WIN_RATE_BOOST' as BuffType,
                    buffValue: 8.0,
                    unlockLevel: 12,
                    unlockXp: 50000,
                },
                // DEFENSIVE Items
                {
                    name: 'Quick Withdraw',
                    description: 'Reduces withdrawal cooldown by 50%',
                    type: 'DEFENSIVE' as ItemType,
                    icon: '🛡️',
                    rarity: 'COMMON',
                    buffType: 'WITHDRAWAL_SPEED' as BuffType,
                    buffValue: 50.0,
                    unlockLevel: 3,
                    unlockXp: 4000,
                },
                {
                    name: 'Cooldown Reducer',
                    description: 'Reduces all cooldowns by 30%',
                    type: 'DEFENSIVE' as ItemType,
                    icon: '⏱️',
                    rarity: 'RARE',
                    buffType: 'COOLDOWN_REDUCTION' as BuffType,
                    buffValue: 30.0,
                    unlockLevel: 5,
                    unlockXp: 10000,
                },
                // Additional PASSIVE Items
                {
                    name: 'Neural Link IV',
                    description: 'Increases XP gain by 50%',
                    type: 'PASSIVE' as ItemType,
                    icon: '🧠🧠🧠🧠',
                    rarity: 'LEGENDARY',
                    buffType: 'XP_BOOST' as BuffType,
                    buffValue: 50.0,
                    unlockLevel: 20,
                    unlockXp: 100000,
                },
                {
                    name: 'Experience Amplifier',
                    description: 'Boosts XP from all sources by 15%',
                    type: 'PASSIVE' as ItemType,
                    icon: '⭐',
                    rarity: 'RARE',
                    buffType: 'XP_BOOST' as BuffType,
                    buffValue: 15.0,
                    unlockLevel: 3,
                    unlockXp: 3000,
                },
                {
                    name: 'Wisdom Crystal',
                    description: 'Ancient crystal that enhances learning by 25%',
                    type: 'PASSIVE' as ItemType,
                    icon: '💎',
                    rarity: 'EPIC',
                    buffType: 'XP_BOOST' as BuffType,
                    buffValue: 25.0,
                    unlockLevel: 8,
                    unlockXp: 18000,
                },
                {
                    name: 'Progression Catalyst',
                    description: 'Accelerates level progression by 18%',
                    type: 'PASSIVE' as ItemType,
                    icon: '🚀',
                    rarity: 'RARE',
                    buffType: 'XP_BOOST' as BuffType,
                    buffValue: 18.0,
                    unlockLevel: 6,
                    unlockXp: 12000,
                },
                // Additional ECONOMY Items
                {
                    name: 'Fee Negator',
                    description: 'Reduces platform fees by 25%',
                    type: 'ECONOMY' as ItemType,
                    icon: '💰💰💰',
                    rarity: 'EPIC',
                    buffType: 'FEE_REDUCTION' as BuffType,
                    buffValue: 25.0,
                    unlockLevel: 15,
                    unlockXp: 75000,
                },
                {
                    name: 'Profit Maximizer',
                    description: 'Increases profit share by 20%',
                    type: 'ECONOMY' as ItemType,
                    icon: '📈📈',
                    rarity: 'LEGENDARY',
                    buffType: 'PROFIT_BOOST' as BuffType,
                    buffValue: 20.0,
                    unlockLevel: 18,
                    unlockXp: 90000,
                },
                {
                    name: 'Wealth Accumulator',
                    description: 'Gradually increases profit over time by 8%',
                    type: 'ECONOMY' as ItemType,
                    icon: '💵',
                    rarity: 'RARE',
                    buffType: 'PROFIT_BOOST' as BuffType,
                    buffValue: 8.0,
                    unlockLevel: 5,
                    unlockXp: 10000,
                },
                {
                    name: 'Deposit Bonus I',
                    description: 'Increases deposit bonus by 5%',
                    type: 'ECONOMY' as ItemType,
                    icon: '💳',
                    rarity: 'COMMON',
                    buffType: 'DEPOSIT_BONUS' as BuffType,
                    buffValue: 5.0,
                    unlockLevel: 2,
                    unlockXp: 2000,
                },
                {
                    name: 'Deposit Bonus II',
                    description: 'Increases deposit bonus by 10%',
                    type: 'ECONOMY' as ItemType,
                    icon: '💳💳',
                    rarity: 'RARE',
                    buffType: 'DEPOSIT_BONUS' as BuffType,
                    buffValue: 10.0,
                    unlockLevel: 7,
                    unlockXp: 15000,
                },
                {
                    name: 'Capital Booster',
                    description: 'Significantly boosts deposit bonuses by 15%',
                    type: 'ECONOMY' as ItemType,
                    icon: '💰',
                    rarity: 'EPIC',
                    buffType: 'DEPOSIT_BONUS' as BuffType,
                    buffValue: 15.0,
                    unlockLevel: 12,
                    unlockXp: 50000,
                },
                {
                    name: 'Compound Interest',
                    description: 'Compounds profit over multiple runs by 12%',
                    type: 'ECONOMY' as ItemType,
                    icon: '📊',
                    rarity: 'RARE',
                    buffType: 'PROFIT_BOOST' as BuffType,
                    buffValue: 12.0,
                    unlockLevel: 6,
                    unlockXp: 12000,
                },
                {
                    name: 'Tax Shield',
                    description: 'Small fee reduction for beginners by 3%',
                    type: 'ECONOMY' as ItemType,
                    icon: '🛡️',
                    rarity: 'COMMON',
                    buffType: 'FEE_REDUCTION' as BuffType,
                    buffValue: 3.0,
                    unlockLevel: 1,
                    unlockXp: 500,
                },
                // Additional ACTIVE Items
                {
                    name: 'Oracle Mastery',
                    description: 'Master-level vote accuracy boost by 20%',
                    type: 'ACTIVE' as ItemType,
                    icon: '👁️‍🗨️',
                    rarity: 'LEGENDARY',
                    buffType: 'VOTE_ACCURACY' as BuffType,
                    buffValue: 20.0,
                    unlockLevel: 20,
                    unlockXp: 100000,
                },
                {
                    name: 'Prediction Crystal',
                    description: 'Enhances prediction accuracy by 8%',
                    type: 'ACTIVE' as ItemType,
                    icon: '🔮',
                    rarity: 'RARE',
                    buffType: 'VOTE_ACCURACY' as BuffType,
                    buffValue: 8.0,
                    unlockLevel: 5,
                    unlockXp: 10000,
                },
                {
                    name: 'Market Insight',
                    description: 'Provides better market understanding by 7%',
                    type: 'ACTIVE' as ItemType,
                    icon: '📊',
                    rarity: 'RARE',
                    buffType: 'VOTE_ACCURACY' as BuffType,
                    buffValue: 7.0,
                    unlockLevel: 4,
                    unlockXp: 8000,
                },
                {
                    name: 'Quick Decision',
                    description: 'Reduces decision-making cooldown by 10%',
                    type: 'ACTIVE' as ItemType,
                    icon: '⚡',
                    rarity: 'COMMON',
                    buffType: 'COOLDOWN_REDUCTION' as BuffType,
                    buffValue: 10.0,
                    unlockLevel: 1,
                    unlockXp: 1000,
                },
                {
                    name: 'Time Dilation',
                    description: 'Significantly reduces all cooldowns by 40%',
                    type: 'ACTIVE' as ItemType,
                    icon: '⏰',
                    rarity: 'EPIC',
                    buffType: 'COOLDOWN_REDUCTION' as BuffType,
                    buffValue: 40.0,
                    unlockLevel: 11,
                    unlockXp: 40000,
                },
                // Additional OFFENSIVE Items
                {
                    name: 'Leverage Maximizer',
                    description: 'Increases max leverage by 3x',
                    type: 'OFFENSIVE' as ItemType,
                    icon: '⚔️⚔️',
                    rarity: 'EPIC',
                    buffType: 'LEVERAGE_BOOST' as BuffType,
                    buffValue: 3.0,
                    unlockLevel: 10,
                    unlockXp: 30000,
                },
                {
                    name: 'Leverage Master',
                    description: 'Maximum leverage boost by 5x',
                    type: 'OFFENSIVE' as ItemType,
                    icon: '⚔️⚔️⚔️',
                    rarity: 'LEGENDARY',
                    buffType: 'LEVERAGE_BOOST' as BuffType,
                    buffValue: 5.0,
                    unlockLevel: 18,
                    unlockXp: 90000,
                },
                {
                    name: 'Position Amplifier',
                    description: 'Significantly increases position size by 25%',
                    type: 'OFFENSIVE' as ItemType,
                    icon: '🎯🎯',
                    rarity: 'LEGENDARY',
                    buffType: 'POSITION_SIZE' as BuffType,
                    buffValue: 25.0,
                    unlockLevel: 15,
                    unlockXp: 75000,
                },
                {
                    name: 'Victory Booster',
                    description: 'Boosts overall win rate by 6%',
                    type: 'OFFENSIVE' as ItemType,
                    icon: '🏆',
                    rarity: 'EPIC',
                    buffType: 'WIN_RATE_BOOST' as BuffType,
                    buffValue: 6.0,
                    unlockLevel: 9,
                    unlockXp: 25000,
                },
                {
                    name: 'Aggressive Stance',
                    description: 'Increases win rate with aggressive play by 4%',
                    type: 'OFFENSIVE' as ItemType,
                    icon: '⚡',
                    rarity: 'RARE',
                    buffType: 'WIN_RATE_BOOST' as BuffType,
                    buffValue: 4.0,
                    unlockLevel: 5,
                    unlockXp: 10000,
                },
                {
                    name: 'Momentum Builder',
                    description: 'Builds momentum for consecutive wins by 5%',
                    type: 'OFFENSIVE' as ItemType,
                    icon: '📈',
                    rarity: 'RARE',
                    buffType: 'WIN_RATE_BOOST' as BuffType,
                    buffValue: 5.0,
                    unlockLevel: 7,
                    unlockXp: 15000,
                },
                // Additional DEFENSIVE Items
                {
                    name: 'Instant Withdraw',
                    description: 'Almost instant withdrawals, reduces cooldown by 75%',
                    type: 'DEFENSIVE' as ItemType,
                    icon: '🛡️🛡️',
                    rarity: 'EPIC',
                    buffType: 'WITHDRAWAL_SPEED' as BuffType,
                    buffValue: 75.0,
                    unlockLevel: 10,
                    unlockXp: 30000,
                },
                {
                    name: 'Cooldown Eliminator',
                    description: 'Significantly reduces cooldowns by 50%',
                    type: 'DEFENSIVE' as ItemType,
                    icon: '⏱️⏱️',
                    rarity: 'EPIC',
                    buffType: 'COOLDOWN_REDUCTION' as BuffType,
                    buffValue: 50.0,
                    unlockLevel: 12,
                    unlockXp: 50000,
                },
                {
                    name: 'Safety Net',
                    description: 'Basic cooldown reduction by 15%',
                    type: 'DEFENSIVE' as ItemType,
                    icon: '🛡️',
                    rarity: 'COMMON',
                    buffType: 'COOLDOWN_REDUCTION' as BuffType,
                    buffValue: 15.0,
                    unlockLevel: 2,
                    unlockXp: 2000,
                },
                {
                    name: 'Risk Mitigator',
                    description: 'Reduces risk through faster actions by 20%',
                    type: 'DEFENSIVE' as ItemType,
                    icon: '🛡️🛡️',
                    rarity: 'RARE',
                    buffType: 'COOLDOWN_REDUCTION' as BuffType,
                    buffValue: 20.0,
                    unlockLevel: 6,
                    unlockXp: 12000,
                },
                {
                    name: 'Protection Aura',
                    description: 'Protective aura reduces wait times by 35%',
                    type: 'DEFENSIVE' as ItemType,
                    icon: '✨',
                    rarity: 'EPIC',
                    buffType: 'COOLDOWN_REDUCTION' as BuffType,
                    buffValue: 35.0,
                    unlockLevel: 11,
                    unlockXp: 40000,
                },
                // SPECIAL Items
                {
                    name: 'Lucky Charm',
                    description: 'Slight boost to luck and win rate by 3%',
                    type: 'OFFENSIVE' as ItemType,
                    icon: '🍀',
                    rarity: 'RARE',
                    buffType: 'WIN_RATE_BOOST' as BuffType,
                    buffValue: 3.0,
                    unlockLevel: 3,
                    unlockXp: 3000,
                },
                {
                    name: 'Fortune\'s Favor',
                    description: 'Fortune smiles upon you, increases win rate by 7%',
                    type: 'OFFENSIVE' as ItemType,
                    icon: '🎰',
                    rarity: 'EPIC',
                    buffType: 'WIN_RATE_BOOST' as BuffType,
                    buffValue: 7.0,
                    unlockLevel: 10,
                    unlockXp: 30000,
                },
                {
                    name: 'Streak Protector',
                    description: 'Protects win streaks, increases win rate by 4%',
                    type: 'OFFENSIVE' as ItemType,
                    icon: '🔒',
                    rarity: 'RARE',
                    buffType: 'WIN_RATE_BOOST' as BuffType,
                    buffValue: 4.0,
                    unlockLevel: 6,
                    unlockXp: 12000,
                },
                {
                    name: 'Momentum Keeper',
                    description: 'Maintains momentum across runs, increases win rate by 6%',
                    type: 'OFFENSIVE' as ItemType,
                    icon: '🔄',
                    rarity: 'EPIC',
                    buffType: 'WIN_RATE_BOOST' as BuffType,
                    buffValue: 6.0,
                    unlockLevel: 11,
                    unlockXp: 40000,
                },
                {
                    name: 'Perfect Timing',
                    description: 'Perfect timing for all decisions, increases vote accuracy by 15%',
                    type: 'ACTIVE' as ItemType,
                    icon: '⏰',
                    rarity: 'LEGENDARY',
                    buffType: 'VOTE_ACCURACY' as BuffType,
                    buffValue: 15.0,
                    unlockLevel: 18,
                    unlockXp: 90000,
                },
            ];

            // Check if item model exists (migration might not be run)
            if (!(this.prisma as any).item) {
                logger.error('item model not found. Please run: npx prisma migrate dev && npx prisma generate');
                throw new Error('Items table does not exist. Please run database migration first.');
            }

            // Test database connection by trying to count items
            try {
                const existingCount = await (this.prisma as any).item.count();
                logger.info(`[initializeDefaultItems] Current items in database: ${existingCount}`);
            } catch (testError: any) {
                logger.error('[initializeDefaultItems] Database test failed:', testError);
                if (testError.code === '42P01' || testError.message?.includes('does not exist')) {
                    throw new Error('Items table does not exist. Please run: npx prisma migrate deploy');
                }
                throw testError;
            }

            let successCount = 0;
            let errorCount = 0;

            for (const itemData of defaultItems) {
                try {
                    await (this.prisma as any).item.upsert({
                        where: { name: itemData.name },
                        update: itemData,
                        create: itemData,
                    });
                    successCount++;
                } catch (itemError: any) {
                    errorCount++;
                    logger.error(`Failed to upsert item ${itemData.name}:`, itemError);
                    // Continue with other items even if one fails
                }
            }

            if (successCount > 0) {
                logger.info(`✅ Initialized ${successCount} default items${errorCount > 0 ? ` (${errorCount} failed)` : ''}`);
            } else {
                logger.warn(`⚠️  No items were initialized. ${errorCount} errors occurred.`);
                throw new Error(`Failed to initialize items. ${errorCount} errors occurred.`);
            }
        } catch (error) {
            logger.error('Error initializing default items:', error);
            throw error;
        }
    }

    /**
     * Get all available items
     */
    async getAllItems(): Promise<Item[]> {
        try {
            // Check if item model exists (migration might not be run)
            if (!(this.prisma as any).item) {
                logger.warn('item model not found. Please run: npx prisma generate');
                return [];
            }

            try {
                const items = await (this.prisma as any).item.findMany({
                    where: { isActive: true },
                    orderBy: [
                        { rarity: 'asc' },
                        { unlockLevel: 'asc' },
                    ],
                });

                logger.info(`[getAllItems] Returning ${items.length} items`);
                return items;
            } catch (dbError: any) {
                // If table doesn't exist, return empty array instead of throwing
                if (dbError.code === '42P01' || dbError.message?.includes('does not exist')) {
                    logger.warn('[getAllItems] Items table does not exist. Please run migration.');
                    return [];
                }
                throw dbError;
            }
        } catch (error) {
            logger.error('Error fetching all items:', error);
            throw error;
        }
    }

    /**
     * Get user's loadout (items they own and equipped)
     */
    async getUserLoadout(userId: string): Promise<LoadoutItem[]> {
        try {
            // Check if userLoadout model exists (migration might not be run)
            if (!(this.prisma as any).userLoadout) {
                logger.warn('userLoadout model not found. Please run: npx prisma generate');
                return [];
            }

            try {
                const userLoadouts = await (this.prisma as any).userLoadout.findMany({
                    where: { userId },
                    include: { item: true },
                    orderBy: { slot: 'asc' },
                });

                return userLoadouts.map((ul: any) => ({
                    id: ul.item.id,
                    name: ul.item.name,
                    description: ul.item.description,
                    type: ul.item.type,
                    icon: ul.item.icon,
                    rarity: ul.item.rarity,
                    buffType: ul.item.buffType,
                    buffValue: ul.item.buffValue,
                    isActive: ul.item.isActive,
                    isEquipped: ul.isActive,
                    slot: ul.slot,
                    unlockLevel: ul.item.unlockLevel,
                    unlockXp: ul.item.unlockXp,
                }));
            } catch (dbError: any) {
                // If table doesn't exist, return empty array instead of throwing
                if (dbError.code === '42P01' || dbError.message?.includes('does not exist')) {
                    logger.warn('[getUserLoadout] User loadout table does not exist. Please run migration.');
                    return [];
                }
                throw dbError;
            }
        } catch (error) {
            logger.error('Error fetching user loadout:', error);
            throw error;
        }
    }

    /**
     * Get available items for user (based on level/XP)
     */
    async getAvailableItems(userId: string): Promise<ItemWithLoadout[]> {
        try {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { xp: true },
            });

            if (!user) {
                throw new AppError('User not found', 404);
            }

            // Calculate user level (simple: level = floor(xp / 1000))
            const userLevel = Math.floor(user.xp / 1000);

            logger.info(`[getAvailableItems] User ${userId} - XP: ${user.xp}, Level: ${userLevel}`);

            // Check if item model exists (migration might not be run)
            if (!(this.prisma as any).item) {
                logger.warn('item model not found. Please run: npx prisma generate');
                return [];
            }

            try {
                // First, check total items in database
                const totalItems = await (this.prisma as any).item.count({
                    where: { isActive: true },
                });
                logger.info(`[getAvailableItems] Total active items in database: ${totalItems}`);

                if (totalItems === 0) {
                    logger.warn('[getAvailableItems] No items found in database. Items may not be initialized.');
                    return [];
                }

                const allItems = await (this.prisma as any).item.findMany({
                    where: {
                        isActive: true,
                        OR: [
                            { unlockLevel: { lte: userLevel } },
                            { unlockXp: { lte: user.xp } },
                        ],
                    },
                    include: {
                        userLoadouts: {
                            where: { userId },
                            take: 1,
                        },
                    },
                    orderBy: [
                        { rarity: 'asc' },
                        { unlockLevel: 'asc' },
                    ],
                });

                logger.info(`[getAvailableItems] Found ${allItems.length} available items for user ${userId}`);
                return allItems.map((item: any) => ({
                    ...item,
                    userLoadout: item.userLoadouts[0] || null,
                }));
            } catch (dbError: any) {
                // If table doesn't exist, return empty array instead of throwing
                if (dbError.code === '42P01' || dbError.message?.includes('does not exist')) {
                    logger.warn('[getAvailableItems] Items table does not exist. Please run migration.');
                    return [];
                }
                throw dbError;
            }

        } catch (error) {
            logger.error('Error fetching available items:', error);
            throw error;
        }
    }

    /**
     * Equip item to user loadout (max 3 active items)
     */
    async equipItem(userId: string, itemId: string, slot?: number): Promise<UserLoadout> {
        try {
            // Check if models exist
            if (!(this.prisma as any).userLoadout || !(this.prisma as any).item) {
                throw new AppError('Items feature not initialized. Please run: npx prisma migrate dev && npx prisma generate', 503);
            }

            // Check if user owns the item
            let userLoadout = await (this.prisma as any).userLoadout.findUnique({
                where: {
                    userId_itemId: {
                        userId,
                        itemId,
                    },
                },
            });

            // If user doesn't own it, create ownership
            if (!userLoadout) {
                userLoadout = await (this.prisma as any).userLoadout.create({
                    data: {
                        userId,
                        itemId,
                        isActive: false,
                    },
                });
            }

            // Check current active items count
            const activeItems = await (this.prisma as any).userLoadout.count({
                where: {
                    userId,
                    isActive: true,
                },
            });

            if (activeItems >= 3 && !userLoadout.isActive) {
                throw new AppError('Maximum 3 items can be equipped at once', 400);
            }

            // Determine slot if not provided
            let targetSlot = slot;
            if (!targetSlot) {
                // Find first available slot (1-3)
                const usedSlots = await (this.prisma as any).userLoadout.findMany({
                    where: {
                        userId,
                        isActive: true,
                        slot: { not: null },
                    },
                    select: { slot: true },
                });

                const usedSlotNumbers = usedSlots.map((ul: any) => ul.slot).filter(Boolean) as number[];
                for (let i = 1; i <= 3; i++) {
                    if (!usedSlotNumbers.includes(i)) {
                        targetSlot = i;
                        break;
                    }
                }
                targetSlot = targetSlot || activeItems + 1;
            }

            // Unequip item in target slot if exists
            await (this.prisma as any).userLoadout.updateMany({
                where: {
                    userId,
                    slot: targetSlot,
                    isActive: true,
                },
                data: {
                    isActive: false,
                    slot: null,
                },
            });

            // Equip the item
            const updated = await (this.prisma as any).userLoadout.update({
                where: { id: userLoadout.id },
                data: {
                    isActive: true,
                    slot: targetSlot,
                    equippedAt: new Date(),
                },
                include: { item: true },
            });

            logger.info(`User ${userId} equipped item ${itemId} in slot ${targetSlot}`);
            return updated;
        } catch (error) {
            logger.error('Error equipping item:', error);
            throw error;
        }
    }

    /**
     * Unequip item from user loadout
     */
    async unequipItem(userId: string, itemId: string): Promise<void> {
        try {
            // Check if model exists
            if (!(this.prisma as any).userLoadout) {
                throw new AppError('Items feature not initialized. Please run: npx prisma migrate dev && npx prisma generate', 503);
            }

            await (this.prisma as any).userLoadout.updateMany({
                where: {
                    userId,
                    itemId,
                    isActive: true,
                },
                data: {
                    isActive: false,
                    slot: null,
                },
            });

            logger.info(`User ${userId} unequipped item ${itemId}`);
        } catch (error) {
            logger.error('Error unequipping item:', error);
            throw error;
        }
    }

    /**
     * Get active loadout buffs for user
     */
    async getActiveBuffs(userId: string): Promise<Record<BuffType, number>> {
        try {
            // Check if models exist
            if (!(this.prisma as any).userLoadout || !(this.prisma as any).item) {
                logger.warn('Items feature not initialized. Returning empty buffs.');
                return {
                    XP_BOOST: 0,
                    FEE_REDUCTION: 0,
                    PROFIT_BOOST: 0,
                    VOTE_ACCURACY: 0,
                    LEVERAGE_BOOST: 0,
                    POSITION_SIZE: 0,
                    WIN_RATE_BOOST: 0,
                    DEPOSIT_BONUS: 0,
                    WITHDRAWAL_SPEED: 0,
                    COOLDOWN_REDUCTION: 0,
                };
            }

            const activeLoadout = await (this.prisma as any).userLoadout.findMany({
                where: {
                    userId,
                    isActive: true,
                },
                include: { item: true },
            });

            const buffs: Record<BuffType, number> = {
                XP_BOOST: 0,
                FEE_REDUCTION: 0,
                PROFIT_BOOST: 0,
                VOTE_ACCURACY: 0,
                LEVERAGE_BOOST: 0,
                POSITION_SIZE: 0,
                WIN_RATE_BOOST: 0,
                DEPOSIT_BONUS: 0,
                WITHDRAWAL_SPEED: 0,
                COOLDOWN_REDUCTION: 0,
            };

            for (const loadout of activeLoadout) {
                const buffType = loadout.item.buffType as BuffType;
                if (buffType in buffs) {
                    buffs[buffType] = (buffs[buffType] || 0) + loadout.item.buffValue;
                }
            }

            return buffs;
        } catch (error) {
            logger.error('Error fetching active buffs:', error);
            throw error;
        }
    }
}

