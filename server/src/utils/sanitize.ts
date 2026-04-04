/**
 * Input Sanitization Utilities
 * 
 * Provides functions to sanitize user input and prevent XSS,
 * SQL injection, and other security vulnerabilities.
 */

// ============================================
// HTML Entities for XSS Prevention
// ============================================

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
}

const HTML_ENTITY_PATTERN = /[&<>"'`=\/]/g

// ============================================
// XSS Prevention
// ============================================

/**
 * Escape HTML entities to prevent XSS attacks
 */
export const escapeHtml = (str: string): string => {
  if (typeof str !== 'string') return ''
  return str.replace(HTML_ENTITY_PATTERN, (char) => HTML_ENTITIES[char] || char)
}

/**
 * Unescape HTML entities
 */
export const unescapeHtml = (str: string): string => {
  if (typeof str !== 'string') return ''
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#x60;/g, '`')
    .replace(/&#x3D;/g, '=')
}

/**
 * Strip all HTML tags from string
 */
export const stripHtmlTags = (str: string): string => {
  if (typeof str !== 'string') return ''
  return str.replace(/<[^>]*>/g, '')
}

/**
 * Remove potentially dangerous HTML attributes
 */
export const sanitizeHtmlAttributes = (str: string): string => {
  if (typeof str !== 'string') return ''
  // Remove event handlers and javascript: URLs
  return str
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/data:/gi, '')
}

// ============================================
// String Sanitization
// ============================================

/**
 * Trim and normalize whitespace
 */
export const normalizeWhitespace = (str: string): string => {
  if (typeof str !== 'string') return ''
  return str.trim().replace(/\s+/g, ' ')
}

/**
 * Remove control characters
 */
export const removeControlChars = (str: string): string => {
  if (typeof str !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

/**
 * Sanitize string for safe use in text content
 */
export const sanitizeString = (str: string): string => {
  if (typeof str !== 'string') return ''
  return removeControlChars(normalizeWhitespace(str))
}

/**
 * Sanitize string for HTML output
 */
export const sanitizeForHtml = (str: string): string => {
  return escapeHtml(sanitizeString(str))
}

// ============================================
// SQL Injection Prevention
// ============================================

/**
 * Escape SQL LIKE pattern special characters
 * Note: This is for LIKE patterns, not for parameterized queries
 */
export const escapeLikePattern = (str: string): string => {
  if (typeof str !== 'string') return ''
  return str
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

/**
 * Sanitize string for use in SQL identifiers (table/column names)
 * Only allows alphanumeric and underscore
 */
export const sanitizeSqlIdentifier = (str: string): string => {
  if (typeof str !== 'string') return ''
  return str.replace(/[^a-zA-Z0-9_]/g, '')
}

/**
 * Check if string looks like SQL injection attempt
 */
export const detectSqlInjection = (str: string): boolean => {
  if (typeof str !== 'string') return false
  const patterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b)/i,
    /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i,
    /(--|\#|\/\*)/,
    /(\bEXEC\b|\bEXECUTE\b)/i,
    /(\bxp_)/i,
  ]
  return patterns.some(pattern => pattern.test(str))
}

// ============================================
// Path Sanitization
// ============================================

/**
 * Sanitize file path to prevent directory traversal
 */
export const sanitizePath = (str: string): string => {
  if (typeof str !== 'string') return ''
  return str
    .replace(/\.\./g, '')
    .replace(/\/\//g, '/')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
}

/**
 * Extract safe filename from path
 */
export const sanitizeFilename = (str: string): string => {
  if (typeof str !== 'string') return ''
  // Remove path components
  const filename = str.split(/[\\/]/).pop() || ''
  // Remove potentially dangerous characters
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_')
}

// ============================================
// URL Sanitization
// ============================================

/**
 * Validate and sanitize URL
 */
export const sanitizeUrl = (str: string): string | null => {
  if (typeof str !== 'string') return null
  
  try {
    const url = new URL(str)
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Check if URL is safe (no javascript:, data:, etc.)
 */
export const isSafeUrl = (str: string): boolean => {
  if (typeof str !== 'string') return false
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:']
  const lowerStr = str.toLowerCase().trim()
  return !dangerousProtocols.some(proto => lowerStr.startsWith(proto))
}

// ============================================
// Email Sanitization
// ============================================

/**
 * Normalize email address
 */
export const normalizeEmail = (email: string): string => {
  if (typeof email !== 'string') return ''
  return email.toLowerCase().trim()
}

// ============================================
// Object Sanitization
// ============================================

/**
 * Recursively sanitize all string values in an object
 */
export const sanitizeObject = <T extends Record<string, any>>(
  obj: T,
  sanitizer: (str: string) => string = sanitizeString
): T => {
  if (!obj || typeof obj !== 'object') return obj
  
  const result: any = Array.isArray(obj) ? [] : {}
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = sanitizer(value)
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value, sanitizer)
    } else {
      result[key] = value
    }
  }
  
  return result
}

/**
 * Remove specified fields from object (for sensitive data)
 */
export const omitFields = <T extends Record<string, any>>(
  obj: T,
  fields: string[]
): Partial<T> => {
  const result = { ...obj }
  for (const field of fields) {
    delete result[field]
  }
  return result
}

/**
 * Pick only specified fields from object
 */
export const pickFields = <T extends Record<string, any>>(
  obj: T,
  fields: string[]
): Partial<T> => {
  const result: Partial<T> = {}
  for (const field of fields) {
    if (field in obj) {
      result[field as keyof T] = obj[field]
    }
  }
  return result
}

// ============================================
// Number Sanitization
// ============================================

/**
 * Parse integer with bounds checking
 */
export const safeParseInt = (
  value: any,
  defaultValue: number = 0,
  min?: number,
  max?: number
): number => {
  const parsed = parseInt(String(value), 10)
  if (isNaN(parsed)) return defaultValue
  
  let result = parsed
  if (min !== undefined) result = Math.max(min, result)
  if (max !== undefined) result = Math.min(max, result)
  
  return result
}

/**
 * Parse float with bounds checking
 */
export const safeParseFloat = (
  value: any,
  defaultValue: number = 0,
  min?: number,
  max?: number
): number => {
  const parsed = parseFloat(String(value))
  if (isNaN(parsed)) return defaultValue
  
  let result = parsed
  if (min !== undefined) result = Math.max(min, result)
  if (max !== undefined) result = Math.min(max, result)
  
  return result
}

// ============================================
// Content Type Validation
// ============================================

const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ],
  video: ['video/mp4', 'video/webm', 'video/ogg'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
}

/**
 * Check if MIME type is allowed
 */
export const isAllowedMimeType = (
  mimeType: string,
  category?: keyof typeof ALLOWED_MIME_TYPES
): boolean => {
  if (!mimeType) return false
  
  if (category) {
    return ALLOWED_MIME_TYPES[category]?.includes(mimeType) || false
  }
  
  return Object.values(ALLOWED_MIME_TYPES)
    .flat()
    .includes(mimeType)
}

/**
 * Get MIME type category
 */
export const getMimeTypeCategory = (
  mimeType: string
): keyof typeof ALLOWED_MIME_TYPES | null => {
  for (const [category, types] of Object.entries(ALLOWED_MIME_TYPES)) {
    if (types.includes(mimeType)) {
      return category as keyof typeof ALLOWED_MIME_TYPES
    }
  }
  return null
}

// ============================================
// Export All
// ============================================

export default {
  escapeHtml,
  unescapeHtml,
  stripHtmlTags,
  sanitizeHtmlAttributes,
  normalizeWhitespace,
  removeControlChars,
  sanitizeString,
  sanitizeForHtml,
  escapeLikePattern,
  sanitizeSqlIdentifier,
  detectSqlInjection,
  sanitizePath,
  sanitizeFilename,
  sanitizeUrl,
  isSafeUrl,
  normalizeEmail,
  sanitizeObject,
  omitFields,
  pickFields,
  safeParseInt,
  safeParseFloat,
  isAllowedMimeType,
  getMimeTypeCategory,
}
