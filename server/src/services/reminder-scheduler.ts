/**
 * Reminder Scheduler
 *
 * Periodically scans upcoming assignment due dates and dispatches in-app +
 * email "due soon" reminders to students who:
 *   1. Have not yet submitted (no submission row, or status === 'draft')
 *   2. Have due-date reminders enabled in their notification settings
 *   3. Are within their preferred lead window (default 24h)
 *   4. Have not already received this reminder (idempotency via
 *      `assignment_reminder_log`).
 *
 * The tick runs every 15 minutes (configurable). Disable in tests / one-off
 * scripts by setting ENABLE_REMINDER_SCHEDULER=false.
 */

import { supabaseAdmin } from '../lib/supabase.js'
import { sendAssignmentDueSoonNotification } from './notifications.js'
import { sendAssignmentDueReminderEmail } from './email.js'
import {
  getNotificationSettings,
  sendEmailIfEnabled,
} from './notification-settings.js'
import { ACTIVE_ENROLLMENT_STATUSES } from '../utils/enrollmentStatus.js'
import logger from '../utils/logger.js'

const REMINDER_KIND_DUE_SOON = 'due_soon'
const MAX_LEAD_HOURS = 168 // matches the per-user cap (1 week)
const TICK_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

let schedulerHandle: NodeJS.Timeout | null = null
let isTickRunning = false

interface ReminderCandidate {
  assignment_id: string
  user_id: string
  user_email: string
  user_full_name: string
  assignment_title: string
  course_title: string
  due_date: string
}

const isMissingTableError = (
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean => {
  if (!error) return false
  if (error.code === '42P01') return true
  if (typeof error.message === 'string' && /relation .* does not exist/i.test(error.message)) {
    return true
  }
  return false
}

const fetchUpcomingCandidates = async (now: Date): Promise<ReminderCandidate[]> => {
  const horizon = new Date(now.getTime() + MAX_LEAD_HOURS * 3600 * 1000)

  const { data: assignments, error: assignmentsError } = await supabaseAdmin
    .from('assignments')
    .select(`
      id, title, due_date, course_id,
      course:courses(id, title)
    `)
    .gte('due_date', now.toISOString())
    .lte('due_date', horizon.toISOString())

  if (assignmentsError) {
    logger.warn('Reminder scheduler: failed to load upcoming assignments', {
      error: assignmentsError.message,
    })
    return []
  }

  if (!assignments || assignments.length === 0) {
    return []
  }

  const candidates: ReminderCandidate[] = []
  const courseIdsByAssignment = new Map<string, string>()
  for (const a of assignments) {
    courseIdsByAssignment.set(a.id as string, a.course_id as string)
  }

  // Batch-load enrollments for all relevant courses in one round-trip.
  const courseIds = Array.from(new Set(assignments.map((a) => a.course_id as string)))
  const { data: enrollments, error: enrollmentsError } = await supabaseAdmin
    .from('enrollments')
    .select('course_id, student_id')
    .in('course_id', courseIds)
    .in('status', ACTIVE_ENROLLMENT_STATUSES)

  if (enrollmentsError) {
    logger.warn('Reminder scheduler: failed to load enrollments', {
      error: enrollmentsError.message,
    })
    return []
  }

  const studentsByCourse = new Map<string, Set<string>>()
  for (const e of enrollments || []) {
    const set = studentsByCourse.get(e.course_id as string) ?? new Set<string>()
    set.add(e.student_id as string)
    studentsByCourse.set(e.course_id as string, set)
  }

  const allStudentIds = Array.from(
    new Set(Array.from(studentsByCourse.values()).flatMap((s) => Array.from(s))),
  )
  if (allStudentIds.length === 0) {
    return []
  }

  // Profiles (for email + name)
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, email, first_name, last_name')
    .in('id', allStudentIds)

  const profileById = new Map<string, { email: string; first_name: string; last_name: string }>()
  for (const p of profiles || []) {
    profileById.set(p.id as string, {
      email: (p.email as string) || '',
      first_name: (p.first_name as string) || '',
      last_name: (p.last_name as string) || '',
    })
  }

  // Existing submissions across all (assignment, student) pairs of interest.
  const assignmentIds = assignments.map((a) => a.id as string)
  const { data: subs } = await supabaseAdmin
    .from('submissions')
    .select('assignment_id, student_id, status')
    .in('assignment_id', assignmentIds)
    .in('student_id', allStudentIds)

  const submittedKey = new Set<string>()
  for (const s of subs || []) {
    // Treat anything beyond draft as "turned in" — don't re-remind.
    if (s.status !== 'draft') {
      submittedKey.add(`${s.assignment_id}:${s.student_id}`)
    }
  }

  // Existing reminder log so we never re-send.
  let alreadySentKey = new Set<string>()
  const { data: reminderRows, error: reminderError } = await supabaseAdmin
    .from('assignment_reminder_log')
    .select('assignment_id, user_id')
    .eq('reminder_kind', REMINDER_KIND_DUE_SOON)
    .in('assignment_id', assignmentIds)

  if (reminderError) {
    if (isMissingTableError(reminderError)) {
      logger.warn('assignment_reminder_log table missing; skipping reminder tick. Run migration 042.')
      return []
    }
    logger.warn('Reminder scheduler: failed to load reminder log', { error: reminderError.message })
  } else {
    alreadySentKey = new Set(
      (reminderRows || []).map((r) => `${r.assignment_id}:${r.user_id}`),
    )
  }

  for (const a of assignments) {
    const assignmentId = a.id as string
    const dueDate = a.due_date as string
    const courseTitle =
      (Array.isArray(a.course) ? a.course[0]?.title : (a.course as any)?.title) || 'Course'
    const studentSet = studentsByCourse.get(courseIdsByAssignment.get(assignmentId)!) || new Set()

    for (const studentId of studentSet) {
      const key = `${assignmentId}:${studentId}`
      if (submittedKey.has(key)) continue
      if (alreadySentKey.has(key)) continue
      const profile = profileById.get(studentId)
      if (!profile) continue

      candidates.push({
        assignment_id: assignmentId,
        user_id: studentId,
        user_email: profile.email,
        user_full_name: `${profile.first_name} ${profile.last_name}`.trim() || 'Student',
        assignment_title: a.title as string,
        course_title: courseTitle,
        due_date: dueDate,
      })
    }
  }

  return candidates
}

const dispatchCandidate = async (
  candidate: ReminderCandidate,
  now: Date,
): Promise<boolean> => {
  let settings
  try {
    settings = await getNotificationSettings(candidate.user_id)
  } catch (err) {
    logger.warn('Reminder scheduler: failed to load settings; skipping', {
      user_id: candidate.user_id,
      err: err instanceof Error ? err.message : String(err),
    })
    return false
  }

  if (!settings.due_date_reminders_enabled) {
    return false
  }

  const hoursUntilDue =
    (new Date(candidate.due_date).getTime() - now.getTime()) / 3600000

  if (hoursUntilDue < 0) return false
  if (hoursUntilDue > settings.due_date_reminder_lead_hours) return false

  // In-app + push (gated inside notifications service via shouldSend).
  try {
    await sendAssignmentDueSoonNotification(
      candidate.user_id,
      candidate.assignment_title,
      candidate.course_title,
      candidate.due_date,
      candidate.assignment_id,
    )
  } catch (err) {
    logger.error('Reminder scheduler: in-app dispatch failed', {
      user_id: candidate.user_id,
      assignment_id: candidate.assignment_id,
      err: err instanceof Error ? err.message : String(err),
    })
  }

  // Email — only when the user has email enabled for this type.
  if (candidate.user_email) {
    await sendEmailIfEnabled(
      candidate.user_id,
      'assignment_due_soon',
      async () => {
        await sendAssignmentDueReminderEmail(
          candidate.user_email,
          candidate.user_full_name,
          candidate.assignment_title,
          candidate.course_title,
          new Date(candidate.due_date),
        )
      },
    )
  }

  // Mark sent.
  const { error: logError } = await supabaseAdmin
    .from('assignment_reminder_log')
    .insert({
      assignment_id: candidate.assignment_id,
      user_id: candidate.user_id,
      reminder_kind: REMINDER_KIND_DUE_SOON,
    })

  if (logError && !isMissingTableError(logError)) {
    // 23505 = unique violation — another tick beat us to it, that's fine.
    if (logError.code !== '23505') {
      logger.warn('Reminder scheduler: failed to record reminder dispatch', {
        user_id: candidate.user_id,
        assignment_id: candidate.assignment_id,
        error: logError.message,
      })
    }
  }

  return true
}

export const runDueDateReminderTick = async (now: Date = new Date()): Promise<number> => {
  const candidates = await fetchUpcomingCandidates(now)
  let dispatched = 0
  for (const candidate of candidates) {
    const sent = await dispatchCandidate(candidate, now)
    if (sent) dispatched += 1
  }
  if (dispatched > 0) {
    logger.info('Reminder scheduler: dispatched due-date reminders', {
      count: dispatched,
      candidateCount: candidates.length,
    })
  }
  return dispatched
}

const tickSafely = async (): Promise<void> => {
  if (isTickRunning) {
    logger.warn('Reminder scheduler: previous tick still running, skipping')
    return
  }
  isTickRunning = true
  try {
    await runDueDateReminderTick(new Date())
  } catch (err) {
    logger.error('Reminder scheduler: tick failed', {
      err: err instanceof Error ? err.message : String(err),
    })
  } finally {
    isTickRunning = false
  }
}

export const startReminderScheduler = (): void => {
  if (schedulerHandle) {
    return
  }
  schedulerHandle = setInterval(() => {
    void tickSafely()
  }, TICK_INTERVAL_MS)
  // Don't keep the event loop alive solely for this timer in shutdown paths.
  if (typeof schedulerHandle.unref === 'function') {
    schedulerHandle.unref()
  }
  logger.info('Reminder scheduler started', { interval_ms: TICK_INTERVAL_MS })
  // Kick off an immediate first tick so reminders flow without waiting 15min.
  void tickSafely()
}

export const stopReminderScheduler = (): void => {
  if (schedulerHandle) {
    clearInterval(schedulerHandle)
    schedulerHandle = null
  }
}
