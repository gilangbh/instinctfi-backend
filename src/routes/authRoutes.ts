import { Router } from 'express';
import { AuthController } from '@/controllers/AuthController';

export const createAuthRoutes = (authController: AuthController): Router => {
  const router = Router();

  // GET /auth/wallet/nonce - Get message to sign
  router.get('/wallet/nonce', authController.getNonce);

  // POST /auth/wallet/verify - Verify wallet signature and authenticate
  router.post('/wallet/verify', authController.verifyWallet);

  return router;
};





