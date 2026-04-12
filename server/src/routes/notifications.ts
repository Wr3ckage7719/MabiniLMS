/**
 * Notifications Routes
 * 
 * API endpoints for user notifications.
 */

import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
  markReadSchema,
  registerWebPushSubscriptionSchema,
  unregisterWebPushSubscriptionSchema,
} from '../types/notifications.js'
import * as notificationController from '../controllers/notifications.js'

const router = Router()

/**
 * @swagger
 * tags:
 *   - name: Notifications
 *     description: User notification management
 */

// All routes require authentication
router.use(authenticate)

// ============================================
// List & Count
// ============================================

/**
 * GET /api/notifications - List notifications
 */
router.get(
  '/',
  validate({ query: listNotificationsQuerySchema }),
  notificationController.listNotifications
)

/**
 * GET /api/notifications/count - Get notification counts
 */
router.get('/count', notificationController.getNotificationCount)

/**
 * GET /api/notifications/push/public-key - Get Web Push VAPID public key
 */
router.get('/push/public-key', notificationController.getWebPushPublicKey)

/**
 * POST /api/notifications/push/subscribe - Register Web Push subscription
 */
router.post(
  '/push/subscribe',
  validate({ body: registerWebPushSubscriptionSchema }),
  notificationController.registerWebPushSubscription
)

/**
 * POST /api/notifications/push/unsubscribe - Unregister Web Push subscription
 */
router.post(
  '/push/unsubscribe',
  validate({ body: unregisterWebPushSubscriptionSchema }),
  notificationController.unregisterWebPushSubscription
)

// ============================================
// Bulk Operations (before :id to avoid conflicts)
// ============================================

/**
 * POST /api/notifications/mark-read - Mark multiple as read
 */
router.post(
  '/mark-read',
  validate({ body: markReadSchema }),
  notificationController.markMultipleAsRead
)

/**
 * POST /api/notifications/mark-all-read - Mark all as read
 */
router.post('/mark-all-read', notificationController.markAllAsRead)

/**
 * DELETE /api/notifications/delete-read - Delete all read
 */
router.delete('/delete-read', notificationController.deleteReadNotifications)

// ============================================
// Single Notification Operations
// ============================================

/**
 * GET /api/notifications/:id - Get notification
 */
router.get(
  '/:id',
  validate({ params: notificationIdParamSchema }),
  notificationController.getNotification
)

/**
 * PATCH /api/notifications/:id/read - Mark as read
 */
router.patch(
  '/:id/read',
  validate({ params: notificationIdParamSchema }),
  notificationController.markAsRead
)

/**
 * PATCH /api/notifications/:id/unread - Mark as unread
 */
router.patch(
  '/:id/unread',
  validate({ params: notificationIdParamSchema }),
  notificationController.markAsUnread
)

/**
 * DELETE /api/notifications/:id - Delete notification
 */
router.delete(
  '/:id',
  validate({ params: notificationIdParamSchema }),
  notificationController.deleteNotification
)

export default router
