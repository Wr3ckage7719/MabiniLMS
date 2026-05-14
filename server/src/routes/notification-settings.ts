/**
 * Notification Settings Routes
 *
 * GET  /api/notification-settings  → current user's preferences (defaults if unset)
 * PUT  /api/notification-settings  → upsert patch (partial updates allowed)
 */

import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { notificationSettingsUpdateSchema } from '../types/notifications.js'
import * as ctrl from '../controllers/notification-settings.js'

const router = Router()

router.use(authenticate)

router.get('/', ctrl.getMine)

router.put(
  '/',
  validate({ body: notificationSettingsUpdateSchema }),
  ctrl.updateMine,
)

export default router
