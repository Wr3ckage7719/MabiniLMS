/**
 * Analytics Routes
 * 
 * API endpoints for analytics and reporting.
 */

import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { validateUUID } from '../middleware/validate.js'
import { UserRole } from '../types/index.js'
import * as analyticsController from '../controllers/analytics.js'

const router = Router()

/**
 * @swagger
 * tags:
 *   - name: Analytics
 *     description: Analytics and reporting endpoints
 */

// All routes require authentication
router.use(authenticate)

// ============================================
// My Analytics
// ============================================

/**
 * GET /api/analytics/me - Get analytics for current user
 */
router.get('/me', analyticsController.getMyAnalytics)

// ============================================
// Platform Analytics (Admin only)
// ============================================

/**
 * GET /api/analytics/platform - Get platform analytics
 */
router.get(
  '/platform',
  authorize(UserRole.ADMIN),
  analyticsController.getPlatformAnalytics
)

// ============================================
// Course Analytics
// ============================================

/**
 * GET /api/analytics/courses/:courseId - Get course analytics
 */
router.get(
  '/courses/:courseId',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validateUUID('courseId'),
  analyticsController.getCourseAnalytics
)

// ============================================
// Student Analytics
// ============================================

/**
 * GET /api/analytics/students/:studentId - Get student analytics
 */
router.get(
  '/students/:studentId',
  validateUUID('studentId'),
  analyticsController.getStudentAnalytics
)

// ============================================
// Teacher Analytics
// ============================================

/**
 * GET /api/analytics/teachers/:teacherId - Get teacher analytics
 */
router.get(
  '/teachers/:teacherId',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validateUUID('teacherId'),
  analyticsController.getTeacherAnalytics
)

export default router
