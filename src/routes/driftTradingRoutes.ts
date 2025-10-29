import { Router } from 'express';
import { DriftTradingController } from '@/controllers/DriftTradingController';

const router = Router();

/**
 * @route   GET /api/drift/mode
 * @desc    Get trading mode (mock or real)
 * @access  Public
 */
router.get('/mode', DriftTradingController.getTradingMode);

/**
 * @route   GET /api/drift/account
 * @desc    Get Drift account information
 * @access  Public (for now - add auth later)
 */
router.get('/account', DriftTradingController.getAccount);

/**
 * @route   GET /api/drift/positions
 * @desc    Get all open positions on Drift
 * @access  Public (for now - add auth later)
 */
router.get('/positions', DriftTradingController.getPositions);

/**
 * @route   POST /api/drift/order
 * @desc    Place a perp order on Drift
 * @access  Public (for now - add auth later)
 * @body    { marketSymbol, direction, baseAmount, leverage?, reduceOnly? }
 */
router.post('/order', DriftTradingController.placePerpOrder);

/**
 * @route   POST /api/drift/close
 * @desc    Close a position on Drift
 * @access  Public (for now - add auth later)
 * @body    { marketSymbol }
 */
router.post('/close', DriftTradingController.closePosition);

export default router;

