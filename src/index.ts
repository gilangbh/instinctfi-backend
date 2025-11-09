import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { PrismaClient } from '@prisma/client';
import { config } from '@/utils/config';
import { morganStream } from '@/utils/logger';
import logger from '@/utils/logger';
import '@/types'; // Import types to ensure Request extension is loaded

// Import services and controllers
import { UserService } from '@/services/UserService';
import { RunService } from '@/services/RunService';
import { RunSchedulerService } from '@/services/RunSchedulerService';
import { DriftService } from '@/services/DriftService';
import { WaitlistService } from '@/services/WaitlistService';
import { PriceService } from '@/services/PriceService';
import { UserController } from '@/controllers/UserController';
import { RunController } from '@/controllers/RunController';
import { MarketController } from '@/controllers/MarketController';
import { AuthController } from '@/controllers/AuthController';
import { WaitlistController } from '@/controllers/WaitlistController';
import { AuthMiddleware } from '@/middleware/auth';
import { createRoutes } from '@/routes';

// Import WebSocket server
import { WebSocketService } from '@/services/WebSocketService';

class App {
  public app: express.Application;
  private prisma: PrismaClient;
  private wsServer: WebSocketService;
  private priceService: PriceService;
  private runScheduler: RunSchedulerService | null = null;

  constructor() {
    this.app = express();
    this.prisma = new PrismaClient();
    this.wsServer = new WebSocketService();
    this.priceService = new PriceService(this.prisma, this.wsServer);
    
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
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
    // Initialize services
    const userService = new UserService(this.prisma);
    const runService = new RunService(this.prisma);
    const driftService = new DriftService();
    const waitlistService = new WaitlistService();

    // Initialize and start run scheduler
    this.runScheduler = new RunSchedulerService(this.prisma, runService);
    this.runScheduler.start();

    // Connect DriftService price updates to WebSocket broadcasts
    driftService.setPriceUpdateCallback((priceData) => {
      this.wsServer.broadcastPriceUpdate(priceData);
    });

    // Initialize controllers
    const userController = new UserController(userService);
    const runController = new RunController(runService);
    const marketController = new MarketController(this.priceService);
    const authController = new AuthController(userService);
    const waitlistController = new WaitlistController(waitlistService);

    // Initialize middleware
    const authMiddleware = new AuthMiddleware(this.prisma);

    // Initialize routes
    const routes = createRoutes(
      userController,
      runController,
      marketController,
      authController,
      waitlistController,
      authMiddleware
    );
    
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
      // Connect to database
      await this.prisma.$connect();
      logger.info('Connected to database');

      // Start HTTP server
      const server = this.app.listen(config.port, () => {
        logger.info(`HTTP server running on port ${config.port}`);
        logger.info(`Environment: ${config.nodeEnv}`);
        logger.info(`API Version: ${config.apiVersion}`);
      });

      // Start WebSocket server
      this.wsServer.start(server);
      logger.info(`WebSocket server running on port ${config.port}`);

      // Start price monitoring service
      this.priceService.start();
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
const app = new App();
app.start().catch((error) => {
  logger.error('Failed to start application:', error);
  process.exit(1);
});

export default app;
