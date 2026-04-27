/**
 * Validation & Sanitization Tests
 * 
 * Tests for:
 * - Sanitization utilities (XSS, SQL injection, path traversal)
 * - Validation middleware (body, query, params)
 * - Schema helpers
 */

import { Request, Response } from 'express'
import { z } from 'zod'

// ============================================
// Sanitization Tests
// ============================================

describe('Sanitization Utilities', () => {
  // Import utilities
  let sanitize: typeof import('../../src/utils/sanitize')

  beforeEach(async () => {
    sanitize = await import('../../src/utils/sanitize')
  })

  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      // Note: Implementation also escapes / to &#x2F;
      expect(sanitize.escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
      )
    })

    it('should escape ampersands', () => {
      expect(sanitize.escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry')
    })

    it('should escape single quotes', () => {
      expect(sanitize.escapeHtml("it's")).toBe('it&#x27;s')
    })

    it('should handle empty strings', () => {
      expect(sanitize.escapeHtml('')).toBe('')
    })

    it('should handle strings without special characters', () => {
      expect(sanitize.escapeHtml('Hello World')).toBe('Hello World')
    })
  })

  describe('stripHtmlTags', () => {
    it('should remove HTML tags', () => {
      expect(sanitize.stripHtmlTags('<p>Hello</p>')).toBe('Hello')
    })

    it('should remove nested tags', () => {
      expect(sanitize.stripHtmlTags('<div><p><b>Hello</b></p></div>')).toBe('Hello')
    })

    it('should remove script tags but not content', () => {
      // Note: stripHtmlTags removes tags but not content inside them
      expect(sanitize.stripHtmlTags('<script>alert(1)</script>Text')).toBe('alert(1)Text')
    })

    it('should handle self-closing tags', () => {
      expect(sanitize.stripHtmlTags('Line<br/>Break')).toBe('LineBreak')
    })
  })

  describe('escapeLikePattern', () => {
    it('should escape percent signs', () => {
      expect(sanitize.escapeLikePattern('100%')).toBe('100\\%')
    })

    it('should escape underscores', () => {
      expect(sanitize.escapeLikePattern('user_name')).toBe('user\\_name')
    })

    it('should escape backslashes', () => {
      expect(sanitize.escapeLikePattern('path\\file')).toBe('path\\\\file')
    })

    it('should escape all special characters', () => {
      expect(sanitize.escapeLikePattern('100%_\\test')).toBe('100\\%\\_\\\\test')
    })
  })

  describe('detectSqlInjection', () => {
    it('should detect OR 1=1 injection', () => {
      expect(sanitize.detectSqlInjection("' OR 1=1 --")).toBe(true)
    })

    it('should detect UNION SELECT', () => {
      expect(sanitize.detectSqlInjection('UNION SELECT * FROM users')).toBe(true)
    })

    it('should detect DROP TABLE', () => {
      expect(sanitize.detectSqlInjection('; DROP TABLE users;')).toBe(true)
    })

    it('should detect comment injection', () => {
      expect(sanitize.detectSqlInjection('admin-- ')).toBe(true)
    })

    it('should detect EXEC commands', () => {
      expect(sanitize.detectSqlInjection('EXEC xp_cmdshell')).toBe(true)
    })

    it('should not flag normal text', () => {
      expect(sanitize.detectSqlInjection('Hello World')).toBe(false)
    })

    it('should not flag normal queries', () => {
      expect(sanitize.detectSqlInjection('search for courses')).toBe(false)
    })

    it('should be case insensitive', () => {
      expect(sanitize.detectSqlInjection('union SELECT')).toBe(true)
    })
  })

  describe('sanitizePath', () => {
    it('should remove path traversal sequences', () => {
      expect(sanitize.sanitizePath('../../../etc/passwd')).toBe('etc/passwd')
    })

    it('should remove Windows path traversal', () => {
      expect(sanitize.sanitizePath('..\\..\\windows\\system32')).toBe('windows/system32')
    })

    it('should normalize slashes', () => {
      expect(sanitize.sanitizePath('path\\to\\file')).toBe('path/to/file')
    })

    it('should handle normal paths', () => {
      expect(sanitize.sanitizePath('uploads/images/photo.jpg')).toBe('uploads/images/photo.jpg')
    })

    it('should remove leading slashes', () => {
      expect(sanitize.sanitizePath('/etc/passwd')).toBe('etc/passwd')
    })
  })

  describe('sanitizeFilename', () => {
    it('should extract filename from path', () => {
      // Note: sanitizeFilename extracts the last path component and sanitizes it
      expect(sanitize.sanitizeFilename('path/to/file.txt')).toBe('file.txt')
    })

    it('should extract filename from Windows path', () => {
      expect(sanitize.sanitizeFilename('path\\to\\file.txt')).toBe('file.txt')
    })

    it('should replace invalid characters with underscore', () => {
      expect(sanitize.sanitizeFilename('file name!@#.txt')).toBe('file_name___.txt')
    })

    it('should handle valid filenames', () => {
      expect(sanitize.sanitizeFilename('my-document_v2.pdf')).toBe('my-document_v2.pdf')
    })

    it('should handle spaces (replace with underscore)', () => {
      expect(sanitize.sanitizeFilename('my file.txt')).toBe('my_file.txt')
    })
  })

  describe('sanitizeString', () => {
    it('should trim and normalize whitespace', () => {
      expect(sanitize.sanitizeString('  hello   world  ')).toBe('hello world')
    })

    it('should remove control characters', () => {
      expect(sanitize.sanitizeString('hello\x00\x01\x02world')).toBe('helloworld')
    })

    it('should preserve normal text', () => {
      expect(sanitize.sanitizeString('Hello World!')).toBe('Hello World!')
    })

    it('should collapse multiple spaces', () => {
      expect(sanitize.sanitizeString('hello    world')).toBe('hello world')
    })
  })

  describe('sanitizeObject', () => {
    it('should sanitize all string values', () => {
      const obj = { name: '  John  ', email: 'john@example.com  ' }
      const result = sanitize.sanitizeObject(obj, sanitize.sanitizeString)
      expect(result).toEqual({ name: 'John', email: 'john@example.com' })
    })

    it('should handle nested objects', () => {
      const obj = { user: { name: '  John  ' } }
      const result = sanitize.sanitizeObject(obj, sanitize.sanitizeString)
      expect(result).toEqual({ user: { name: 'John' } })
    })

    it('should handle arrays', () => {
      const obj = { tags: ['  tag1  ', '  tag2  '] }
      const result = sanitize.sanitizeObject(obj, sanitize.sanitizeString)
      expect(result).toEqual({ tags: ['tag1', 'tag2'] })
    })

    it('should preserve non-string values', () => {
      const obj = { count: 42, active: true, date: null }
      const result = sanitize.sanitizeObject(obj, sanitize.sanitizeString)
      expect(result).toEqual({ count: 42, active: true, date: null })
    })
  })

  describe('omitFields', () => {
    it('should remove specified fields', () => {
      const obj = { name: 'John', password: 'secret', email: 'john@example.com' }
      const result = sanitize.omitFields(obj, ['password'])
      expect(result).toEqual({ name: 'John', email: 'john@example.com' })
    })

    it('should handle multiple fields', () => {
      const obj = { a: 1, b: 2, c: 3, d: 4 }
      const result = sanitize.omitFields(obj, ['b', 'd'])
      expect(result).toEqual({ a: 1, c: 3 })
    })

    it('should handle missing fields', () => {
      const obj = { name: 'John' }
      const result = sanitize.omitFields(obj, ['password'])
      expect(result).toEqual({ name: 'John' })
    })
  })

  describe('pickFields', () => {
    it('should keep only specified fields', () => {
      const obj = { name: 'John', password: 'secret', email: 'john@example.com' }
      const result = sanitize.pickFields(obj, ['name', 'email'])
      expect(result).toEqual({ name: 'John', email: 'john@example.com' })
    })

    it('should handle missing fields', () => {
      const obj = { name: 'John' }
      const result = sanitize.pickFields(obj, ['name', 'email'])
      expect(result).toEqual({ name: 'John' })
    })
  })
})

// ============================================
// Validation Middleware Tests
// ============================================

describe('Validation Middleware', () => {
  let validateModule: typeof import('../../src/middleware/validate')

  beforeEach(async () => {
    validateModule = await import('../../src/middleware/validate')
  })

  // Helper to create mock request/response/next
  const createMocks = () => {
    const req = {
      body: {},
      query: {},
      params: {},
    } as Request

    const res = {} as Response

    const next = vi.fn()

    return { req, res, next }
  }

  describe('validate()', () => {
    it('should validate body successfully', async () => {
      const { req, res, next } = createMocks()
      req.body = { name: 'John', age: 25 }

      const schema = z.object({
        name: z.string(),
        age: z.number(),
      })

      const middleware = validateModule.validate({ body: schema })
      await middleware(req, res, next)

      expect(next).toHaveBeenCalledWith()
      expect(req.body).toEqual({ name: 'John', age: 25 })
    })

    it('should validate query successfully', async () => {
      const { req, res, next } = createMocks()
      req.query = { page: '1', limit: '10' }

      const schema = z.object({
        page: z.coerce.number(),
        limit: z.coerce.number(),
      })

      const middleware = validateModule.validate({ query: schema })
      await middleware(req, res, next)

      expect(next).toHaveBeenCalledWith()
      expect(req.query).toEqual({ page: 1, limit: 10 })
    })

    it('should validate params successfully', async () => {
      const { req, res, next } = createMocks()
      req.params = { id: '123e4567-e89b-12d3-a456-426614174000' }

      const schema = z.object({
        id: z.string().uuid(),
      })

      const middleware = validateModule.validate({ params: schema })
      await middleware(req, res, next)

      expect(next).toHaveBeenCalledWith()
    })

    it('should call next with error on invalid body', async () => {
      const { req, res, next } = createMocks()
      req.body = { name: 123 } // Should be string

      const schema = z.object({
        name: z.string(),
      })

      const middleware = validateModule.validate({ body: schema })
      await middleware(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(Error))
    })

    it('should validate multiple targets', async () => {
      const { req, res, next } = createMocks()
      req.body = { name: 'John' }
      req.query = { page: '1' }
      req.params = { id: '123e4567-e89b-12d3-a456-426614174000' }

      const bodySchema = z.object({ name: z.string() })
      const querySchema = z.object({ page: z.coerce.number() })
      const paramsSchema = z.object({ id: z.string().uuid() })

      const middleware = validateModule.validate({
        body: bodySchema,
        query: querySchema,
        params: paramsSchema,
      })
      await middleware(req, res, next)

      expect(next).toHaveBeenCalledWith()
      expect(req.body).toEqual({ name: 'John' })
      expect(req.query).toEqual({ page: 1 })
    })
  })

  describe('validateBody()', () => {
    it('should validate body', async () => {
      const { req, res, next } = createMocks()
      req.body = { email: 'test@example.com' }

      const schema = z.object({ email: z.string().email() })
      const middleware = validateModule.validateBody(schema)
      await middleware(req, res, next)

      expect(next).toHaveBeenCalledWith()
    })

    it('should sanitize strings by default', async () => {
      const { req, res, next } = createMocks()
      req.body = { name: '  John  ' }

      const schema = z.object({ name: z.string() })
      const middleware = validateModule.validateBody(schema)
      await middleware(req, res, next)

      expect(next).toHaveBeenCalledWith()
      expect(req.body.name).toBe('John')
    })
  })

  describe('validateQuery()', () => {
    it('should validate query params', async () => {
      const { req, res, next } = createMocks()
      req.query = { search: 'test' }

      const schema = z.object({ search: z.string() })
      const middleware = validateModule.validateQuery(schema)
      await middleware(req, res, next)

      expect(next).toHaveBeenCalledWith()
    })

    it('should coerce numbers', async () => {
      const { req, res, next } = createMocks()
      req.query = { page: '5' }

      const schema = z.object({ page: z.coerce.number() })
      const middleware = validateModule.validateQuery(schema)
      await middleware(req, res, next)

      expect(next).toHaveBeenCalledWith()
      expect(req.query).toEqual({ page: 5 })
    })
  })

  describe('validateParams()', () => {
    it('should validate URL params', async () => {
      const { req, res, next } = createMocks()
      req.params = { id: '123e4567-e89b-12d3-a456-426614174000' }

      const schema = z.object({ id: z.string().uuid() })
      const middleware = validateModule.validateParams(schema)
      await middleware(req, res, next)

      expect(next).toHaveBeenCalledWith()
    })

    it('should reject invalid UUID', async () => {
      const { req, res, next } = createMocks()
      req.params = { id: 'not-a-uuid' }

      const schema = z.object({ id: z.string().uuid() })
      const middleware = validateModule.validateParams(schema)
      await middleware(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('validateUUID()', () => {
    it('should validate default id param', async () => {
      const { req, res, next } = createMocks()
      req.params = { id: '123e4567-e89b-12d3-a456-426614174000' }

      const middleware = validateModule.validateUUID()
      await middleware(req, res, next)

      expect(next).toHaveBeenCalledWith()
    })

    it('should validate custom param name', async () => {
      const { req, res, next } = createMocks()
      req.params = { courseId: '123e4567-e89b-12d3-a456-426614174000' }

      const middleware = validateModule.validateUUID('courseId')
      await middleware(req, res, next)

      expect(next).toHaveBeenCalledWith()
    })
  })

  describe('validatePagination()', () => {
    it('should use defaults when not provided', async () => {
      const { req, res, next } = createMocks()
      req.query = {}

      const middleware = validateModule.validatePagination()
      await middleware(req, res, next)

      expect(next).toHaveBeenCalledWith()
      expect(req.query).toEqual({ page: 1, limit: 10 })
    })

    it('should use custom defaults', async () => {
      const { req, res, next } = createMocks()
      req.query = {}

      const middleware = validateModule.validatePagination({ page: 1, limit: 20 })
      await middleware(req, res, next)

      expect(next).toHaveBeenCalledWith()
      expect(req.query).toEqual({ page: 1, limit: 20 })
    })

    it('should validate user-provided values', async () => {
      const { req, res, next } = createMocks()
      req.query = { page: '3', limit: '50' }

      const middleware = validateModule.validatePagination()
      await middleware(req, res, next)

      expect(next).toHaveBeenCalledWith()
      expect(req.query).toEqual({ page: 3, limit: 50 })
    })

    it('should reject page < 1', async () => {
      const { req, res, next } = createMocks()
      req.query = { page: '0' }

      const middleware = validateModule.validatePagination()
      await middleware(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(Error))
    })

    it('should reject limit > 100', async () => {
      const { req, res, next } = createMocks()
      req.query = { limit: '200' }

      const middleware = validateModule.validatePagination()
      await middleware(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('requireFields()', () => {
    it('should pass when all fields present', () => {
      const { req, res, next } = createMocks()
      req.body = { name: 'John', email: 'john@example.com' }

      const middleware = validateModule.requireFields('name', 'email')
      middleware(req, res, next)

      expect(next).toHaveBeenCalledWith()
    })

    it('should fail when fields missing', () => {
      const { req, res, next } = createMocks()
      req.body = { name: 'John' }

      const middleware = validateModule.requireFields('name', 'email')
      middleware(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(Error))
    })
  })
})

// ============================================
// Schema Helpers Tests
// ============================================

describe('Schema Helpers', () => {
  let validateModule: typeof import('../../src/middleware/validate')

  beforeEach(async () => {
    validateModule = await import('../../src/middleware/validate')
  })

  describe('schemas.uuid', () => {
    it('should accept valid UUID', () => {
      const result = validateModule.schemas.uuid.safeParse(
        '123e4567-e89b-12d3-a456-426614174000'
      )
      expect(result.success).toBe(true)
    })

    it('should reject invalid UUID', () => {
      const result = validateModule.schemas.uuid.safeParse('not-a-uuid')
      expect(result.success).toBe(false)
    })
  })

  describe('schemas.email', () => {
    it('should accept valid email', () => {
      const result = validateModule.schemas.email.safeParse('test@example.com')
      expect(result.success).toBe(true)
    })

    it('should reject invalid email', () => {
      const result = validateModule.schemas.email.safeParse('not-an-email')
      expect(result.success).toBe(false)
    })
  })

  describe('schemas.password', () => {
    it('should accept valid password', () => {
      const result = validateModule.schemas.password.safeParse('SecurePass123!')
      expect(result.success).toBe(true)
    })

    it('should reject short password', () => {
      const result = validateModule.schemas.password.safeParse('Short1!')
      expect(result.success).toBe(false)
    })

    it('should reject password without uppercase', () => {
      const result = validateModule.schemas.password.safeParse('lowercase123!')
      expect(result.success).toBe(false)
    })

    it('should reject password without lowercase', () => {
      const result = validateModule.schemas.password.safeParse('UPPERCASE123!')
      expect(result.success).toBe(false)
    })

    it('should reject password without digit', () => {
      const result = validateModule.schemas.password.safeParse('NoDigits!@#')
      expect(result.success).toBe(false)
    })

    it('should reject password without special character', () => {
      const result = validateModule.schemas.password.safeParse('NoSpecial123')
      expect(result.success).toBe(false)
    })
  })

  describe('schemas.percentage', () => {
    it('should accept 0', () => {
      const result = validateModule.schemas.percentage.safeParse(0)
      expect(result.success).toBe(true)
    })

    it('should accept 100', () => {
      const result = validateModule.schemas.percentage.safeParse(100)
      expect(result.success).toBe(true)
    })

    it('should accept 50.5', () => {
      const result = validateModule.schemas.percentage.safeParse(50.5)
      expect(result.success).toBe(true)
    })

    it('should reject negative', () => {
      const result = validateModule.schemas.percentage.safeParse(-1)
      expect(result.success).toBe(false)
    })

    it('should reject > 100', () => {
      const result = validateModule.schemas.percentage.safeParse(101)
      expect(result.success).toBe(false)
    })
  })

  describe('schemas.booleanString', () => {
    it('should transform "true" to true', () => {
      const result = validateModule.schemas.booleanString.safeParse('true')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(true)
      }
    })

    it('should transform "false" to false', () => {
      const result = validateModule.schemas.booleanString.safeParse('false')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(false)
      }
    })

    it('should reject other strings', () => {
      const result = validateModule.schemas.booleanString.safeParse('yes')
      expect(result.success).toBe(false)
    })
  })

  describe('arrayOf()', () => {
    it('should create array schema', () => {
      const schema = validateModule.arrayOf(z.string())
      const result = schema.safeParse(['a', 'b', 'c'])
      expect(result.success).toBe(true)
    })

    it('should enforce min', () => {
      const schema = validateModule.arrayOf(z.string(), { min: 2 })
      const result = schema.safeParse(['a'])
      expect(result.success).toBe(false)
    })

    it('should enforce max', () => {
      const schema = validateModule.arrayOf(z.string(), { max: 2 })
      const result = schema.safeParse(['a', 'b', 'c'])
      expect(result.success).toBe(false)
    })
  })

  describe('optional() and nullable()', () => {
    it('should make schema optional', () => {
      const schema = z.object({
        name: validateModule.optional(z.string()),
      })
      const result = schema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('should make schema nullable', () => {
      const schema = z.object({
        name: validateModule.nullable(z.string()),
      })
      const result = schema.safeParse({ name: null })
      expect(result.success).toBe(true)
    })
  })
})
