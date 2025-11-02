import { Router } from 'express';
import { SolanaController } from '@/controllers/SolanaController';

const router = Router();

/**
 * @route   GET /api/solana/authority
 * @desc    Get authority wallet address
 * @access  Public
 */
router.get('/authority', SolanaController.getAuthority);

/**
 * @route   GET /api/solana/platform
 * @desc    Get platform information from blockchain
 * @access  Public
 */
router.get('/platform', SolanaController.getPlatformInfo);

/**
 * @route   POST /api/solana/platform/initialize
 * @desc    Initialize platform (one-time setup, admin only)
 * @access  Private (Admin)
 */
router.post('/platform/initialize', SolanaController.initializePlatform);

/**
 * @route   POST /api/solana/platform/pause
 * @desc    Pause platform (emergency, admin only)
 * @access  Private (Admin)
 */
router.post('/platform/pause', SolanaController.pausePlatform);

/**
 * @route   POST /api/solana/platform/unpause
 * @desc    Unpause platform (admin only)
 * @access  Private (Admin)
 */
router.post('/platform/unpause', SolanaController.unpausePlatform);

/**
 * @route   GET /api/solana/run/:runId
 * @desc    Get run information from blockchain
 * @access  Public
 */
router.get('/run/:runId', SolanaController.getRunInfo);

/**
 * @route   GET /api/solana/run/:runId/pdas
 * @desc    Get all PDAs for a run
 * @access  Public
 */
router.get('/run/:runId/pdas', SolanaController.getRunPDAs);

export default router;



