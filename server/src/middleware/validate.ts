/**
 * Validation Middleware
 * 
 * Provides reusable middleware for validating request data
 * using Zod schemas with proper error handling.
 */

import { Request, Response, NextFunction } from 'express'
import { ZodSchema, ZodError, z } from 'zod'
import { ValidationError } from '../errors/AppError.js'
import { sanitizeObject, sanitizeString } from '../utils/sanitize.js'

// ============================================
// Types
// ============================================

type ValidationTarget = 'body' | 'query' | 'params'

interface ValidationOptions {
  /** Strip unknown fields (default: true for body, false for query/params) */
  stripUnknown?: boolean
  /** Sanitize string inputs (default: true) */
  sanitize?: boolean
  /** Custom error message */
  errorMessage?: string
}

// ============================================
// Main Validation Middleware
// ============================================

/**
 * Create combined validator for multiple targets
 */
export const validate = (config: {
  body?: ZodSchema
  query?: ZodSchema
  params?: ZodSchema
  options?: ValidationOptions
}) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const opts = config.options || {}

      // Validate params first (usually IDs that other validations might reference)
      if (config.params) {
        req.params = await validateData(config.params, req.params, {
          sanitize: false,
          ...opts,
        })
      }

      // Validate query
      if (config.query) {
        req.query = await validateData(config.query, req.query, {
          sanitize: true,
          ...opts,
        }) as any
      }

      // Validate body
      if (config.body) {
        req.body = await validateData(config.body, req.body, {
          stripUnknown: true,
          sanitize: true,
          ...opts,
        })
      }

      next()
    } catch (error) {
      next(error)
    }
  }
}

// ============================================
// Single-Target Validators
// ============================================

/**
 * Create validation middleware for request body
 */
export const validateBody = <T>(
  schema: ZodSchema<T>,
  options: ValidationOptions = {}
) => {
  return createValidator('body', schema, {
    stripUnknown: true,
    sanitize: true,
    ...options,
  })
}

/**
 * Create validation middleware for query parameters
 */
export const validateQuery = <T>(
  schema: ZodSchema<T>,
  options: ValidationOptions = {}
) => {
  return createValidator('query', schema, {
    stripUnknown: false,
    sanitize: true,
    ...options,
  })
}

/**
 * Create validation middleware for route parameters
 */
export const validateParams = <T>(
  schema: ZodSchema<T>,
  options: ValidationOptions = {}
) => {
  return createValidator('params', schema, {
    stripUnknown: false,
    sanitize: false,
    ...options,
  })
}

// ============================================
// Internal Helpers
// ============================================

/**
 * Create validator middleware for specific target
 */
const createValidator = <T>(
  target: ValidationTarget,
  schema: ZodSchema<T>,
  options: ValidationOptions
) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const data = req[target]
      const validated = await validateData(schema, data, options)

      // Replace request data with validated data
      ;(req as any)[target] = validated

      next()
    } catch (error) {
      next(error)
    }
  }
}

/**
 * Validate and optionally sanitize data
 */
const validateData = async <T>(
  schema: ZodSchema<T>,
  data: any,
  options: ValidationOptions
): Promise<T> => {
  // Sanitize input strings if enabled
  let processedData = data
  if (options.sanitize && data && typeof data === 'object') {
    processedData = sanitizeObject(data, sanitizeString)
  }

  // Parse with Zod
  const result = await schema.safeParseAsync(processedData)

  if (!result.success) {
    throw convertZodToValidationError(result.error, options.errorMessage)
  }

  return result.data
}

/**
 * Convert Zod error to ValidationError
 */
const convertZodToValidationError = (
  zodError: ZodError,
  customMessage?: string
): ValidationError => {
  const fields: Record<string, string[]> = {}

  zodError.errors.forEach((err) => {
    const path = err.path.length > 0 ? err.path.join('.') : 'value'
    if (!fields[path]) {
      fields[path] = []
    }
    fields[path].push(err.message)
  })

  const fieldCount = Object.keys(fields).length
  const message =
    customMessage ||
    `Validation failed for ${fieldCount} field${fieldCount === 1 ? '' : 's'}`

  return new ValidationError(message, { fields })
}

// ============================================
// Utility Validators
// ============================================

/**
 * Validate UUID parameter
 */
export const validateUUID = (paramName: string = 'id') => {
  return validateParams(
    z.object({
      [paramName]: z.string().uuid(`Invalid ${paramName} format`),
    })
  )
}

/**
 * Validate pagination query parameters
 */
export const validatePagination = (defaults?: { page?: number; limit?: number }) => {
  return validateQuery(
    z.object({
      page: z.coerce.number().int().min(1).default(defaults?.page || 1),
      limit: z.coerce.number().int().min(1).max(100).default(defaults?.limit || 10),
    })
  )
}

/**
 * Require specific fields in body
 */
export const requireFields = (...fields: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const missing = fields.filter((field) => !(field in req.body))

    if (missing.length > 0) {
      const fieldErrors: Record<string, string> = {}
      missing.forEach((field) => {
        fieldErrors[field] = `${field} is required`
      })

      return next(
        new ValidationError(
          `Missing required fields: ${missing.join(', ')}`,
          { fields: fieldErrors }
        )
      )
    }

    next()
  }
}

// ============================================
// Common Schema Components
// ============================================

export const schemas = {
  // ID schemas
  uuid: z.string().uuid('Invalid ID format'),
  
  // String schemas
  nonEmptyString: z.string().min(1, 'This field is required'),
  email: z.string().email('Invalid email format'),
  url: z.string().url('Invalid URL format'),
  
  // Number schemas
  positiveInt: z.coerce.number().int().positive(),
  nonNegativeInt: z.coerce.number().int().min(0),
  percentage: z.coerce.number().min(0).max(100),
  
  // Date schemas
  isoDate: z.string().datetime({ message: 'Invalid date format' }),
  futureDate: z.string().datetime().refine(
    (date) => new Date(date) > new Date(),
    'Date must be in the future'
  ),
  
  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  
  // Boolean from string
  booleanString: z.enum(['true', 'false']).transform((val) => val === 'true'),
  
  // Password with requirements
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
}

// ============================================
// Schema Helpers
// ============================================

/**
 * Create optional version of schema
 */
export const optional = <T extends z.ZodTypeAny>(schema: T) => schema.optional()

/**
 * Create nullable version of schema
 */
export const nullable = <T extends z.ZodTypeAny>(schema: T) => schema.nullable()

/**
 * Create array schema with min/max
 */
export const arrayOf = <T extends z.ZodTypeAny>(
  schema: T,
  options?: { min?: number; max?: number }
) => {
  let arr = z.array(schema)
  if (options?.min) arr = arr.min(options.min)
  if (options?.max) arr = arr.max(options.max)
  return arr
}
