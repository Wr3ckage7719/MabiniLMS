/**
 * Notifications Types
 * 
 * Zod schemas and TypeScript interfaces for the notification system.
 */

import { z } from 'zod'

// ============================================
// Notification Types Enum
// ============================================

export enum NotificationType {
  // Course notifications
  COURSE_ENROLLMENT = 'course_enrollment',
  COURSE_PUBLISHED = 'course_published',
  COURSE_ANNOUNCEMENT = 'course_announcement',
  
  // Assignment notifications
  ASSIGNMENT_CREATED = 'assignment_created',
  ASSIGNMENT_DUE_SOON = 'assignment_due_soon',
  ASSIGNMENT_OVERDUE = 'assignment_overdue',
  
  // Grade notifications
  GRADE_POSTED = 'grade_posted',
  GRADE_UPDATED = 'grade_updated',
  
  // Material notifications
  MATERIAL_ADDED = 'material_added',
  
  // System notifications
  SYSTEM_ANNOUNCEMENT = 'system_announcement',
  ACCOUNT_UPDATE = 'account_update',
}

export const NotificationTypeSchema = z.nativeEnum(NotificationType)

// ============================================
// Notification Priority
// ============================================

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export const NotificationPrioritySchema = z.nativeEnum(NotificationPriority)

// ============================================
// Base Notification Schema
// ============================================

export const notificationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  type: NotificationTypeSchema,
  title: z.string(),
  message: z.string(),
  priority: NotificationPrioritySchema.default(NotificationPriority.NORMAL),
  read: z.boolean().default(false),
  read_at: z.string().datetime().nullable().optional(),
  action_url: z.string().url().nullable().optional(),
  metadata: z.record(z.any()).nullable().optional(),
  created_at: z.string().datetime(),
  expires_at: z.string().datetime().nullable().optional(),
})

export type Notification = z.infer<typeof notificationSchema>

// ============================================
// Create Notification Schema
// ============================================

export const createNotificationSchema = z.object({
  user_id: z.string().uuid(),
  type: NotificationTypeSchema,
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  priority: NotificationPrioritySchema.optional().default(NotificationPriority.NORMAL),
  action_url: z.string().url().optional(),
  metadata: z.record(z.any()).optional(),
  expires_at: z.string().datetime().optional(),
})

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>

// ============================================
// Bulk Create Notification Schema
// ============================================

export const bulkNotificationSchema = z.object({
  user_ids: z.array(z.string().uuid()).min(1).max(100),
  type: NotificationTypeSchema,
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  priority: NotificationPrioritySchema.optional().default(NotificationPriority.NORMAL),
  action_url: z.string().url().optional(),
  metadata: z.record(z.any()).optional(),
  expires_at: z.string().datetime().optional(),
})

export type BulkNotificationInput = z.infer<typeof bulkNotificationSchema>

// ============================================
// Update Notification Schema
// ============================================

export const updateNotificationSchema = z.object({
  read: z.boolean().optional(),
})

export type UpdateNotificationInput = z.infer<typeof updateNotificationSchema>

// ============================================
// Mark Multiple as Read Schema
// ============================================

export const markReadSchema = z.object({
  notification_ids: z.array(z.string().uuid()).min(1).max(100),
})

export type MarkReadInput = z.infer<typeof markReadSchema>

// ============================================
// Query Schemas
// ============================================

export const listNotificationsQuerySchema = z.object({
  read: z.enum(['true', 'false', 'all']).optional().default('all'),
  type: NotificationTypeSchema.optional(),
  priority: NotificationPrioritySchema.optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
  include_expired: z.enum(['true', 'false']).optional().default('false'),
})

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>

export const notificationIdParamSchema = z.object({
  id: z.string().uuid(),
})

// ============================================
// Notification Settings Schema
// ============================================

export const notificationSettingsSchema = z.object({
  email_enabled: z.boolean().default(true),
  push_enabled: z.boolean().default(true),
  types: z.record(NotificationTypeSchema, z.object({
    email: z.boolean().default(true),
    push: z.boolean().default(true),
    in_app: z.boolean().default(true),
  })).optional(),
})

export type NotificationSettings = z.infer<typeof notificationSettingsSchema>

// ============================================
// Notification Count Response
// ============================================

export interface NotificationCount {
  total: number
  unread: number
  by_type: Partial<Record<NotificationType, number>>
  by_priority: Partial<Record<NotificationPriority, number>>
}

// ============================================
// Database Migration SQL
// ============================================

export const NOTIFICATIONS_MIGRATION_SQL = `
-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  action_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- RLS Policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Only service role can insert notifications
CREATE POLICY "Service role can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Notification settings table (optional, for user preferences)
CREATE TABLE IF NOT EXISTS notification_settings (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  type_preferences JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`

// ============================================
// Helper Functions
// ============================================

/**
 * Get notification display color based on priority
 */
export const getPriorityColor = (priority: NotificationPriority): string => {
  switch (priority) {
    case NotificationPriority.URGENT:
      return '#dc2626' // red
    case NotificationPriority.HIGH:
      return '#f97316' // orange
    case NotificationPriority.NORMAL:
      return '#3b82f6' // blue
    case NotificationPriority.LOW:
      return '#6b7280' // gray
    default:
      return '#3b82f6'
  }
}

/**
 * Get notification icon based on type
 */
export const getNotificationIcon = (type: NotificationType): string => {
  switch (type) {
    case NotificationType.COURSE_ENROLLMENT:
      return 'book-open'
    case NotificationType.COURSE_PUBLISHED:
      return 'globe'
    case NotificationType.COURSE_ANNOUNCEMENT:
      return 'megaphone'
    case NotificationType.ASSIGNMENT_CREATED:
      return 'clipboard-list'
    case NotificationType.ASSIGNMENT_DUE_SOON:
      return 'clock'
    case NotificationType.ASSIGNMENT_OVERDUE:
      return 'exclamation-circle'
    case NotificationType.GRADE_POSTED:
      return 'academic-cap'
    case NotificationType.GRADE_UPDATED:
      return 'pencil'
    case NotificationType.MATERIAL_ADDED:
      return 'document-add'
    case NotificationType.SYSTEM_ANNOUNCEMENT:
      return 'information-circle'
    case NotificationType.ACCOUNT_UPDATE:
      return 'user-circle'
    default:
      return 'bell'
  }
}

/**
 * Format notification timestamp for display
 */
export const formatNotificationTime = (createdAt: string | Date): string => {
  const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString()
}
