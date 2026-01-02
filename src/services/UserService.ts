import { PrismaClient, User, Badge, UserBadge, XpHistory } from '@prisma/client';
import { CreateUserRequest, UpdateUserRequest, UserStats, ExtendedUserStats } from '@/types';
import { AppError } from '@/types';
import { checkNewBadges, getXpLevel, getXpForNextLevel, getXpProgress } from '@/utils/xp';
import logger from '@/utils/logger';
import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '@/utils/config';

export class UserService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new user
   */
  async createUser(data: CreateUserRequest): Promise<User> {
    try {
      // Check if user already exists
      const existingUser = await this.prisma.user.findFirst({
        where: {
          OR: [
            { walletAddress: data.walletAddress },
            { username: data.username },
            ...(data.email ? [{ email: data.email }] : []),
          ],
        },
      });

      if (existingUser) {
        throw new AppError('User already exists with this wallet address, username, or email', 409);
      }

      const user = await this.prisma.user.create({
        data: {
          walletAddress: data.walletAddress,
          username: data.username,
          email: data.email,
        },
      });

      logger.info(`User created: ${user.id} (${user.username})`);
      return user;
    } catch (error) {
      logger.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<User | null> {
    try {
      return await this.prisma.user.findUnique({
        where: { id },
      });
    } catch (error) {
      logger.error('Error fetching user by ID:', error);
      throw error;
    }
  }

  /**
   * Get user by wallet address
   */
  async getUserByWalletAddress(walletAddress: string): Promise<User | null> {
    try {
      return await this.prisma.user.findUnique({
        where: { walletAddress },
      });
    } catch (error) {
      logger.error('Error fetching user by wallet address:', error);
      throw error;
    }
  }

  /**
   * Generate JWT authentication token for user
   */
  async generateAuthToken(userId: string): Promise<string> {
    try {
      const payload = {
        userId,
        iat: Math.floor(Date.now() / 1000),
      };

      const token = jwt.sign(payload, config.jwtSecret, {
        expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
      });

      logger.info(`JWT token generated for user ${userId}`);
      return token;
    } catch (error) {
      logger.error('Error generating auth token:', error);
      throw error;
    }
  }

  /**
   * Update user
   */
  async updateUser(id: string, data: UpdateUserRequest): Promise<User> {
    try {
      // Check if username is already taken
      if (data.username) {
        const existingUser = await this.prisma.user.findFirst({
          where: {
            username: data.username,
            NOT: { id },
          },
        });

        if (existingUser) {
          throw new AppError('Username already taken', 409);
        }
      }

      const user = await this.prisma.user.update({
        where: { id },
        data,
      });

      logger.info(`User updated: ${user.id} (${user.username})`);
      return user;
    } catch (error) {
      logger.error('Error updating user:', error);
      throw error;
    }
  }

  /**
   * Get user with badges and XP history
   */
  async getUserWithDetails(id: string): Promise<User & { badges: (UserBadge & { badge: Badge })[]; xpHistory: XpHistory[] } | null> {
    try {
      return await this.prisma.user.findUnique({
        where: { id },
        include: {
          badges: {
            include: {
              badge: true,
            },
          },
          xpHistory: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 10,
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching user with details:', error);
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(id: string): Promise<UserStats> {
    try {
      const user = await this.getUserById(id);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Get run participation data
      const runParticipants = await this.prisma.runParticipant.findMany({
        where: { userId: id },
        include: {
          run: true,
        },
      });

      // Get vote data
      const votes = await this.prisma.vote.findMany({
        where: { userId: id },
      });

      // Get user badges
      const userBadges = await this.prisma.userBadge.findMany({
        where: { userId: id },
        include: {
          badge: true,
        },
      });

      // Calculate statistics
      const totalRuns = runParticipants.length;
      const winningRuns = runParticipants.filter(p => p.finalShare && p.finalShare > p.depositAmount).length;
      const winRate = totalRuns > 0 ? (winningRuns / totalRuns) * 100 : 0;

      const totalVotes = votes.length;
      const correctVotes = runParticipants.reduce((sum, p) => sum + p.votesCorrect, 0);

      // Calculate total profit from all completed runs
      // Profit = finalShare - depositAmount for runs where finalShare exists
      const totalProfit = runParticipants
        .filter(p => p.finalShare !== null)
        .reduce((sum, p) => {
          const profit = (p.finalShare || 0) - p.depositAmount;
          return sum + profit;
        }, 0);

      // Calculate active runs (runs that are not ENDED)
      const activeRuns = runParticipants.filter(
        p => p.run.status !== 'ENDED'
      ).length;

      // Calculate consecutive wins (simplified)
      const consecutiveWins = 0; // TODO: Implement proper consecutive win calculation

      // Calculate consecutive participation (simplified)
      const consecutiveParticipation = 0; // TODO: Implement proper consecutive participation calculation

      return {
        totalRuns,
        activeRuns,
        completedRuns: totalRuns - activeRuns,
        totalProfit,
        winRate,
        totalVotes,
        correctVotes,
        consecutiveWins,
        consecutiveParticipation,
        totalXp: user.xp,
        xp: user.xp,
        level: Math.floor(user.xp / 1000), // Simple level calculation
        badges: userBadges,
      };
    } catch (error) {
      logger.error('Error fetching user stats:', error);
      throw error;
    }
  }

  /**
   * Add XP to user
   */
  async addXp(userId: string, amount: number, reason: string, runId?: string): Promise<User> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Create XP history entry
      await this.prisma.xpHistory.create({
        data: {
          userId,
          amount,
          reason,
          runId,
        },
      });

      // Update user XP
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: {
          xp: user.xp + amount,
        },
      });

      logger.info(`Added ${amount} XP to user ${userId} for: ${reason}`);
      return updatedUser;
    } catch (error) {
      logger.error('Error adding XP to user:', error);
      throw error;
    }
  }

  /**
   * Award badge to user
   */
  async awardBadge(userId: string, badgeId: string): Promise<UserBadge> {
    try {
      // Check if user already has this badge
      const existingBadge = await this.prisma.userBadge.findUnique({
        where: {
          userId_badgeId: {
            userId,
            badgeId,
          },
        },
      });

      if (existingBadge) {
        throw new AppError('User already has this badge', 409);
      }

      const userBadge = await this.prisma.userBadge.create({
        data: {
          userId,
          badgeId,
        },
        include: {
          badge: true,
        },
      });

      logger.info(`Badge awarded to user ${userId}: ${userBadge.badge.name}`);
      return userBadge;
    } catch (error) {
      logger.error('Error awarding badge:', error);
      throw error;
    }
  }

  /**
   * Check and award new badges
   */
  async checkAndAwardBadges(userId: string): Promise<UserBadge[]> {
    try {
      const user = await this.getUserWithDetails(userId);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      const stats = await this.getUserStats(userId);
      const currentBadgeIds = user.badges.map(ub => ub.badgeId);
      
      const newBadges = checkNewBadges(stats, currentBadgeIds);
      const awardedBadges: UserBadge[] = [];

      for (const badge of newBadges) {
        try {
          const userBadge = await this.awardBadge(userId, badge.name);
          awardedBadges.push(userBadge);
        } catch (error) {
          logger.warn(`Failed to award badge ${badge.name} to user ${userId}:`, error);
        }
      }

      return awardedBadges;
    } catch (error) {
      logger.error('Error checking and awarding badges:', error);
      throw error;
    }
  }

  /**
   * Get all achievements with unlocked/locked status for user
   */
  async getUserAchievements(userId: string): Promise<any[]> {
    try {
      const user = await this.getUserWithDetails(userId);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      const stats = await this.getUserStats(userId);
      const userBadgeIds = new Set(user.badges.map(ub => ub.badgeId));

      // Get all badges from database
      const allBadges = await this.prisma.badge.findMany({
        orderBy: { createdAt: 'asc' },
      });

      // Map badges with unlocked status
      const achievements = allBadges.map((badge) => {
        const isUnlocked = userBadgeIds.has(badge.id);
        const userBadge = user.badges.find(ub => ub.badgeId === badge.id);

        return {
          id: badge.id,
          name: badge.name,
          emoji: badge.emoji,
          description: badge.description,
          xpReward: badge.xpReward,
          isUnlocked,
          earnedAt: userBadge?.earnedAt || null,
          createdAt: badge.createdAt,
        };
      });

      return achievements;
    } catch (error) {
      logger.error('Error fetching user achievements:', error);
      throw error;
    }
  }

  /**
   * Get user leaderboard
   */
  async getLeaderboard(limit: number = 10): Promise<User[]> {
    try {
      return await this.prisma.user.findMany({
        orderBy: [
          { xp: 'desc' },
          { totalRuns: 'desc' },
        ],
        take: limit,
      });
    } catch (error) {
      logger.error('Error fetching leaderboard:', error);
      throw error;
    }
  }

  /**
   * Ban user
   */
  async banUser(id: string, reason: string, expiresAt?: Date): Promise<User> {
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          isBanned: true,
          banReason: reason,
          banExpiresAt: expiresAt,
        },
      });

      logger.warn(`User banned: ${user.id} (${user.username}) - Reason: ${reason}`);
      return user;
    } catch (error) {
      logger.error('Error banning user:', error);
      throw error;
    }
  }

  /**
   * Unban user
   */
  async unbanUser(id: string): Promise<User> {
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          isBanned: false,
          banReason: null,
          banExpiresAt: null,
        },
      });

      logger.info(`User unbanned: ${user.id} (${user.username})`);
      return user;
    } catch (error) {
      logger.error('Error unbanning user:', error);
      throw error;
    }
  }

  /**
   * Get user level information
   */
  async getUserLevelInfo(userId: string): Promise<{
    level: number;
    currentXp: number;
    xpForNextLevel: number;
    progress: number;
  }> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      const level = getXpLevel(user.xp);
      const xpForNextLevel = getXpForNextLevel(level);
      const progress = getXpProgress(user.xp, level);

      return {
        level,
        currentXp: user.xp,
        xpForNextLevel,
        progress,
      };
    } catch (error) {
      logger.error('Error getting user level info:', error);
      throw error;
    }
  }

  /**
   * Get extended user statistics including Net Asset Value and Global Rank
   */
  async getExtendedUserStats(userId: string): Promise<ExtendedUserStats> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Get all run participants for this user
      const runParticipants = await this.prisma.runParticipant.findMany({
        where: { userId },
        include: {
          run: {
            select: {
              status: true,
            },
          },
        },
      });

      // Calculate total deposits (all deposits across all runs)
      const totalDeposits = runParticipants.reduce(
        (sum, p) => sum + p.depositAmount,
        0
      );

      // Calculate total withdrawals (sum of finalShare where withdrawn = true)
      const totalWithdrawals = runParticipants
        .filter(p => p.withdrawn && p.finalShare !== null)
        .reduce((sum, p) => sum + (p.finalShare || 0), 0);

      // Calculate active deposits (deposits in runs that are not ENDED)
      const activeDeposits = runParticipants
        .filter(p => p.run.status !== 'ENDED')
        .reduce((sum, p) => sum + p.depositAmount, 0);

      // Calculate total profit (sum of profit from all completed runs)
      // Profit = finalShare - depositAmount for runs where finalShare exists
      const totalProfit = runParticipants
        .filter(p => p.finalShare !== null)
        .reduce((sum, p) => {
          const profit = (p.finalShare || 0) - p.depositAmount;
          return sum + profit;
        }, 0);

      // Calculate Net Asset Value
      // NAV = Total Deposits + Total Profit - Total Withdrawals
      // Or more simply: NAV = Active Deposits + (Total Profit - Total Withdrawals from ended runs)
      // For simplicity, we'll use: NAV = Total Deposits + Total Profit - Total Withdrawals
      const netAssetValue = totalDeposits + totalProfit - totalWithdrawals;

      // Calculate Global Rank based on XP
      // Rank = number of users with higher XP + 1
      const usersWithHigherXp = await this.prisma.user.count({
        where: {
          xp: {
            gt: user.xp,
          },
        },
      });

      const globalRank = usersWithHigherXp + 1;

      logger.info(`Extended stats calculated for user ${userId}: Rank ${globalRank}, NAV ${netAssetValue} cents`);

      return {
        globalRank,
        netAssetValue,
        totalProfit,
        totalDeposits,
        totalWithdrawals,
        activeDeposits,
      };
    } catch (error) {
      logger.error('Error getting extended user stats:', error);
      throw error;
    }
  }
}

