import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createBrotliCompress, constants as zlibConstants } from 'zlib';
import dotenv from 'dotenv';
import { supabase, verifySupabaseAdminCapabilities } from './lib/supabase.js';
import { setupSwagger } from './config/swagger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger, slowRequestLogger } from './middleware/requestLogger.js';
import { apiLimiter, adminLimiter, batchLimiter, searchLimiter } from './middleware/rateLimiter.js';
import { httpCache } from './middleware/httpCache.js';
import logger from './utils/logger.js';
import { initializeWebSocket } from './services/websocket.js';
import {
  authRoutes, 
  userRoutes,
  adminRoutes,
  courseRoutes, 
  materialRoutes, 
  enrollmentRoutes,
  googleOAuthRoutes,
  assignmentRoutes,
  gradeRoutes,
  searchRoutes,
  notificationRoutes,
  bugReportRoutes,
  analyticsRoutes,
  batchRoutes,
  twoFactorRoutes,
  announcementRoutes,
  invitationRoutes,
  discussionRoutes,
  competencyRoutes,
  lessonRoutes,
} from './routes/index.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const JSON_BODY_LIMIT = '5mb';

const isEnvFlagEnabled = (value: string | undefined): boolean => {
  return (value || '').trim().toLowerCase() === 'true';
};

const shouldExposeApiDocs = !isProduction || isEnvFlagEnabled(process.env.EXPOSE_API_DOCS);
const shouldExposeDbTestEndpoint = !isProduction || isEnvFlagEnabled(process.env.EXPOSE_DB_TEST_ENDPOINT);

// Trust reverse proxy headers so req.ip is the real client IP on Render/Vercel.
app.set('trust proxy', 1);

const toOrigin = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).origin;
  } catch {
    // Support plain host values from env by coercing to https.
    if (/^[a-z0-9.-]+$/i.test(trimmed)) {
      try {
        return new URL(`https://${trimmed}`).origin;
      } catch {
        return null;
      }
    }
    return null;
  }
};

const parseOrigins = (...values: Array<string | undefined>): string[] => {
  const origins = values
    .flatMap((value) => (value ? value.split(',') : []))
    .map((value) => toOrigin(value))
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(origins));
};

// Initialize WebSocket server
initializeWebSocket(httpServer);

// Disable X-Powered-By header (security through obscurity)
app.disable('x-powered-by');

// =============================================================================
// SECURITY MIDDLEWARE
// =============================================================================

// 1. Helmet.js - Security headers (CSP, X-Frame-Options, HSTS, etc.)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Needed for Swagger UI
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.SUPABASE_URL || ''].filter(Boolean),
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding for API docs
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xContentTypeOptions: true,
  xDnsPrefetchControl: { allow: false },
  xDownloadOptions: true,
  xFrameOptions: { action: "deny" },
  xPermittedCrossDomainPolicies: { permittedPolicies: "none" },
  xPoweredBy: false,
  xXssProtection: true,
}));

// 2. CORS Configuration - Strict origin validation
const allowedOrigins = parseOrigins(
  process.env.CLIENT_URL,
  process.env.CORS_ORIGIN,
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:3000',
  'https://mabinilms.vercel.app',
  'https://www.mabinilms.vercel.app'
);

const corsOptions: cors.CorsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, Postman, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if origin matches allowed list
    const requestOrigin = toOrigin(origin);
    const isAllowed = Boolean(requestOrigin && allowedOrigins.includes(requestOrigin));
    
    if (isAllowed) {
      callback(null, true);
    } else if (isProduction) {
      // In production, reject unknown origins
      logger.warn('CORS blocked request from unknown origin', { origin });
      callback(new Error('Not allowed by CORS'), false);
    } else {
      // In development, allow but log warning
      logger.warn('CORS allowing unknown origin in development', { origin });
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 86400, // 24 hours preflight cache
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// 3. Body parsing with size limits (DoS prevention)
app.use(express.json({ 
  limit: JSON_BODY_LIMIT,  // Max JSON body size
  strict: true,  // Only accept arrays and objects
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: JSON_BODY_LIMIT,  // Max URL-encoded body size
  parameterLimit: 1000, // Max number of parameters
}));
app.use(express.raw({ 
  limit: '5mb',  // Max raw body (for file uploads)
  // Do not parse multipart/form-data here; Multer handles multipart routes.
  type: ['application/octet-stream'],
}));

// 4. Brotli + gzip compression — Brotli quality 4 (fast, good ratio), gzip fallback
const brotliMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (req.headers['x-no-compression']) return next();
  const accept = String(req.headers['accept-encoding'] || '');
  if (!accept.includes('br')) return next();
  const contentType = res.getHeader('content-type') as string | undefined;
  if (contentType && /application\/(gzip|zip|br|zstd)|image\/|video\//.test(contentType)) return next();

  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);
  const brotli = createBrotliCompress({
    params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 },
  });

  let headersSent = false;
  const patchHeaders = () => {
    if (headersSent) return;
    headersSent = true;
    res.setHeader('Content-Encoding', 'br');
    res.removeHeader('Content-Length');
  };

  brotli.on('data', (chunk: Buffer) => { origWrite(chunk); });
  brotli.on('end', () => { origEnd(); });
  brotli.on('error', () => { next(); });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.write = (chunk: any, ..._args: any[]) => {
    patchHeaders();
    return brotli.write(chunk);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.end = (chunk?: any, ..._args: any[]) => {
    patchHeaders();
    if (chunk) brotli.write(chunk);
    brotli.end();
    return res;
  };
  next();
};
// Apply Brotli before the gzip fallback
app.use(brotliMiddleware);
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    if (res.getHeader('content-encoding')) return false; // Brotli already applied
    const accept = String(req.headers['accept'] || '');
    if (accept.includes('text/event-stream')) return false;
    return compression.filter(req, res);
  },
}));

// 5. Request logging with correlation IDs
app.use(requestLogger);
app.use(slowRequestLogger(1000));

// Apply rate limiting to all API routes
app.use('/api', apiLimiter);

// Setup Swagger documentation
if (shouldExposeApiDocs) {
  setupSwagger(app);
}

// Health check endpoint (no auth required)
/**
 * @openapi
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns server status and timestamp
 *     tags:
 *       - Health
 *     security: []
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: ok
 *                     message:
 *                       type: string
 *                       example: Server is running
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 */
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ 
    success: true,
    data: {
      status: 'ok', 
      message: 'Server is running',
      timestamp: new Date().toISOString()
    }
  });
});

// Database connection test endpoint (no auth required)
/**
 * @openapi
 * /api/db-test:
 *   get:
 *     summary: Database connection test
 *     description: Verifies Supabase database connectivity
 *     tags:
 *       - Health
 *     security: []
 *     responses:
 *       200:
 *         description: Database connection successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: ok
 *                     message:
 *                       type: string
 *                       example: Supabase connected successfully
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *       500:
 *         description: Database connection failed
 */
if (shouldExposeDbTestEndpoint) {
  app.get('/api/db-test', async (_req: Request, res: Response) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .select('count')
        .limit(1);

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      let adminWriteReady = true;
      let adminWriteMessage = 'Supabase admin key verified';

      try {
        await verifySupabaseAdminCapabilities();
      } catch (adminError) {
        adminWriteReady = false;
        adminWriteMessage = adminError instanceof Error
          ? adminError.message
          : 'Supabase admin capability validation failed';
      }

      if (!adminWriteReady) {
        throw new Error(adminWriteMessage);
      }

      res.json({ 
        success: true,
        data: {
          status: 'ok', 
          message: 'Supabase connected successfully',
          checks: {
            public_read: true,
            admin_write_ready: true,
          },
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Database connection test failed', { error: (error as Error).message });

      const errorPayload: {
        code: string;
        message: string;
        details?: string;
      } = {
        code: 'INTERNAL_ERROR',
        message: 'Database connection failed',
      };

      if (!isProduction) {
        errorPayload.details = (error as Error).message;
      }

      res.status(500).json({ 
        success: false,
        error: errorPayload,
      });
    }
  });
}

// API Routes with specific rate limiters
app.use('/api/auth', authRoutes);
app.use('/api/auth/google', googleOAuthRoutes); // Google OAuth routes
app.use('/api/2fa', twoFactorRoutes); // Two-Factor Authentication routes
app.use('/api/users', userRoutes);
app.use('/api/admin', adminLimiter, adminRoutes); // Admin-specific rate limiting
app.use('/api/courses', httpCache, courseRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/assignments', httpCache, assignmentRoutes);
app.use('/api/grades', httpCache, gradeRoutes);
app.use('/api/search', searchLimiter, searchRoutes); // Search-specific rate limiting
app.use('/api/notifications', notificationRoutes);
app.use('/api/bug-reports', bugReportRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/batch', batchLimiter, batchRoutes); // Batch-specific rate limiting
app.use('/api/invitations', invitationRoutes);
app.use('/api', httpCache, announcementRoutes); // Announcements routes (nested under /api/courses/:courseId/announcements)
app.use('/api', discussionRoutes); // Course discussion stream routes
app.use('/api/competency', competencyRoutes); // TESDA competency overlay
app.use('/api/lessons', httpCache, lessonRoutes); // LM-centric lesson flow

// Error handlers (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// =============================================================================
// SERVER STARTUP & GRACEFUL SHUTDOWN
// =============================================================================

let server: ReturnType<typeof httpServer.listen> | null = null;

const startServer = async (): Promise<void> => {
  server = httpServer.listen(PORT, () => {
    logger.info(`🚀 Server is running on port ${PORT}`);
    if (shouldExposeApiDocs) {
      logger.info(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
    } else {
      logger.info('📚 API Documentation: disabled');
    }
    logger.info(`🏥 Health check: http://localhost:${PORT}/api/health`);
    logger.info(`🔌 WebSocket: Enabled for real-time notifications`);
    logger.info(`🔒 Security: Helmet enabled, CORS configured, rate limiting active`);
    console.log(`🚀 Server is running on port ${PORT}`);
    if (shouldExposeApiDocs) {
      console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
    } else {
      console.log('📚 API Documentation: disabled');
    }
    console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  });

  // Tune keep-alive so Render's load balancer (100 s idle timeout) closes
  // connections before Node does — avoids ECONNRESET retries on the client.
  httpServer.keepAliveTimeout = 120 * 1000;
  httpServer.headersTimeout = 125 * 1000;

  // Verify Supabase admin capabilities in the background — don't block listen.
  // Health checks (and the Vercel prewarm ping) must succeed immediately.
  if (process.env.NODE_ENV !== 'test') {
    verifySupabaseAdminCapabilities()
      .then(() => logger.info('✅ Supabase admin capability verified'))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Supabase admin capability check failed (server still listening)', { error: message });
      });
  }
};

void startServer().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('Server startup failed', { error: message });
  console.error(`❌ Server startup failed: ${message}`);
  process.exit(1);
});

// Graceful shutdown handling
let isShuttingDown = false;

const gracefulShutdown = (signal: string) => {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress, ignoring signal', { signal });
    return;
  }
  
  isShuttingDown = true;
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);

  if (!server) {
    logger.warn('Shutdown requested before HTTP server initialization completed', { signal });
    process.exit(signal === 'SIGTERM' || signal === 'SIGINT' ? 0 : 1);
    return;
  }

  // Stop accepting new connections
  server.close((err) => {
    if (err) {
      logger.error('Error during server close', { error: err.message });
      process.exit(1);
    }

    logger.info('HTTP server closed. All connections terminated.');
    console.log('✅ HTTP server closed successfully.');

    // Clean up any other resources here (database connections, etc.)
    // Supabase client doesn't require explicit cleanup

    logger.info('Graceful shutdown complete.');
    console.log('👋 Goodbye!');
    process.exit(0);
  });

  // Force shutdown after 30 seconds if graceful shutdown fails
  setTimeout(() => {
    logger.error('Graceful shutdown timed out. Forcing exit.');
    console.error('⚠️ Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: { name: error.name, message: error.message, stack: error.stack } });
  console.error('💥 Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise: String(promise) });
  console.error('💥 Unhandled Rejection:', reason);
  gracefulShutdown('unhandledRejection');
});

export default app;
