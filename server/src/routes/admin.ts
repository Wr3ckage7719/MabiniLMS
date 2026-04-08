import { Router } from 'express'
import * as adminController from '../controllers/admin.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { UserRole } from '../types/index.js'
import { z } from 'zod'

const router = Router()

/**
 * @openapi
 * tags:
 *   - name: Admin
 *     description: Admin operations for managing users and system settings
 */

// All admin routes require authentication and admin role
router.use(authenticate)
router.use(authorize(UserRole.ADMIN))

// ========================================
// Teacher Approval Routes
// ========================================

/**
 * List pending teachers
 */
router.get(
  '/teachers/pending',
  adminController.listPendingTeachers
)

/**
 * Approve a teacher
 */
router.post(
  '/teachers/:id/approve',
  validate({
    params: z.object({
      id: z.string().uuid('Invalid teacher ID')
    })
  }),
  adminController.approveTeacher
)

/**
 * Reject a teacher
 */
router.post(
  '/teachers/:id/reject',
  validate({
    params: z.object({
      id: z.string().uuid('Invalid teacher ID')
    }),
    body: z.object({
      reason: z.string().optional()
    })
  }),
  adminController.rejectTeacher
)

// ========================================
// Student Management Routes
// ========================================

/**
 * List all students
 */
router.get(
  '/students',
  adminController.listStudents
)

/**
 * Create a single student account
 */
router.post(
  '/students',
  validate({
    body: z.object({
      email: z.string().email('Invalid email address'),
      first_name: z.string().min(1, 'First name is required'),
      last_name: z.string().min(1, 'Last name is required'),
      student_id: z.string().optional()
    })
  }),
  adminController.createStudent
)

/**
 * Bulk create student accounts
 */
router.post(
  '/students/bulk',
  validate({
    body: z.object({
      students: z.array(
        z.object({
          email: z.string().email('Invalid email address'),
          first_name: z.string().min(1, 'First name is required'),
          last_name: z.string().min(1, 'Last name is required'),
          student_id: z.string().optional()
        })
      ).min(1, 'At least one student is required')
    })
  }),
  adminController.bulkCreateStudents
)

// ========================================
// System Settings Routes
// ========================================

/**
 * Get all system settings
 */
router.get(
  '/settings',
  adminController.getSettings
)

/**
 * Update system settings
 */
router.put(
  '/settings',
  validate({
    body: z.record(z.any()).refine(
      (data) => Object.keys(data).length > 0,
      { message: 'At least one setting is required' }
    )
  }),
  adminController.updateSettings
)

// ========================================
// Audit Log Routes
// ========================================

/**
 * Get audit logs
 */
router.get(
  '/audit-logs',
  validate({
    query: z.object({
      admin_id: z.string().uuid().optional(),
      action_type: z.string().optional(),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      limit: z.string().regex(/^\d+$/).optional(),
      offset: z.string().regex(/^\d+$/).optional()
    })
  }),
  adminController.getAuditLogs
)

// ========================================
// Dashboard Stats Routes
// ========================================

/**
 * Get dashboard statistics
 */
router.get(
  '/stats',
  adminController.getDashboardStats
)

export default router
