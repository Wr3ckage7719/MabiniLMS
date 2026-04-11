import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { UserRole } from '../types/index.js';
import {
  createAssignmentSchema,
  updateAssignmentSchema,
  courseAssignmentsParamSchema,
  assignmentIdParamSchema,
  listAssignmentsQuerySchema,
  createSubmissionSchema,
  transitionSubmissionStatusSchema,
  requestRevisionSchema,
  assignmentSubmissionsParamSchema,
  submissionIdParamSchema,
  createAssignmentCommentSchema,
  assignmentCommentsParamSchema,
} from '../types/assignments.js';
import * as assignmentController from '../controllers/assignments.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: Assignments
 *     description: Assignment management
 *   - name: Submissions
 *     description: Assignment submissions
 */

// All routes require authentication
router.use(authenticate);

// ============================================
// Assignment Routes
// ============================================

// GET /api/assignments - List assignments (filtered by role)
router.get(
  '/',
  validate({ query: listAssignmentsQuerySchema }),
  assignmentController.listAssignments
);

// POST /api/courses/:courseId/assignments - Create assignment (teacher/admin)
router.post(
  '/courses/:courseId/assignments',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: courseAssignmentsParamSchema, body: createAssignmentSchema }),
  assignmentController.createAssignment
);

// GET /api/assignments/:id - Get assignment by ID
router.get(
  '/:id',
  validate({ params: assignmentIdParamSchema }),
  assignmentController.getAssignment
);

// PATCH /api/assignments/:id - Update assignment (teacher/admin)
router.patch(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: assignmentIdParamSchema, body: updateAssignmentSchema }),
  assignmentController.updateAssignment
);

// DELETE /api/assignments/:id - Delete assignment (teacher/admin)
router.delete(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: assignmentIdParamSchema }),
  assignmentController.deleteAssignment
);

// ============================================
// Submission Routes
// ============================================

// POST /api/assignments/:assignmentId/submit - Submit assignment (student)
router.post(
  '/:assignmentId/submit',
  authorize(UserRole.STUDENT),
  validate({ params: assignmentSubmissionsParamSchema, body: createSubmissionSchema }),
  assignmentController.submitAssignment
);

// GET /api/assignments/:assignmentId/my-submission - Get my submission (student)
router.get(
  '/:assignmentId/my-submission',
  authorize(UserRole.STUDENT),
  validate({ params: assignmentSubmissionsParamSchema }),
  assignmentController.getMySubmission
);

// GET /api/assignments/:assignmentId/submissions - List submissions (teacher/admin)
router.get(
  '/:assignmentId/submissions',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: assignmentSubmissionsParamSchema }),
  assignmentController.listSubmissions
);

// GET /api/assignments/:assignmentId/comments - List comments
router.get(
  '/:assignmentId/comments',
  validate({ params: assignmentCommentsParamSchema }),
  assignmentController.listComments
);

// POST /api/assignments/:assignmentId/comments - Add comment
router.post(
  '/:assignmentId/comments',
  validate({ params: assignmentCommentsParamSchema, body: createAssignmentCommentSchema }),
  assignmentController.createComment
);

// ============================================
// Submission Detail Routes
// ============================================

// PATCH /api/assignments/submissions/:id/status - transition submission status
router.patch(
  '/submissions/:id/status',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: submissionIdParamSchema, body: transitionSubmissionStatusSchema }),
  assignmentController.transitionSubmissionStatus
);

// POST /api/assignments/submissions/:id/request-revision - request student revision
router.post(
  '/submissions/:id/request-revision',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: submissionIdParamSchema, body: requestRevisionSchema }),
  assignmentController.requestSubmissionRevision
);

// GET /api/assignments/submissions/:id/timeline - immutable status timeline
router.get(
  '/submissions/:id/timeline',
  validate({ params: submissionIdParamSchema }),
  assignmentController.getSubmissionTimeline
);

// GET /api/submissions/:id - Get submission by ID
router.get(
  '/submissions/:id',
  validate({ params: submissionIdParamSchema }),
  assignmentController.getSubmission
);

export default router;
