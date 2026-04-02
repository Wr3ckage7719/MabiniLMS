import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

// Add correlation ID and log requests (errors only, but track all requests with ID)
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  // Generate correlation ID for request tracking
  const correlationId = uuidv4();
  req.headers['x-correlation-id'] = correlationId;

  // Add correlation ID to response header
  res.setHeader('X-Correlation-ID', correlationId);

  // Capture start time
  const start = Date.now();

  // Capture response finish event
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;

    // Only log errors (4xx and 5xx) based on minimal logging preference
    if (statusCode >= 400) {
      logger.error('Request completed with error', {
        method: req.method,
        path: req.path,
        statusCode,
        duration: `${duration}ms`,
        correlationId,
        userAgent: req.get('user-agent'),
        ip: req.ip,
      });
    }
  });

  next();
};
