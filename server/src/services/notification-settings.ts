/**
 * Notification Settings Service
 *
 * Persists per-user notification preferences in `notification_settings` and
 * exposes a `shouldSend` helper that other services call before dispatching
 * email / push / in-app notifications.
 *
 * Storage gracefully degrades: if the table doesn't exist yet (e.g. migration
 * 042 hasn't been applied), default-permissive settings are returned so
 * existing behaviour is unchanged.
 */

import { supabaseAdmin } from '../lib/supabase.js'
import { ApiError, ErrorCode } from '../types/index.js'
import {
  NotificationSettingsRecord,
  NotificationSettingsUpdateInput,
  NotificationTypePreference,
} from '../types/notifications.js'
import logger from '../utils/logger.js'

const TABLE_NAME = 'notification_settings'

const DEFAULTS = {
  email_enabled: true,
  push_enabled: true,
  due_date_reminders_enabled: true,
  due_date_reminder_lead_hours: 24,
  type_preferences: {} as Record<string, NotificationTypePreference>,
}

const isMissingTableError = (error: { code?: string | null; message?: string | null } | null | undefined): boolean => {
  if (!error) return false
  // PostgREST code for "relation does not exist"
  if (error.code === '42P01') return true
  if (typeof error.message === 'string' && /relation .* does not exist/i.test(error.message)) {
    return true
  }
  return false
}

const buildDefaultRecord = (userId: string): NotificationSettingsRecord => ({
  user_id: userId,
  email_enabled: DEFAULTS.email_enabled,
  push_enabled: DEFAULTS.push_enabled,
  due_date_reminders_enabled: DEFAULTS.due_date_reminders_enabled,
  due_date_reminder_lead_hours: DEFAULTS.due_date_reminder_lead_hours,
  type_preferences: { ...DEFAULTS.type_preferences },
  updated_at: new Date().toISOString(),
})

export const getNotificationSettings = async (
  userId: string,
): Promise<NotificationSettingsRecord> => {
  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) {
      logger.warn('notification_settings table missing; returning defaults', { userId })
      return buildDefaultRecord(userId)
    }
    logger.error('Failed to load notification settings', { userId, error: error.message })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load notification settings', 500)
  }

  if (!data) {
    return buildDefaultRecord(userId)
  }

  return data as NotificationSettingsRecord
}

export const upsertNotificationSettings = async (
  userId: string,
  patch: NotificationSettingsUpdateInput,
): Promise<NotificationSettingsRecord> => {
  const current = await getNotificationSettings(userId)

  const merged: NotificationSettingsRecord = {
    ...current,
    ...patch,
    type_preferences: patch.type_preferences ?? current.type_preferences,
    user_id: userId,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .upsert(merged, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) {
    if (isMissingTableError(error)) {
      logger.warn('notification_settings table missing; cannot persist patch', { userId })
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Notification settings storage is not initialized. Run migration 042.',
        500,
      )
    }
    logger.error('Failed to save notification settings', { userId, error: error.message })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to save notification settings', 500)
  }

  return data as NotificationSettingsRecord
}

export type NotificationChannel = 'email' | 'push' | 'in_app'

export const shouldSend = (
  settings: NotificationSettingsRecord,
  channel: NotificationChannel,
  type?: string,
): boolean => {
  if (channel === 'email' && !settings.email_enabled) return false
  if (channel === 'push' && !settings.push_enabled) return false

  if (type) {
    const typePref = settings.type_preferences?.[type]
    if (typePref && typePref[channel] === false) {
      return false
    }
  }

  return true
}

/**
 * Convenience wrapper: load settings once, run the sender only when the email
 * channel is enabled for the (optional) notification type. Failures inside the
 * sender are logged but never re-thrown so a single recipient's email config
 * issue doesn't break a bulk dispatch.
 */
export const sendEmailIfEnabled = async (
  userId: string,
  type: string | undefined,
  sender: () => Promise<void>,
): Promise<boolean> => {
  let settings: NotificationSettingsRecord
  try {
    settings = await getNotificationSettings(userId)
  } catch (err) {
    logger.error('sendEmailIfEnabled: failed to load settings, defaulting to enabled', {
      userId,
      err: err instanceof Error ? err.message : String(err),
    })
    settings = buildDefaultRecord(userId)
  }

  if (!shouldSend(settings, 'email', type)) {
    return false
  }

  try {
    await sender()
    return true
  } catch (err) {
    logger.error('sendEmailIfEnabled: sender threw', {
      userId,
      type,
      err: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}
