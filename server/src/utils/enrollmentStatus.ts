import { EnrollmentStatus } from '../types/enrollments.js'

export const LEGACY_ACTIVE_ENROLLMENT_STATUS = 'enrolled'

export const ACTIVE_ENROLLMENT_STATUSES: string[] = [
  EnrollmentStatus.ACTIVE,
  LEGACY_ACTIVE_ENROLLMENT_STATUS,
]

export const isActiveEnrollmentStatus = (status: unknown): boolean => {
  const normalizedStatus = String(status || '').toLowerCase()
  return ACTIVE_ENROLLMENT_STATUSES.includes(normalizedStatus)
}
