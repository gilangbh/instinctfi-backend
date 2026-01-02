import { Router } from 'express';
import { UserController } from '@/controllers/UserController';
import { AuthMiddleware } from '@/middleware/auth';
import { generalRateLimit, strictRateLimit } from '@/middleware/rateLimiter';
import { validate, validateQuery } from '@/utils/validation';
import { createUserSchema, updateUserSchema, paginationSchema } from '@/utils/validation';

export const createUserRoutes = (userController: UserController, authMiddleware: AuthMiddleware): Router => {
  const router = Router();

  // Apply general rate limiting to all routes
  router.use(generalRateLimit);

  // Public routes
  router.post(
    '/',
    validate(createUserSchema),
    userController.createUser
  );

  router.get(
    '/leaderboard',
    validateQuery(paginationSchema),
    userController.getLeaderboard
  );

  router.get(
    '/wallet/:walletAddress',
    userController.getUserByWallet
  );

  // Protected routes (require authentication)
  router.use(authMiddleware.authenticate);

  router.get(
    '/:id',
    userController.getUserById
  );

  router.put(
    '/:id',
    validate(updateUserSchema),
    userController.updateUser
  );

  router.get(
    '/:id/details',
    userController.getUserDetails
  );

  router.get(
    '/:id/stats',
    userController.getUserStats
  );

  router.get(
    '/:id/level',
    userController.getUserLevel
  );

  router.get(
    '/:id/extended-stats',
    userController.getExtendedUserStats
  );

  router.get(
    '/:id/achievements',
    userController.getUserAchievements
  );

  // Admin routes (require admin access)
  router.use(authMiddleware.requireAdmin);

  router.post(
    '/:id/ban',
    strictRateLimit,
    userController.banUser
  );

  router.post(
    '/:id/unban',
    strictRateLimit,
    userController.unbanUser
  );

  return router;
};

