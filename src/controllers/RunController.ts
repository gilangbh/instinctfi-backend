import { Request, Response } from 'express';
import { RunService } from '@/services/RunService';
import { CreateRunRequest, JoinRunRequest, ApiResponse, PaginatedResponse } from '@/types';
import { validate, validateQuery } from '@/utils/validation';
import { createRunSchema, joinRunSchema, runQuerySchema, paginationSchema } from '@/utils/validation';
import logger from '@/utils/logger';

export class RunController {
  constructor(private runService: RunService) {}

  /**
   * Create a new run
   */
  createRun = async (req: Request, res: Response): Promise<void> => {
    try {
      const runData: CreateRunRequest = req.body;
      const run = await this.runService.createRun(runData);

      const response: ApiResponse = {
        success: true,
        data: run,
        message: 'Run created successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      logger.error('Error in createRun controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Get run by ID
   */
  getRunById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const run = await this.runService.getRunById(id);

      if (!run) {
        const response: ApiResponse = {
          success: false,
          error: 'Run not found',
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: run,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getRunById controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Get active runs
   */
  getActiveRuns = async (req: Request, res: Response): Promise<void> => {
    try {
      let runs = await this.runService.getActiveRuns();
      
      // Add countdown to each waiting run
      const lobbyDurationMs = (parseInt(process.env.LOBBY_DURATION_MINUTES || '10')) * 60 * 1000;
      runs = runs.map((run: any) => {
        if (run.status === 'WAITING' && run.countdown === null) {
          // Calculate countdown from createdAt
          const createdAt = new Date(run.createdAt);
          const scheduledStart = new Date(createdAt.getTime() + lobbyDurationMs);
          const timeUntilStart = scheduledStart.getTime() - Date.now();
          run.countdown = Math.max(0, Math.floor(timeUntilStart / 1000));
        }
        return run;
      });

      const response: ApiResponse = {
        success: true,
        data: runs,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getActiveRuns controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Get run history
   */
  getRunHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);

      const { runs, total } = await this.runService.getRunHistory(pageNum, limitNum);

      const response: PaginatedResponse<any> = {
        success: true,
        data: runs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getRunHistory controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Join a run
   */
  joinRun = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const joinData: JoinRunRequest = req.body;
      const userId = req.user?.id; // Assuming user is attached to request by auth middleware

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: 'User not authenticated',
        };
        res.status(401).json(response);
        return;
      }

      const participant = await this.runService.joinRun(id, userId, joinData);

      const response: ApiResponse = {
        success: true,
        data: participant,
        message: 'Successfully joined run',
      };

      res.status(201).json(response);
    } catch (error) {
      logger.error('Error in joinRun controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Leave a run
   */
  leaveRun = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: 'User not authenticated',
        };
        res.status(401).json(response);
        return;
      }

      await this.runService.leaveRun(id, userId);

      const response: ApiResponse = {
        success: true,
        message: 'Successfully left run',
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in leaveRun controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Start a run
   */
  startRun = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const run = await this.runService.startRun(id);

      const response: ApiResponse = {
        success: true,
        data: run,
        message: 'Run started successfully',
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in startRun controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Cast a vote
   */
  castVote = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { round, choice } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: 'User not authenticated',
        };
        res.status(401).json(response);
        return;
      }

      await this.runService.castVote(id, userId, round, choice);

      const response: ApiResponse = {
        success: true,
        message: 'Vote cast successfully',
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in castVote controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Get run participants
   */
  getRunParticipants = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const participants = await this.runService.getRunParticipants(id);

      const response: ApiResponse = {
        success: true,
        data: participants,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getRunParticipants controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Get run trades
   */
  getRunTrades = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const trades = await this.runService.getRunTrades(id);

      const response: ApiResponse = {
        success: true,
        data: trades,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getRunTrades controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Get unrealized PnL for an open trade
   */
  getUnrealizedPnL = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id, round } = req.params;
      const roundNum = parseInt(round, 10);
      
      if (isNaN(roundNum)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid round number',
        };
        res.status(400).json(response);
        return;
      }

      const unrealizedPnL = await this.runService.getUnrealizedPnL(id, roundNum);

      const response: ApiResponse = {
        success: true,
        data: {
          unrealizedPnL,
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getUnrealizedPnL controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Get current voting round
   */
  getCurrentVotingRound = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const votingRound = await this.runService.getCurrentVotingRound(id);

      if (!votingRound) {
        const response: ApiResponse = {
          success: false,
          error: 'No active voting round found',
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: votingRound,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getCurrentVotingRound controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * End a run
   */
  endRun = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const run = await this.runService.endRun(id);

      const response: ApiResponse = {
        success: true,
        data: run,
        message: 'Run ended successfully',
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in endRun controller:', error);
      this.handleError(error, res);
    }
  };

  /**
   * Handle errors
   */
  private handleError(error: any, res: Response): void {
    if (error.statusCode) {
      const response: ApiResponse = {
        success: false,
        error: error.message,
      };
      res.status(error.statusCode).json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        error: 'Internal server error',
      };
      res.status(500).json(response);
    }
  }
}

