/**
 * Notification Settings Controller
 *
 * HTTP handlers for GET / PUT /api/notification-settings.
 */

import { Response, NextFunction } from 'express'
import { AuthRequest, ApiError, ErrorCode } from '../types/index.js'
import * as notificationSettingsService from '../services/notification-settings.js'

export const getMine = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError(ErrorCode.UNAUTHORIZED, 'Authentication required', 401)
    }
    const settings = await notificationSettingsService.getNotificationSettings(req.user.id)
    res.json({ success: true, data: settings })
  } catch (error) {
    next(error)
  }
}

export const updateMine = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError(ErrorCode.UNAUTHORIZED, 'Authentication required', 401)
    }
    const settings = await notificationSettingsService.upsertNotificationSettings(
      req.user.id,
      req.body,
    )
    res.json({ success: true, data: settings })
  } catch (error) {
    next(error)
  }
}
