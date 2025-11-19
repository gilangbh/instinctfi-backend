import { Router } from 'express';
import { WaitlistController } from '@/controllers/WaitlistController';

export const createWaitlistRoutes = (waitlistController: WaitlistController): Router => {
  const router = Router();

  router.post('/', waitlistController.subscribe);

  return router;
};









