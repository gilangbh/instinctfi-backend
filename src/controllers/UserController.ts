import { Request, Response } from 'express';
import { UserService } from '@/services/UserService';
import { CreateUserRequest, UpdateUserRequest, ApiResponse } from '@/types';
import { validate } from '@/utils/validation';
import { createUserSchema, updateUserSchema, paginationSchema } from '@/utils/validation';
import logger from '@/utils/logger';

export class UserController {
  constructor(private userService: UserService) {}

  /**
   * Create a new user
   */
  createUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const userData: CreateUserRequest = req.body;
      const user = await this.userService.createUser(userData);

      const response: ApiResponse = {
        success: true,
        data: user,
        message: 'User created successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      logger.error('Error in createUser controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Get user by ID
   */
  getUserById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const user = await this.userService.getUserById(id);

      if (!user) {
        const response: ApiResponse = {
          success: false,
          error: 'User not found',
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: user,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getUserById controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Get user by wallet address
   */
  getUserByWallet = async (req: Request, res: Response): Promise<void> => {
    try {
      const { walletAddress } = req.params;
      const user = await this.userService.getUserByWalletAddress(walletAddress);

      if (!user) {
        const response: ApiResponse = {
          success: false,
          error: 'User not found',
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: user,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getUserByWallet controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Update user
   */
  updateUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const updateData: UpdateUserRequest = req.body;
      const user = await this.userService.updateUser(id, updateData);

      const response: ApiResponse = {
        success: true,
        data: user,
        message: 'User updated successfully',
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in updateUser controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Get user with details (badges, XP history)
   */
  getUserDetails = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const user = await this.userService.getUserWithDetails(id);

      if (!user) {
        const response: ApiResponse = {
          success: false,
          error: 'User not found',
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: user,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getUserDetails controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Get user statistics
   */
  getUserStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const stats = await this.userService.getUserStats(id);

      const response: ApiResponse = {
        success: true,
        data: stats,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getUserStats controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Get user level information
   */
  getUserLevel = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const levelInfo = await this.userService.getUserLevelInfo(id);

      const response: ApiResponse = {
        success: true,
        data: levelInfo,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getUserLevel controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Get extended user statistics (NAV, Global Rank, etc.)
   */
  getExtendedUserStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const extendedStats = await this.userService.getExtendedUserStats(id);

      const response: ApiResponse = {
        success: true,
        data: extendedStats,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getExtendedUserStats controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Get user achievements
   */
  getUserAchievements = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const achievements = await this.userService.getUserAchievements(id);

      const response: ApiResponse = {
        success: true,
        data: achievements,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getUserAchievements controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Get leaderboard
   */
  getLeaderboard = async (req: Request, res: Response): Promise<void> => {
    try {
      const { limit } = req.query;
      const limitNum = limit ? parseInt(limit as string, 10) : 10;
      
      const users = await this.userService.getLeaderboard(limitNum);

      const response: ApiResponse = {
        success: true,
        data: users,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getLeaderboard controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Ban user
   */
  banUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { reason, expiresAt } = req.body;
      
      const user = await this.userService.banUser(id, reason, expiresAt ? new Date(expiresAt) : undefined);

      const response: ApiResponse = {
        success: true,
        data: user,
        message: 'User banned successfully',
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in banUser controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Unban user
   */
  unbanUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const user = await this.userService.unbanUser(id);

      const response: ApiResponse = {
        success: true,
        data: user,
        message: 'User unbanned successfully',
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in unbanUser controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Handle errors
   */
  private handleError(error: any, res: Response): void {
    if (error.statusCode) {
      const response: ApiResponse = {
        success: false,
        error: error.message,
      };
      res.status(error.statusCode).json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        error: 'Internal server error',
      };
      res.status(500).json(response);
    }
  }
}

