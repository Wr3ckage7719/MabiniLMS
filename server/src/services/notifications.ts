/**
 * Notifications Service
 * 
 * Business logic for the notification system.
 */

import { supabaseAdmin } from '../lib/supabase.js'
import webpush from 'web-push'
import { ApiError, ErrorCode } from '../types/index.js'
import {
  Notification,
  NotificationType,
  NotificationPriority,
  CreateNotificationInput,
  BulkNotificationInput,
  ListNotificationsQuery,
  NotificationCount,
  RegisterWebPushSubscriptionInput,
} from '../types/notifications.js'
import logger from '../utils/logger.js'

type NotificationActor = {
  id?: string
  name?: string
  avatar_url?: string | null
}

type PushSubscriptionRecord = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

type PushPayload = {
  title: string
  body: string
  icon: string
  badge: string
  tag: string
  url: string
  data: {
    notificationId: string
    type: string
    url: string
  }
}

type DatabaseErrorShape = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

const WEB_PUSH_VAPID_PUBLIC_KEY = (process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim()
const WEB_PUSH_VAPID_PRIVATE_KEY = (process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '').trim()
const WEB_PUSH_SUBJECT = (process.env.WEB_PUSH_SUBJECT || '').trim() || 'mailto:support@mabinilms.local'

const hasWebPushEnvConfig = Boolean(
  WEB_PUSH_VAPID_PUBLIC_KEY &&
    WEB_PUSH_VAPID_PRIVATE_KEY &&
    WEB_PUSH_SUBJECT
)

let webPushReady = hasWebPushEnvConfig

const isWebPushConfigured = (): boolean => {
  return webPushReady
}

if (hasWebPushEnvConfig) {
  try {
    webpush.setVapidDetails(
      WEB_PUSH_SUBJECT,
      WEB_PUSH_VAPID_PUBLIC_KEY,
      WEB_PUSH_VAPID_PRIVATE_KEY
    )
  } catch (error) {
    webPushReady = false
    logger.warn('Web Push VAPID configuration is invalid. Push delivery disabled.', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

const getMetadataCourseId = (metadata: Notification['metadata']): string | null => {
  if (!metadata || typeof metadata !== 'object') {
    return null
  }

  const value = metadata.course_id || metadata.courseId
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

const resolveNotificationActionPath = (
  actionUrl: string | null | undefined,
  metadata: Notification['metadata']
): string => {
  const courseId = getMetadataCourseId(metadata)

  if (courseId) {
    return `/class/${courseId}`
  }

  const trimmedActionUrl = (actionUrl || '').trim()
  if (!trimmedActionUrl) {
    return '/dashboard'
  }

  try {
    const parsedUrl = new URL(trimmedActionUrl, 'https://mabinilms.local')
    const pathname = parsedUrl.pathname
    const suffix = `${parsedUrl.search}${parsedUrl.hash}`

    if (pathname.startsWith('/courses/')) {
      const courseIdFromPath = pathname.split('/').filter(Boolean)[1]
      if (courseIdFromPath) {
        return `/class/${courseIdFromPath}`
      }
      return '/dashboard'
    }

    if (pathname.startsWith('/class/')) {
      return `${pathname}${suffix}`
    }

    if (pathname.startsWith('/assignments/')) {
      return '/dashboard'
    }

    if (pathname === '/' || pathname === '/index.html') {
      return '/dashboard'
    }

    return `${pathname}${suffix}`
  } catch {
    return '/dashboard'
  }
}

const toPushPayload = (notification: Notification): PushPayload => {
  const url = resolveNotificationActionPath(notification.action_url, notification.metadata)

  return {
    title: notification.title,
    body: notification.message,
    icon: '/icons/icon-192x192.svg',
    badge: '/icons/icon-192x192.svg',
    tag: `notification-${notification.id}`,
    url,
    data: {
      notificationId: notification.id,
      type: notification.type,
      url,
    },
  }
}

const toNormalizedDbErrorMessage = (error: DatabaseErrorShape | null | undefined): string => {
  const parts = [error?.message, error?.details, error?.hint]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')

  return parts.toLowerCase()
}

const isMissingRelationError = (error: DatabaseErrorShape | null | undefined): boolean => {
  const normalized = toNormalizedDbErrorMessage(error)

  return (
    error?.code === '42P01' ||
    normalized.includes('relation') && normalized.includes('does not exist')
  )
}

const isMissingColumnError = (error: DatabaseErrorShape | null | undefined): boolean => {
  const normalized = toNormalizedDbErrorMessage(error)

  return (
    error?.code === '42703' ||
    (normalized.includes('column') && normalized.includes('does not exist'))
  )
}

const isMissingOnConflictConstraintError = (
  error: DatabaseErrorShape | null | undefined
): boolean => {
  const normalized = toNormalizedDbErrorMessage(error)

  return (
    error?.code === '42P10' ||
    normalized.includes('no unique or exclusion constraint matching the on conflict specification')
  )
}

const isDuplicateKeyError = (error: DatabaseErrorShape | null | undefined): boolean => {
  if (!error) {
    return false
  }

  return error.code === '23505'
}

const extractMissingColumnName = (error: DatabaseErrorShape | null | undefined): string | null => {
  const normalized = toNormalizedDbErrorMessage(error)
  if (!normalized) {
    return null
  }

  const match = normalized.match(/column\s+"?([a-z0-9_]+)"?\s+does not exist/i)
  return match?.[1] || null
}

const omitEndpointFromPayload = (payload: Record<string, any>): Record<string, any> =>
  Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'endpoint'))

const writePushSubscriptionWithColumnFallback = async (
  writeOperation: (
    payload: Record<string, any>
  ) => PromiseLike<{ error: DatabaseErrorShape | null }>,
  initialPayload: Record<string, any>
): Promise<DatabaseErrorShape | null> => {
  const payload = { ...initialPayload }
  let lastError: DatabaseErrorShape | null = null

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { error } = await writeOperation(payload)

    if (!error) {
      return null
    }

    lastError = error

    if (!isMissingColumnError(error)) {
      return error
    }

    const missingColumn = extractMissingColumnName(error)
    if (!missingColumn || !(missingColumn in payload)) {
      return error
    }

    delete payload[missingColumn]
  }

  return lastError
}

const throwPushSubscriptionStorageUnavailable = (error?: DatabaseErrorShape | null): never => {
  logger.error('Push subscription storage is unavailable', {
    code: error?.code,
    error: error?.message,
    details: error?.details,
    hint: error?.hint,
  })

  throw new ApiError(
    ErrorCode.INTERNAL_ERROR,
    'Push subscription storage is unavailable. Run migration 015_web_push_subscriptions and retry.',
    503
  )
}

const throwPushRegistrationFailure = (
  userId: string,
  endpoint: string,
  phase: string,
  error?: DatabaseErrorShape | null
): never => {
  logger.error('Failed to register web push subscription', {
    userId,
    endpoint,
    phase,
    code: error?.code,
    error: error?.message,
    details: error?.details,
    hint: error?.hint,
  })

  throw new ApiError(
    ErrorCode.INTERNAL_ERROR,
    'Failed to register push subscription',
    500
  )
}

const deactivateStalePushSubscriptions = async (
  subscriptionIds: string[]
): Promise<void> => {
  if (subscriptionIds.length === 0) {
    return
  }

  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .in('id', subscriptionIds)

  if (error) {
    logger.warn('Failed to deactivate stale push subscriptions', {
      count: subscriptionIds.length,
      error: error.message,
    })
  }
}

const dispatchWebPushNotifications = async (
  notifications: Notification[]
): Promise<void> => {
  if (!isWebPushConfigured() || notifications.length === 0) {
    return
  }

  const userIds = Array.from(
    new Set(notifications.map((notification) => notification.user_id).filter(Boolean))
  )

  if (userIds.length === 0) {
    return
  }

  const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', userIds)
    .eq('is_active', true)

  if (subscriptionsError) {
    logger.warn('Failed to load push subscriptions for notifications', {
      error: subscriptionsError.message,
    })
    return
  }

  const subscriptionRows = (subscriptions || []) as PushSubscriptionRecord[]
  if (subscriptionRows.length === 0) {
    return
  }

  const subscriptionsByUserId = new Map<string, PushSubscriptionRecord[]>()

  subscriptionRows.forEach((subscription) => {
    const existing = subscriptionsByUserId.get(subscription.user_id) || []
    existing.push(subscription)
    subscriptionsByUserId.set(subscription.user_id, existing)
  })

  const staleSubscriptionIds = new Set<string>()

  for (const notification of notifications) {
    const userSubscriptions = subscriptionsByUserId.get(notification.user_id) || []
    if (userSubscriptions.length === 0) {
      continue
    }

    const payload = toPushPayload(notification)

    await Promise.all(
      userSubscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            JSON.stringify(payload),
            {
              TTL: 60 * 60,
            }
          )
        } catch (error: any) {
          const statusCode = Number(error?.statusCode || 0)

          if (statusCode === 404 || statusCode === 410) {
            staleSubscriptionIds.add(subscription.id)
            return
          }

          logger.warn('Failed to deliver web push notification', {
            notificationId: notification.id,
            userId: notification.user_id,
            endpoint: subscription.endpoint,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      })
    )
  }

  if (staleSubscriptionIds.size > 0) {
    await deactivateStalePushSubscriptions(Array.from(staleSubscriptionIds))
  }
}

export const getWebPushPublicKey = (): string => {
  if (!isWebPushConfigured()) {
    throw new ApiError(
      ErrorCode.NOT_FOUND,
      'Web Push is not configured on this server',
      404
    )
  }

  return WEB_PUSH_VAPID_PUBLIC_KEY
}

export const registerWebPushSubscription = async (
  userId: string,
  input: RegisterWebPushSubscriptionInput
): Promise<void> => {
  if (!isWebPushConfigured()) {
    throw new ApiError(
      ErrorCode.NOT_FOUND,
      'Web Push is not configured on this server',
      404
    )
  }

  const expirationTime =
    typeof input.subscription.expirationTime === 'number'
      ? new Date(input.subscription.expirationTime).toISOString()
      : null

  const nowIso = new Date().toISOString()
  const endpoint = input.subscription.endpoint
  const registrationPayload = {
    user_id: userId,
    endpoint,
    p256dh: input.subscription.keys.p256dh,
    auth: input.subscription.keys.auth,
    expiration_time: expirationTime,
    user_agent: input.user_agent || null,
    platform: input.platform || null,
    is_active: true,
    last_used_at: nowIso,
    updated_at: nowIso,
  }

  const upsertError = await writePushSubscriptionWithColumnFallback(
    (payload) =>
      supabaseAdmin
        .from('push_subscriptions')
        .upsert(payload, {
          onConflict: 'endpoint',
        }),
    registrationPayload
  )

  if (!upsertError) {
    return
  }

  if (isMissingRelationError(upsertError)) {
    throwPushSubscriptionStorageUnavailable(upsertError)
  }

  if (!isMissingOnConflictConstraintError(upsertError)) {
    throwPushRegistrationFailure(userId, endpoint, 'upsert', upsertError)
  }

  // Compatibility fallback for deployments where push_subscriptions.endpoint is not unique.
  const { data: existingRows, error: existingLookupError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', endpoint)
    .limit(1)

  if (existingLookupError) {
    if (isMissingRelationError(existingLookupError)) {
      throwPushSubscriptionStorageUnavailable(existingLookupError)
    }

    throwPushRegistrationFailure(userId, endpoint, 'lookup-existing', existingLookupError)
  }

  const existingId = (existingRows as Array<{ id: string }> | null)?.[0]?.id

  if (existingId) {
    const updatePayload = omitEndpointFromPayload(registrationPayload)

    const updateError = await writePushSubscriptionWithColumnFallback(
      (payload) =>
        supabaseAdmin
          .from('push_subscriptions')
          .update(payload)
          .eq('id', existingId),
      updatePayload
    )

    if (!updateError) {
      return
    }

    if (isMissingRelationError(updateError)) {
      throwPushSubscriptionStorageUnavailable(updateError)
    }

    throwPushRegistrationFailure(userId, endpoint, 'legacy-update', updateError)
  }

  const insertError = await writePushSubscriptionWithColumnFallback(
    (payload) => supabaseAdmin.from('push_subscriptions').insert(payload),
    registrationPayload
  )

  if (!insertError) {
    return
  }

  if (isMissingRelationError(insertError)) {
    throwPushSubscriptionStorageUnavailable(insertError)
  }

  // A concurrent request may insert the endpoint between lookup and insert.
  if (isDuplicateKeyError(insertError)) {
    const updatePayload = omitEndpointFromPayload(registrationPayload)

    const retryUpdateError = await writePushSubscriptionWithColumnFallback(
      (payload) =>
        supabaseAdmin
          .from('push_subscriptions')
          .update(payload)
          .eq('endpoint', endpoint),
      updatePayload
    )

    if (!retryUpdateError) {
      return
    }

    if (isMissingRelationError(retryUpdateError)) {
      throwPushSubscriptionStorageUnavailable(retryUpdateError)
    }

    throwPushRegistrationFailure(userId, endpoint, 'retry-update-after-duplicate', retryUpdateError)
  }

  throwPushRegistrationFailure(userId, endpoint, 'legacy-insert', insertError)
}

export const unregisterWebPushSubscription = async (
  userId: string,
  endpoint: string
): Promise<void> => {
  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('endpoint', endpoint)

  if (error) {
    logger.error('Failed to unregister web push subscription', {
      userId,
      endpoint,
      error: error.message,
    })
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to remove push subscription',
      500
    )
  }
}

// ============================================
// Create Notifications
// ============================================

/**
 * Create a notification for a user
 */
export const createNotification = async (
  input: CreateNotificationInput
): Promise<Notification> => {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .insert({
      user_id: input.user_id,
      type: input.type,
      title: input.title,
      message: input.message,
      priority: input.priority || NotificationPriority.NORMAL,
      action_url: input.action_url || null,
      metadata: input.metadata || null,
      expires_at: input.expires_at || null,
    })
    .select()
    .single()

  if (error) {
    logger.error('Failed to create notification', { error: error.message, input })
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to create notification',
      500
    )
  }

  void dispatchWebPushNotifications([data as Notification]).catch((pushError) => {
    logger.warn('Failed to dispatch web push notification', {
      notificationId: data.id,
      userId: data.user_id,
      error: pushError instanceof Error ? pushError.message : String(pushError),
    })
  })

  logger.info('Notification created', { id: data.id, type: input.type, user_id: input.user_id })
  return data
}

/**
 * Create notifications for multiple users
 */
export const createBulkNotifications = async (
  input: BulkNotificationInput
): Promise<{ created: number; failed: number }> => {
  const notifications = input.user_ids.map((userId) => ({
    user_id: userId,
    type: input.type,
    title: input.title,
    message: input.message,
    priority: input.priority || NotificationPriority.NORMAL,
    action_url: input.action_url || null,
    metadata: input.metadata || null,
    expires_at: input.expires_at || null,
  }))

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .insert(notifications)
    .select()

  if (error) {
    logger.error('Failed to create bulk notifications', { error: error.message })
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to create notifications',
      500
    )
  }

  const created = data?.length || 0
  const failed = input.user_ids.length - created

  if (created > 0) {
    void dispatchWebPushNotifications((data || []) as Notification[]).catch((pushError) => {
      logger.warn('Failed to dispatch bulk web push notifications', {
        created,
        error: pushError instanceof Error ? pushError.message : String(pushError),
      })
    })
  }

  logger.info('Bulk notifications created', { created, failed, type: input.type })
  return { created, failed }
}

// ============================================
// Read Notifications
// ============================================

/**
 * Get notification by ID
 */
export const getNotificationById = async (
  id: string,
  userId: string
): Promise<Notification | null> => {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to fetch notification',
      500
    )
  }

  return data
}

/**
 * List notifications for a user
 */
export const listNotifications = async (
  userId: string,
  query: ListNotificationsQuery
): Promise<{ notifications: Notification[]; total: number }> => {
  let dbQuery = supabaseAdmin
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  // Filter by read status
  if (query.read === 'true') {
    dbQuery = dbQuery.eq('read', true)
  } else if (query.read === 'false') {
    dbQuery = dbQuery.eq('read', false)
  }

  // Filter by type
  if (query.type) {
    dbQuery = dbQuery.eq('type', query.type)
  }

  // Filter by priority
  if (query.priority) {
    dbQuery = dbQuery.eq('priority', query.priority)
  }

  // Exclude expired notifications by default
  if (query.include_expired !== 'true') {
    dbQuery = dbQuery.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
  }

  // Apply pagination
  dbQuery = dbQuery.range(query.offset, query.offset + query.limit - 1)

  const { data, error, count } = await dbQuery

  if (error) {
    logger.error('Failed to list notifications', { error: error.message, userId })
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to fetch notifications',
      500
    )
  }

  return {
    notifications: data || [],
    total: count || 0,
  }
}

/**
 * Get notification counts for a user
 */
export const getNotificationCount = async (
  userId: string
): Promise<NotificationCount> => {
  // Get all non-expired notifications
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('id, read, type, priority')
    .eq('user_id', userId)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)

  if (error) {
    logger.error('Failed to count notifications', { error: error.message, userId })
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to count notifications',
      500
    )
  }

  const notifications = data || []
  const total = notifications.length
  const unread = notifications.filter((n) => !n.read).length

  // Count by type
  const by_type: Partial<Record<NotificationType, number>> = {}
  notifications.forEach((n) => {
    by_type[n.type as NotificationType] = (by_type[n.type as NotificationType] || 0) + 1
  })

  // Count by priority
  const by_priority: Partial<Record<NotificationPriority, number>> = {}
  notifications.forEach((n) => {
    by_priority[n.priority as NotificationPriority] = (by_priority[n.priority as NotificationPriority] || 0) + 1
  })

  return { total, unread, by_type, by_priority }
}

// ============================================
// Update Notifications
// ============================================

/**
 * Mark a notification as read/unread
 */
export const markNotificationRead = async (
  id: string,
  userId: string,
  read: boolean = true
): Promise<Notification> => {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update({
      read,
      read_at: read ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new ApiError(
        ErrorCode.NOT_FOUND,
        'Notification not found',
        404
      )
    }
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to update notification',
      500
    )
  }

  return data
}

/**
 * Mark multiple notifications as read
 */
export const markMultipleRead = async (
  notificationIds: string[],
  userId: string,
  read: boolean = true
): Promise<{ updated: number }> => {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update({
      read,
      read_at: read ? new Date().toISOString() : null,
    })
    .in('id', notificationIds)
    .eq('user_id', userId)
    .select()

  if (error) {
    logger.error('Failed to mark notifications as read', { error: error.message })
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to update notifications',
      500
    )
  }

  return { updated: data?.length || 0 }
}

/**
 * Mark all notifications as read for a user
 */
export const markAllRead = async (
  userId: string
): Promise<{ updated: number }> => {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update({
      read: true,
      read_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('read', false)
    .select()

  if (error) {
    logger.error('Failed to mark all notifications as read', { error: error.message })
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to update notifications',
      500
    )
  }

  return { updated: data?.length || 0 }
}

// ============================================
// Delete Notifications
// ============================================

/**
 * Delete a notification
 */
export const deleteNotification = async (
  id: string,
  userId: string
): Promise<void> => {
  const { error } = await supabaseAdmin
    .from('notifications')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    logger.error('Failed to delete notification', { error: error.message, id })
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to delete notification',
      500
    )
  }
}

/**
 * Delete all read notifications for a user
 */
export const deleteReadNotifications = async (
  userId: string
): Promise<{ deleted: number }> => {
  // First count how many will be deleted
  const { count } = await supabaseAdmin
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', true)

  const { error } = await supabaseAdmin
    .from('notifications')
    .delete()
    .eq('user_id', userId)
    .eq('read', true)

  if (error) {
    logger.error('Failed to delete read notifications', { error: error.message, userId })
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to delete notifications',
      500
    )
  }

  return { deleted: count || 0 }
}

/**
 * Delete expired notifications (for cron job)
 */
export const deleteExpiredNotifications = async (): Promise<{ deleted: number }> => {
  // First count how many will be deleted
  const { count } = await supabaseAdmin
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .lt('expires_at', new Date().toISOString())

  const { error } = await supabaseAdmin
    .from('notifications')
    .delete()
    .lt('expires_at', new Date().toISOString())

  if (error) {
    logger.error('Failed to delete expired notifications', { error: error.message })
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to delete expired notifications',
      500
    )
  }

  logger.info('Deleted expired notifications', { count: count || 0 })
  return { deleted: count || 0 }
}

// ============================================
// Notification Triggers (for use by other services)
// ============================================

/**
 * Send grade notification
 */
export const sendGradeNotification = async (
  userId: string,
  assignmentTitle: string,
  courseTitle: string,
  points: number,
  maxPoints: number,
  assignmentId: string,
  isUpdate: boolean = false
): Promise<void> => {
  const percentage = Math.round((points / maxPoints) * 100)

  await createNotification({
    user_id: userId,
    type: isUpdate ? NotificationType.GRADE_UPDATED : NotificationType.GRADE_POSTED,
    title: isUpdate ? 'Grade Updated' : 'Grade Posted',
    message: `Your grade for "${assignmentTitle}" in ${courseTitle} is ${points}/${maxPoints} (${percentage}%)`,
    priority: NotificationPriority.NORMAL,
    action_url: `/assignments/${assignmentId}`,
    metadata: {
      assignment_id: assignmentId,
      points,
      max_points: maxPoints,
      percentage,
    },
  })
}

/**
 * Send assignment due soon notification
 */
export const sendAssignmentDueSoonNotification = async (
  userId: string,
  assignmentTitle: string,
  courseTitle: string,
  dueDate: string,
  assignmentId: string
): Promise<void> => {
  const due = new Date(dueDate)
  const hoursUntilDue = Math.round((due.getTime() - Date.now()) / 3600000)

  await createNotification({
    user_id: userId,
    type: NotificationType.ASSIGNMENT_DUE_SOON,
    title: 'Assignment Due Soon',
    message: `"${assignmentTitle}" in ${courseTitle} is due in ${hoursUntilDue} hours`,
    priority: NotificationPriority.HIGH,
    action_url: `/assignments/${assignmentId}`,
    metadata: {
      assignment_id: assignmentId,
      due_date: dueDate,
      hours_until_due: hoursUntilDue,
    },
    expires_at: dueDate, // Expire after due date
  })
}

/**
 * Send assignment created notification to multiple users
 */
export const sendAssignmentCreatedNotification = async (
  userIds: string[],
  courseTitle: string,
  courseId: string,
  assignmentTitle: string,
  assignmentId: string,
  assignmentType: 'activity' | 'quiz' | 'exam' = 'activity',
  actor?: NotificationActor
): Promise<void> => {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)))

  if (uniqueUserIds.length === 0) {
    return
  }

  const assignmentLabelByType: Record<'activity' | 'quiz' | 'exam', string> = {
    activity: 'Activity',
    quiz: 'Quiz',
    exam: 'Exam',
  }

  const assignmentLabel = assignmentLabelByType[assignmentType] || 'Assignment'

  const metadata: Record<string, unknown> = {
    course_id: courseId,
    assignment_id: assignmentId,
    assignment_type: assignmentType,
  }

  if (actor?.id) {
    metadata.actor_id = actor.id
  }

  if (actor?.name) {
    metadata.actor_name = actor.name
  }

  if (actor?.avatar_url) {
    metadata.actor_avatar_url = actor.avatar_url
  }

  await createBulkNotifications({
    user_ids: uniqueUserIds,
    type: NotificationType.ASSIGNMENT_CREATED,
    title: `New ${assignmentLabel}`,
    message: `New ${assignmentLabel.toLowerCase()} "${assignmentTitle}" posted in ${courseTitle}`,
    priority:
      assignmentType === 'exam' || assignmentType === 'quiz'
        ? NotificationPriority.HIGH
        : NotificationPriority.NORMAL,
    action_url: `/class/${courseId}`,
    metadata,
  })
}

/**
 * Send course enrollment notification
 */
export const sendEnrollmentNotification = async (
  userId: string,
  courseTitle: string,
  courseId: string,
  actor?: NotificationActor
): Promise<void> => {
  const metadata: Record<string, unknown> = {
    course_id: courseId,
  }

  if (actor?.id) {
    metadata.actor_id = actor.id
  }

  if (actor?.name) {
    metadata.actor_name = actor.name
  }

  if (actor?.avatar_url) {
    metadata.actor_avatar_url = actor.avatar_url
  }

  await createNotification({
    user_id: userId,
    type: NotificationType.COURSE_ENROLLMENT,
    title: 'Enrolled in Course',
    message: `You have been enrolled in "${courseTitle}"`,
    priority: NotificationPriority.NORMAL,
    action_url: `/class/${courseId}`,
    metadata,
  })
}

/**
 * Send course announcement notification
 */
export const sendAnnouncementNotification = async (
  userIds: string[],
  courseTitle: string,
  courseId: string,
  announcementTitle: string,
  actor?: NotificationActor
): Promise<void> => {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)))

  if (uniqueUserIds.length === 0) {
    return
  }

  const metadata: Record<string, unknown> = {
    course_id: courseId,
  }

  if (actor?.id) {
    metadata.actor_id = actor.id
  }

  if (actor?.name) {
    metadata.actor_name = actor.name
  }

  if (actor?.avatar_url) {
    metadata.actor_avatar_url = actor.avatar_url
  }

  await createBulkNotifications({
    user_ids: uniqueUserIds,
    type: NotificationType.COURSE_ANNOUNCEMENT,
    title: 'New Announcement',
    message: `New announcement in ${courseTitle}: "${announcementTitle}"`,
    priority: NotificationPriority.NORMAL,
    action_url: `/class/${courseId}`,
    metadata,
  })
}

/**
 * Send course discussion post notification
 */
export const sendDiscussionPostNotification = async (
  userIds: string[],
  courseTitle: string,
  courseId: string,
  authorName: string
): Promise<void> => {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)))

  if (uniqueUserIds.length === 0) {
    return
  }

  await createBulkNotifications({
    user_ids: uniqueUserIds,
    type: NotificationType.COURSE_ANNOUNCEMENT,
    title: 'New Discussion Post',
    message: `${authorName} posted in ${courseTitle} discussion`,
    priority: NotificationPriority.NORMAL,
    action_url: `/class/${courseId}`,
    metadata: {
      course_id: courseId,
      author_name: authorName,
      source: 'discussion',
    },
  })
}
