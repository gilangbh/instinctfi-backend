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
// Temporarily disabled due to IDL parsing issue
// import solanaRoutes from './solanaRoutes';
import driftPriceRoutes from './driftPriceRoutes';
import driftTradingRoutes from './driftTradingRoutes';

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
  
  // Solana routes - temporarily disabled due to IDL parsing issue
  // TODO: Fix IDL compatibility and re-enable
  // router.use('/solana', solanaRoutes);
  
  // Drift routes
  router.use('/prices', driftPriceRoutes);
  router.use('/drift', driftTradingRoutes);

  // 404 handler
  router.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: 'Route not found',
    });
  });

  return router;
};

