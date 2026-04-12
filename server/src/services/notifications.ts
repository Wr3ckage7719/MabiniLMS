/**
 * Notifications Service
 * 
 * Business logic for the notification system.
 */

import { supabaseAdmin } from '../lib/supabase.js'
import { ApiError, ErrorCode } from '../types/index.js'
import {
  Notification,
  NotificationType,
  NotificationPriority,
  CreateNotificationInput,
  BulkNotificationInput,
  ListNotificationsQuery,
  NotificationCount,
} from '../types/notifications.js'
import logger from '../utils/logger.js'

type NotificationActor = {
  id?: string
  name?: string
  avatar_url?: string | null
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
    action_url: `/courses/${courseId}`,
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
    action_url: `/courses/${courseId}/announcements`,
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
