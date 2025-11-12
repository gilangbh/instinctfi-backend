import Joi from 'joi';
import { VoteChoice, RunStatus } from '@/types';

// User validation schemas
export const createUserSchema = Joi.object({
  walletAddress: Joi.string().required().min(32).max(44),
  username: Joi.string().required().min(3).max(20).alphanum(),
  email: Joi.string().email().optional(),
});

export const updateUserSchema = Joi.object({
  username: Joi.string().min(3).max(20).alphanum().optional(),
  email: Joi.string().email().optional(),
});

// Run validation schemas
export const createRunSchema = Joi.object({
  tradingPair: Joi.string().required().pattern(/^[A-Z]{2,10}\/[A-Z]{2,10}$/),
  coin: Joi.string().required().min(2).max(10),
  duration: Joi.number().integer().min(60).max(480).optional(), // 1-8 hours
  votingInterval: Joi.number().integer().min(5).max(60).optional(), // 5-60 minutes
  minDeposit: Joi.number().integer().min(10).max(100).optional(), // 10-100 USDC
  maxDeposit: Joi.number().integer().min(10).max(100).optional(), // 10-100 USDC
  maxParticipants: Joi.number().integer().min(10).max(100).optional(),
});

export const joinRunSchema = Joi.object({
  depositAmount: Joi.number().integer().min(10).max(100).required(), // 10-100 USDC
  walletSignature: Joi.string().min(16).max(200).optional(),
});

// Vote validation schemas
export const castVoteSchema = Joi.object({
  choice: Joi.string().valid(...Object.values(VoteChoice)).required(),
  round: Joi.number().integer().min(1).required(),
});

// Chat validation schemas
export const sendMessageSchema = Joi.object({
  message: Joi.string().required().min(1).max(500).trim(),
});

// Query parameter validation schemas
export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const runQuerySchema = Joi.object({
  status: Joi.string().valid(...Object.values(RunStatus)).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

// Validation middleware
export const validate = (schema: Joi.ObjectSchema) => {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message,
      });
    }
    req.body = value;
    next();
  };
};

export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message,
      });
    }
    req.query = value;
    next();
  };
};

// Custom validation functions
export const isValidWalletAddress = (address: string): boolean => {
  // Basic Solana wallet address validation
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
};

export const isValidTradingPair = (pair: string): boolean => {
  return /^[A-Z]{2,10}\/[A-Z]{2,10}$/.test(pair);
};

export const isValidDepositAmount = (amount: number): boolean => {
  return amount >= 10 && amount <= 100 && Number.isInteger(amount);
};

export const isValidVoteChoice = (choice: string): boolean => {
  return Object.values(VoteChoice).includes(choice as VoteChoice);
};

export const isValidRunStatus = (status: string): boolean => {
  return Object.values(RunStatus).includes(status as RunStatus);
};

