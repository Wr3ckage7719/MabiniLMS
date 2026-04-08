import rateLimit from 'express-rate-limit';
import { ApiResponse, ErrorCode } from '../types/index.js';

// General API rate limiter - 100 requests per 15 minutes
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many requests, please try again later',
      },
    };
    res.status(429).json(response);
  },
});

// Strict rate limiter for authentication endpoints - 5 requests per 15 minutes
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many login attempts, please try again later',
      },
    };
    res.status(429).json(response);
  },
});

// Admin operations rate limiter - 50 requests per 15 minutes
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many admin requests, please try again later',
      },
    };
    res.status(429).json(response);
  },
});

// Batch operations rate limiter - 10 requests per hour
export const batchLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many bulk operations, please try again later',
      },
    };
    res.status(429).json(response);
  },
});

// Export/Download rate limiter - 20 requests per hour
export const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many export requests, please try again later',
      },
    };
    res.status(429).json(response);
  },
});

// Search rate limiter - 30 requests per minute (more lenient for UX)
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many search requests, please slow down',
      },
    };
    res.status(429).json(response);
  },
});

// File upload rate limiter - 50 uploads per hour
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many uploads, please try again later',
      },
    };
    res.status(429).json(response);
  },
});
