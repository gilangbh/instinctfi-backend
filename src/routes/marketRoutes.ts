import { Router } from 'express';
import { MarketController } from '@/controllers/MarketController';

export const createMarketRoutes = (
  marketController: MarketController
): Router => {
  const router = Router();

  // GET /market/price/:symbol - Get current price for a symbol
  router.get('/price/:symbol', marketController.getCurrentPrice);

  // GET /market/price-history/:symbol - Get price history for a symbol
  router.get('/price-history/:symbol', marketController.getPriceHistory);

  // GET /market/price-change/:symbol - Get price change for a symbol
  router.get('/price-change/:symbol', marketController.getPriceChange);

  // GET /market/prices - Get all current prices
  router.get('/prices', marketController.getAllCurrentPrices);

  // GET /market/stats - Get price service statistics
  router.get('/stats', marketController.getStats);

  return router;
};





