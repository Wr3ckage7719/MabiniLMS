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
const approveTeacherSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid teacher ID')
  })
})

router.post(
  '/teachers/:id/approve',
  validate(approveTeacherSchema),
  adminController.approveTeacher
)

/**
 * Reject a teacher
 */
const rejectTeacherSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid teacher ID')
  }),
  body: z.object({
    reason: z.string().optional()
  })
})

router.post(
  '/teachers/:id/reject',
  validate(rejectTeacherSchema),
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
const createStudentSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    first_name: z.string().min(1, 'First name is required'),
    last_name: z.string().min(1, 'Last name is required'),
    student_id: z.string().optional()
  })
})

router.post(
  '/students',
  validate(createStudentSchema),
  adminController.createStudent
)

/**
 * Bulk create student accounts
 */
const bulkCreateStudentsSchema = z.object({
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
})

router.post(
  '/students/bulk',
  validate(bulkCreateStudentsSchema),
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
const updateSettingsSchema = z.object({
  body: z.record(z.any()).refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one setting is required' }
  )
})

router.put(
  '/settings',
  validate(updateSettingsSchema),
  adminController.updateSettings
)

// ========================================
// Audit Log Routes
// ========================================

/**
 * Get audit logs
 */
const auditLogsQuerySchema = z.object({
  query: z.object({
    admin_id: z.string().uuid().optional(),
    action_type: z.string().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    offset: z.string().regex(/^\d+$/).optional()
  })
})

router.get(
  '/audit-logs',
  validate(auditLogsQuerySchema),
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
