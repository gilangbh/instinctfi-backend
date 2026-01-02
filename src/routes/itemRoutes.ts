import { Router } from 'express';
import { ItemController } from '@/controllers/ItemController';
import { AuthMiddleware } from '@/middleware/auth';
import { generalRateLimit } from '@/middleware/rateLimiter';

export const createItemRoutes = (itemController: ItemController, authMiddleware: AuthMiddleware): Router => {
  const router = Router();

  // Apply general rate limiting to all routes
  router.use(generalRateLimit);

  // Public routes
  router.get(
    '/',
    itemController.getAllItems
  );

  // Temporary: Public initialize endpoint (for development)
  // TODO: Remove or protect this in production
  router.post(
    '/initialize',
    itemController.initializeItems
  );

  // Protected routes (require authentication)
  router.use(authMiddleware.authenticate);

  router.get(
    '/user/:id/loadout',
    itemController.getUserLoadout
  );

  router.get(
    '/user/:id/available',
    itemController.getAvailableItems
  );

  router.get(
    '/user/:id/buffs',
    itemController.getActiveBuffs
  );

  router.post(
    '/user/:id/equip',
    itemController.equipItem
  );

  router.post(
    '/user/:id/unequip',
    itemController.unequipItem
  );

  // Admin routes (require admin access)
  // Note: /initialize is now public for development (see above)
  // router.use(authMiddleware.requireAdmin);

  return router;
};

