/**
 * Request Logger Middleware
 * 
 * Logs HTTP requests with timing, status codes, and contextual information.
 */

import { Request, Response, NextFunction } from 'express'
import { logger, logRequest, sanitizeLogData } from '../config/logger.js'
import { randomUUID } from 'crypto'

// ============================================
// Types
// ============================================

declare global {
  namespace Express {
    interface Request {
      id?: string
      startTime?: number
    }
  }
}

// ============================================
// Request ID Middleware
// ============================================

/**
 * Generate unique request ID for tracking
 */
export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Use existing request ID from header or generate new one
  req.id = req.headers['x-request-id'] as string || randomUUID()
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.id)
  
  // Legacy correlation ID header (for backwards compatibility)
  res.setHeader('X-Correlation-ID', req.id)
  
  next()
}

// ============================================
// Request Logger
// ============================================

/**
 * Log incoming HTTP requests
 */
export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Record start time
  req.startTime = Date.now()

  // Log request start (debug level)
  logger.debug('Incoming request', {
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  })

  // Listen for response finish
  res.on('finish', () => {
    const responseTime = Date.now() - (req.startTime || Date.now())
    
    // Prepare context
    const context: Record<string, any> = {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    }

    // Add user ID if available
    if ((req as any).user?.id) {
      context.userId = (req as any).user.id
    }

    // Add query params if present
    if (Object.keys(req.query).length > 0) {
      context.query = req.query
    }

    // Add request body for non-GET requests (sanitized)
    if (req.method !== 'GET' && req.body) {
      context.body = sanitizeLogData(req.body)
    }

    // Log the request
    logRequest(
      req.method,
      req.originalUrl,
      res.statusCode,
      responseTime,
      context
    )
  })

  next()
}

// ============================================
// Performance Logger
// ============================================

/**
 * Log slow requests (> threshold ms)
 */
export const slowRequestLogger = (threshold: number = 1000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now()

    res.on('finish', () => {
      const duration = Date.now() - startTime

      if (duration > threshold) {
        logger.warn('Slow request detected', {
          requestId: req.id,
          method: req.method,
          url: req.originalUrl,
          duration,
          threshold,
        })
      }
    })

    next()
  }
}

// ============================================
// Export
// ============================================

export default requestLogger
