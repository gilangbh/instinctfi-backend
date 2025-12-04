import { Router } from 'express';
import { RunController } from '@/controllers/RunController';
import { AuthMiddleware } from '@/middleware/auth';
import { generalRateLimit, strictRateLimit, voteRateLimit, joinRunRateLimit, createRunRateLimit } from '@/middleware/rateLimiter';
import { validate, validateQuery } from '@/utils/validation';
import { createRunSchema, joinRunSchema, runQuerySchema, paginationSchema, castVoteSchema } from '@/utils/validation';

export const createRunRoutes = (runController: RunController, authMiddleware: AuthMiddleware): Router => {
  const router = Router();

  // Apply general rate limiting to all routes
  router.use(generalRateLimit);

  // Public routes
  router.get(
    '/active',
    runController.getActiveRuns
  );

  router.get(
    '/history',
    validateQuery(paginationSchema),
    runController.getRunHistory
  );

  router.get(
    '/:id',
    runController.getRunById
  );

  router.get(
    '/:id/participants',
    runController.getRunParticipants
  );

  router.get(
    '/:id/trades',
    runController.getRunTrades
  );

  router.get(
    '/:id/trades/:round/unrealized-pnl',
    runController.getUnrealizedPnL
  );

  router.get(
    '/:id/voting-round',
    runController.getCurrentVotingRound
  );

  router.get(
    '/:id/logs',
    runController.getRunLogs
  );

  // Protected routes (require authentication)
  router.use(authMiddleware.authenticate);
  router.use(authMiddleware.requireNotBanned);

  router.post(
    '/',
    validate(createRunSchema),
    createRunRateLimit,
    runController.createRun
  );

  router.post(
    '/:id/join',
    validate(joinRunSchema),
    joinRunRateLimit,
    runController.joinRun
  );

  router.delete(
    '/:id/leave',
    runController.leaveRun
  );

  router.post(
    '/:id/withdraw',
    runController.withdraw
  );

  router.post(
    '/:id/vote',
    validate(castVoteSchema),
    voteRateLimit,
    runController.castVote
  );

  // Admin routes (require admin access)
  router.use(authMiddleware.requireAdmin);

  router.post(
    '/:id/start',
    strictRateLimit,
    runController.startRun
  );

  router.post(
    '/:id/end',
    strictRateLimit,
    runController.endRun
  );

  return router;
};

