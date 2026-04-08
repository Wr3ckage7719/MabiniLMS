/**
 * Grades Controller
 * 
 * HTTP handlers for grading endpoints.
 */

import { Response, NextFunction } from 'express'
import { AuthRequest, UserRole } from '../types/index.js'
import * as gradeService from '../services/grades.js'

// ============================================
// Student Grade Controllers
// ============================================

/**
 * @swagger
 * /api/grades/my-grades:
 *   get:
 *     summary: Get all grades for current student
 *     tags: [Grades]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all student grades across courses
 *       401:
 *         description: Unauthorized
 */
export const getMyGrades = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const grades = await gradeService.getStudentGrades(req.user!.id)

    res.json({
      success: true,
      data: grades,
      meta: {
        total: grades.length,
      },
    })
  } catch (error) {
    next(error)
  }
}

// ============================================
// Grade CRUD Controllers
// ============================================

/**
 * @swagger
 * /api/grades:
 *   post:
 *     summary: Create a grade for a submission
 *     tags: [Grades]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - submission_id
 *               - points_earned
 *             properties:
 *               submission_id:
 *                 type: string
 *                 format: uuid
 *               points_earned:
 *                 type: number
 *               feedback:
 *                 type: string
 *     responses:
 *       201:
 *         description: Grade created
 *       400:
 *         description: Invalid input
 *       403:
 *         description: Not authorized
 *       409:
 *         description: Grade already exists
 */
export const createGrade = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const grade = await gradeService.createGrade(
      req.body,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.status(201).json({
      success: true,
      data: grade,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * @swagger
 * /api/grades/{id}:
 *   get:
 *     summary: Get grade by ID
 *     tags: [Grades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Grade details
 *       404:
 *         description: Grade not found
 */
export const getGrade = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const grade = await gradeService.getGradeById(req.params.id)

    res.json({
      success: true,
      data: grade,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * @swagger
 * /api/grades/{id}:
 *   put:
 *     summary: Update a grade
 *     tags: [Grades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               points_earned:
 *                 type: number
 *               feedback:
 *                 type: string
 *     responses:
 *       200:
 *         description: Grade updated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Grade not found
 */
export const updateGrade = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const grade = await gradeService.updateGrade(
      req.params.id,
      req.body,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.json({
      success: true,
      data: grade,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * @swagger
 * /api/grades/{id}:
 *   delete:
 *     summary: Delete a grade
 *     tags: [Grades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Grade deleted
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Grade not found
 */
export const deleteGrade = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await gradeService.deleteGrade(
      req.params.id,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.json({
      success: true,
      data: { message: 'Grade deleted successfully' },
    })
  } catch (error) {
    next(error)
  }
}

// ============================================
// Submission Grade Controllers
// ============================================

/**
 * @swagger
 * /api/submissions/{submissionId}/grade:
 *   get:
 *     summary: Get grade for a submission
 *     tags: [Grades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: submissionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Grade details (or null if not graded)
 */
export const getSubmissionGrade = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const grade = await gradeService.getGradeBySubmissionId(req.params.submissionId)

    res.json({
      success: true,
      data: grade,
    })
  } catch (error) {
    next(error)
  }
}

// ============================================
// Assignment Grade Controllers
// ============================================

/**
 * @swagger
 * /api/assignments/{assignmentId}/grades:
 *   get:
 *     summary: List all grades for an assignment
 *     tags: [Grades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of grades
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Assignment not found
 */
export const listAssignmentGrades = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const grades = await gradeService.listAssignmentGrades(
      req.params.assignmentId,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.json({
      success: true,
      data: grades,
      meta: {
        total: grades.length,
      },
    })
  } catch (error) {
    next(error)
  }
}

/**
 * @swagger
 * /api/assignments/{assignmentId}/grades/stats:
 *   get:
 *     summary: Get grade statistics for an assignment
 *     tags: [Grades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Grade statistics
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Assignment not found
 */
export const getAssignmentGradeStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const stats = await gradeService.getAssignmentGradeStats(
      req.params.assignmentId,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    next(error)
  }
}

// ============================================
// Bulk Operations
// ============================================

/**
 * @swagger
 * /api/grades/bulk:
 *   post:
 *     summary: Bulk create/update grades
 *     tags: [Grades]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - grades
 *             properties:
 *               grades:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     submission_id:
 *                       type: string
 *                       format: uuid
 *                     points_earned:
 *                       type: number
 *                     feedback:
 *                       type: string
 *     responses:
 *       200:
 *         description: Bulk grading results
 *       403:
 *         description: Not authorized
 */
export const bulkGrade = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const results = await gradeService.bulkGrade(
      req.body,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.json({
      success: true,
      data: results,
    })
  } catch (error) {
    next(error)
  }
}
