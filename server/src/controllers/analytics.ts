/**
 * Analytics Controller
 * 
 * HTTP handlers for analytics endpoints.
 */

import { Response, NextFunction } from 'express'
import { AuthRequest, UserRole } from '../types/index.js'
import * as analyticsService from '../services/analytics.js'

// ============================================
// Course Analytics
// ============================================

/**
 * @swagger
 * /api/analytics/courses/{courseId}:
 *   get:
 *     summary: Get analytics for a course
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Course analytics
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Course not found
 */
export const getCourseAnalytics = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const analytics = await analyticsService.getCourseAnalytics(
      req.params.courseId,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.json({
      success: true,
      data: analytics,
    })
  } catch (error) {
    next(error)
  }
}

// ============================================
// Student Analytics
// ============================================

/**
 * @swagger
 * /api/analytics/students/{studentId}:
 *   get:
 *     summary: Get analytics for a student
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Student analytics
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Student not found
 */
export const getStudentAnalytics = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const analytics = await analyticsService.getStudentAnalytics(
      req.params.studentId,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.json({
      success: true,
      data: analytics,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * @swagger
 * /api/analytics/me:
 *   get:
 *     summary: Get analytics for current user (student/teacher)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User analytics
 */
export const getMyAnalytics = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userRole = req.user!.role as UserRole

    if (userRole === UserRole.STUDENT) {
      const analytics = await analyticsService.getStudentAnalytics(
        req.user!.id,
        req.user!.id,
        userRole
      )
      res.json({ success: true, data: analytics })
    } else if (userRole === UserRole.TEACHER) {
      const analytics = await analyticsService.getTeacherAnalytics(
        req.user!.id,
        req.user!.id,
        userRole
      )
      res.json({ success: true, data: analytics })
    } else {
      // Admin - return platform analytics
      const analytics = await analyticsService.getPlatformAnalytics(
        req.user!.id,
        userRole
      )
      res.json({ success: true, data: analytics })
    }
  } catch (error) {
    next(error)
  }
}

// ============================================
// Teacher Analytics
// ============================================

/**
 * @swagger
 * /api/analytics/teachers/{teacherId}:
 *   get:
 *     summary: Get analytics for a teacher
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teacherId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Teacher analytics
 *       403:
 *         description: Not authorized
 */
export const getTeacherAnalytics = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const analytics = await analyticsService.getTeacherAnalytics(
      req.params.teacherId,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.json({
      success: true,
      data: analytics,
    })
  } catch (error) {
    next(error)
  }
}

// ============================================
// Platform Analytics (Admin only)
// ============================================

/**
 * @swagger
 * /api/analytics/platform:
 *   get:
 *     summary: Get platform-wide analytics (admin only)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Platform analytics
 *       403:
 *         description: Admin access required
 */
export const getPlatformAnalytics = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const analytics = await analyticsService.getPlatformAnalytics(
      req.user!.id,
      req.user!.role as UserRole
    )

    res.json({
      success: true,
      data: analytics,
    })
  } catch (error) {
    next(error)
  }
}
