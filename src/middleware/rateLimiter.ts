import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { config } from '@/utils/config';
import logger from '@/utils/logger';

/**
 * General rate limiter
 */
export const generalRateLimit = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: {
    success: false,
    error: 'Too many requests, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later',
    });
  },
});

/**
 * Strict rate limiter for sensitive operations
 */
export const strictRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per 15 minutes
  message: {
    success: false,
    error: 'Too many requests for this operation, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn(`Strict rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many requests for this operation, please try again later',
    });
  },
});

/**
 * Vote rate limiter - one vote per round per user
 */
export const voteRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes (voting window)
  max: 1, // 1 vote per 10 minutes
  keyGenerator: (req: Request) => {
    // Use user ID if authenticated, otherwise IP
    return req.user?.id || req.ip;
  },
  message: {
    success: false,
    error: 'You can only vote once per round',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn(`Vote rate limit exceeded for user: ${req.user?.id || req.ip}`);
    res.status(429).json({
      success: false,
      error: 'You can only vote once per round',
    });
  },
});

/**
 * Chat rate limiter
 */
export const chatRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 messages per minute
  keyGenerator: (req: Request) => {
    return req.user?.id || req.ip;
  },
  message: {
    success: false,
    error: 'Too many messages, please slow down',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn(`Chat rate limit exceeded for user: ${req.user?.id || req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many messages, please slow down',
    });
  },
});

/**
 * Join run rate limiter
 */
export const joinRunRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // 3 joins per 5 minutes
  keyGenerator: (req: Request) => {
    return req.user?.id || req.ip;
  },
  message: {
    success: false,
    error: 'Too many run joins, please wait before joining another run',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn(`Join run rate limit exceeded for user: ${req.user?.id || req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many run joins, please wait before joining another run',
    });
  },
});

/**
 * Create run rate limiter
 */
export const createRunRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 runs per hour
  keyGenerator: (req: Request) => {
    return req.user?.id || req.ip;
  },
  message: {
    success: false,
    error: 'Too many runs created, please wait before creating another run',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn(`Create run rate limit exceeded for user: ${req.user?.id || req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many runs created, please wait before creating another run',
    });
  },
});

