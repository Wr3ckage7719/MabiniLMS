import { Response, NextFunction } from 'express';
import { AuthRequest, UserRole } from '../types/index.js';
import * as assignmentService from '../services/assignments.js';

/**
 * @swagger
 * components:
 *   schemas:
 *     Assignment:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         course_id:
 *           type: string
 *           format: uuid
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         due_date:
 *           type: string
 *           format: date-time
 *         max_points:
 *           type: integer
 *         created_at:
 *           type: string
 *           format: date-time
 *     Submission:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         assignment_id:
 *           type: string
 *         student_id:
 *           type: string
 *         drive_file_id:
 *           type: string
 *         drive_view_link:
 *           type: string
 *         drive_file_name:
 *           type: string
 *         content:
 *           type: string
 *         submitted_at:
 *           type: string
 *         status:
 *           type: string
 *           enum: [submitted, graded, late]
 */

// ============================================
// Assignment Controllers
// ============================================

/**
 * @swagger
 * /api/courses/{courseId}/assignments:
 *   post:
 *     summary: Create assignment
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               assignment_type:
 *                 type: string
 *                 enum: [exam, quiz, activity]
 *                 default: activity
 *               due_date:
 *                 type: string
 *                 format: date-time
 *               max_points:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Assignment created
 */
export const createAssignment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.params;
    const assignment = await assignmentService.createAssignment(
      courseId,
      req.body,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.status(201).json({
      success: true,
      data: assignment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/assignments:
 *   get:
 *     summary: List assignments
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: course_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: include_past
 *         schema:
 *           type: string
 *           enum: [true, false]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of assignments
 */
export const listAssignments = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await assignmentService.listAssignments(
      req.query as any,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.json({
      success: true,
      data: result.assignments,
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
 * /api/assignments/{id}:
 *   get:
 *     summary: Get assignment by ID
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Assignment details
 */
export const getAssignment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const assignment = await assignmentService.getAssignmentById(req.params.id);

    res.json({
      success: true,
      data: assignment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/assignments/{id}:
 *   put:
 *     summary: Update assignment
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Assignment updated
 */
export const updateAssignment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const assignment = await assignmentService.updateAssignment(
      req.params.id,
      req.body,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.json({
      success: true,
      data: assignment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/assignments/{id}:
 *   delete:
 *     summary: Delete assignment
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Assignment deleted
 */
export const deleteAssignment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await assignmentService.deleteAssignment(
      req.params.id,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.json({
      success: true,
      data: { message: 'Assignment deleted successfully' },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// Submission Controllers
// ============================================

/**
 * @swagger
 * /api/assignments/{assignmentId}/submit:
 *   post:
 *     summary: Submit assignment
 *     tags: [Submissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Provide either provider_file_id (preferred) or drive_file_id (legacy alias).
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [google_drive]
 *               provider_file_id:
 *                 type: string
 *                 description: Preferred provider-backed file identifier.
 *               provider_file_name:
 *                 type: string
 *                 description: Optional provider-backed file name override.
 *               drive_file_id:
 *                 type: string
 *                 description: Legacy alias for provider_file_id.
 *               drive_file_name:
 *                 type: string
 *                 description: Legacy alias for provider_file_name.
 *               content:
 *                 type: string
 *               sync_key:
 *                 type: string
 *     responses:
 *       201:
 *         description: Assignment submitted
 */
export const submitAssignment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { assignmentId } = req.params;
    const submission = await assignmentService.submitAssignment(
      assignmentId,
      req.body,
      req.user!.id
    );

    res.status(201).json({
      success: true,
      data: submission,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/assignments/{assignmentId}/submissions:
 *   get:
 *     summary: List submissions (teacher)
 *     tags: [Submissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of submissions
 */
export const listSubmissions = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { assignmentId } = req.params;
    const submissions = await assignmentService.listSubmissions(
      assignmentId,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.json({
      success: true,
      data: submissions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/assignments/{assignmentId}/submissions/storage-diagnostics:
 *   get:
 *     summary: Get submission storage metadata diagnostics (teacher/admin)
 *     tags: [Submissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Submission storage metadata diagnostics report
 */
export const getSubmissionStorageDiagnostics = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { assignmentId } = req.params;
    const diagnostics = await assignmentService.getAssignmentSubmissionStorageDiagnostics(
      assignmentId,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.json({
      success: true,
      data: diagnostics,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/assignments/{assignmentId}/my-submission:
 *   get:
 *     summary: Get my submission (student)
 *     tags: [Submissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: My submission
 */
export const getMySubmission = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { assignmentId } = req.params;
    const submission = await assignmentService.getMySubmission(
      assignmentId,
      req.user!.id
    );

    res.json({
      success: true,
      data: submission,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/submissions/{id}:
 *   get:
 *     summary: Get submission by ID
 *     tags: [Submissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Submission details
 */
export const getSubmission = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const submission = await assignmentService.getSubmissionById(
      req.params.id,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.json({
      success: true,
      data: submission,
    });
  } catch (error) {
    next(error);
  }
};

export const transitionSubmissionStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const submission = await assignmentService.transitionSubmissionStatus(
      req.params.id,
      req.body,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.json({
      success: true,
      data: submission,
    });
  } catch (error) {
    next(error);
  }
};

export const requestSubmissionRevision = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const submission = await assignmentService.requestSubmissionRevision(
      req.params.id,
      req.body.reason,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.json({
      success: true,
      data: submission,
    });
  } catch (error) {
    next(error);
  }
};

export const getSubmissionTimeline = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const timeline = await assignmentService.getSubmissionStatusTimeline(
      req.params.id,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.json({
      success: true,
      data: timeline,
    });
  } catch (error) {
    next(error);
  }
};

export const listComments = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { assignmentId } = req.params;
    const comments = await assignmentService.listAssignmentComments(
      assignmentId,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.json({
      success: true,
      data: comments,
    });
  } catch (error) {
    next(error);
  }
};

export const createComment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { assignmentId } = req.params;
    const comment = await assignmentService.createAssignmentComment(
      assignmentId,
      req.body,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.status(201).json({
      success: true,
      data: comment,
    });
  } catch (error) {
    next(error);
  }
};
