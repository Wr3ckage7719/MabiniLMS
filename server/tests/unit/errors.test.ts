import {
  AppError,
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
  createValidationError,
  createNotFoundError,
  createConflictError,
  createForbiddenError,
  isAppError,
  isOperationalError,
  isValidationError,
  isAuthenticationError,
  isForbiddenError,
  isNotFoundError,
  isConflictError,
  isRateLimitError,
  ERROR_CODES,
} from '../../src/errors/AppError.js'

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create error with all properties', () => {
      const error = new AppError('Test error', 400, 'TEST_ERROR', true, { foo: 'bar' })

      expect(error.message).toBe('Test error')
      expect(error.statusCode).toBe(400)
      expect(error.errorCode).toBe('TEST_ERROR')
      expect(error.isOperational).toBe(true)
      expect(error.metadata).toEqual({ foo: 'bar' })
    })

    it('should use default values', () => {
      const error = new AppError('Test error')

      expect(error.statusCode).toBe(500)
      expect(error.errorCode).toBe('INTERNAL_ERROR')
      expect(error.isOperational).toBe(true)
    })

    it('should serialize to JSON correctly', () => {
      const error = new AppError('Test error', 400, 'TEST_ERROR', true, { foo: 'bar' })
      const json = error.toJSON()

      expect(json.error.message).toBe('Test error')
      expect(json.error.code).toBe('TEST_ERROR')
      expect(json.error.statusCode).toBe(400)
      expect(json.error.metadata).toEqual({ foo: 'bar' })
    })

    it('should have stack trace', () => {
      const error = new AppError('Test error')
      expect(error.stack).toBeDefined()
    })
  })

  describe('ValidationError', () => {
    it('should create 400 error with correct code', () => {
      const error = new ValidationError('Invalid input')

      expect(error.statusCode).toBe(400)
      expect(error.errorCode).toBe('VALIDATION_ERROR')
      expect(error.isOperational).toBe(true)
    })

    it('should use default message', () => {
      const error = new ValidationError()
      expect(error.message).toBe('Validation failed')
    })
  })

  describe('AuthenticationError', () => {
    it('should create 401 error with correct code', () => {
      const error = new AuthenticationError('Invalid token')

      expect(error.statusCode).toBe(401)
      expect(error.errorCode).toBe('AUTHENTICATION_ERROR')
      expect(error.isOperational).toBe(true)
    })
  })

  describe('ForbiddenError', () => {
    it('should create 403 error with correct code', () => {
      const error = new ForbiddenError('Access denied')

      expect(error.statusCode).toBe(403)
      expect(error.errorCode).toBe('FORBIDDEN_ERROR')
      expect(error.isOperational).toBe(true)
    })
  })

  describe('NotFoundError', () => {
    it('should create 404 error with correct code', () => {
      const error = new NotFoundError('User not found')

      expect(error.statusCode).toBe(404)
      expect(error.errorCode).toBe('NOT_FOUND_ERROR')
      expect(error.isOperational).toBe(true)
    })
  })

  describe('ConflictError', () => {
    it('should create 409 error with correct code', () => {
      const error = new ConflictError('Resource already exists')

      expect(error.statusCode).toBe(409)
      expect(error.errorCode).toBe('CONFLICT_ERROR')
      expect(error.isOperational).toBe(true)
    })
  })

  describe('RateLimitError', () => {
    it('should create 429 error with correct code', () => {
      const error = new RateLimitError('Too many requests', 60)

      expect(error.statusCode).toBe(429)
      expect(error.errorCode).toBe('RATE_LIMIT_ERROR')
      expect(error.isOperational).toBe(true)
      expect(error.metadata?.retryAfter).toBe(60)
    })
  })

  describe('InternalError', () => {
    it('should create 500 error marked non-operational', () => {
      const error = new InternalError('Database connection failed')

      expect(error.statusCode).toBe(500)
      expect(error.errorCode).toBe('INTERNAL_ERROR')
      expect(error.isOperational).toBe(false)
    })
  })

  describe('ServiceUnavailableError', () => {
    it('should create 503 error with correct code', () => {
      const error = new ServiceUnavailableError('Service is down')

      expect(error.statusCode).toBe(503)
      expect(error.errorCode).toBe('SERVICE_UNAVAILABLE_ERROR')
      expect(error.isOperational).toBe(true)
    })
  })

  describe('BusinessLogicError', () => {
    it('should create 422 error with correct code', () => {
      const error = new BusinessLogicError('Cannot enroll in full course')

      expect(error.statusCode).toBe(422)
      expect(error.errorCode).toBe('BUSINESS_LOGIC_ERROR')
      expect(error.isOperational).toBe(true)
    })
  })

  describe('DatabaseError', () => {
    it('should create 500 error marked non-operational', () => {
      const error = new DatabaseError('Query timeout')

      expect(error.statusCode).toBe(500)
      expect(error.errorCode).toBe('DATABASE_ERROR')
      expect(error.isOperational).toBe(false)
    })
  })

  describe('ExternalAPIError', () => {
    it('should create 502 error with service info', () => {
      const error = new ExternalAPIError('API failed', 'google-drive')

      expect(error.statusCode).toBe(502)
      expect(error.errorCode).toBe('EXTERNAL_API_ERROR')
      expect(error.isOperational).toBe(true)
      expect(error.metadata?.service).toBe('google-drive')
    })
  })
})

describe('Error Factory Functions', () => {
  describe('createValidationError', () => {
    it('should create validation error with field errors', () => {
      const error = createValidationError({
        email: 'Invalid email format',
        password: ['Too short', 'Missing uppercase'],
      })

      expect(error).toBeInstanceOf(ValidationError)
      expect(error.message).toBe('Validation failed for 2 fields')
      expect(error.metadata?.fields).toEqual({
        email: 'Invalid email format',
        password: ['Too short', 'Missing uppercase'],
      })
    })

    it('should handle single field', () => {
      const error = createValidationError({
        email: 'Required',
      })

      expect(error.message).toBe('Validation failed for 1 field')
    })
  })

  describe('createNotFoundError', () => {
    it('should create not found error with identifier', () => {
      const error = createNotFoundError('User', '123')

      expect(error).toBeInstanceOf(NotFoundError)
      expect(error.message).toBe("User with identifier '123' not found")
      expect(error.metadata?.resourceType).toBe('User')
      expect(error.metadata?.identifier).toBe('123')
    })

    it('should create not found error without identifier', () => {
      const error = createNotFoundError('Course')

      expect(error.message).toBe('Course not found')
    })
  })

  describe('createConflictError', () => {
    it('should create conflict error with field and value', () => {
      const error = createConflictError('User', 'email', 'test@example.com')

      expect(error).toBeInstanceOf(ConflictError)
      expect(error.message).toBe("User with email 'test@example.com' already exists")
    })

    it('should create conflict error without field', () => {
      const error = createConflictError('Course')

      expect(error.message).toBe('Course already exists')
    })
  })

  describe('createForbiddenError', () => {
    it('should create forbidden error with action and resource', () => {
      const error = createForbiddenError('delete', 'course')

      expect(error).toBeInstanceOf(ForbiddenError)
      expect(error.message).toBe('You do not have permission to delete this course')
      expect(error.metadata?.action).toBe('delete')
      expect(error.metadata?.resource).toBe('course')
    })
  })
})

describe('Type Guards', () => {
  describe('isAppError', () => {
    it('should return true for AppError instances', () => {
      expect(isAppError(new AppError('test'))).toBe(true)
      expect(isAppError(new ValidationError())).toBe(true)
      expect(isAppError(new NotFoundError())).toBe(true)
    })

    it('should return false for other errors', () => {
      expect(isAppError(new Error('test'))).toBe(false)
      expect(isAppError(null)).toBe(false)
      expect(isAppError(undefined)).toBe(false)
    })
  })

  describe('isOperationalError', () => {
    it('should return true for operational errors', () => {
      expect(isOperationalError(new ValidationError())).toBe(true)
      expect(isOperationalError(new NotFoundError())).toBe(true)
    })

    it('should return false for non-operational errors', () => {
      expect(isOperationalError(new InternalError())).toBe(false)
      expect(isOperationalError(new DatabaseError())).toBe(false)
    })
  })

  describe('specific type guards', () => {
    it('should correctly identify error types', () => {
      expect(isValidationError(new ValidationError())).toBe(true)
      expect(isAuthenticationError(new AuthenticationError())).toBe(true)
      expect(isForbiddenError(new ForbiddenError())).toBe(true)
      expect(isNotFoundError(new NotFoundError())).toBe(true)
      expect(isConflictError(new ConflictError())).toBe(true)
      expect(isRateLimitError(new RateLimitError())).toBe(true)
    })

    it('should return false for wrong types', () => {
      expect(isValidationError(new NotFoundError())).toBe(false)
      expect(isNotFoundError(new ValidationError())).toBe(false)
    })
  })
})

describe('ERROR_CODES', () => {
  it('should have all expected error codes', () => {
    expect(ERROR_CODES.VALIDATION_ERROR).toBe('VALIDATION_ERROR')
    expect(ERROR_CODES.AUTHENTICATION_ERROR).toBe('AUTHENTICATION_ERROR')
    expect(ERROR_CODES.FORBIDDEN_ERROR).toBe('FORBIDDEN_ERROR')
    expect(ERROR_CODES.NOT_FOUND_ERROR).toBe('NOT_FOUND_ERROR')
    expect(ERROR_CODES.CONFLICT_ERROR).toBe('CONFLICT_ERROR')
    expect(ERROR_CODES.RATE_LIMIT_ERROR).toBe('RATE_LIMIT_ERROR')
    expect(ERROR_CODES.INTERNAL_ERROR).toBe('INTERNAL_ERROR')
    expect(ERROR_CODES.DATABASE_ERROR).toBe('DATABASE_ERROR')
    expect(ERROR_CODES.EXTERNAL_API_ERROR).toBe('EXTERNAL_API_ERROR')
    expect(ERROR_CODES.SERVICE_UNAVAILABLE_ERROR).toBe('SERVICE_UNAVAILABLE_ERROR')
  })
})
