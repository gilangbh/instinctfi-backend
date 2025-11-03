// DEPLOYMENT DEBUG - Log before any imports
console.log('========================================');
console.log('🚀 Starting InstinctFi Backend...');
console.log('Timestamp:', new Date().toISOString());
console.log('Node version:', process.version);
console.log('Environment:', process.env.NODE_ENV);
console.log('========================================');

console.log('Importing express...');
import express from 'express';
console.log('✅ express imported');

console.log('Importing cors, helmet, morgan, compression...');
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
console.log('✅ middleware imports done');

console.log('Importing Prisma...');
import { PrismaClient } from '@prisma/client';
console.log('✅ Prisma imported');

console.log('Importing config and logger...');
import { config } from '@/utils/config';
import { morganStream } from '@/utils/logger';
import logger from '@/utils/logger';
import '@/types'; // Import types to ensure Request extension is loaded
console.log('✅ Config and logger imported');

// Import services and controllers
console.log('Importing services...');
import { UserService } from '@/services/UserService';
console.log('✅ UserService imported');

import { RunService } from '@/services/RunService';
console.log('✅ RunService imported');

import { RunSchedulerService } from '@/services/RunSchedulerService';
console.log('✅ RunSchedulerService imported');

import { DriftService } from '@/services/DriftService';
console.log('✅ DriftService imported');

import { PriceService } from '@/services/PriceService';
console.log('✅ PriceService imported');

console.log('Importing controllers...');
import { UserController } from '@/controllers/UserController';
import { RunController } from '@/controllers/RunController';
import { MarketController } from '@/controllers/MarketController';
import { AuthController } from '@/controllers/AuthController';
console.log('✅ Controllers imported');

console.log('Importing middleware and routes...');
import { AuthMiddleware } from '@/middleware/auth';
import { createRoutes } from '@/routes';
console.log('✅ Middleware and routes imported');

// Import WebSocket server
console.log('Importing WebSocket...');
import { WebSocketService } from '@/services/WebSocketService';
console.log('✅ WebSocket imported');

console.log('🎉 ALL IMPORTS SUCCESSFUL!');

class App {
  public app: express.Application;
  private prisma: PrismaClient;
  private wsServer: WebSocketService;
  private priceService: PriceService;
  private runScheduler: RunSchedulerService | null = null;

  constructor() {
    try {
      logger.info('Initializing application...');
      this.app = express();
      logger.info('Express app created');
      
      this.prisma = new PrismaClient();
      logger.info('Prisma client created');
      
      this.wsServer = new WebSocketService();
      logger.info('WebSocket service created');
      
      this.priceService = new PriceService(this.prisma, this.wsServer);
      logger.info('Price service created');
      
      this.initializeMiddleware();
      logger.info('Middleware initialized');
      
      this.initializeRoutes();
      logger.info('Routes initialized');
      
      this.initializeErrorHandling();
      logger.info('Error handling initialized');
    } catch (error) {
      logger.error('Failed during App construction:', error);
      throw error;
    }
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    
    // CORS middleware
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        
        // Allow localhost on any port for development
        if (origin.includes('localhost')) {
          return callback(null, true);
        }
        
        // Allow configured origin
        if (origin === config.corsOrigin) {
          return callback(null, true);
        }
        
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    }));

    // Compression middleware
    this.app.use(compression());

    // Logging middleware
    this.app.use(morgan('combined', { stream: morganStream }));

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request ID middleware
    this.app.use((req, res, next) => {
      req.id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      next();
    });
  }

  private initializeRoutes(): void {
    try {
      // Initialize services
      logger.info('Creating UserService...');
      const userService = new UserService(this.prisma);
      
      logger.info('Creating RunService...');
      const runService = new RunService(this.prisma);
      
      logger.info('Creating DriftService...');
      const driftService = new DriftService();

      // Initialize and start run scheduler
      logger.info('Creating RunSchedulerService...');
      this.runScheduler = new RunSchedulerService(this.prisma, runService);
      
      logger.info('Starting RunScheduler...');
      this.runScheduler.start();

      // Connect DriftService price updates to WebSocket broadcasts
      logger.info('Setting up Drift price callback...');
      driftService.setPriceUpdateCallback((priceData) => {
        this.wsServer.broadcastPriceUpdate(priceData);
      });

      // Initialize controllers
      logger.info('Creating controllers...');
      const userController = new UserController(userService);
      const runController = new RunController(runService);
      const marketController = new MarketController(this.priceService);
      const authController = new AuthController(userService);

      // Initialize middleware
      logger.info('Creating auth middleware...');
      const authMiddleware = new AuthMiddleware(this.prisma);

      // Initialize routes
      logger.info('Creating routes...');
      const routes = createRoutes(userController, runController, marketController, authController, authMiddleware);
      
      this.app.use(`/api/${config.apiVersion}`, routes);

      // Root endpoint
      this.app.get('/', (req, res) => {
        res.json({
          success: true,
          message: 'Welcome to Instinct.fi API',
          version: config.apiVersion,
          documentation: `/api/${config.apiVersion}/docs`,
          health: `/api/${config.apiVersion}/health`,
        });
      });

      // WebSocket status endpoint
      this.app.get(`/api/${config.apiVersion}/ws/status`, (req, res) => {
        const driftStatus = driftService.getConnectionStatus();
        const wsStats = this.wsServer.getStats();
        
        res.json({
          success: true,
          data: {
            binanceWebSocket: driftStatus,
            appWebSocket: wsStats,
          },
        });
      });
      
      logger.info('Routes initialization complete');
    } catch (error) {
      logger.error('Failed during route initialization:', error);
      throw error;
    }
  }

  private initializeErrorHandling(): void {
    // Global error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error:', error);

      // Don't leak error details in production
      const isDevelopment = config.nodeEnv === 'development';
      
      res.status(error.statusCode || 500).json({
        success: false,
        error: isDevelopment ? error.message : 'Internal server error',
        ...(isDevelopment && { stack: error.stack }),
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });
  }

  public async start(): Promise<void> {
    try {
      console.log('📍 start() method called');
      
      // Connect to database
      console.log('Connecting to database...');
      await this.prisma.$connect();
      console.log('✅ Database connected');
      logger.info('Connected to database');

      // Start HTTP server
      console.log(`Starting HTTP server on port ${config.port}...`);
      const server = this.app.listen(config.port, () => {
        console.log(`✅ HTTP server listening on port ${config.port}`);
        logger.info(`HTTP server running on port ${config.port}`);
        logger.info(`Environment: ${config.nodeEnv}`);
        logger.info(`API Version: ${config.apiVersion}`);
      });
      console.log('✅ Server listen() called');

      // Start WebSocket server
      console.log('Starting WebSocket server...');
      this.wsServer.start(server);
      console.log('✅ WebSocket started');
      logger.info(`WebSocket server running on port ${config.port}`);

      // Start price monitoring service
      console.log('Starting price monitoring...');
      this.priceService.start();
      console.log('✅ Price monitoring started');
      logger.info('Price monitoring service started');

      // Graceful shutdown
      const gracefulShutdown = async (signal: string) => {
        logger.info(`Received ${signal}, shutting down gracefully`);
        
        // Stop run scheduler
        if (this.runScheduler) {
          this.runScheduler.stop();
        }
        
        // Stop price monitoring service
        this.priceService.stop();
        logger.info('Price monitoring service stopped');
        
        server.close(async () => {
          logger.info('HTTP server closed');
          
          await this.prisma.$disconnect();
          logger.info('Database connection closed');
          
          process.exit(0);
        });
      };

      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Start the application
console.log('Creating App instance...');
const app = new App();
console.log('✅ App instance created successfully!');

console.log('Calling app.start()...');
app.start().catch((error) => {
  console.error('❌ FATAL: Failed to start application:', error);
  logger.error('Failed to start application:', error);
  process.exit(1);
});

export default app;
