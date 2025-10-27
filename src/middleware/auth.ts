import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@/utils/config';
import { JwtPayload } from '@/types';
import { PrismaClient } from '@prisma/client';
import logger from '@/utils/logger';

export class AuthMiddleware {
  constructor(private prisma: PrismaClient) {}

  /**
   * Verify JWT token and attach user to request
   */
  authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: 'No token provided',
        });
        return;
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      try {
        const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
        
        // Get user from database
        const user = await this.prisma.user.findUnique({
          where: { id: decoded.userId },
          select: {
            id: true,
            walletAddress: true,
            username: true,
            isBanned: true,
            banExpiresAt: true,
          },
        });

        if (!user) {
          res.status(401).json({
            success: false,
            error: 'User not found',
          });
          return;
        }

        // Check if user is banned
        if (user.isBanned) {
          if (user.banExpiresAt && user.banExpiresAt > new Date()) {
            res.status(403).json({
              success: false,
              error: 'User is banned',
            });
            return;
          }
        }

        req.user = {
          id: user.id,
          userId: user.id,
          walletAddress: user.walletAddress,
          username: user.username,
          isBanned: user.isBanned,
          banExpiresAt: user.banExpiresAt || undefined,
        };
        next();
      } catch (jwtError) {
        logger.warn('JWT verification failed:', jwtError);
        res.status(401).json({
          success: false,
          error: 'Invalid token',
        });
        return;
      }
    } catch (error) {
      logger.error('Error in authenticate middleware:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  };

  /**
   * Optional authentication - doesn't fail if no token provided
   */
  optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        next();
        return;
      }

      const token = authHeader.substring(7);

      try {
        const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
        
        const user = await this.prisma.user.findUnique({
          where: { id: decoded.userId },
          select: {
            id: true,
            walletAddress: true,
            username: true,
            isBanned: true,
            banExpiresAt: true,
          },
        });

        if (user && (!user.isBanned || (user.banExpiresAt && user.banExpiresAt <= new Date()))) {
          req.user = {
            id: user.id,
            userId: user.id,
            walletAddress: user.walletAddress,
            username: user.username,
            isBanned: user.isBanned,
            banExpiresAt: user.banExpiresAt || undefined,
          };
        }
      } catch (jwtError) {
        logger.warn('Optional JWT verification failed:', jwtError);
      }

      next();
    } catch (error) {
      logger.error('Error in optionalAuth middleware:', error);
      next();
    }
  };

  /**
   * Check if user is admin (for admin-only routes)
   */
  requireAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      // TODO: Implement admin role check
      // For now, we'll use a simple check based on username or add an admin field to user model
      const isAdmin = req.user.username === 'admin' || req.user.walletAddress === 'admin';

      if (!isAdmin) {
        res.status(403).json({
          success: false,
          error: 'Admin access required',
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Error in requireAdmin middleware:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  };

  /**
   * Check if user is not banned
   */
  requireNotBanned = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      if (req.user.isBanned) {
        res.status(403).json({
          success: false,
          error: 'User is banned',
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Error in requireNotBanned middleware:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  };
}

/**
 * Generate JWT token for user
 */
export const generateToken = (userId: string, walletAddress: string, username: string = '', isBanned: boolean = false): string => {
  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    id: userId,
    userId,
    walletAddress,
    username,
    isBanned,
  };

  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as string,
  } as jwt.SignOptions);
};

/**
 * Verify JWT token
 */
export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, config.jwtSecret) as JwtPayload;
};

