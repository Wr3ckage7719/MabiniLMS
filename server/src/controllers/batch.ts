/**
 * Batch Operations Controller
 * 
 * HTTP handlers for bulk operations.
 */

import { Response, NextFunction } from 'express'
import { AuthRequest, UserRole } from '../types/index.js'
import * as batchService from '../services/batch.js'
import { buildRegistrarWorkbook } from '../services/registrar-export.js'

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// ============================================
// Bulk Enrollment
// ============================================

/**
 * @swagger
 * /api/batch/enroll:
 *   post:
 *     summary: Bulk enroll students in a course
 *     tags: [Batch]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - course_id
 *               - student_ids
 *             properties:
 *               course_id:
 *                 type: string
 *                 format: uuid
 *               student_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               send_notifications:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Enrollment results
 */
export const bulkEnroll = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await batchService.bulkEnroll(
      req.body,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * @swagger
 * /api/batch/unenroll:
 *   post:
 *     summary: Bulk unenroll students from a course
 *     tags: [Batch]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - course_id
 *               - student_ids
 *             properties:
 *               course_id:
 *                 type: string
 *                 format: uuid
 *               student_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       200:
 *         description: Unenrollment results
 */
export const bulkUnenroll = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await batchService.bulkUnenroll(
      req.body,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

// ============================================
// Grade Export
// ============================================

/**
 * @swagger
 * /api/batch/export-grades/{courseId}:
 *   get:
 *     summary: Export grades for a course
 *     tags: [Batch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: assignmentId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, json]
 *           default: json
 *       - in: query
 *         name: include_feedback
 *         schema:
 *           type: boolean
 *           default: false
 *       - in: query
 *         name: include_student_info
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: Grade export data
 */
export const exportGrades = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.params
    const {
      assignmentId,
      format = 'json',
      include_feedback,
      include_student_info,
    } = req.query

    const result = await batchService.exportGrades(
      courseId,
      assignmentId as string | null,
      {
        format: format as 'csv' | 'json',
        include_feedback: include_feedback === 'true',
        include_student_info: include_student_info === 'true',
      },
      req.user!.id,
      req.user!.role as UserRole
    )

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename="grades-${courseId}.csv"`)
      res.send(result)
    } else {
      res.json({
        success: true,
        data: result,
      })
    }
  } catch (error) {
    next(error)
  }
}

// ============================================
// Registrar Export
// ============================================

export const exportRegistrarGrades = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.params
    const detailed = req.query.detailed === 'true' || req.query.detailed === '1'
    const csv = await batchService.exportRegistrarGrades(
      courseId,
      req.user!.id,
      req.user!.role as UserRole,
      undefined,
      { detailed }
    )
    res.setHeader('Content-Type', 'text/csv')
    const suffix = detailed ? '-detailed' : ''
    res.setHeader('Content-Disposition', `attachment; filename="registrar-grades${suffix}-${courseId}.csv"`)
    res.send(csv)
  } catch (error) {
    next(error)
  }
}

/**
 * Student self-export: same Mabini 4-period registrar format,
 * scoped to the authenticated student's row only.
 */
export const exportMyRegistrarGrades = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.params
    const csv = await batchService.exportRegistrarGrades(
      courseId,
      req.user!.id,
      req.user!.role as UserRole,
      req.user!.id
    )
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="my-grade-${courseId}.csv"`)
    res.send(csv)
  } catch (error) {
    next(error)
  }
}

// ============================================
// Registrar Export — Mabini Colleges xlsx workbook (mirrors TTH 1-2_30PM.xlsx)
// ============================================

export const exportRegistrarWorkbook = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.params
    const { buffer, filename } = await buildRegistrarWorkbook(
      courseId,
      req.user!.id,
      req.user!.role as UserRole
    )
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(buffer)
  } catch (error) {
    next(error)
  }
}

export const exportMyRegistrarWorkbook = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.params
    const { buffer, filename } = await buildRegistrarWorkbook(
      courseId,
      req.user!.id,
      req.user!.role as UserRole,
      { scopeStudentId: req.user!.id }
    )
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(buffer)
  } catch (error) {
    next(error)
  }
}

// ============================================
// Student Import
// ============================================

/**
 * @swagger
 * /api/batch/import-students:
 *   post:
 *     summary: Bulk import students (admin only)
 *     tags: [Batch]
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
 *                     role:
 *                       type: string
 *                       enum: [student, teacher]
 *     responses:
 *       200:
 *         description: Import results
 */
export const importStudents = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { students } = req.body

    const result = await batchService.importStudents(
      students,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

// ============================================
// Course Copy
// ============================================

/**
 * @swagger
 * /api/batch/copy-course/{courseId}:
 *   post:
 *     summary: Copy a course with materials and assignments
 *     tags: [Batch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - new_title
 *             properties:
 *               new_title:
 *                 type: string
 *     responses:
 *       201:
 *         description: Course copied
 */
export const copyCourse = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.params
    const { new_title } = req.body

    const result = await batchService.copyCourse(
      courseId,
      new_title,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.status(201).json({
      success: true,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}
