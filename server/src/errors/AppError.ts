/**
 * Custom Error Classes
 * 
 * Provides a hierarchy of error classes for consistent error handling
 * across the application.
 */

// ============================================
// Base Error Class
// ============================================

export interface ErrorMetadata {
  [key: string]: any
}

export class AppError extends Error {
  public readonly statusCode: number
  public readonly errorCode: string
  public readonly isOperational: boolean
  public readonly metadata?: ErrorMetadata

  constructor(
    message: string,
    statusCode: number = 500,
    errorCode: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    metadata?: ErrorMetadata
  ) {
    super(message)
    
    this.statusCode = statusCode
    this.errorCode = errorCode
    this.isOperational = isOperational
    this.metadata = metadata

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor)
    
    // Set the prototype explicitly for proper instanceof checks
    Object.setPrototypeOf(this, AppError.prototype)
  }

  toJSON() {
    return {
      error: {
        message: this.message,
        code: this.errorCode,
        statusCode: this.statusCode,
        ...(this.metadata && { metadata: this.metadata }),
      },
    }
  }
}

// ============================================
// Specific Error Classes
// ============================================

/**
 * 400 Bad Request - Validation errors
 */
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', metadata?: ErrorMetadata) {
    super(message, 400, 'VALIDATION_ERROR', true, metadata)
    Object.setPrototypeOf(this, ValidationError.prototype)
  }
}

/**
 * 401 Unauthorized - Authentication required
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', metadata?: ErrorMetadata) {
    super(message, 401, 'AUTHENTICATION_ERROR', true, metadata)
    Object.setPrototypeOf(this, AuthenticationError.prototype)
  }
}

/**
 * 403 Forbidden - Insufficient permissions
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access forbidden', metadata?: ErrorMetadata) {
    super(message, 403, 'FORBIDDEN_ERROR', true, metadata)
    Object.setPrototypeOf(this, ForbiddenError.prototype)
  }
}

/**
 * 404 Not Found - Resource not found
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', metadata?: ErrorMetadata) {
    super(message, 404, 'NOT_FOUND_ERROR', true, metadata)
    Object.setPrototypeOf(this, NotFoundError.prototype)
  }
}

/**
 * 409 Conflict - Resource conflict (e.g., duplicate entry)
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict', metadata?: ErrorMetadata) {
    super(message, 409, 'CONFLICT_ERROR', true, metadata)
    Object.setPrototypeOf(this, ConflictError.prototype)
  }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitError extends AppError {
  constructor(
    message: string = 'Rate limit exceeded',
    retryAfter?: number,
    metadata?: ErrorMetadata
  ) {
    const meta = { ...metadata, ...(retryAfter && { retryAfter }) }
    super(message, 429, 'RATE_LIMIT_ERROR', true, meta)
    Object.setPrototypeOf(this, RateLimitError.prototype)
  }
}

/**
 * 500 Internal Server Error - Unexpected errors
 */
export class InternalError extends AppError {
  constructor(message: string = 'Internal server error', metadata?: ErrorMetadata) {
    super(message, 500, 'INTERNAL_ERROR', false, metadata)
    Object.setPrototypeOf(this, InternalError.prototype)
  }
}

/**
 * 503 Service Unavailable - External service failure
 */
export class ServiceUnavailableError extends AppError {
  constructor(
    message: string = 'Service temporarily unavailable',
    metadata?: ErrorMetadata
  ) {
    super(message, 503, 'SERVICE_UNAVAILABLE_ERROR', true, metadata)
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype)
  }
}

/**
 * 422 Unprocessable Entity - Business logic validation error
 */
export class BusinessLogicError extends AppError {
  constructor(message: string = 'Business logic validation failed', metadata?: ErrorMetadata) {
    super(message, 422, 'BUSINESS_LOGIC_ERROR', true, metadata)
    Object.setPrototypeOf(this, BusinessLogicError.prototype)
  }
}

/**
 * Database-specific errors
 */
export class DatabaseError extends AppError {
  constructor(message: string = 'Database error', metadata?: ErrorMetadata) {
    super(message, 500, 'DATABASE_ERROR', false, metadata)
    Object.setPrototypeOf(this, DatabaseError.prototype)
  }
}

/**
 * External API errors
 */
export class ExternalAPIError extends AppError {
  constructor(
    message: string = 'External API error',
    service?: string,
    metadata?: ErrorMetadata
  ) {
    const meta = { ...metadata, ...(service && { service }) }
    super(message, 502, 'EXTERNAL_API_ERROR', true, meta)
    Object.setPrototypeOf(this, ExternalAPIError.prototype)
  }
}

// ============================================
// Error Factory Functions
// ============================================

/**
 * Create a validation error with field-specific details
 */
export const createValidationError = (
  fieldErrors: Record<string, string | string[]>
) => {
  const errorCount = Object.keys(fieldErrors).length
  const message = `Validation failed for ${errorCount} field${errorCount === 1 ? '' : 's'}`
  
  return new ValidationError(message, { fields: fieldErrors })
}

/**
 * Create a not found error for a specific resource
 */
export const createNotFoundError = (
  resourceType: string,
  identifier?: string | number
) => {
  const message = identifier
    ? `${resourceType} with identifier '${identifier}' not found`
    : `${resourceType} not found`
  
  return new NotFoundError(message, { resourceType, identifier })
}

/**
 * Create a conflict error for duplicate resources
 */
export const createConflictError = (
  resourceType: string,
  field?: string,
  value?: any
) => {
  const message = field
    ? `${resourceType} with ${field} '${value}' already exists`
    : `${resourceType} already exists`
  
  return new ConflictError(message, { resourceType, field, value })
}

/**
 * Create a forbidden error for permission issues
 */
export const createForbiddenError = (
  action: string,
  resource: string
) => {
  return new ForbiddenError(
    `You do not have permission to ${action} this ${resource}`,
    { action, resource }
  )
}

// ============================================
// Error Type Guards
// ============================================

export const isAppError = (error: any): error is AppError => {
  return error instanceof AppError
}

export const isOperationalError = (error: any): boolean => {
  return isAppError(error) && error.isOperational
}

export const isValidationError = (error: any): error is ValidationError => {
  return error instanceof ValidationError
}

export const isAuthenticationError = (error: any): error is AuthenticationError => {
  return error instanceof AuthenticationError
}

export const isForbiddenError = (error: any): error is ForbiddenError => {
  return error instanceof ForbiddenError
}

export const isNotFoundError = (error: any): error is NotFoundError => {
  return error instanceof NotFoundError
}

export const isConflictError = (error: any): error is ConflictError => {
  return error instanceof ConflictError
}

export const isRateLimitError = (error: any): error is RateLimitError => {
  return error instanceof RateLimitError
}

// ============================================
// Error Code Constants
// ============================================

export const ERROR_CODES = {
  // Client errors (4xx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  FORBIDDEN_ERROR: 'FORBIDDEN_ERROR',
  NOT_FOUND_ERROR: 'NOT_FOUND_ERROR',
  CONFLICT_ERROR: 'CONFLICT_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  BUSINESS_LOGIC_ERROR: 'BUSINESS_LOGIC_ERROR',
  
  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
  SERVICE_UNAVAILABLE_ERROR: 'SERVICE_UNAVAILABLE_ERROR',
} as const

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]
