/**
 * Batch Operations Routes
 * 
 * API endpoints for bulk operations.
 */

import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate, validateUUID } from '../middleware/validate.js'
import { UserRole } from '../types/index.js'
import { z } from 'zod'
import * as batchController from '../controllers/batch.js'

const router = Router()

/**
 * @swagger
 * tags:
 *   - name: Batch
 *     description: Bulk operations
 */

// All routes require authentication
router.use(authenticate)

// ============================================
// Validation Schemas
// ============================================

const bulkEnrollSchema = z.object({
  course_id: z.string().uuid(),
  student_ids: z.array(z.string().uuid()).min(1).max(100),
  send_notifications: z.boolean().optional().default(true),
})

const bulkUnenrollSchema = z.object({
  course_id: z.string().uuid(),
  student_ids: z.array(z.string().uuid()).min(1).max(100),
})

const importStudentsSchema = z.object({
  students: z.array(z.object({
    email: z.string().email(),
    first_name: z.string().min(1).max(100),
    last_name: z.string().min(1).max(100),
    role: z.enum(['student', 'teacher']).optional(),
  })).min(1).max(500),
})

const copyCourseSchema = z.object({
  new_title: z.string().min(1).max(200),
})

// ============================================
// Enrollment Routes
// ============================================

/**
 * POST /api/batch/enroll - Bulk enroll students
 */
router.post(
  '/enroll',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ body: bulkEnrollSchema }),
  batchController.bulkEnroll
)

/**
 * POST /api/batch/unenroll - Bulk unenroll students
 */
router.post(
  '/unenroll',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ body: bulkUnenrollSchema }),
  batchController.bulkUnenroll
)

// ============================================
// Export Routes
// ============================================

/**
 * GET /api/batch/export-grades/:courseId - Export grades
 */
router.get(
  '/export-grades/:courseId',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validateUUID('courseId'),
  batchController.exportGrades
)

/**
 * GET /api/batch/export-registrar/:courseId - Export grades in Mabini Colleges registrar format (CSV)
 */
router.get(
  '/export-registrar/:courseId',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validateUUID('courseId'),
  batchController.exportRegistrarGrades
)

/**
 * GET /api/batch/export-registrar-xlsx/:courseId - Mabini Colleges registrar workbook (.xlsx),
 * mirrors the layout of TTH 1-2_30PM.xlsx (5 sheets, formulas, lookup table).
 */
router.get(
  '/export-registrar-xlsx/:courseId',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validateUUID('courseId'),
  batchController.exportRegistrarWorkbook
)

/**
 * GET /api/batch/export-my-grade/:courseId - Student self-export (own grade only, CSV)
 */
router.get(
  '/export-my-grade/:courseId',
  authorize(UserRole.STUDENT),
  validateUUID('courseId'),
  batchController.exportMyRegistrarGrades
)

/**
 * GET /api/batch/export-my-grade-xlsx/:courseId - Student self-export workbook
 * scoped to the authenticated student's row.
 */
router.get(
  '/export-my-grade-xlsx/:courseId',
  authorize(UserRole.STUDENT),
  validateUUID('courseId'),
  batchController.exportMyRegistrarWorkbook
)

// ============================================
// Import Routes
// ============================================

/**
 * POST /api/batch/import-students - Import students (admin only)
 */
router.post(
  '/import-students',
  authorize(UserRole.ADMIN),
  validate({ body: importStudentsSchema }),
  batchController.importStudents
)

// ============================================
// Course Copy
// ============================================

/**
 * POST /api/batch/copy-course/:courseId - Copy a course
 */
router.post(
  '/copy-course/:courseId',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validateUUID('courseId'),
  validate({ body: copyCourseSchema }),
  batchController.copyCourse
)

export default router
