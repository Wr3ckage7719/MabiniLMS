export const STUDENT_INSTITUTIONAL_DOMAIN = 'mabinicolleges.edu.ph';
export const TEACHER_PENDING_APPROVAL_MESSAGE =
  'Your teacher account is pending admin approval. Please wait for approval from the admin.';
export const TEACHER_GOOGLE_APPROVAL_REQUIRED_MESSAGE =
  'No approved teacher account was found for this Google login. Please request a teacher account and wait for admin approval.';

export function isInstitutionalStudentEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${STUDENT_INSTITUTIONAL_DOMAIN}`);
}

export function isMissingLinkedAuthUserError(message: string): boolean {
  const normalizedMessage = message.toLowerCase();
  return (
    (normalizedMessage.includes('sub claim') && normalizedMessage.includes('does not exist')) ||
    (normalizedMessage.includes('user') && normalizedMessage.includes('does not exist')) ||
    normalizedMessage.includes('invalid refresh token')
  );
}
