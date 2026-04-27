import { Response, NextFunction } from 'express';
import { AuthRequest, UserRole } from '../types/index.js';
import * as enrollmentService from '../services/enrollments.js';

/**
 * @swagger
 * components:
 *   schemas:
 *     Enrollment:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         course_id:
 *           type: string
 *           format: uuid
 *         student_id:
 *           type: string
 *           format: uuid
 *         enrolled_at:
 *           type: string
 *           format: date-time
 *         status:
 *           type: string
 *           enum: [active, dropped, completed]
 *     EnrollmentWithCourse:
 *       allOf:
 *         - $ref: '#/components/schemas/Enrollment'
 *         - type: object
 *           properties:
 *             course:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 title:
 *                   type: string
 *                 description:
 *                   type: string
 *                 status:
 *                   type: string
 *                 teacher:
 *                   $ref: '#/components/schemas/UserProfile'
 *     EnrollmentWithStudent:
 *       allOf:
 *         - $ref: '#/components/schemas/Enrollment'
 *         - type: object
 *           properties:
 *             student:
 *               $ref: '#/components/schemas/UserProfile'
 */

/**
 * @swagger
 * /api/enrollments:
 *   post:
 *     summary: Enroll in a course
 *     tags: [Enrollments]
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
 *             properties:
 *               course_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Successfully enrolled
 *       400:
 *         description: Already enrolled or invalid course
 *       401:
 *         description: Unauthorized
 */
export const enroll = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { course_id } = req.body;
    const enrollment = await enrollmentService.enrollStudent(course_id, req.user!.id);

    res.status(201).json({
      success: true,
      data: enrollment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/enrollments/my-courses:
 *   get:
 *     summary: Get my enrolled courses
 *     tags: [Enrollments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, dropped, completed]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of enrolled courses
 *       401:
 *         description: Unauthorized
 */
export const getMyCourses = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await enrollmentService.getStudentEnrollments(req.user!.id, req.query as any);

    res.json({
      success: true,
      data: result.enrollments,
      meta: {
        total: result.total,
        limit: Number(req.query.limit) || 50,
        offset: Number(req.query.offset) || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/courses/{courseId}/roster:
 *   get:
 *     summary: Get course roster (enrolled students)
 *     tags: [Enrollments]
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, dropped, completed]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of enrolled students
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not course teacher
 *       404:
 *         description: Course not found
 */
export const getCourseRoster = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.params;
    const result = await enrollmentService.getCourseRoster(
      courseId,
      req.user!.id,
      req.user!.role as UserRole,
      req.query as any
    );

    res.json({
      success: true,
      data: result.enrollments,
      meta: {
        total: result.total,
        limit: Number(req.query.limit) || 50,
        offset: Number(req.query.offset) || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/enrollments/{id}:
 *   get:
 *     summary: Get enrollment by ID
 *     tags: [Enrollments]
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
 *         description: Enrollment details
 *       404:
 *         description: Enrollment not found
 */
export const getEnrollment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const enrollment = await enrollmentService.getEnrollmentById(req.params.id);

    res.json({
      success: true,
      data: enrollment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/enrollments/{id}/status:
 *   patch:
 *     summary: Update enrollment status
 *     tags: [Enrollments]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, dropped, completed]
 *     responses:
 *       200:
 *         description: Status updated
 *       400:
 *         description: Invalid status transition
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Enrollment not found
 */
export const updateStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const enrollment = await enrollmentService.updateEnrollmentStatus(
      req.params.id,
      req.body,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.json({
      success: true,
      data: enrollment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/enrollments/{id}:
 *   delete:
 *     summary: Unenroll from a course
 *     tags: [Enrollments]
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
 *         description: Successfully unenrolled
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Enrollment not found
 */
export const unenroll = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await enrollmentService.unenrollStudent(
      req.params.id,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.json({
      success: true,
      data: { message: 'Successfully unenrolled from course' },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/enrollments/course/{courseId}/status:
 *   get:
 *     summary: Check enrollment status for a course
 *     tags: [Enrollments]
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
 *         description: Enrollment status
 *       401:
 *         description: Unauthorized
 */
export const getEnrollmentStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.params;
    const status = await enrollmentService.getEnrollmentStatusForUser(
      courseId,
      req.user!.id
    );

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
};

export const setMyArchive = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
  archive: boolean
): Promise<void> => {
  try {
    const { courseId } = req.params;
    const result = await enrollmentService.setMyEnrollmentArchive(
      courseId,
      req.user!.id,
      archive
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
