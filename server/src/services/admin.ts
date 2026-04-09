import { supabaseAdmin } from '../lib/supabase.js'
import logger from '../utils/logger.js'
import * as emailService from './email.js'
import crypto from 'crypto'

const SYSTEM_SETTING_DESCRIPTIONS: Record<string, string> = {
  institutional_email_domains: 'Array of allowed email domains for student signup',
  require_teacher_approval: 'Whether teacher accounts require admin approval',
  allow_student_self_signup: 'Whether students can self-register',
  max_upload_size_mb: 'Maximum file upload size in megabytes',
  session_timeout_minutes: 'Session timeout in minutes',
  email_provider: "Email provider: 'mock', 'smtp', or 'gmail'",
  email_from: 'From email address for outbound emails',
  email_from_name: 'From name for outbound emails',
  smtp_host: 'SMTP server host',
  smtp_port: 'SMTP server port',
  smtp_secure: 'Whether SMTP transport uses secure TLS',
  smtp_user: 'SMTP username',
  smtp_pass: 'SMTP password or app password',
}

const EMAIL_SETTINGS_KEYS = new Set([
  'email_provider',
  'email_from',
  'email_from_name',
  'smtp_host',
  'smtp_port',
  'smtp_secure',
  'smtp_user',
  'smtp_pass',
])

/**
 * Admin Service
 * Handles admin-specific operations like teacher approval and student management
 */

export interface PendingTeacher {
  id: string
  email: string
  first_name: string
  last_name: string
  created_at: string
  pending_approval: boolean
}

export interface StudentData {
  email: string
  first_name: string
  last_name: string
  student_id?: string
}

export interface BulkStudentResult {
  total: number
  created: number
  failed: number
  errors: Array<{ row: number; email: string; error: string }>
}

export interface AuditLogFilter {
  admin_id?: string
  action_type?: string
  start_date?: string
  end_date?: string
  limit?: number
  offset?: number
}

export interface AuditLog {
  id: string
  admin_id: string
  action_type: string
  target_user_id: string | null
  details: Record<string, any>
  ip_address?: string
  user_agent?: string
  created_at: string
  admin?: {
    first_name: string
    last_name: string
    email: string
  }
  target_user?: {
    first_name: string
    last_name: string
    email: string
  }
}

/**
 * Log an admin action to audit log
 */
const logAdminAction = async (
  adminId: string,
  actionType: string,
  targetUserId: string | null,
  details: Record<string, any>,
  ipAddress?: string,
  userAgent?: string
): Promise<void> => {
  try {
    const { error } = await supabaseAdmin
      .from('admin_audit_logs')
      .insert({
        admin_id: adminId,
        action_type: actionType,
        target_user_id: targetUserId,
        details,
        ip_address: ipAddress,
        user_agent: userAgent
      })

    if (error) {
      logger.error(`Failed to log admin action: ${error.message}`)
    }
  } catch (error) {
    logger.error(`Error logging admin action: ${error}`)
  }
}

/**
 * List all pending teachers waiting for approval
 */
export const listPendingTeachers = async (): Promise<PendingTeacher[]> => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, first_name, last_name, created_at, pending_approval')
    .eq('role', 'teacher')
    .eq('pending_approval', true)
    .order('created_at', { ascending: false })

  if (error) {
    logger.error(`Error fetching pending teachers: ${error.message}`)
    throw new Error('Failed to fetch pending teachers')
  }

  return data as PendingTeacher[]
}

/**
 * Approve a pending teacher account
 */
export const approveTeacher = async (
  teacherId: string,
  adminId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> => {
  // Get teacher details
  const { data: teacher, error: fetchError } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', teacherId)
    .single()

  if (fetchError || !teacher) {
    throw new Error('Teacher not found')
  }

  if (teacher.role !== 'teacher') {
    throw new Error('User is not a teacher')
  }

  if (!teacher.pending_approval) {
    throw new Error('Teacher is already approved')
  }

  // Update teacher profile
  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({
      pending_approval: false,
      approved_at: new Date().toISOString(),
      approved_by: adminId
    })
    .eq('id', teacherId)

  if (updateError) {
    logger.error(`Error approving teacher: ${updateError.message}`)
    throw new Error('Failed to approve teacher')
  }

  // Log the action
  await logAdminAction(
    adminId,
    'teacher_approved',
    teacherId,
    {
      teacher_email: teacher.email,
      teacher_name: `${teacher.first_name} ${teacher.last_name}`
    },
    ipAddress,
    userAgent
  )

  // Send approval email
  try {
    await emailService.sendTeacherApprovalEmail(
      teacher.email,
      `${teacher.first_name} ${teacher.last_name}`
    )
  } catch (emailError) {
    logger.error(`Failed to send approval email: ${emailError}`)
    // Don't throw - approval succeeded even if email failed
  }

  logger.info(`Teacher ${teacher.email} approved by admin ${adminId}`)
}

/**
 * Reject a pending teacher account
 */
export const rejectTeacher = async (
  teacherId: string,
  adminId: string,
  reason?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> => {
  // Get teacher details
  const { data: teacher, error: fetchError } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', teacherId)
    .single()

  if (fetchError || !teacher) {
    throw new Error('Teacher not found')
  }

  if (teacher.role !== 'teacher') {
    throw new Error('User is not a teacher')
  }

  // Log the action before deletion
  await logAdminAction(
    adminId,
    'teacher_rejected',
    teacherId,
    {
      teacher_email: teacher.email,
      teacher_name: `${teacher.first_name} ${teacher.last_name}`,
      reason: reason || 'No reason provided'
    },
    ipAddress,
    userAgent
  )

  // Send rejection email
  try {
    await emailService.sendTeacherRejectionEmail(
      teacher.email,
      `${teacher.first_name} ${teacher.last_name}`,
      reason
    )
  } catch (emailError) {
    logger.error(`Failed to send rejection email: ${emailError}`)
  }

  // Delete the teacher profile (cascade will handle auth.users)
  const { error: deleteError } = await supabaseAdmin
    .from('profiles')
    .delete()
    .eq('id', teacherId)

  if (deleteError) {
    logger.error(`Error rejecting teacher: ${deleteError.message}`)
    throw new Error('Failed to reject teacher')
  }

  logger.info(`Teacher ${teacher.email} rejected by admin ${adminId}`)
}

/**
 * Generate a secure temporary password
 */
export const generateTemporaryPassword = (): string => {
  // Generate a 12-character password with mix of chars
  const length = 12
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  let password = ''
  
  const randomBytes = crypto.randomBytes(length)
  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length]
  }
  
  return password
}

/**
 * Create a single student account
 */
export const createStudentAccount = async (
  studentData: StudentData,
  adminId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ student: any; temporaryPassword: string }> => {
  const { email, first_name, last_name, student_id } = studentData

  // Check if user already exists
  const { data: existing } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single()

  if (existing) {
    throw new Error(`User with email ${email} already exists`)
  }

  // Generate temporary password
  const temporaryPassword = generateTemporaryPassword()

  // Create user in Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true, // Auto-confirm email for admin-created accounts
    user_metadata: {
      first_name,
      last_name,
      role: 'student',
      student_id: student_id || null
    }
  })

  if (authError || !authData.user) {
    logger.error(`Error creating student auth: ${authError?.message}`)
    throw new Error(`Failed to create student account: ${authError?.message}`)
  }

  // Create profile
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: authData.user.id,
      email,
      first_name,
      last_name,
      role: 'student',
      email_verified: true,
      email_verified_at: new Date().toISOString(),
      account_created_by: adminId
    })
    .select()
    .single()

  if (profileError) {
    // Rollback auth user creation
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    logger.error(`Error creating student profile: ${profileError.message}`)
    throw new Error('Failed to create student profile')
  }

  // Store temporary password record (for tracking, not for authentication)
  // We'll use a simple hash for tracking that this password was temp-generated
  const passwordHash = crypto.createHash('sha256').update(temporaryPassword).digest('hex')
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7) // 7 days expiry

  const { error: tempPassError } = await supabaseAdmin
    .from('temporary_passwords')
    .insert({
      user_id: authData.user.id,
      temp_password_hash: passwordHash,
      must_change_password: true,
      expires_at: expiresAt.toISOString()
    })

  if (tempPassError) {
    logger.error(`Error storing temporary password: ${tempPassError.message}`)
    // Don't fail the entire operation
  }

  // Log the action
  await logAdminAction(
    adminId,
    'student_created',
    authData.user.id,
    {
      student_email: email,
      student_name: `${first_name} ${last_name}`,
      student_id: student_id || null
    },
    ipAddress,
    userAgent
  )

  // Send credentials email
  try {
    await emailService.sendStudentCredentialsEmail(
      email,
      `${first_name} ${last_name}`,
      email,
      temporaryPassword
    )
  } catch (emailError) {
    logger.error(`Failed to send credentials email: ${emailError}`)
    // Don't throw - account was created successfully
  }

  logger.info(`Student account created: ${email} by admin ${adminId}`)

  return { student: profile, temporaryPassword }
}

/**
 * Create multiple student accounts from CSV data
 */
export const bulkCreateStudents = async (
  studentsData: StudentData[],
  adminId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<BulkStudentResult> => {
  const result: BulkStudentResult = {
    total: studentsData.length,
    created: 0,
    failed: 0,
    errors: []
  }

  for (let i = 0; i < studentsData.length; i++) {
    const studentData = studentsData[i]
    try {
      await createStudentAccount(studentData, adminId, ipAddress, userAgent)
      result.created++
    } catch (error) {
      result.failed++
      result.errors.push({
        row: i + 1,
        email: studentData.email,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      logger.error(`Failed to create student ${studentData.email}: ${error}`)
    }
  }

  // Log bulk operation
  await logAdminAction(
    adminId,
    'students_bulk_created',
    null,
    {
      total: result.total,
      created: result.created,
      failed: result.failed
    },
    ipAddress,
    userAgent
  )

  return result
}

/**
 * Get system setting by key
 */
export const getSystemSetting = async (key: string): Promise<any> => {
  const { data, error } = await supabaseAdmin
    .from('system_settings')
    .select('value')
    .eq('key', key)
    .single()

  if (error) {
    logger.error(`Error fetching system setting ${key}: ${error.message}`)
    return null
  }

  return data?.value
}

/**
 * Update system setting
 */
export const updateSystemSetting = async (
  key: string,
  value: any,
  adminId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> => {
  // Get old value for audit log
  const oldValue = await getSystemSetting(key)

  const { error } = await supabaseAdmin
    .from('system_settings')
    .upsert({
      key,
      value,
      description: SYSTEM_SETTING_DESCRIPTIONS[key] || `System setting for ${key}`,
      updated_by: adminId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })

  if (error) {
    logger.error(`Error updating system setting ${key}: ${error.message}`)
    throw new Error(`Failed to update setting: ${key}`)
  }

  if (EMAIL_SETTINGS_KEYS.has(key)) {
    emailService.invalidateEmailSettingsCache()
  }

  // Log the action
  await logAdminAction(
    adminId,
    'settings_updated',
    null,
    {
      setting_key: key,
      old_value: oldValue,
      new_value: value
    },
    ipAddress,
    userAgent
  )

  logger.info(`System setting ${key} updated by admin ${adminId}`)
}

/**
 * Get all system settings
 */
export const getAllSystemSettings = async (): Promise<Record<string, any>> => {
  const { data, error } = await supabaseAdmin
    .from('system_settings')
    .select('key, value, description, updated_at')

  if (error) {
    logger.error(`Error fetching system settings: ${error.message}`)
    throw new Error('Failed to fetch system settings')
  }

  const settings: Record<string, any> = {}
  data.forEach((setting) => {
    settings[setting.key] = {
      value: setting.value,
      description: setting.description,
      updated_at: setting.updated_at
    }
  })

  return settings
}

/**
 * Get audit logs with filters
 */
export const getAuditLogs = async (filters: AuditLogFilter = {}): Promise<{ logs: AuditLog[]; total: number }> => {
  let query = supabaseAdmin
    .from('admin_audit_logs')
    .select(`
      *,
      admin:admin_id (first_name, last_name, email),
      target_user:target_user_id (first_name, last_name, email)
    `, { count: 'exact' })

  if (filters.admin_id) {
    query = query.eq('admin_id', filters.admin_id)
  }

  if (filters.action_type) {
    query = query.eq('action_type', filters.action_type)
  }

  if (filters.start_date) {
    query = query.gte('created_at', filters.start_date)
  }

  if (filters.end_date) {
    query = query.lte('created_at', filters.end_date)
  }

  query = query.order('created_at', { ascending: false })

  if (filters.limit) {
    query = query.limit(filters.limit)
  }

  if (filters.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1)
  }

  const { data, error, count } = await query

  if (error) {
    logger.error(`Error fetching audit logs: ${error.message}`)
    throw new Error('Failed to fetch audit logs')
  }

  return { logs: data as AuditLog[], total: count || 0 }
}

/**
 * Get count of pending teachers for admin notifications
 */
export const getPendingTeachersCount = async (): Promise<number> => {
  const { count, error } = await supabaseAdmin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'teacher')
    .eq('pending_approval', true)

  if (error) {
    logger.error(`Error counting pending teachers: ${error.message}`)
    return 0
  }

  return count || 0
}
