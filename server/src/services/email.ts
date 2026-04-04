import logger from '../utils/logger.js'

/**
 * Email service with mock implementation
 * Ready to swap for Nodemailer or SendGrid
 */

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

/**
 * Send email (mock implementation - logs to console)
 */
export const sendEmail = async (options: EmailOptions): Promise<void> => {
  const { to, subject, html, text } = options

  // Mock implementation: log to console and logger
  const preview = text || html.substring(0, 100).replace(/<[^>]*>/g, '')

  logger.error(`[EMAIL SENT] To: ${to}, Subject: ${subject}, Body: ${preview}`)

  console.log(`
╔════════════════════════════════════════╗
║         📧 EMAIL SENT (MOCK)          ║
╠════════════════════════════════════════╣
║ To:       ${to}
║ Subject:  ${subject}
║ Preview:  ${preview}
╚════════════════════════════════════════╝
  `)
}

/**
 * Send email verification
 */
export const sendVerificationEmail = async (
  email: string,
  verificationLink: string
): Promise<void> => {
  const subject = 'Verify Your Email - MabiniLMS'

  const html = `
    <h2>Welcome to MabiniLMS!</h2>
    <p>Please verify your email to complete your registration.</p>
    <p><a href="${verificationLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Verify Email</a></p>
    <p>Or copy this link: ${verificationLink}</p>
    <p>This link expires in 24 hours.</p>
  `

  const text = `
Welcome to MabiniLMS!
Please verify your email to complete your registration.
Verification link: ${verificationLink}
This link expires in 24 hours.
  `.trim()

  await sendEmail({ to: email, subject, html, text })
}

/**
 * Send password reset email
 */
export const sendPasswordResetEmail = async (
  email: string,
  resetLink: string
): Promise<void> => {
  const subject = 'Reset Your Password - MabiniLMS'

  const html = `
    <h2>Password Reset Request</h2>
    <p>We received a request to reset your password.</p>
    <p><a href="${resetLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Reset Password</a></p>
    <p>Or copy this link: ${resetLink}</p>
    <p>This link expires in 1 hour.</p>
    <p>If you didn't request this, ignore this email.</p>
  `

  const text = `
Password Reset Request

We received a request to reset your password.
Reset link: ${resetLink}
This link expires in 1 hour.

If you didn't request this, ignore this email.
  `.trim()

  await sendEmail({ to: email, subject, html, text })
}

/**
 * Send enrollment confirmation email
 */
export const sendEnrollmentConfirmationEmail = async (
  email: string,
  studentName: string,
  courseName: string
): Promise<void> => {
  const subject = `Enrollment Confirmation - ${courseName} - MabiniLMS`

  const html = `
    <h2>Enrollment Confirmation</h2>
    <p>Dear ${studentName},</p>
    <p>You have been successfully enrolled in <strong>${courseName}</strong>.</p>
    <p>You can now access the course materials and assignments through your MabiniLMS dashboard.</p>
  `

  const text = `
Enrollment Confirmation

Dear ${studentName},

You have been successfully enrolled in ${courseName}.
You can now access the course materials and assignments through your MabiniLMS dashboard.
  `.trim()

  await sendEmail({ to: email, subject, html, text })
}

/**
 * Send assignment due reminder email
 */
export const sendAssignmentDueReminderEmail = async (
  email: string,
  studentName: string,
  assignmentTitle: string,
  courseName: string,
  dueDate: Date
): Promise<void> => {
  const subject = `Reminder: Assignment Due in 24 Hours - ${assignmentTitle}`

  const dueDateStr = dueDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  const html = `
    <h2>Assignment Due Reminder</h2>
    <p>Dear ${studentName},</p>
    <p>This is a reminder that your assignment <strong>${assignmentTitle}</strong> in <strong>${courseName}</strong> is due in 24 hours.</p>
    <p><strong>Due Date:</strong> ${dueDateStr}</p>
    <p>Submit your assignment through the MabiniLMS dashboard.</p>
  `

  const text = `
Assignment Due Reminder

Dear ${studentName},

This is a reminder that your assignment "${assignmentTitle}" in "${courseName}" is due in 24 hours.
Due Date: ${dueDateStr}

Submit your assignment through the MabiniLMS dashboard.
  `.trim()

  await sendEmail({ to: email, subject, html, text })
}

/**
 * Send submission received confirmation
 */
export const sendSubmissionReceivedEmail = async (
  email: string,
  studentName: string,
  assignmentTitle: string,
  courseName: string,
  submittedAt: Date
): Promise<void> => {
  const subject = `Submission Received - ${assignmentTitle}`

  const submittedAtStr = submittedAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  const html = `
    <h2>Submission Received</h2>
    <p>Dear ${studentName},</p>
    <p>Your submission for <strong>${assignmentTitle}</strong> in <strong>${courseName}</strong> has been received.</p>
    <p><strong>Submitted At:</strong> ${submittedAtStr}</p>
    <p>Your instructor will review and grade your submission soon.</p>
  `

  const text = `
Submission Received

Dear ${studentName},

Your submission for "${assignmentTitle}" in "${courseName}" has been received.
Submitted At: ${submittedAtStr}

Your instructor will review and grade your submission soon.
  `.trim()

  await sendEmail({ to: email, subject, html, text })
}

/**
 * Send grade released notification
 */
export const sendGradeReleasedEmail = async (
  email: string,
  studentName: string,
  assignmentTitle: string,
  courseName: string,
  pointsEarned: number,
  pointsPossible: number,
  feedback?: string
): Promise<void> => {
  const percentage = Math.round((pointsEarned / pointsPossible) * 100)
  const subject = `Grade Released - ${assignmentTitle}`

  const html = `
    <h2>Your Grade is Ready</h2>
    <p>Dear ${studentName},</p>
    <p>Your grade for <strong>${assignmentTitle}</strong> in <strong>${courseName}</strong> is now available.</p>
    <p><strong>Score:</strong> ${pointsEarned}/${pointsPossible} (${percentage}%)</p>
    ${feedback ? `<p><strong>Feedback:</strong></p><p>${feedback.replace(/\n/g, '<br>')}</p>` : ''}
    <p>View detailed feedback and comments in your MabiniLMS dashboard.</p>
  `

  const text = `
Your Grade is Ready

Dear ${studentName},

Your grade for "${assignmentTitle}" in "${courseName}" is now available.
Score: ${pointsEarned}/${pointsPossible} (${percentage}%)
${feedback ? `\nFeedback:\n${feedback}` : ''}

View detailed feedback and comments in your MabiniLMS dashboard.
  `.trim()

  await sendEmail({ to: email, subject, html, text })
}

/**
 * Send course announcement email
 */
export const sendCourseAnnouncementEmail = async (
  email: string,
  studentName: string,
  courseName: string,
  title: string,
  content: string
): Promise<void> => {
  const subject = `Announcement - ${courseName}: ${title}`

  const html = `
    <h2>Course Announcement</h2>
    <p>Dear ${studentName},</p>
    <p>New announcement in <strong>${courseName}</strong>:</p>
    <h3>${title}</h3>
    <p>${content.replace(/\n/g, '<br>')}</p>
  `

  const text = `
Course Announcement

Dear ${studentName},

New announcement in ${courseName}:

${title}

${content}
  `.trim()

  await sendEmail({ to: email, subject, html, text })
}
