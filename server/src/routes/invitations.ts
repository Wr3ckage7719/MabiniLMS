import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { UserRole } from '../types/index.js';
import {
  createInvitationSchema,
  invitationIdParamSchema,
  courseInvitationsParamSchema,
  invitationQuerySchema,
} from '../types/invitations.js';
import * as invitationController from '../controllers/invitations.js';

const router = Router();

// All invitation routes require authentication
router.use(authenticate);

// POST /api/invitations - create invitation (teacher/admin)
router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ body: createInvitationSchema }),
  invitationController.createInvitation
);

// GET /api/invitations/my - list invitations for current user
router.get(
  '/my',
  validate({ query: invitationQuerySchema }),
  invitationController.listMyInvitations
);

// GET /api/invitations/course/:courseId - list invitations for a course (teacher/admin)
router.get(
  '/course/:courseId',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: courseInvitationsParamSchema, query: invitationQuerySchema }),
  invitationController.listCourseInvitations
);

// POST /api/invitations/:id/accept - accept invitation (student)
router.post(
  '/:id/accept',
  authorize(UserRole.STUDENT),
  validate({ params: invitationIdParamSchema }),
  invitationController.acceptInvitation
);

// POST /api/invitations/:id/decline - decline invitation (student)
router.post(
  '/:id/decline',
  authorize(UserRole.STUDENT),
  validate({ params: invitationIdParamSchema }),
  invitationController.declineInvitation
);

export default router;
