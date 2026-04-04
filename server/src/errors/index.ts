/**
 * Error Module Index
 * 
 * Exports all error classes, factory functions, and type guards.
 */

export {
  // Base error
  AppError,
  
  // Specific error classes
  ValidationError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalError,
  ServiceUnavailableError,
  BusinessLogicError,
  DatabaseError,
  ExternalAPIError,
  
  // Factory functions
  createValidationError,
  createNotFoundError,
  createConflictError,
  createForbiddenError,
  
  // Type guards
  isAppError,
  isOperationalError,
  isValidationError,
  isAuthenticationError,
  isForbiddenError,
  isNotFoundError,
  isConflictError,
  isRateLimitError,
  
  // Constants
  ERROR_CODES,
} from './AppError.js'

// Type exports
export type { ErrorMetadata, ErrorCode } from './AppError.js'
