/**
 * Announcements Routes
 * 
 * API endpoints for course announcements.
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { UserRole } from '../types/index.js';
import {
  createAnnouncementSchema,
  updateAnnouncementSchema,
  announcementIdParamSchema,
  courseAnnouncementsParamSchema,
  listAnnouncementsQuerySchema,
} from '../types/announcements.js';
import * as announcementController from '../controllers/announcements.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Announcements
 *   description: Course announcement management
 */

// All routes require authentication
router.use(authenticate);

// ============================================
// Course Announcement Routes
// ============================================

// POST /api/courses/:courseId/announcements - Create announcement
router.post(
  '/courses/:courseId/announcements',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: courseAnnouncementsParamSchema, body: createAnnouncementSchema }),
  announcementController.createAnnouncement
);

// GET /api/courses/:courseId/announcements - List announcements
router.get(
  '/courses/:courseId/announcements',
  validate({ params: courseAnnouncementsParamSchema, query: listAnnouncementsQuerySchema }),
  announcementController.listAnnouncements
);

// ============================================
// Individual Announcement Routes
// ============================================

// GET /api/announcements/:id - Get announcement by ID
router.get(
  '/announcements/:id',
  validate({ params: announcementIdParamSchema }),
  announcementController.getAnnouncement
);

// PUT /api/announcements/:id - Update announcement
router.put(
  '/announcements/:id',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: announcementIdParamSchema, body: updateAnnouncementSchema }),
  announcementController.updateAnnouncement
);

// DELETE /api/announcements/:id - Delete announcement
router.delete(
  '/announcements/:id',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: announcementIdParamSchema }),
  announcementController.deleteAnnouncement
);

export default router;
