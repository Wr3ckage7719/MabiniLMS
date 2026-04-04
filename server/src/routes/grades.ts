/**
 * Grades Routes
 * 
 * API endpoints for grading submissions.
 */

import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { UserRole } from '../types/index.js'
import {
  createGradeSchema,
  updateGradeSchema,
  gradeIdParamSchema,
  submissionGradeParamSchema,
  assignmentGradesParamSchema,
  bulkGradeSchema,
} from '../types/grades.js'
import * as gradeController from '../controllers/grades.js'

const router = Router()

/**
 * @swagger
 * tags:
 *   - name: Grades
 *     description: Grade management for submissions
 */

// All routes require authentication
router.use(authenticate)

// ============================================
// Grade CRUD Routes
// ============================================

/**
 * POST /api/grades - Create a grade (teacher/admin)
 */
router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ body: createGradeSchema }),
  gradeController.createGrade
)

/**
 * GET /api/grades/:id - Get grade by ID
 */
router.get(
  '/:id',
  validate({ params: gradeIdParamSchema }),
  gradeController.getGrade
)

/**
 * PUT /api/grades/:id - Update grade (teacher/admin)
 */
router.put(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: gradeIdParamSchema, body: updateGradeSchema }),
  gradeController.updateGrade
)

/**
 * DELETE /api/grades/:id - Delete grade (teacher/admin)
 */
router.delete(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: gradeIdParamSchema }),
  gradeController.deleteGrade
)

// ============================================
// Bulk Operations
// ============================================

/**
 * POST /api/grades/bulk - Bulk create/update grades (teacher/admin)
 */
router.post(
  '/bulk',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ body: bulkGradeSchema }),
  gradeController.bulkGrade
)

// ============================================
// Submission Grade Routes
// ============================================

/**
 * GET /api/grades/submission/:submissionId - Get grade for submission
 */
router.get(
  '/submission/:submissionId',
  validate({ params: submissionGradeParamSchema }),
  gradeController.getSubmissionGrade
)

// ============================================
// Assignment Grade Routes
// ============================================

/**
 * GET /api/grades/assignment/:assignmentId - List all grades for assignment
 */
router.get(
  '/assignment/:assignmentId',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: assignmentGradesParamSchema }),
  gradeController.listAssignmentGrades
)

/**
 * GET /api/grades/assignment/:assignmentId/stats - Get grade statistics
 */
router.get(
  '/assignment/:assignmentId/stats',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: assignmentGradesParamSchema }),
  gradeController.getAssignmentGradeStats
)

export default router
