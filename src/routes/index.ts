import { Router } from 'express';
import { UserController } from '@/controllers/UserController';
import { RunController } from '@/controllers/RunController';
import { MarketController } from '@/controllers/MarketController';
import { AuthController } from '@/controllers/AuthController';
import { AuthMiddleware } from '@/middleware/auth';
import { createUserRoutes } from './userRoutes';
import { createRunRoutes } from './runRoutes';
import { createMarketRoutes } from './marketRoutes';
import { createAuthRoutes } from './authRoutes';

export const createRoutes = (
  userController: UserController,
  runController: RunController,
  marketController: MarketController,
  authController: AuthController,
  authMiddleware: AuthMiddleware
): Router => {
  const router = Router();

  // Health check endpoint
  router.get('/health', (req, res) => {
    res.json({
      success: true,
      message: 'Instinct.fi API is running',
      timestamp: new Date().toISOString(),
      version: process.env.API_VERSION || 'v1',
    });
  });

  // API routes
  router.use('/auth', createAuthRoutes(authController));
  router.use('/users', createUserRoutes(userController, authMiddleware));
  router.use('/runs', createRunRoutes(runController, authMiddleware));
  router.use('/market', createMarketRoutes(marketController));

  // 404 handler
  router.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: 'Route not found',
    });
  });

  return router;
};

