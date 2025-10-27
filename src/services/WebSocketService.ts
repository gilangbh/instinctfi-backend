import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { config } from '@/utils/config';
import logger from '@/utils/logger';
import { WebSocketMessage, WebSocketMessageType, RunUpdateMessage, VoteUpdateMessage, TradeUpdateMessage, ChatMessageUpdateMessage, PriceUpdateMessage } from '@/types';

export class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocket> = new Map();
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
  private runSubscriptions: Map<string, Set<string>> = new Map(); // runId -> Set of socketIds

  public start(server: Server): void {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
    });

    this.wss.on('connection', (ws: WebSocket, req) => {
      const socketId = this.generateSocketId();
      this.clients.set(socketId, ws);

      logger.info(`WebSocket client connected: ${socketId}`);

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(socketId, message);
        } catch (error) {
          logger.error('Error parsing WebSocket message:', error);
          this.sendError(socketId, 'Invalid message format');
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(socketId);
      });

      ws.on('error', (error) => {
        logger.error(`WebSocket error for client ${socketId}:`, error);
        this.handleDisconnect(socketId);
      });

      // Send welcome message
      this.sendMessage(socketId, {
        type: WebSocketMessageType.RUN_UPDATE,
        data: {
          message: 'Connected to Instinct.fi WebSocket',
          timestamp: new Date(),
        },
      });
    });

    logger.info('WebSocket server started');
  }

  private handleMessage(socketId: string, message: any): void {
    try {
      switch (message.type) {
        case 'AUTHENTICATE':
          this.handleAuthentication(socketId, message.data);
          break;
        case 'SUBSCRIBE_RUN':
          this.handleRunSubscription(socketId, message.data);
          break;
        case 'UNSUBSCRIBE_RUN':
          this.handleRunUnsubscription(socketId, message.data);
          break;
        case 'PING':
          this.sendMessage(socketId, { type: 'PONG', data: { timestamp: new Date() } });
          break;
        default:
          logger.warn(`Unknown message type: ${message.type}`);
          this.sendError(socketId, 'Unknown message type');
      }
    } catch (error) {
      logger.error('Error handling WebSocket message:', error);
      this.sendError(socketId, 'Error processing message');
    }
  }

  private handleAuthentication(socketId: string, data: any): void {
    const { userId } = data;
    
    if (!userId) {
      this.sendError(socketId, 'User ID required for authentication');
      return;
    }

    // Add socket to user's socket set
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);

    logger.info(`User ${userId} authenticated on socket ${socketId}`);
    
    this.sendMessage(socketId, {
      type: 'AUTHENTICATED',
      data: { userId, timestamp: new Date() },
    });
  }

  private handleRunSubscription(socketId: string, data: any): void {
    const { runId } = data;
    
    if (!runId) {
      this.sendError(socketId, 'Run ID required for subscription');
      return;
    }

    // Add socket to run's subscription set
    if (!this.runSubscriptions.has(runId)) {
      this.runSubscriptions.set(runId, new Set());
    }
    this.runSubscriptions.get(runId)!.add(socketId);

    logger.info(`Socket ${socketId} subscribed to run ${runId}`);
    
    this.sendMessage(socketId, {
      type: 'SUBSCRIBED',
      data: { runId, timestamp: new Date() },
    });
  }

  private handleRunUnsubscription(socketId: string, data: any): void {
    const { runId } = data;
    
    if (runId && this.runSubscriptions.has(runId)) {
      this.runSubscriptions.get(runId)!.delete(socketId);
      logger.info(`Socket ${socketId} unsubscribed from run ${runId}`);
    }
  }

  private handleDisconnect(socketId: string): void {
    // Remove from clients
    this.clients.delete(socketId);

    // Remove from user sockets
    for (const [userId, sockets] of this.userSockets.entries()) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }

    // Remove from run subscriptions
    for (const [runId, sockets] of this.runSubscriptions.entries()) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.runSubscriptions.delete(runId);
      }
    }

    logger.info(`WebSocket client disconnected: ${socketId}`);
  }

  private sendMessage(socketId: string, message: WebSocketMessage): void {
    const ws = this.clients.get(socketId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error(`Error sending message to socket ${socketId}:`, error);
        this.handleDisconnect(socketId);
      }
    }
  }

  private sendError(socketId: string, error: string): void {
    this.sendMessage(socketId, {
      type: WebSocketMessageType.ERROR,
      data: { error, timestamp: new Date() },
    });
  }

  private generateSocketId(): string {
    return `socket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public methods for broadcasting updates

  /**
   * Broadcast run update to all subscribers of the run
   */
  public broadcastRunUpdate(runId: string, update: RunUpdateMessage['data']): void {
    const subscribers = this.runSubscriptions.get(runId);
    if (subscribers) {
      const message: RunUpdateMessage = {
        type: WebSocketMessageType.RUN_UPDATE,
        data: update,
        timestamp: new Date(),
      };

      subscribers.forEach(socketId => {
        this.sendMessage(socketId, message);
      });

      logger.info(`Broadcasted run update to ${subscribers.size} subscribers for run ${runId}`);
    }
  }

  /**
   * Broadcast vote update to all subscribers of the run
   */
  public broadcastVoteUpdate(runId: string, update: VoteUpdateMessage['data']): void {
    const subscribers = this.runSubscriptions.get(runId);
    if (subscribers) {
      const message: VoteUpdateMessage = {
        type: WebSocketMessageType.VOTE_UPDATE,
        data: update,
        timestamp: new Date(),
      };

      subscribers.forEach(socketId => {
        this.sendMessage(socketId, message);
      });

      logger.info(`Broadcasted vote update to ${subscribers.size} subscribers for run ${runId}`);
    }
  }

  /**
   * Broadcast trade update to all subscribers of the run
   */
  public broadcastTradeUpdate(runId: string, update: TradeUpdateMessage['data']): void {
    const subscribers = this.runSubscriptions.get(runId);
    if (subscribers) {
      const message: TradeUpdateMessage = {
        type: WebSocketMessageType.TRADE_UPDATE,
        data: update,
        timestamp: new Date(),
      };

      subscribers.forEach(socketId => {
        this.sendMessage(socketId, message);
      });

      logger.info(`Broadcasted trade update to ${subscribers.size} subscribers for run ${runId}`);
    }
  }

  /**
   * Broadcast chat message to all subscribers of the run
   */
  public broadcastChatMessage(runId: string, update: ChatMessageUpdateMessage['data']): void {
    const subscribers = this.runSubscriptions.get(runId);
    if (subscribers) {
      const message: ChatMessageUpdateMessage = {
        type: WebSocketMessageType.CHAT_MESSAGE,
        data: update,
        timestamp: new Date(),
      };

      subscribers.forEach(socketId => {
        this.sendMessage(socketId, message);
      });

      logger.info(`Broadcasted chat message to ${subscribers.size} subscribers for run ${runId}`);
    }
  }

  /**
   * Broadcast price update to all subscribers
   */
  public broadcastPriceUpdate(update: PriceUpdateMessage['data']): void {
    const message: PriceUpdateMessage = {
      type: WebSocketMessageType.PRICE_UPDATE,
      data: update,
      timestamp: new Date(),
    };

    this.clients.forEach((ws, socketId) => {
      this.sendMessage(socketId, message);
    });

    logger.info(`Broadcasted price update to ${this.clients.size} clients`);
  }

  /**
   * Send message to specific user
   */
  public sendToUser(userId: string, message: WebSocketMessage): void {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.forEach(socketId => {
        this.sendMessage(socketId, message);
      });
    }
  }

  /**
   * Get connection statistics
   */
  public getStats(): {
    totalClients: number;
    totalUsers: number;
    totalRunSubscriptions: number;
  } {
    return {
      totalClients: this.clients.size,
      totalUsers: this.userSockets.size,
      totalRunSubscriptions: this.runSubscriptions.size,
    };
  }
}

