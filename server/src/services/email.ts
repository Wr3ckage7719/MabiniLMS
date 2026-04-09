import nodemailer from 'nodemailer';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../utils/logger.js'

/**
 * Email service with Nodemailer integration
 * Supports SMTP, Gmail, and mock mode for development
 */

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
  attachments?: Array<{
    filename: string
    content: Buffer | string
    contentType?: string
  }>
}

interface EmailConfig {
  provider: 'smtp' | 'gmail' | 'mock'
  smtp?: {
    host: string
    port: number
    secure: boolean
    auth: {
      user: string
      pass: string
    }
  }
  from: string
  fromName: string
}

const EMAIL_SETTING_KEYS = [
  'email_provider',
  'email_from',
  'email_from_name',
  'smtp_host',
  'smtp_port',
  'smtp_secure',
  'smtp_user',
  'smtp_pass',
] as const;

let cachedSettings: Record<string, unknown> = {};
let settingsLoadedAt = 0;
const SETTINGS_CACHE_TTL_MS = 60 * 1000;

export const invalidateEmailSettingsCache = (): void => {
  cachedSettings = {};
  settingsLoadedAt = 0;
  transporter = null;
  transporterConfigKey = null;
};

const getClientUrl = (): string => {
  return process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
};

const parseBoolean = (value: unknown, defaultValue: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return defaultValue;
};

const parseNumber = (value: unknown, defaultValue: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return defaultValue;
};

const getSetting = <T>(key: string): T | undefined => {
  return cachedSettings[key] as T | undefined;
};

const refreshEmailSettings = async (): Promise<void> => {
  const now = Date.now();
  if (now - settingsLoadedAt < SETTINGS_CACHE_TTL_MS) {
    return;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('system_settings')
      .select('key, value')
      .in('key', [...EMAIL_SETTING_KEYS]);

    if (error) {
      logger.warn('Failed to load email settings from system settings', { error: error.message });
      settingsLoadedAt = now;
      return;
    }

    cachedSettings = {};
    for (const setting of data || []) {
      cachedSettings[setting.key] = setting.value;
    }

    settingsLoadedAt = now;
  } catch (error) {
    logger.warn('Error while loading email settings from system settings', {
      error: (error as Error).message,
    });
    settingsLoadedAt = now;
  }
};

// Email configuration from environment
const getEmailConfig = (): EmailConfig => {
  const rawProvider = String(
    getSetting<string>('email_provider') ||
    process.env.EMAIL_PROVIDER ||
    process.env.EMAIL_SERVICE ||
    'mock'
  ).toLowerCase();
  let provider: 'smtp' | 'gmail' | 'mock' =
    rawProvider === 'smtp' || rawProvider === 'gmail' || rawProvider === 'mock'
      ? rawProvider
      : 'mock';

  const smtpHost =
    getSetting<string>('smtp_host') ||
    process.env.SMTP_HOST ||
    'smtp.gmail.com';
  const smtpPort = parseNumber(getSetting<number | string>('smtp_port') || process.env.SMTP_PORT, 587);
  const smtpSecure = parseBoolean(getSetting<boolean | string>('smtp_secure') || process.env.SMTP_SECURE, false);
  const smtpUser =
    getSetting<string>('smtp_user') ||
    process.env.SMTP_USER ||
    process.env.EMAIL_USER ||
    '';
  const smtpPass =
    getSetting<string>('smtp_pass') ||
    process.env.SMTP_PASS ||
    process.env.EMAIL_PASSWORD ||
    '';
  const configuredFrom = getSetting<string>('email_from') || process.env.EMAIL_FROM || '';

  if (process.env.NODE_ENV === 'production' && provider === 'mock' && smtpUser && smtpPass) {
    logger.warn(
      'Email provider is set to mock in production, but SMTP credentials exist. Falling back to SMTP provider.'
    );
    provider = 'smtp';
  }

  const from = configuredFrom || smtpUser || 'noreply@mabinilms.edu.ph';
  const fromName = getSetting<string>('email_from_name') || process.env.EMAIL_FROM_NAME || 'MabiniLMS';
  
  return {
    provider,
    smtp: {
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    },
    from,
    fromName,
  };
};

const assertEmailConfig = (config: EmailConfig): void => {
  const isProduction = process.env.NODE_ENV === 'production';

  if (config.provider === 'mock') {
    if (isProduction) {
      throw new Error(
        'Email provider is set to mock in production. Configure email_provider and SMTP settings in /api/admin/settings or environment variables.'
      );
    }
    return;
  }

  if (!config.smtp?.auth.user || !config.smtp?.auth.pass) {
    throw new Error('Email credentials are missing. Configure SMTP_USER/SMTP_PASS or smtp_user/smtp_pass in system settings.');
  }

  if (config.provider === 'smtp' && !config.smtp?.host) {
    throw new Error('SMTP host is missing. Configure SMTP_HOST or smtp_host in system settings.');
  }
};

// Create transporter based on configuration
let transporter: nodemailer.Transporter | null = null;
let transporterConfigKey: string | null = null;

const getTransporter = (): nodemailer.Transporter => {
  const config = getEmailConfig();
  const configKey = JSON.stringify({
    provider: config.provider,
    host: config.smtp?.host,
    port: config.smtp?.port,
    secure: config.smtp?.secure,
    user: config.smtp?.auth.user,
    from: config.from,
    fromName: config.fromName,
  });

  if (transporter && transporterConfigKey === configKey) {
    return transporter;
  }

  transporterConfigKey = configKey;
  
  if (config.provider === 'mock') {
    // Create a mock transporter that logs to console
    transporter = nodemailer.createTransport({
      streamTransport: true,
      newline: 'windows',
    });
    logger.info('Email service initialized in MOCK mode');
    return transporter;
  }
  
  if (config.provider === 'gmail') {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.smtp?.auth.user,
        pass: config.smtp?.auth.pass, // Use App Password for Gmail
      },
    });
    logger.info('Email service initialized with Gmail');
    return transporter;
  }
  
  // SMTP provider
  transporter = nodemailer.createTransport({
    host: config.smtp?.host,
    port: config.smtp?.port,
    secure: config.smtp?.secure,
    auth: {
      user: config.smtp?.auth.user,
      pass: config.smtp?.auth.pass,
    },
  });
  
  logger.info('Email service initialized with SMTP', { host: config.smtp?.host });
  return transporter;
};

/**
 * Send email with retry logic
 */
export const sendEmail = async (options: EmailOptions): Promise<void> => {
  await refreshEmailSettings();
  const config = getEmailConfig();
  assertEmailConfig(config);
  const { to, subject, html, text, attachments } = options;
  
  // In mock mode, just log the email
  if (config.provider === 'mock') {
    const preview = text || html.substring(0, 100).replace(/<[^>]*>/g, '');
    
    logger.info('[EMAIL MOCK] Email would be sent', { to, subject, preview: preview.substring(0, 50) });
    
    console.log(`
╔════════════════════════════════════════╗
║         📧 EMAIL (MOCK MODE)           ║
╠════════════════════════════════════════╣
║ To:       ${to}
║ Subject:  ${subject}
║ Preview:  ${preview.substring(0, 60)}${preview.length > 60 ? '...' : ''}
╚════════════════════════════════════════╝
    `);
    return;
  }
  
  // Production email sending with retry
  const transport = getTransporter();
  const maxRetries = 3;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const mailOptions = {
        from: `"${config.fromName}" <${config.from}>`,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''),
        attachments,
      };
      
      const info = await transport.sendMail(mailOptions);
      
      logger.info('Email sent successfully', { 
        to, 
        subject, 
        messageId: info.messageId,
        attempt 
      });
      
      return;
    } catch (error) {
      lastError = error as Error;
      logger.warn(`Email send attempt ${attempt} failed`, { 
        to, 
        subject, 
        error: lastError.message 
      });
      
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }
  
  logger.error('Email send failed after all retries', { 
    to, 
    subject, 
    error: lastError?.message 
  });
  
  throw new Error(`Failed to send email after ${maxRetries} attempts: ${lastError?.message}`);
};

/**
 * Verify email configuration is working
 */
export const verifyEmailConfig = async (): Promise<boolean> => {
  await refreshEmailSettings();
  try {
    const config = getEmailConfig();
    assertEmailConfig(config);

    if (config.provider === 'mock') {
      logger.info('Email verification skipped (mock mode)');
      return true;
    }

    const transport = getTransporter();
    await transport.verify();
    logger.info('Email configuration verified successfully');
    return true;
  } catch (error) {
    logger.error('Email configuration verification failed', { error: (error as Error).message });
    return false;
  }
};

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

/**
 * Send teacher approval notification email
 */
export const sendTeacherApprovalEmail = async (
  email: string,
  teacherName: string
): Promise<void> => {
  const clientUrl = getClientUrl();
  const subject = 'Your Teacher Account Has Been Approved - MabiniLMS'

  const html = `
    <h2>Account Approved!</h2>
    <p>Dear ${teacherName},</p>
    <p>Great news! Your teacher account has been approved by an administrator.</p>
    <p>You now have full access to all teacher features, including:</p>
    <ul>
      <li>Create and manage courses</li>
      <li>Create assignments and grade submissions</li>
      <li>Manage course materials</li>
      <li>View analytics and student progress</li>
    </ul>
    <p><a href="${clientUrl}/login" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Go to Dashboard</a></p>
  `

  const text = `
Account Approved!

Dear ${teacherName},

Great news! Your teacher account has been approved by an administrator.

You now have full access to all teacher features, including:
- Create and manage courses
- Create assignments and grade submissions
- Manage course materials
- View analytics and student progress

Visit: ${clientUrl}/login
  `.trim()

  await sendEmail({ to: email, subject, html, text })
}

/**
 * Send teacher rejection notification email
 */
export const sendTeacherRejectionEmail = async (
  email: string,
  teacherName: string,
  reason?: string
): Promise<void> => {
  const subject = 'Teacher Account Application Update - MabiniLMS'

  const html = `
    <h2>Account Application Update</h2>
    <p>Dear ${teacherName},</p>
    <p>Thank you for your interest in becoming a teacher on MabiniLMS.</p>
    <p>After review, we are unable to approve your teacher account at this time.</p>
    ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
    <p>If you believe this is an error or have questions, please contact the administrator.</p>
  `

  const text = `
Account Application Update

Dear ${teacherName},

Thank you for your interest in becoming a teacher on MabiniLMS.

After review, we are unable to approve your teacher account at this time.
${reason ? `\nReason: ${reason}` : ''}

If you believe this is an error or have questions, please contact the administrator.
  `.trim()

  await sendEmail({ to: email, subject, html, text })
}

/**
 * Send student credentials email
 */
export const sendStudentCredentialsEmail = async (
  email: string,
  studentName: string,
  username: string,
  temporaryPassword: string
): Promise<void> => {
  const clientUrl = getClientUrl();
  const subject = 'Your MabiniLMS Student Account - Login Credentials'

  const html = `
    <h2>Welcome to MabiniLMS!</h2>
    <p>Dear ${studentName},</p>
    <p>An administrator has created a student account for you. Below are your login credentials:</p>
    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 4px; margin: 15px 0;">
      <p style="margin: 5px 0;"><strong>Username/Email:</strong> ${username}</p>
      <p style="margin: 5px 0;"><strong>Temporary Password:</strong> <code style="background-color: #e9ecef; padding: 2px 6px; border-radius: 3px;">${temporaryPassword}</code></p>
    </div>
    <p><strong>⚠️ Important:</strong> You will be required to change your password on first login for security purposes.</p>
    <p><a href="${clientUrl}/login" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Login to Your Account</a></p>
    <p style="color: #666; font-size: 12px; margin-top: 20px;">For security, do not share these credentials with anyone.</p>
  `

  const text = `
Welcome to MabiniLMS!

Dear ${studentName},

An administrator has created a student account for you. Below are your login credentials:

Username/Email: ${username}
Temporary Password: ${temporaryPassword}

⚠️ Important: You will be required to change your password on first login for security purposes.

Login at: ${clientUrl}/login

For security, do not share these credentials with anyone.
  `.trim()

  await sendEmail({ to: email, subject, html, text })
}

/**
 * Send admin notification for pending teacher approvals
 */
export const sendAdminNotificationEmail = async (
  adminEmail: string,
  adminName: string,
  pendingCount: number,
  teacherNames: string[]
): Promise<void> => {
  const clientUrl = getClientUrl();
  const subject = `${pendingCount} Teacher Account${pendingCount > 1 ? 's' : ''} Awaiting Approval - MabiniLMS`

  const teacherList = teacherNames.slice(0, 5).join(', ') + (teacherNames.length > 5 ? `, and ${teacherNames.length - 5} more` : '')

  const html = `
    <h2>Pending Teacher Approvals</h2>
    <p>Dear ${adminName},</p>
    <p>There ${pendingCount === 1 ? 'is' : 'are'} currently <strong>${pendingCount}</strong> teacher account${pendingCount > 1 ? 's' : ''} waiting for your approval.</p>
    <p><strong>Recent applicants:</strong> ${teacherList}</p>
    <p><a href="${clientUrl}/admin/teachers/pending" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Review Pending Teachers</a></p>
  `

  const text = `
Pending Teacher Approvals

Dear ${adminName},

There ${pendingCount === 1 ? 'is' : 'are'} currently ${pendingCount} teacher account${pendingCount > 1 ? 's' : ''} waiting for your approval.

Recent applicants: ${teacherList}

Review at: ${clientUrl}/admin/teachers/pending
  `.trim()

  await sendEmail({ to: adminEmail, subject, html, text })
}
