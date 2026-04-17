/**
 * Error Handler Middleware
 * 
 * Centralized error handling for Express applications.
 * Handles both operational errors and unexpected errors.
 */

import { Request, Response, NextFunction } from 'express'
import { AppError, isAppError, isOperationalError } from '../errors/AppError.js'
import { logger, logError, sanitizeLogData } from '../config/logger.js'
import { ZodError } from 'zod'
import { ApiError } from '../types/index.js'

// ============================================
// Types
// ============================================

interface ErrorResponse {
  success: false
  error: {
    message: string
    code: string
    statusCode: number
    metadata?: Record<string, any>
    stack?: string
  }
  requestId?: string
}

// ============================================
// Environment
// ============================================

const isDevelopment = process.env.NODE_ENV !== 'production'

const toHttpStatusCode = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  const normalized = Math.trunc(value)
  if (normalized < 400 || normalized > 599) {
    return null
  }

  return normalized
}

// ============================================
// Error Handler
// ============================================

/**
 * Main error handling middleware
 * Must be registered last in middleware chain
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // If response already sent, delegate to default error handler
  if (res.headersSent) {
    return next(err)
  }

  // Convert known error types to AppError
  const error = normalizeError(err)

  // Log the error
  logErrorWithContext(error, req)

  // Send error response
  const response = formatErrorResponse(error, req)
  res.status(error.statusCode).json(response)
}

// ============================================
// Error Normalization
// ============================================

/**
 * Convert various error types to AppError
 */
const normalizeError = (err: any): AppError => {
  // Already an AppError
  if (isAppError(err)) {
    return err
  }

  // Legacy ApiError (from types/index.ts)
  if (err instanceof ApiError) {
    return new AppError(
      err.message,
      err.statusCode,
      err.code,
      true,
      err.details ? { details: err.details } : undefined
    )
  }

  // Zod validation error
  if (err instanceof ZodError) {
    return convertZodError(err)
  }

  // Supabase/PostgreSQL errors
  if (err.code && typeof err.code === 'string') {
    const supabaseError = convertSupabaseError(err)
    if (supabaseError) return supabaseError
  }

  // Preserve explicit HTTP status errors from lower-level middleware (for example body-parser 413).
  const explicitStatusCode = toHttpStatusCode(err?.statusCode) || toHttpStatusCode(err?.status)
  if (explicitStatusCode) {
    const isPayloadTooLarge = explicitStatusCode === 413 || err?.type === 'entity.too.large'
    return new AppError(
      isPayloadTooLarge
        ? 'Request payload is too large. Please upload a smaller image.'
        : err.message || 'Request could not be processed',
      explicitStatusCode,
      isPayloadTooLarge ? 'PAYLOAD_TOO_LARGE' : explicitStatusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
      explicitStatusCode < 500,
      {
        type: err?.type,
      }
    )
  }

  // Generic Error to AppError
  return new AppError(
    err.message || 'Internal server error',
    500,
    'INTERNAL_ERROR',
    false
  )
}

/**
 * Convert Zod validation error to ValidationError
 */
const convertZodError = (error: ZodError): AppError => {
  const fields: Record<string, string[]> = {}

  error.errors.forEach((err) => {
    const path = err.path.join('.')
    if (!fields[path]) {
      fields[path] = []
    }
    fields[path].push(err.message)
  })

  return new AppError(
    'Validation failed',
    400,
    'VALIDATION_ERROR',
    true,
    { fields }
  )
}

/**
 * Convert Supabase/PostgreSQL errors to appropriate AppError
 */
const convertSupabaseError = (err: any): AppError | null => {
  const code = err.code

  // Unique constraint violation
  if (code === '23505') {
    return new AppError(
      'Resource already exists',
      409,
      'CONFLICT_ERROR',
      true,
      { detail: err.detail }
    )
  }

  // Foreign key violation
  if (code === '23503') {
    return new AppError(
      'Referenced resource not found',
      400,
      'VALIDATION_ERROR',
      true,
      { detail: err.detail }
    )
  }

  // Not null violation
  if (code === '23502') {
    return new AppError(
      'Required field missing',
      400,
      'VALIDATION_ERROR',
      true,
      { detail: err.detail }
    )
  }

  return null
}

// ============================================
// Error Logging
// ============================================

/**
 * Log error with request context
 */
const logErrorWithContext = (error: AppError, req: Request) => {
  const context = {
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: (req as any).user?.id,
    errorCode: error.errorCode,
    statusCode: error.statusCode,
    metadata: error.metadata,
  }

  // Sanitize request body
  const sanitizedBody = sanitizeLogData(req.body)

  logError(error, {
    ...context,
    body: sanitizedBody,
  })

  // Log stack trace for non-operational errors
  if (!isOperationalError(error) && error.stack) {
    logger.error('Stack trace:', { stack: error.stack })
  }
}

// ============================================
// Response Formatting
// ============================================

/**
 * Format error response based on environment
 */
const formatErrorResponse = (error: AppError, req: Request): ErrorResponse => {
  const response: ErrorResponse = {
    success: false,
    error: {
      message: error.message,
      code: error.errorCode,
      statusCode: error.statusCode,
    },
  }

  // Add request ID if available
  if (req.id) {
    response.requestId = req.id
  }

  // Add metadata in development or for operational errors
  if (isDevelopment || isOperationalError(error)) {
    if (error.metadata) {
      response.error.metadata = error.metadata
    }
  }

  // Add stack trace in development only
  if (isDevelopment && error.stack) {
    response.error.stack = error.stack
  }

  // For non-operational errors in production, use generic message
  if (!isDevelopment && !isOperationalError(error)) {
    response.error.message = 'An unexpected error occurred'
  }

  return response
}

// ============================================
// 404 Handler
// ============================================

/**
 * Handle 404 Not Found
 * Must be registered after all routes
 */
export const notFoundHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const error = new AppError(
    `Route ${req.method} ${req.originalUrl} not found`,
    404,
    'NOT_FOUND_ERROR',
    true,
    {
      method: req.method,
      path: req.originalUrl,
    }
  )

  next(error)
}

// ============================================
// Async Handler Wrapper
// ============================================

/**
 * Wrap async route handlers to catch errors
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

// ============================================
// Export
// ============================================

export default errorHandler
