/**
 * Winston Logger Configuration
 * 
 * Centralized logging system with structured logging,
 * multiple transports, and environment-aware formatting.
 */

import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================
// Configuration
// ============================================

const isDevelopment = process.env.NODE_ENV !== 'production'
const LOG_LEVEL = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info')
const LOGS_DIR = process.env.LOGS_DIR || path.join(__dirname, '../../logs')

// ============================================
// Custom Log Levels
// ============================================

const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'blue',
  },
}

winston.addColors(customLevels.colors)

// ============================================
// Formatters
// ============================================

/**
 * Development format - Human readable with colors
 */
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`
    
    // Add metadata if present
    const metaKeys = Object.keys(metadata)
    if (metaKeys.length > 0) {
      // Filter out empty objects and internal winston props
      const filteredMeta = Object.fromEntries(
        metaKeys
          .filter(key => !['level', 'timestamp'].includes(key))
          .map(key => [key, metadata[key]])
      )
      if (Object.keys(filteredMeta).length > 0) {
        msg += `\n${JSON.stringify(filteredMeta, null, 2)}`
      }
    }
    
    return msg
  })
)

/**
 * Production format - JSON for log aggregation
 */
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
)

// ============================================
// Transports
// ============================================

const transports: winston.transport[] = []

// Console transport (always enabled)
transports.push(
  new winston.transports.Console({
    format: isDevelopment ? developmentFormat : productionFormat,
  })
)

// File transports (production only)
if (!isDevelopment) {
  // All logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(LOGS_DIR, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: productionFormat,
    })
  )

  // Error logs only
  transports.push(
    new DailyRotateFile({
      filename: path.join(LOGS_DIR, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d',
      format: productionFormat,
    })
  )
}

// ============================================
// Logger Instance
// ============================================

export const logger = winston.createLogger({
  levels: customLevels.levels,
  level: LOG_LEVEL,
  transports,
  // Don't exit on uncaught exceptions (we handle them separately)
  exitOnError: false,
})

// ============================================
// Helper Functions
// ============================================

/**
 * Log an error with full context
 */
export const logError = (
  error: Error,
  context?: Record<string, any>
) => {
  logger.error(error.message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
  })
}

/**
 * Log HTTP request
 */
export const logRequest = (
  method: string,
  url: string,
  statusCode: number,
  responseTime: number,
  context?: Record<string, any>
) => {
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'http'
  
  logger.log(level, `${method} ${url} ${statusCode} ${responseTime}ms`, {
    http: {
      method,
      url,
      statusCode,
      responseTime,
    },
    ...context,
  })
}

/**
 * Log database query (debug only)
 */
export const logQuery = (
  query: string,
  duration?: number,
  context?: Record<string, any>
) => {
  if (isDevelopment) {
    logger.debug('Database query', {
      query,
      duration,
      ...context,
    })
  }
}

/**
 * Log external API call
 */
export const logAPICall = (
  service: string,
  endpoint: string,
  method: string,
  statusCode?: number,
  duration?: number,
  context?: Record<string, any>
) => {
  const level = !statusCode || statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'
  
  logger.log(level, `API call to ${service}`, {
    api: {
      service,
      endpoint,
      method,
      statusCode,
      duration,
    },
    ...context,
  })
}

/**
 * Sanitize sensitive data from logs
 */
export const sanitizeLogData = (data: any): any => {
  if (!data || typeof data !== 'object') {
    return data
  }

  const sensitiveFields = [
    'password',
    'token',
    'accessToken',
    'refreshToken',
    'apiKey',
    'secret',
    'authorization',
    'cookie',
    'session',
  ]

  const sanitized = Array.isArray(data) ? [...data] : { ...data }

  for (const key in sanitized) {
    const lowerKey = key.toLowerCase()
    
    // Check if field name suggests sensitive data
    if (sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]'
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeLogData(sanitized[key])
    }
  }

  return sanitized
}

/**
 * Create child logger with default context
 */
export const createChildLogger = (context: Record<string, any>) => {
  return logger.child(context)
}

// ============================================
// Process Event Handlers
// ============================================

// Log uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  })
  
  // Give logger time to write, then exit
  setTimeout(() => {
    process.exit(1)
  }, 1000)
})

// Log unhandled promise rejections
process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? {
      name: reason.name,
      message: reason.message,
      stack: reason.stack,
    } : reason,
  })
})

// Log when process is about to exit
process.on('beforeExit', (code) => {
  logger.info('Process is about to exit', { exitCode: code })
})

// ============================================
// Export
// ============================================

export default logger
