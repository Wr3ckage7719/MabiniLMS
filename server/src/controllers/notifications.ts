/**
 * Notifications Controller
 * 
 * HTTP handlers for notification endpoints.
 */

import { Response, NextFunction } from 'express'
import { AuthRequest } from '../types/index.js'
import * as notificationService from '../services/notifications.js'

// ============================================
// List & Count
// ============================================

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: List user's notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: read
 *         schema:
 *           type: string
 *           enum: [true, false, all]
 *           default: all
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
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
 *         description: List of notifications
 */
export const listNotifications = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await notificationService.listNotifications(
      req.user!.id,
      {
        read: (req.query.read as 'true' | 'false' | 'all') || 'all',
        type: req.query.type as any,
        priority: req.query.priority as any,
        limit: parseInt(req.query.limit as string, 10) || 50,
        offset: parseInt(req.query.offset as string, 10) || 0,
        include_expired: (req.query.include_expired as 'true' | 'false') || 'false',
      }
    )

    res.json({
      success: true,
      data: result.notifications,
      meta: {
        total: result.total,
      },
    })
  } catch (error) {
    next(error)
  }
}

/**
 * @swagger
 * /api/notifications/count:
 *   get:
 *     summary: Get notification counts
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification counts
 */
export const getNotificationCount = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const counts = await notificationService.getNotificationCount(req.user!.id)

    res.json({
      success: true,
      data: counts,
    })
  } catch (error) {
    next(error)
  }
}

// ============================================
// Single Notification Operations
// ============================================

/**
 * @swagger
 * /api/notifications/{id}:
 *   get:
 *     summary: Get notification by ID
 *     tags: [Notifications]
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
 *         description: Notification details
 *       404:
 *         description: Not found
 */
export const getNotification = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const notification = await notificationService.getNotificationById(
      req.params.id,
      req.user!.id
    )

    if (!notification) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Notification not found',
        },
      })
      return
    }

    res.json({
      success: true,
      data: notification,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Mark notification as read
 *     tags: [Notifications]
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
 *         description: Notification marked as read
 */
export const markAsRead = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const notification = await notificationService.markNotificationRead(
      req.params.id,
      req.user!.id,
      true
    )

    res.json({
      success: true,
      data: notification,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * @swagger
 * /api/notifications/{id}/unread:
 *   patch:
 *     summary: Mark notification as unread
 *     tags: [Notifications]
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
 *         description: Notification marked as unread
 */
export const markAsUnread = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const notification = await notificationService.markNotificationRead(
      req.params.id,
      req.user!.id,
      false
    )

    res.json({
      success: true,
      data: notification,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * @swagger
 * /api/notifications/{id}:
 *   delete:
 *     summary: Delete notification
 *     tags: [Notifications]
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
 *         description: Notification deleted
 */
export const deleteNotification = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await notificationService.deleteNotification(
      req.params.id,
      req.user!.id
    )

    res.json({
      success: true,
      data: { message: 'Notification deleted' },
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
 * /api/notifications/mark-read:
 *   post:
 *     summary: Mark multiple notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notification_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       200:
 *         description: Notifications marked as read
 */
export const markMultipleAsRead = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { notification_ids } = req.body

    const result = await notificationService.markMultipleRead(
      notification_ids,
      req.user!.id,
      true
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
 * /api/notifications/mark-all-read:
 *   post:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
export const markAllAsRead = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await notificationService.markAllRead(req.user!.id)

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
 * /api/notifications/delete-read:
 *   delete:
 *     summary: Delete all read notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Read notifications deleted
 */
export const deleteReadNotifications = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await notificationService.deleteReadNotifications(req.user!.id)

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}
