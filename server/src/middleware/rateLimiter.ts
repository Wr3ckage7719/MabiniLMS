import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { Redis } from 'ioredis';
import { Request, Response } from 'express';
import { ApiResponse, ErrorCode } from '../types/index.js';
import logger from '../utils/logger.js';

const redisUrl = (process.env.REDIS_URL || '').trim();
const isProduction = process.env.NODE_ENV === 'production';
const redisClient = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: true,
    })
  : null;

if (redisClient) {
  redisClient.on('connect', () => {
    logger.info('Redis-backed rate limiting enabled');
  });

  redisClient.on('error', (error: unknown) => {
    logger.error('Redis rate limiter client error', {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

const buildStore = (prefix: string) => {
  if (!redisClient) {
    return undefined;
  }

  return new RedisStore({
    sendCommand: (...args: string[]) =>
      redisClient.call(args[0], ...args.slice(1)) as Promise<any>,
    prefix: `mabinilms:rate-limit:${prefix}:`,
  });
};

const createLimiter = (
  prefix: string,
  options: Omit<Parameters<typeof rateLimit>[0], 'store'>
) => {
  return rateLimit({
    ...options,
    // Avoid turning Redis outages into full API outages.
    passOnStoreError: true,
    ...(redisClient ? { store: buildStore(prefix) } : {}),
  });
};

const createRateLimitHandler = (message: string) => {
  return (_req: Request, res: Response) => {
    const response: ApiResponse = {
      success: false,
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message,
      },
    };
    res.status(429).json(response);
  };
};

// General API rate limiter - 300 requests per 15 minutes
export const apiLimiter = createLimiter('api', {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  handler: createRateLimitHandler('Too many requests, please try again later'),
});

// Strict rate limiter for authentication endpoints - 5 requests per 15 minutes
export const authLimiter = createLimiter('auth', {
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 5 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: createRateLimitHandler('Too many login attempts, please try again later'),
});

// Endpoint-specific auth limiters
export const signupLimiter = createLimiter('signup', {
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 6 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  // Count all requests for signup-style flows to reduce abuse and email spam.
  skipSuccessfulRequests: false,
  handler: createRateLimitHandler('Too many signup requests. Please try again later.'),
});

export const studentSignupLimiter = createLimiter('student-signup', {
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 4 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: createRateLimitHandler('Too many account setup requests. Please try again later.'),
});

export const loginLimiter = createLimiter('login', {
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 5 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: createRateLimitHandler('Too many login attempts, please try again later'),
});

export const forgotPasswordLimiter = createLimiter('forgot-password', {
  windowMs: 60 * 60 * 1000,
  max: isProduction ? 8 : 160,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: createRateLimitHandler('Too many password reset requests. Please try again later.'),
});

export const verificationEmailLimiter = createLimiter('verification-email', {
  windowMs: 60 * 60 * 1000,
  max: isProduction ? 8 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: createRateLimitHandler('Too many verification requests. Please try again later.'),
});

// Google OAuth endpoints rate limiter - 20 requests per 15 minutes
export const googleOAuthLimiter = createLimiter('google-oauth', {
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many Google OAuth requests, please try again later'),
});

// Admin operations rate limiter - 50 requests per 15 minutes
export const adminLimiter = createLimiter('admin', {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 50 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many admin requests, please try again later'),
});

// Batch operations rate limiter - 10 requests per hour
export const batchLimiter = createLimiter('batch', {
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many bulk operations, please try again later'),
});

// Export/Download rate limiter - 20 requests per hour
export const exportLimiter = createLimiter('export', {
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many export requests, please try again later'),
});

// Search rate limiter - 30 requests per minute (more lenient for UX)
export const searchLimiter = createLimiter('search', {
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many search requests, please slow down'),
});

// File upload rate limiter - 50 uploads per hour
export const uploadLimiter = createLimiter('upload', {
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many uploads, please try again later'),
});
