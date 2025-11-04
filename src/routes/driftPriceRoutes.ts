import { Router } from 'express';
import { DriftPriceController } from '@/controllers/DriftPriceController';

const router = Router();

/**
 * @route   GET /api/prices/current/:symbol?
 * @desc    Get current price from Drift oracle
 * @access  Public
 */
router.get('/current/:symbol?', DriftPriceController.getCurrentPrice);

/**
 * @route   GET /api/prices/market/:symbol?
 * @desc    Get market data from Drift oracle
 * @access  Public
 */
router.get('/market/:symbol?', DriftPriceController.getMarketData);

/**
 * @route   GET /api/prices/oracle-info
 * @desc    Get information about oracle source
 * @access  Public
 */
router.get('/oracle-info', DriftPriceController.getOracleInfo);

export default router;




