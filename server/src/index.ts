import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase } from './lib/supabase.js';
import { setupSwagger } from './config/swagger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import logger from './utils/logger.js';
import { 
  authRoutes, 
  userRoutes, 
  courseRoutes, 
  materialRoutes, 
  enrollmentRoutes,
  googleOAuthRoutes,
  assignmentRoutes,
  gradeRoutes,
  searchRoutes,
  notificationRoutes,
  analyticsRoutes,
  batchRoutes,
} from './routes/index.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  process.env.CORS_ORIGIN,
  'http://localhost:8080',
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.some(allowed => origin.startsWith(allowed as string))) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all in development, restrict in production if needed
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(requestLogger); // Add correlation IDs and log errors

// Apply rate limiting to all API routes
app.use('/api', apiLimiter);

// Setup Swagger documentation
setupSwagger(app);

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
app.get('/api/health', (_req, res) => {
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
app.get('/api/db-test', async (_req, res) => {
  try {
    const { error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    res.json({ 
      success: true,
      data: {
        status: 'ok', 
        message: 'Supabase connected successfully',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Database connection test failed', { error: (error as Error).message });
    res.status(500).json({ 
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Database connection failed',
        details: (error as Error).message
      }
    });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/auth/google', googleOAuthRoutes); // Google OAuth routes
app.use('/api/users', userRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/grades', gradeRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/batch', batchRoutes);

// Error handlers (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  logger.error('Server started successfully'); // Test logger
});

