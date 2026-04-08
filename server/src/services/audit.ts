import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../utils/logger.js';

/**
 * User Audit Service
 * Tracks all sensitive user actions for security and compliance
 */

// Audit event types
export enum AuditEventType {
  // Authentication events
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILED = 'login_failed',
  LOGOUT = 'logout',
  SESSION_EXPIRED = 'session_expired',
  TOKEN_REFRESH = 'token_refresh',
  
  // Password events
  PASSWORD_CHANGED = 'password_changed',
  PASSWORD_RESET_REQUESTED = 'password_reset_requested',
  PASSWORD_RESET_COMPLETED = 'password_reset_completed',
  TEMP_PASSWORD_USED = 'temp_password_used',
  
  // Profile events
  PROFILE_UPDATED = 'profile_updated',
  AVATAR_UPDATED = 'avatar_updated',
  EMAIL_CHANGED = 'email_changed',
  
  // Account events
  ACCOUNT_CREATED = 'account_created',
  ACCOUNT_VERIFIED = 'account_verified',
  ACCOUNT_DISABLED = 'account_disabled',
  ACCOUNT_ENABLED = 'account_enabled',
  
  // Course events
  COURSE_CREATED = 'course_created',
  COURSE_UPDATED = 'course_updated',
  COURSE_DELETED = 'course_deleted',
  COURSE_ENROLLED = 'course_enrolled',
  COURSE_UNENROLLED = 'course_unenrolled',
  
  // Assignment events
  ASSIGNMENT_CREATED = 'assignment_created',
  ASSIGNMENT_UPDATED = 'assignment_updated',
  ASSIGNMENT_SUBMITTED = 'assignment_submitted',
  ASSIGNMENT_RESUBMITTED = 'assignment_resubmitted',
  
  // Grade events
  GRADE_VIEWED = 'grade_viewed',
  GRADE_ASSIGNED = 'grade_assigned',
  GRADE_UPDATED = 'grade_updated',
  
  // Material events
  MATERIAL_UPLOADED = 'material_uploaded',
  MATERIAL_DOWNLOADED = 'material_downloaded',
  MATERIAL_DELETED = 'material_deleted',
  
  // Admin events (for non-admin users viewing admin actions)
  ADMIN_ACTION = 'admin_action',
}

export interface AuditEvent {
  id?: string;
  user_id: string;
  event_type: AuditEventType | string;
  resource_type?: string;
  resource_id?: string;
  details?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at?: string;
}

export interface AuditLogFilter {
  user_id?: string;
  event_type?: string;
  resource_type?: string;
  resource_id?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

/**
 * Log a user audit event
 */
export const logAuditEvent = async (event: AuditEvent): Promise<void> => {
  try {
    const { error } = await supabaseAdmin
      .from('user_audit_logs')
      .insert({
        user_id: event.user_id,
        event_type: event.event_type,
        resource_type: event.resource_type || null,
        resource_id: event.resource_id || null,
        details: event.details || {},
        ip_address: event.ip_address || null,
        user_agent: event.user_agent || null,
      });

    if (error) {
      // Don't throw - audit logging should never break the main flow
      logger.error('Failed to log audit event', { 
        error: error.message, 
        event_type: event.event_type,
        user_id: event.user_id 
      });
    }
  } catch (error) {
    logger.error('Error logging audit event', { 
      error: (error as Error).message,
      event_type: event.event_type 
    });
  }
};

/**
 * Log a batch of audit events
 */
export const logAuditEventsBatch = async (events: AuditEvent[]): Promise<void> => {
  if (events.length === 0) return;

  try {
    const { error } = await supabaseAdmin
      .from('user_audit_logs')
      .insert(events.map(e => ({
        user_id: e.user_id,
        event_type: e.event_type,
        resource_type: e.resource_type || null,
        resource_id: e.resource_id || null,
        details: e.details || {},
        ip_address: e.ip_address || null,
        user_agent: e.user_agent || null,
      })));

    if (error) {
      logger.error('Failed to log audit events batch', { 
        error: error.message, 
        count: events.length 
      });
    }
  } catch (error) {
    logger.error('Error logging audit events batch', { 
      error: (error as Error).message 
    });
  }
};

/**
 * Query audit logs with filters
 */
export const queryAuditLogs = async (
  filter: AuditLogFilter
): Promise<{ data: AuditEvent[]; total: number }> => {
  let query = supabaseAdmin
    .from('user_audit_logs')
    .select('*, profiles:user_id(email, first_name, last_name)', { count: 'exact' });

  if (filter.user_id) {
    query = query.eq('user_id', filter.user_id);
  }

  if (filter.event_type) {
    query = query.eq('event_type', filter.event_type);
  }

  if (filter.resource_type) {
    query = query.eq('resource_type', filter.resource_type);
  }

  if (filter.resource_id) {
    query = query.eq('resource_id', filter.resource_id);
  }

  if (filter.start_date) {
    query = query.gte('created_at', filter.start_date);
  }

  if (filter.end_date) {
    query = query.lte('created_at', filter.end_date);
  }

  query = query.order('created_at', { ascending: false });

  if (filter.limit) {
    query = query.limit(filter.limit);
  }

  if (filter.offset) {
    query = query.range(filter.offset, filter.offset + (filter.limit || 50) - 1);
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error('Failed to query audit logs', { error: error.message });
    throw error;
  }

  return {
    data: data || [],
    total: count || 0,
  };
};

/**
 * Get audit logs for a specific user
 */
export const getUserAuditLogs = async (
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<AuditEvent[]> => {
  const { data } = await queryAuditLogs({
    user_id: userId,
    limit,
    offset,
  });
  return data;
};

/**
 * Get recent activity for a resource (course, assignment, etc.)
 */
export const getResourceActivity = async (
  resourceType: string,
  resourceId: string,
  limit: number = 20
): Promise<AuditEvent[]> => {
  const { data } = await queryAuditLogs({
    resource_type: resourceType,
    resource_id: resourceId,
    limit,
  });
  return data;
};

// =============================================================================
// Convenience functions for common audit scenarios
// =============================================================================

/**
 * Log authentication event
 */
export const logAuthEvent = async (
  userId: string,
  eventType: AuditEventType,
  ipAddress?: string,
  userAgent?: string,
  details?: Record<string, any>
): Promise<void> => {
  await logAuditEvent({
    user_id: userId,
    event_type: eventType,
    details: {
      ...details,
      timestamp: new Date().toISOString(),
    },
    ip_address: ipAddress,
    user_agent: userAgent,
  });
};

/**
 * Log password event
 */
export const logPasswordEvent = async (
  userId: string,
  eventType: AuditEventType,
  ipAddress?: string,
  userAgent?: string
): Promise<void> => {
  await logAuditEvent({
    user_id: userId,
    event_type: eventType,
    details: {
      timestamp: new Date().toISOString(),
    },
    ip_address: ipAddress,
    user_agent: userAgent,
  });
};

/**
 * Log profile update
 */
export const logProfileUpdate = async (
  userId: string,
  changedFields: string[],
  ipAddress?: string,
  userAgent?: string
): Promise<void> => {
  await logAuditEvent({
    user_id: userId,
    event_type: AuditEventType.PROFILE_UPDATED,
    details: {
      changed_fields: changedFields,
      timestamp: new Date().toISOString(),
    },
    ip_address: ipAddress,
    user_agent: userAgent,
  });
};

/**
 * Log course event
 */
export const logCourseEvent = async (
  userId: string,
  eventType: AuditEventType,
  courseId: string,
  details?: Record<string, any>
): Promise<void> => {
  await logAuditEvent({
    user_id: userId,
    event_type: eventType,
    resource_type: 'course',
    resource_id: courseId,
    details: {
      ...details,
      timestamp: new Date().toISOString(),
    },
  });
};

/**
 * Log assignment event
 */
export const logAssignmentEvent = async (
  userId: string,
  eventType: AuditEventType,
  assignmentId: string,
  details?: Record<string, any>
): Promise<void> => {
  await logAuditEvent({
    user_id: userId,
    event_type: eventType,
    resource_type: 'assignment',
    resource_id: assignmentId,
    details: {
      ...details,
      timestamp: new Date().toISOString(),
    },
  });
};

/**
 * Log grade event
 */
export const logGradeEvent = async (
  userId: string,
  eventType: AuditEventType,
  gradeId: string,
  details?: Record<string, any>
): Promise<void> => {
  await logAuditEvent({
    user_id: userId,
    event_type: eventType,
    resource_type: 'grade',
    resource_id: gradeId,
    details: {
      ...details,
      timestamp: new Date().toISOString(),
    },
  });
};

/**
 * Log material event
 */
export const logMaterialEvent = async (
  userId: string,
  eventType: AuditEventType,
  materialId: string,
  details?: Record<string, any>
): Promise<void> => {
  await logAuditEvent({
    user_id: userId,
    event_type: eventType,
    resource_type: 'material',
    resource_id: materialId,
    details: {
      ...details,
      timestamp: new Date().toISOString(),
    },
  });
};

/**
 * Delete old audit logs (for data retention compliance)
 * Default: Delete logs older than 1 year
 */
export const purgeOldAuditLogs = async (
  olderThanDays: number = 365
): Promise<number> => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const { data, error } = await supabaseAdmin
    .from('user_audit_logs')
    .delete()
    .lt('created_at', cutoffDate.toISOString())
    .select('id');

  if (error) {
    logger.error('Failed to purge old audit logs', { error: error.message });
    throw error;
  }

  const deletedCount = data?.length || 0;
  logger.info('Purged old audit logs', { deletedCount, olderThanDays });
  return deletedCount;
};

export default {
  AuditEventType,
  logAuditEvent,
  logAuditEventsBatch,
  queryAuditLogs,
  getUserAuditLogs,
  getResourceActivity,
  logAuthEvent,
  logPasswordEvent,
  logProfileUpdate,
  logCourseEvent,
  logAssignmentEvent,
  logGradeEvent,
  logMaterialEvent,
  purgeOldAuditLogs,
};
