import { Router } from 'express';
import { UserController } from '@/controllers/UserController';
import { RunController } from '@/controllers/RunController';
import { MarketController } from '@/controllers/MarketController';
import { AuthController } from '@/controllers/AuthController';
import { WaitlistController } from '@/controllers/WaitlistController';
import { ItemController } from '@/controllers/ItemController';
import { AuthMiddleware } from '@/middleware/auth';
import { createUserRoutes } from './userRoutes';
import { createRunRoutes } from './runRoutes';
import { createMarketRoutes } from './marketRoutes';
import { createAuthRoutes } from './authRoutes';
// Temporarily disabled due to IDL parsing issue
// import solanaRoutes from './solanaRoutes';
import driftPriceRoutes from './driftPriceRoutes';
import driftTradingRoutes from './driftTradingRoutes';
import { createWaitlistRoutes } from './waitlistRoutes';
import { createItemRoutes } from './itemRoutes';

export const createRoutes = (
  userController: UserController,
  runController: RunController,
  marketController: MarketController,
  authController: AuthController,
  waitlistController: WaitlistController,
  itemController: ItemController,
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
  router.use('/waitlist', createWaitlistRoutes(waitlistController));
  router.use('/items', createItemRoutes(itemController, authMiddleware));
  
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

