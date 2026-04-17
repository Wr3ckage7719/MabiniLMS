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
  status?: 'legacy_pending_profile' | 'pending_email_verification' | 'pending_review'
}

export interface StudentData {
  email: string
  first_name: string
  last_name: string
  student_id?: string
}

export interface ManagedUser {
  id: string
  email: string
  first_name: string
  last_name: string
  role: 'teacher' | 'student'
  pending_approval?: boolean | null
  created_at: string
  updated_at: string
}

export interface ManagedUserUpdateInput {
  email?: string
  first_name?: string
  last_name?: string
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

export interface AdminDashboardStats {
  pending_teachers: number
  total_students: number
  total_teachers: number
  active_courses: number
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const normalizeText = (value?: string): string | undefined => {
  if (value === undefined || value === null) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const normalizeStudentInput = (studentData: StudentData): StudentData => {
  return {
    email: (normalizeText(studentData.email) || '').toLowerCase(),
    first_name: normalizeText(studentData.first_name) || '',
    last_name: normalizeText(studentData.last_name) || '',
    student_id: normalizeText(studentData.student_id)
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
  const [legacyResult, applicationResult] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, created_at, pending_approval')
      .eq('role', 'teacher')
      .eq('pending_approval', true)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('teacher_applications')
      .select('id, email, first_name, last_name, created_at, status')
      .in('status', ['pending_email_verification', 'pending_review'])
      .order('created_at', { ascending: false }),
  ])

  if (legacyResult.error) {
    logger.error(`Error fetching pending teacher profiles: ${legacyResult.error.message}`)
    throw new Error('Failed to fetch pending teachers')
  }

  if (applicationResult.error) {
    logger.error(`Error fetching pending teacher applications: ${applicationResult.error.message}`)
    throw new Error('Failed to fetch pending teachers')
  }

  const pendingProfiles: PendingTeacher[] = ((legacyResult.data || []) as PendingTeacher[]).map((profile) => ({
    ...profile,
    status: 'legacy_pending_profile' as const,
  }))
  const pendingApplications: PendingTeacher[] = (applicationResult.data || []).map((application) => {
    const status: PendingTeacher['status'] =
      application.status === 'pending_email_verification'
        ? 'pending_email_verification'
        : 'pending_review'

    return {
      id: application.id,
      email: application.email,
      first_name: application.first_name,
      last_name: application.last_name,
      created_at: application.created_at,
      pending_approval: true,
      status,
    }
  })

  const mergedPendingTeachers: PendingTeacher[] = [...pendingProfiles, ...pendingApplications]

  return mergedPendingTeachers.sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

const getManageableUser = async (userId: string): Promise<ManagedUser> => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, first_name, last_name, role, pending_approval, created_at, updated_at')
    .eq('id', userId)
    .single()

  if (error || !data) {
    throw new Error('User not found')
  }

  if (data.role !== 'teacher' && data.role !== 'student') {
    throw new Error('Only teacher and student accounts can be managed')
  }

  return data as ManagedUser
}

/**
 * Update a teacher or student account from admin panel
 */
export const updateManagedUser = async (
  userId: string,
  input: ManagedUserUpdateInput,
  adminId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<ManagedUser> => {
  const existingUser = await getManageableUser(userId)

  const nextEmail = input.email !== undefined
    ? (normalizeText(input.email) || '').toLowerCase()
    : undefined
  const nextFirstName = input.first_name !== undefined ? normalizeText(input.first_name) : undefined
  const nextLastName = input.last_name !== undefined ? normalizeText(input.last_name) : undefined

  if (input.email !== undefined && !nextEmail) {
    throw new Error('Email is required')
  }

  if (nextEmail && !EMAIL_REGEX.test(nextEmail)) {
    throw new Error('Invalid email address')
  }

  if (input.first_name !== undefined && !nextFirstName) {
    throw new Error('First name is required')
  }

  if (input.last_name !== undefined && !nextLastName) {
    throw new Error('Last name is required')
  }

  if (
    nextEmail === undefined &&
    nextFirstName === undefined &&
    nextLastName === undefined
  ) {
    throw new Error('At least one field is required')
  }

  if (nextEmail && nextEmail !== existingUser.email) {
    const { data: duplicateUser, error: duplicateCheckError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', nextEmail)
      .maybeSingle()

    if (duplicateCheckError) {
      logger.error(`Failed email duplicate check for ${nextEmail}: ${duplicateCheckError.message}`)
      throw new Error('Failed to validate email address')
    }

    if (duplicateUser && duplicateUser.id !== userId) {
      throw new Error(`User with email ${nextEmail} already exists`)
    }
  }

  const updatedEmail = nextEmail ?? existingUser.email
  const updatedFirstName = nextFirstName ?? existingUser.first_name
  const updatedLastName = nextLastName ?? existingUser.last_name

  if (
    updatedEmail !== existingUser.email ||
    updatedFirstName !== existingUser.first_name ||
    updatedLastName !== existingUser.last_name
  ) {
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email: updatedEmail,
      user_metadata: {
        first_name: updatedFirstName,
        last_name: updatedLastName,
      },
    })

    if (authUpdateError) {
      logger.error(`Failed to update auth user ${userId}: ${authUpdateError.message}`)
      throw new Error(`Failed to update user account: ${authUpdateError.message}`)
    }
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (nextEmail !== undefined) {
    updatePayload.email = updatedEmail
  }
  if (nextFirstName !== undefined) {
    updatePayload.first_name = updatedFirstName
  }
  if (nextLastName !== undefined) {
    updatePayload.last_name = updatedLastName
  }

  const { data: updatedUser, error: updateError } = await supabaseAdmin
    .from('profiles')
    .update(updatePayload)
    .eq('id', userId)
    .select('id, email, first_name, last_name, role, pending_approval, created_at, updated_at')
    .single()

  if (updateError || !updatedUser) {
    logger.error(`Failed to update profile ${userId}: ${updateError?.message}`)
    throw new Error('Failed to update user profile')
  }

  await logAdminAction(
    adminId,
    'managed_user_updated',
    userId,
    {
      role: existingUser.role,
      before: {
        email: existingUser.email,
        first_name: existingUser.first_name,
        last_name: existingUser.last_name,
      },
      after: {
        email: updatedUser.email,
        first_name: updatedUser.first_name,
        last_name: updatedUser.last_name,
      },
    },
    ipAddress,
    userAgent
  )

  return updatedUser as ManagedUser
}

/**
 * Delete a teacher or student account from admin panel
 */
export const deleteManagedUser = async (
  userId: string,
  adminId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> => {
  const existingUser = await getManageableUser(userId)

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

  if (deleteError) {
    logger.error(`Failed to delete managed user ${userId}: ${deleteError.message}`)
    throw new Error('Failed to delete user')
  }

  await logAdminAction(
    adminId,
    'managed_user_deleted',
    userId,
    {
      role: existingUser.role,
      email: existingUser.email,
      full_name: `${existingUser.first_name} ${existingUser.last_name}`,
      pending_approval: existingUser.pending_approval || false,
    },
    ipAddress,
    userAgent
  )
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
  const { data: application, error: applicationError } = await supabaseAdmin
    .from('teacher_applications')
    .select('id, email, first_name, last_name, status, linked_user_id')
    .eq('id', teacherId)
    .maybeSingle()

  if (applicationError && applicationError.code !== 'PGRST116') {
    logger.error(`Error fetching teacher application ${teacherId}: ${applicationError.message}`)
    throw new Error('Failed to approve teacher')
  }

  if (application) {
    if (application.status !== 'pending_review') {
      throw new Error('Teacher application is not pending review')
    }

    const normalizedEmail = application.email.trim().toLowerCase()
    const nowIso = new Date().toISOString()
    const onboardingToken = crypto.randomBytes(32).toString('hex')
    const onboardingTokenHash = crypto.createHash('sha256').update(onboardingToken).digest('hex')
    const onboardingExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    let linkedUserId = application.linked_user_id || null

    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existingProfileError && existingProfileError.code !== 'PGRST116') {
      logger.error(`Error checking existing teacher profile ${normalizedEmail}: ${existingProfileError.message}`)
      throw new Error('Failed to approve teacher')
    }

    if (existingProfile && existingProfile.role !== 'teacher') {
      throw new Error('Email is already registered as a non-teacher account')
    }

    if (existingProfile) {
      linkedUserId = existingProfile.id
      const { error: profileUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({
          pending_approval: false,
          email_verified: true,
          email_verified_at: nowIso,
          approved_at: nowIso,
          approved_by: adminId,
          updated_at: nowIso,
        })
        .eq('id', existingProfile.id)

      if (profileUpdateError) {
        logger.error(`Error updating approved teacher profile ${existingProfile.id}: ${profileUpdateError.message}`)
        throw new Error('Failed to approve teacher')
      }
    } else {
      const bootstrapPassword = generateTemporaryPassword()
      const { data: authData, error: authCreateError } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password: bootstrapPassword,
        email_confirm: true,
        user_metadata: {
          first_name: application.first_name,
          last_name: application.last_name,
          role: 'teacher',
        },
      })

      if (authCreateError || !authData.user) {
        logger.error(`Error creating approved teacher auth user for ${normalizedEmail}: ${authCreateError?.message}`)
        throw new Error('Failed to approve teacher')
      }

      linkedUserId = authData.user.id

      const { error: profileUpsertError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: linkedUserId,
          email: normalizedEmail,
          first_name: application.first_name,
          last_name: application.last_name,
          role: 'teacher',
          pending_approval: false,
          email_verified: true,
          email_verified_at: nowIso,
          approved_at: nowIso,
          approved_by: adminId,
          updated_at: nowIso,
        })

      if (profileUpsertError) {
        logger.error(`Error creating teacher profile for approved application ${teacherId}: ${profileUpsertError.message}`)
        throw new Error('Failed to approve teacher')
      }
    }

    const { error: applicationUpdateError } = await supabaseAdmin
      .from('teacher_applications')
      .update({
        status: 'approved',
        linked_user_id: linkedUserId,
        approved_at: nowIso,
        approved_by: adminId,
        onboarding_token_hash: onboardingTokenHash,
        onboarding_expires_at: onboardingExpiresAt,
        onboarding_used_at: null,
        updated_at: nowIso,
      })
      .eq('id', teacherId)

    if (applicationUpdateError) {
      logger.error(`Error updating teacher application approval ${teacherId}: ${applicationUpdateError.message}`)
      throw new Error('Failed to approve teacher')
    }

    await logAdminAction(
      adminId,
      'teacher_application_approved',
      linkedUserId,
      {
        teacher_email: normalizedEmail,
        teacher_name: `${application.first_name} ${application.last_name}`,
        application_id: teacherId,
      },
      ipAddress,
      userAgent
    )

    try {
      const onboardingLink = `${emailService.getClientUrl()}/auth/reset-password?token=${onboardingToken}&flow=teacher-onboarding`
      await emailService.sendTeacherOnboardingEmail(
        normalizedEmail,
        `${application.first_name} ${application.last_name}`,
        onboardingLink
      )
    } catch (emailError) {
      logger.error(`Failed to send teacher onboarding email: ${emailError}`)
    }

    logger.info(`Teacher application ${teacherId} approved by admin ${adminId}`)
    return
  }

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
  const { data: application, error: applicationError } = await supabaseAdmin
    .from('teacher_applications')
    .select('id, email, first_name, last_name, status, linked_user_id')
    .eq('id', teacherId)
    .maybeSingle()

  if (applicationError && applicationError.code !== 'PGRST116') {
    logger.error(`Error fetching teacher application ${teacherId} for rejection: ${applicationError.message}`)
    throw new Error('Failed to reject teacher')
  }

  if (application) {
    if (application.status === 'approved' && application.linked_user_id) {
      throw new Error('Approved teacher applications cannot be rejected')
    }

    const { error: applicationUpdateError } = await supabaseAdmin
      .from('teacher_applications')
      .update({
        status: 'rejected',
        rejected_reason: reason || null,
        rejected_at: new Date().toISOString(),
        verification_token_hash: null,
        verification_expires_at: null,
        onboarding_token_hash: null,
        onboarding_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', teacherId)

    if (applicationUpdateError) {
      logger.error(`Error rejecting teacher application ${teacherId}: ${applicationUpdateError.message}`)
      throw new Error('Failed to reject teacher')
    }

    await logAdminAction(
      adminId,
      'teacher_application_rejected',
      application.linked_user_id || null,
      {
        teacher_email: application.email,
        teacher_name: `${application.first_name} ${application.last_name}`,
        reason: reason || 'No reason provided',
        application_id: teacherId,
      },
      ipAddress,
      userAgent
    )

    try {
      await emailService.sendTeacherRejectionEmail(
        application.email,
        `${application.first_name} ${application.last_name}`,
        reason
      )
    } catch (emailError) {
      logger.error(`Failed to send teacher application rejection email: ${emailError}`)
    }

    logger.info(`Teacher application ${teacherId} rejected by admin ${adminId}`)
    return
  }

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
  const normalizedStudent = normalizeStudentInput(studentData)
  const { email, first_name, last_name, student_id } = normalizedStudent

  if (!email || !EMAIL_REGEX.test(email)) {
    throw new Error('Invalid email address')
  }

  if (!first_name) {
    throw new Error('First name is required')
  }

  if (!last_name) {
    throw new Error('Last name is required')
  }

  // Check if user already exists
  const { data: existing, error: existingCheckError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (existingCheckError) {
    logger.error(`Error checking existing student ${email}: ${existingCheckError.message}`)
    throw new Error('Failed to validate student email')
  }

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
    if (authError?.message?.toLowerCase().includes('already')) {
      throw new Error(`User with email ${email} already exists`)
    }
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
    const rawStudentData = studentsData[i]
    const studentData = normalizeStudentInput(rawStudentData)

    if (!studentData.email || !EMAIL_REGEX.test(studentData.email)) {
      result.failed++
      result.errors.push({
        row: i + 1,
        email: studentData.email || 'N/A',
        error: 'Invalid email address',
      })
      continue
    }

    if (!studentData.first_name || !studentData.last_name) {
      result.failed++
      result.errors.push({
        row: i + 1,
        email: studentData.email,
        error: 'First name and last name are required',
      })
      continue
    }

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
  const [legacyCountResult, applicationCountResult] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'teacher')
      .eq('pending_approval', true),
    supabaseAdmin
      .from('teacher_applications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_review'),
  ])

  if (legacyCountResult.error) {
    logger.error(`Error counting pending teacher profiles: ${legacyCountResult.error.message}`)
    return 0
  }

  if (applicationCountResult.error) {
    logger.error(`Error counting pending teacher applications: ${applicationCountResult.error.message}`)
    return 0
  }

  return (legacyCountResult.count || 0) + (applicationCountResult.count || 0)
}

/**
 * Get dashboard-level stats for admin pages
 */
export const getDashboardStats = async (): Promise<AdminDashboardStats> => {
  const [pendingTeachersResult, pendingApplicationsResult, totalStudentsResult, totalTeachersResult, activeCoursesResult] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'teacher')
      .eq('pending_approval', true),
    supabaseAdmin
      .from('teacher_applications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_review'),
    supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student'),
    supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'teacher'),
    supabaseAdmin
      .from('courses')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published'),
  ])

  if (pendingTeachersResult.error || pendingApplicationsResult.error || totalStudentsResult.error || totalTeachersResult.error || activeCoursesResult.error) {
    logger.error('Failed to compute admin dashboard stats', {
      pendingTeachersError: pendingTeachersResult.error?.message,
      pendingApplicationsError: pendingApplicationsResult.error?.message,
      totalStudentsError: totalStudentsResult.error?.message,
      totalTeachersError: totalTeachersResult.error?.message,
      activeCoursesError: activeCoursesResult.error?.message,
    })
    throw new Error('Failed to fetch dashboard stats')
  }

  return {
    pending_teachers: (pendingTeachersResult.count || 0) + (pendingApplicationsResult.count || 0),
    total_students: totalStudentsResult.count || 0,
    total_teachers: totalTeachersResult.count || 0,
    active_courses: activeCoursesResult.count || 0,
  }
}
