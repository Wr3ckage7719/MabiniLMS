import { Response, NextFunction } from 'express'
import { AuthRequest, ApiResponse, ApiError, ErrorCode } from '../types/index.js'
import * as adminService from '../services/admin.js'

/**
 * Admin Controller
 * Handles HTTP requests for admin operations
 */

/**
 * @openapi
 * /api/admin/teachers/pending:
 *   get:
 *     summary: List pending teachers
 *     description: Get all teachers waiting for admin approval
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending teachers
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
export const listPendingTeachers = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const teachers = await adminService.listPendingTeachers()

    const response: ApiResponse = {
      success: true,
      data: teachers
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
}

/**
 * @openapi
 * /api/admin/teachers/{id}/approve:
 *   post:
 *     summary: Approve a teacher account
 *     description: Approve a pending teacher and grant access to teacher features
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Teacher user ID
 *     responses:
 *       200:
 *         description: Teacher approved successfully
 *       404:
 *         description: Teacher not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
export const approveTeacher = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params
    const adminId = req.user!.id
    const ipAddress = req.ip
    const userAgent = req.get('user-agent')

    await adminService.approveTeacher(id, adminId, ipAddress, userAgent)

    const response: ApiResponse = {
      success: true,
      data: { message: 'Teacher approved successfully' }
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
}

/**
 * @openapi
 * /api/admin/teachers/{id}/reject:
 *   post:
 *     summary: Reject a teacher account
 *     description: Reject a pending teacher application
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Teacher user ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Optional reason for rejection
 *     responses:
 *       200:
 *         description: Teacher rejected successfully
 *       404:
 *         description: Teacher not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
export const rejectTeacher = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params
    const { reason } = req.body
    const adminId = req.user!.id
    const ipAddress = req.ip
    const userAgent = req.get('user-agent')

    await adminService.rejectTeacher(id, adminId, reason, ipAddress, userAgent)

    const response: ApiResponse = {
      success: true,
      data: { message: 'Teacher rejected successfully' }
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
}

/**
 * @openapi
 * /api/admin/students:
 *   get:
 *     summary: List all students
 *     description: Get paginated list of all student accounts
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 50
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *         description: Search by name or email
 *     responses:
 *       200:
 *         description: List of students
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
export const listStudents = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // This uses the existing users service with student filter
    // Will be implemented via users service
    const response: ApiResponse = {
      success: true,
      data: { message: 'Use /api/users endpoint with role=student filter' }
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
}

/**
 * @openapi
 * /api/admin/students:
 *   post:
 *     summary: Create a student account
 *     description: Create a new student account with temporary password
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - first_name
 *               - last_name
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               student_id:
 *                 type: string
 *     responses:
 *       201:
 *         description: Student created successfully
 *       400:
 *         description: Invalid input or student already exists
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
export const createStudent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, first_name, last_name, student_id } = req.body
    const adminId = req.user!.id
    const ipAddress = req.ip
    const userAgent = req.get('user-agent')

    const result = await adminService.createStudentAccount(
      { email, first_name, last_name, student_id },
      adminId,
      ipAddress,
      userAgent
    )

    const response: ApiResponse = {
      success: true,
      data: {
        message: 'Student account created successfully',
        student: result.student,
        temporary_password: result.temporaryPassword
      }
    }
    res.status(201).json(response)
  } catch (error) {
    next(error)
  }
}

/**
 * @openapi
 * /api/admin/students/bulk:
 *   post:
 *     summary: Bulk create student accounts
 *     description: Create multiple student accounts from CSV data
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - students
 *             properties:
 *               students:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - email
 *                     - first_name
 *                     - last_name
 *                   properties:
 *                     email:
 *                       type: string
 *                       format: email
 *                     first_name:
 *                       type: string
 *                     last_name:
 *                       type: string
 *                     student_id:
 *                       type: string
 *     responses:
 *       200:
 *         description: Bulk creation completed
 *       400:
 *         description: Invalid input
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
export const bulkCreateStudents = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { students } = req.body

    if (!Array.isArray(students) || students.length === 0) {
      throw new ApiError(
        ErrorCode.VALIDATION_ERROR,
        'Students array is required and must not be empty',
        400
      )
    }

    const adminId = req.user!.id
    const ipAddress = req.ip
    const userAgent = req.get('user-agent')

    const result = await adminService.bulkCreateStudents(
      students,
      adminId,
      ipAddress,
      userAgent
    )

    const response: ApiResponse = {
      success: true,
      data: {
        message: `Bulk creation completed: ${result.created} created, ${result.failed} failed`,
        ...result
      }
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
}

/**
 * Update a teacher/student account from admin panel
 */
export const updateManagedUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params
    const { email, first_name, last_name } = req.body
    const adminId = req.user!.id
    const ipAddress = req.ip
    const userAgent = req.get('user-agent')

    const user = await adminService.updateManagedUser(
      id,
      { email, first_name, last_name },
      adminId,
      ipAddress,
      userAgent
    )

    const response: ApiResponse = {
      success: true,
      data: {
        message: 'User updated successfully',
        user,
      }
    }

    res.json(response)
  } catch (error) {
    next(error)
  }
}

/**
 * Delete a teacher/student account from admin panel
 */
export const deleteManagedUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params
    const adminId = req.user!.id
    const ipAddress = req.ip
    const userAgent = req.get('user-agent')

    await adminService.deleteManagedUser(id, adminId, ipAddress, userAgent)

    const response: ApiResponse = {
      success: true,
      data: {
        message: 'User deleted successfully',
      }
    }

    res.json(response)
  } catch (error) {
    next(error)
  }
}

/**
 * @openapi
 * /api/admin/settings:
 *   get:
 *     summary: Get system settings
 *     description: Get all system settings
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System settings
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
export const getSettings = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const settings = await adminService.getAllSystemSettings()

    const response: ApiResponse = {
      success: true,
      data: settings
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
}

/**
 * @openapi
 * /api/admin/settings:
 *   put:
 *     summary: Update system settings
 *     description: Update one or more system settings
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *             example:
 *               institutional_email_domains: ["school.edu", "university.edu"]
 *               require_teacher_approval: true
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
export const updateSettings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const settings = req.body
    const adminId = req.user!.id
    const ipAddress = req.ip
    const userAgent = req.get('user-agent')

    // Update each setting
    for (const [key, value] of Object.entries(settings)) {
      await adminService.updateSystemSetting(key, value, adminId, ipAddress, userAgent)
    }

    const response: ApiResponse = {
      success: true,
      data: { message: 'Settings updated successfully' }
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
}

/**
 * @openapi
 * /api/admin/audit-logs:
 *   get:
 *     summary: Get audit logs
 *     description: Get paginated admin action audit logs
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: admin_id
 *         in: query
 *         schema:
 *           type: string
 *       - name: action_type
 *         in: query
 *         schema:
 *           type: string
 *       - name: start_date
 *         in: query
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: end_date
 *         in: query
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 50
 *       - name: offset
 *         in: query
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Audit logs
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
export const getAuditLogs = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      admin_id,
      action_type,
      start_date,
      end_date,
      limit = '50',
      offset = '0'
    } = req.query

    const filters: adminService.AuditLogFilter = {
      admin_id: admin_id as string | undefined,
      action_type: action_type as string | undefined,
      start_date: start_date as string | undefined,
      end_date: end_date as string | undefined,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10)
    }

    const result = await adminService.getAuditLogs(filters)

    const response: ApiResponse = {
      success: true,
      data: {
        logs: result.logs,
        total: result.total,
        limit: filters.limit,
        offset: filters.offset
      }
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
}

/**
 * @openapi
 * /api/admin/stats:
 *   get:
 *     summary: Get admin dashboard statistics
 *     description: Get statistics for admin dashboard
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
export const getDashboardStats = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const stats = await adminService.getDashboardStats()

    const response: ApiResponse = {
      success: true,
      data: stats
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
}
