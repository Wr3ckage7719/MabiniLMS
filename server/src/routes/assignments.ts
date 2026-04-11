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
import {
  createExamQuestionSchema,
  examAssignmentParamSchema,
  examAttemptParamSchema,
  examQuestionParamSchema,
  listViolationsQuerySchema,
  reportExamViolationSchema,
  startExamAttemptSchema,
  submitExamAnswerSchema,
  submitExamAttemptSchema,
  updateExamQuestionSchema,
} from '../types/exams.js';
import * as assignmentController from '../controllers/assignments.js';
import * as examController from '../controllers/exams.js';

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
// Exam Authoring Routes (LMS-010/011/012)
// ============================================

// GET /api/assignments/:assignmentId/exam/questions - list exam questions (teacher/admin)
router.get(
  '/:assignmentId/exam/questions',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: examAssignmentParamSchema }),
  examController.listExamQuestions
);

// POST /api/assignments/:assignmentId/exam/questions - create exam question (teacher/admin)
router.post(
  '/:assignmentId/exam/questions',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: examAssignmentParamSchema, body: createExamQuestionSchema }),
  examController.createExamQuestion
);

// PATCH /api/assignments/:assignmentId/exam/questions/:questionId - update exam question
router.patch(
  '/:assignmentId/exam/questions/:questionId',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({
    params: examAssignmentParamSchema.merge(examQuestionParamSchema),
    body: updateExamQuestionSchema,
  }),
  examController.updateExamQuestion
);

// DELETE /api/assignments/:assignmentId/exam/questions/:questionId - delete exam question
router.delete(
  '/:assignmentId/exam/questions/:questionId',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: examAssignmentParamSchema.merge(examQuestionParamSchema) }),
  examController.deleteExamQuestion
);

// GET /api/assignments/:assignmentId/exam/violations - list violations for an assignment
router.get(
  '/:assignmentId/exam/violations',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: examAssignmentParamSchema, query: listViolationsQuerySchema }),
  examController.listAssignmentViolations
);

// POST /api/assignments/:assignmentId/exam/attempts/start - start exam attempt (student)
router.post(
  '/:assignmentId/exam/attempts/start',
  authorize(UserRole.STUDENT),
  validate({ params: examAssignmentParamSchema, body: startExamAttemptSchema }),
  examController.startExamAttempt
);

// GET /api/assignments/exam/attempts/:attemptId - get exam attempt session
router.get(
  '/exam/attempts/:attemptId',
  validate({ params: examAttemptParamSchema }),
  examController.getExamAttemptSession
);

// POST /api/assignments/exam/attempts/:attemptId/answers - submit answer
router.post(
  '/exam/attempts/:attemptId/answers',
  authorize(UserRole.STUDENT),
  validate({ params: examAttemptParamSchema, body: submitExamAnswerSchema }),
  examController.submitExamAnswer
);

// POST /api/assignments/exam/attempts/:attemptId/violations - report violation (student)
router.post(
  '/exam/attempts/:attemptId/violations',
  authorize(UserRole.STUDENT),
  validate({ params: examAttemptParamSchema, body: reportExamViolationSchema }),
  examController.reportExamViolation
);

// GET /api/assignments/exam/attempts/:attemptId/violations - list violations for attempt
router.get(
  '/exam/attempts/:attemptId/violations',
  validate({ params: examAttemptParamSchema, query: listViolationsQuerySchema }),
  examController.listAttemptViolations
);

// POST /api/assignments/exam/attempts/:attemptId/submit - finalize and auto-grade exam attempt
router.post(
  '/exam/attempts/:attemptId/submit',
  authorize(UserRole.STUDENT),
  validate({ params: examAttemptParamSchema, body: submitExamAttemptSchema }),
  examController.submitExamAttempt
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
