/**
 * Announcements Controller
 * 
 * HTTP handlers for announcement endpoints.
 */

import { Response, NextFunction } from 'express';
import { AuthRequest, ApiResponse, UserRole } from '../types/index.js';
import {
  AnnouncementCommentWithAuthor,
  AnnouncementWithAuthor,
  CreateAnnouncementCommentInput,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
  ListAnnouncementsQuery,
} from '../types/announcements.js';
import * as announcementService from '../services/announcements.js';

/**
 * @swagger
 * /api/courses/{courseId}/announcements:
 *   post:
 *     summary: Create an announcement for a course
 *     tags: [Announcements]
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
 *               - title
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               pinned:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Announcement created
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Course not found
 */
export const createAnnouncement = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.params;
    const input: CreateAnnouncementInput = req.body;

    const announcement = await announcementService.createAnnouncement(
      courseId,
      input,
      req.user!.id,
      req.user!.role as UserRole
    );

    const response: ApiResponse<AnnouncementWithAuthor> = {
      success: true,
      data: announcement,
    };
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/courses/{courseId}/announcements:
 *   get:
 *     summary: List announcements for a course
 *     tags: [Announcements]
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
 *         description: List of announcements
 *       404:
 *         description: Course not found
 */
export const listAnnouncements = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.params;
    const query: ListAnnouncementsQuery = req.query as any;

    const result = await announcementService.listAnnouncements(courseId, query);

    res.json({
      success: true,
      data: result.announcements,
      meta: {
        total: result.total,
        limit: query.limit || 50,
        offset: query.offset || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/announcements/{id}:
 *   get:
 *     summary: Get announcement by ID
 *     tags: [Announcements]
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
 *         description: Announcement details
 *       404:
 *         description: Announcement not found
 */
export const getAnnouncement = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const announcement = await announcementService.getAnnouncementById(req.params.id);

    const response: ApiResponse<AnnouncementWithAuthor> = {
      success: true,
      data: announcement,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/announcements/{id}/comments:
 *   get:
 *     summary: List comments for an announcement
 *     tags: [Announcements]
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
 *         description: List of announcement comments
 *       404:
 *         description: Announcement not found
 */
export const listAnnouncementComments = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const comments = await announcementService.listAnnouncementComments(
      req.params.id,
      req.user!.id,
      req.user!.role as UserRole
    );

    const response: ApiResponse<AnnouncementCommentWithAuthor[]> = {
      success: true,
      data: comments,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/announcements/{id}/comments:
 *   post:
 *     summary: Add a comment to an announcement
 *     tags: [Announcements]
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
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Comment created
 *       404:
 *         description: Announcement not found
 */
export const createAnnouncementComment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const input: CreateAnnouncementCommentInput = req.body;

    const comment = await announcementService.createAnnouncementComment(
      req.params.id,
      input,
      req.user!.id,
      req.user!.role as UserRole
    );

    const response: ApiResponse<AnnouncementCommentWithAuthor> = {
      success: true,
      data: comment,
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/announcements/{id}:
 *   put:
 *     summary: Update an announcement
 *     tags: [Announcements]
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
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               pinned:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Announcement updated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Announcement not found
 */
export const updateAnnouncement = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const input: UpdateAnnouncementInput = req.body;

    const announcement = await announcementService.updateAnnouncement(
      req.params.id,
      input,
      req.user!.id,
      req.user!.role as UserRole
    );

    const response: ApiResponse<AnnouncementWithAuthor> = {
      success: true,
      data: announcement,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/announcements/{id}:
 *   delete:
 *     summary: Delete an announcement
 *     tags: [Announcements]
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
 *         description: Announcement deleted
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Announcement not found
 */
export const deleteAnnouncement = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await announcementService.deleteAnnouncement(
      req.params.id,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.json({
      success: true,
      data: { message: 'Announcement deleted successfully' },
    });
  } catch (error) {
    next(error);
  }
};
