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
const DEV_CLIENT_URL = 'http://localhost:8080';
const PROD_FALLBACK_CLIENT_URL = 'https://mabinilms.vercel.app';

export const invalidateEmailSettingsCache = (): void => {
  cachedSettings = {};
  settingsLoadedAt = 0;
  transporter = null;
  transporterConfigKey = null;
};

const normalizeClientUrl = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return null;
  }
};

const getFirstOriginFromCsv = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }

  const candidates = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const normalized = normalizeClientUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

export const getClientUrl = (): string => {
  const configured = process.env.CLIENT_URL || process.env.FRONTEND_URL;
  const normalizedConfigured = configured ? normalizeClientUrl(configured) : null;

  if (normalizedConfigured) {
    return normalizedConfigured;
  }

  const normalizedCorsOrigin = getFirstOriginFromCsv(process.env.CORS_ORIGIN);
  if (normalizedCorsOrigin) {
    return normalizedCorsOrigin;
  }

  if (process.env.NODE_ENV === 'production') {
    logger.warn('CLIENT_URL/FRONTEND_URL missing in production. Falling back to default client URL.', {
      fallback: PROD_FALLBACK_CLIENT_URL,
    });
    return PROD_FALLBACK_CLIENT_URL;
  }

  return DEV_CLIENT_URL;
};

const stripHtml = (value: string): string => {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const wrapWithEmailLayout = (subject: string, bodyHtml: string): string => {
  const previewText = stripHtml(bodyHtml).slice(0, 140) || 'You have an update from MabiniLMS.';

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${subject}</title>
  </head>
  <body style="margin:0; padding:0; background:#f4f7fb; font-family:Arial, Helvetica, sans-serif; color:#1f2937;">
    <span style="display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden;">${previewText}</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb; padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
            <tr>
              <td style="padding:18px 24px; background:#0f172a; color:#ffffff;">
                <div style="font-size:18px; font-weight:700; letter-spacing:0.2px;">MabiniLMS</div>
                <div style="margin-top:4px; font-size:12px; color:#cbd5e1;">Reliable updates for your learning workspace</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px; line-height:1.6; font-size:15px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px; border-top:1px solid #e5e7eb; font-size:12px; color:#64748b; background:#f8fafc;">
                <div style="font-weight:600; color:#334155; margin-bottom:6px;">${subject}</div>
                <div>If you did not expect this email, you can safely ignore it.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
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
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
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
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
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
  const hasHtmlDocument = /<html[\s>]/i.test(html);
  const normalizedHtml = hasHtmlDocument ? html : wrapWithEmailLayout(subject, html);
  const normalizedText = text && text.trim().length > 0 ? text.trim() : stripHtml(normalizedHtml);
  
  // In mock mode, just log the email
  if (config.provider === 'mock') {
    const preview = normalizedText || normalizedHtml.substring(0, 100).replace(/<[^>]*>/g, '');
    
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
  const maxRetries = process.env.NODE_ENV === 'production' ? 2 : 3;
  const primaryFrom = (config.from || '').trim() || (config.smtp?.auth.user || '').trim() || 'noreply@mabinilms.edu.ph';
  const smtpAuthFrom = (config.smtp?.auth.user || '').trim();
  const fallbackFrom =
    smtpAuthFrom && smtpAuthFrom.toLowerCase() !== primaryFrom.toLowerCase()
      ? smtpAuthFrom
      : null;
  let lastError: Error | null = null;

  const buildMailOptions = (fromAddress: string) => ({
    from: `"${config.fromName}" <${fromAddress}>`,
    to,
    subject,
    html: normalizedHtml,
    text: normalizedText,
    attachments,
  });
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const info = await transport.sendMail(buildMailOptions(primaryFrom));
      
      logger.info('Email sent successfully', { 
        to, 
        subject, 
        messageId: info.messageId,
        attempt 
      });
      
      return;
    } catch (error) {
      lastError = error as Error;

      if (fallbackFrom && isSenderAddressError(lastError)) {
        try {
          const fallbackInfo = await transport.sendMail(buildMailOptions(fallbackFrom));
          logger.warn('Email sent using SMTP auth sender fallback', {
            to,
            subject,
            configuredFrom: primaryFrom,
            fallbackFrom,
            messageId: fallbackInfo.messageId,
            attempt,
          });
          return;
        } catch (fallbackError) {
          lastError = fallbackError as Error;
        }
      }

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
const PRIMARY_BUTTON_STYLE = [
  'display:inline-block',
  'padding:12px 18px',
  'border-radius:8px',
  'background:#2563eb',
  'color:#ffffff',
  'font-weight:600',
  'text-decoration:none',
].join(';');

const SUCCESS_BUTTON_STYLE = [
  'display:inline-block',
  'padding:12px 18px',
  'border-radius:8px',
  'background:#16a34a',
  'color:#ffffff',
  'font-weight:600',
  'text-decoration:none',
].join(';');

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeMultiline = (value: string): string => escapeHtml(value).replace(/\n/g, '<br>');

const isSenderAddressError = (error: Error): boolean => {
  const message = error.message.toLowerCase();
  return (
    message.includes('sender') ||
    message.includes('from address') ||
    message.includes('mail from') ||
    message.includes('not owned by user') ||
    message.includes('unauthenticated') ||
    message.includes('553') ||
    message.includes('550') ||
    message.includes('5.7.1')
  );
};

const supportEmail = (): string => process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || 'support@mabinilms.edu.ph';

const toSingleLine = (value: string): string => value.replace(/\s+/g, ' ').trim();

const formatDateTime = (value: Date): string =>
  value.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const sendVerificationEmail = async (
  email: string,
  verificationLink: string
): Promise<void> => {
  const subject = 'Verify Your MabiniLMS Email Address';
  const safeLink = escapeHtml(verificationLink);

  const html = `
    <h2 style="margin:0 0 12px; font-size:22px; color:#0f172a;">Confirm your email address</h2>
    <p style="margin:0 0 12px;">Welcome to MabiniLMS. Please verify your email to activate your account securely.</p>
    <p style="margin:16px 0 20px;">
      <a href="${safeLink}" style="${PRIMARY_BUTTON_STYLE}">Verify Email Address</a>
    </p>
    <p style="margin:0 0 8px;"><strong>This link expires in 24 hours.</strong></p>
    <p style="margin:0 0 6px; color:#475569;">If the button does not work, copy and paste this URL into your browser:</p>
    <p style="margin:0; word-break:break-all; color:#1d4ed8;">${safeLink}</p>
  `;

  const text = `
Welcome to MabiniLMS.

Please verify your email to activate your account.
Verification link: ${verificationLink}
This link expires in 24 hours.

If you did not create this account, you can ignore this email.
  `.trim();

  await sendEmail({ to: email, subject, html, text });
};

/**
 * Send password reset email
 */
export const sendPasswordResetEmail = async (
  email: string,
  resetLink: string
): Promise<void> => {
  const subject = 'Reset Your MabiniLMS Password';
  const safeLink = escapeHtml(resetLink);

  const html = `
    <h2 style="margin:0 0 12px; font-size:22px; color:#0f172a;">Password reset requested</h2>
    <p style="margin:0 0 12px;">We received a request to reset your password. Use the secure link below to continue.</p>
    <p style="margin:16px 0 20px;">
      <a href="${safeLink}" style="${PRIMARY_BUTTON_STYLE}">Reset Password</a>
    </p>
    <p style="margin:0 0 8px;"><strong>This link expires in 1 hour.</strong></p>
    <p style="margin:0 0 6px; color:#475569;">If the button does not work, copy and paste this URL:</p>
    <p style="margin:0; word-break:break-all; color:#1d4ed8;">${safeLink}</p>
    <p style="margin:14px 0 0; color:#475569;">If you did not request a password reset, no action is required.</p>
  `;

  const text = `
Password Reset Request

We received a request to reset your password.
Reset link: ${resetLink}
This link expires in 1 hour.

If you didn't request this, ignore this email.
  `.trim();

  await sendEmail({ to: email, subject, html, text });
};

/**
 * Send enrollment confirmation email
 */
export const sendEnrollmentConfirmationEmail = async (
  email: string,
  studentName: string,
  courseName: string
): Promise<void> => {
  const clientUrl = getClientUrl();
  const safeStudentName = escapeHtml(studentName);
  const safeCourseName = escapeHtml(courseName);
  const courseLabel = toSingleLine(courseName);
  const subject = `Enrollment Confirmed: ${courseLabel} - MabiniLMS`;

  const html = `
    <h2 style="margin:0 0 12px; font-size:22px; color:#0f172a;">Enrollment confirmed</h2>
    <p style="margin:0 0 12px;">Hello ${safeStudentName},</p>
    <p style="margin:0 0 12px;">You are successfully enrolled in <strong>${safeCourseName}</strong>.</p>
    <p style="margin:0 0 14px;">You can now access class announcements, materials, and assignments.</p>
    <p style="margin:16px 0 0;">
      <a href="${escapeHtml(`${clientUrl}/dashboard`)}" style="${PRIMARY_BUTTON_STYLE}">Open Dashboard</a>
    </p>
  `;

  const text = `
Enrollment Confirmation

Hello ${studentName},

You have been successfully enrolled in ${courseName}.
You can now access announcements, materials, and assignments from your dashboard.

Open dashboard: ${clientUrl}/dashboard
  `.trim();

  await sendEmail({ to: email, subject, html, text });
};

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
  const clientUrl = getClientUrl();
  const safeStudentName = escapeHtml(studentName);
  const safeAssignmentTitle = escapeHtml(assignmentTitle);
  const safeCourseName = escapeHtml(courseName);
  const assignmentLabel = toSingleLine(assignmentTitle);
  const subject = `Reminder: "${assignmentLabel}" is due in 24 hours`;

  const dueDateStr = formatDateTime(dueDate);

  const html = `
    <h2 style="margin:0 0 12px; font-size:22px; color:#0f172a;">Assignment due reminder</h2>
    <p style="margin:0 0 12px;">Hello ${safeStudentName}, this is a reminder that your assignment is due soon.</p>
    <div style="padding:14px; border:1px solid #e2e8f0; border-radius:8px; background:#f8fafc; margin:0 0 14px;">
      <p style="margin:0 0 6px;"><strong>Assignment:</strong> ${safeAssignmentTitle}</p>
      <p style="margin:0 0 6px;"><strong>Course:</strong> ${safeCourseName}</p>
      <p style="margin:0;"><strong>Due:</strong> ${escapeHtml(dueDateStr)}</p>
    </div>
    <p style="margin:16px 0 0;">
      <a href="${escapeHtml(`${clientUrl}/dashboard`)}" style="${PRIMARY_BUTTON_STYLE}">Submit Assignment</a>
    </p>
  `;

  const text = `
Assignment Due Reminder

Hello ${studentName},

Your assignment "${assignmentTitle}" in "${courseName}" is due in 24 hours.
Due Date: ${dueDateStr}

Submit now: ${clientUrl}/dashboard
  `.trim();

  await sendEmail({ to: email, subject, html, text });
};

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
  const clientUrl = getClientUrl();
  const safeStudentName = escapeHtml(studentName);
  const safeAssignmentTitle = escapeHtml(assignmentTitle);
  const safeCourseName = escapeHtml(courseName);
  const assignmentLabel = toSingleLine(assignmentTitle);
  const subject = `Submission Received: ${assignmentLabel}`;

  const submittedAtStr = formatDateTime(submittedAt);

  const html = `
    <h2 style="margin:0 0 12px; font-size:22px; color:#0f172a;">Submission received</h2>
    <p style="margin:0 0 12px;">Hello ${safeStudentName}, your work has been successfully submitted.</p>
    <div style="padding:14px; border:1px solid #e2e8f0; border-radius:8px; background:#f8fafc; margin:0 0 14px;">
      <p style="margin:0 0 6px;"><strong>Assignment:</strong> ${safeAssignmentTitle}</p>
      <p style="margin:0 0 6px;"><strong>Course:</strong> ${safeCourseName}</p>
      <p style="margin:0;"><strong>Submitted:</strong> ${escapeHtml(submittedAtStr)}</p>
    </div>
    <p style="margin:0 0 14px;">Your instructor will review your submission and release grading updates in MabiniLMS.</p>
    <p style="margin:0;">
      <a href="${escapeHtml(`${clientUrl}/dashboard`)}" style="${PRIMARY_BUTTON_STYLE}">View Dashboard</a>
    </p>
  `;

  const text = `
Submission Received

Hello ${studentName},

Your submission for "${assignmentTitle}" in "${courseName}" has been received.
Submitted At: ${submittedAtStr}

View updates: ${clientUrl}/dashboard
  `.trim();

  await sendEmail({ to: email, subject, html, text });
};

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
  const clientUrl = getClientUrl();
  const safeStudentName = escapeHtml(studentName);
  const safeAssignmentTitle = escapeHtml(assignmentTitle);
  const safeCourseName = escapeHtml(courseName);
  const assignmentLabel = toSingleLine(assignmentTitle);
  const normalizedPointsPossible = pointsPossible > 0 ? pointsPossible : 1;
  const percentage = Math.round((pointsEarned / normalizedPointsPossible) * 100);
  const subject = `Grade Released: ${assignmentLabel}`;
  const feedbackHtml = feedback ? escapeMultiline(feedback) : '';

  const html = `
    <h2 style="margin:0 0 12px; font-size:22px; color:#0f172a;">Your grade is now available</h2>
    <p style="margin:0 0 12px;">Hello ${safeStudentName}, your instructor has released grading for the assignment below.</p>
    <div style="padding:14px; border:1px solid #e2e8f0; border-radius:8px; background:#f8fafc; margin:0 0 14px;">
      <p style="margin:0 0 6px;"><strong>Assignment:</strong> ${safeAssignmentTitle}</p>
      <p style="margin:0 0 6px;"><strong>Course:</strong> ${safeCourseName}</p>
      <p style="margin:0;"><strong>Score:</strong> ${pointsEarned}/${pointsPossible} (${percentage}%)</p>
    </div>
    ${feedbackHtml ? `<p style="margin:0 0 6px;"><strong>Instructor feedback:</strong></p><p style="margin:0 0 14px;">${feedbackHtml}</p>` : ''}
    <p style="margin:0;">
      <a href="${escapeHtml(`${clientUrl}/grades`)}" style="${PRIMARY_BUTTON_STYLE}">View Grades</a>
    </p>
  `;

  const text = `
Your Grade is Ready

Hello ${studentName},

Your grade for "${assignmentTitle}" in "${courseName}" is now available.
Score: ${pointsEarned}/${pointsPossible} (${percentage}%)
${feedback ? `\nFeedback:\n${feedback}` : ''}

View grades: ${clientUrl}/grades
  `.trim();

  await sendEmail({ to: email, subject, html, text });
};

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
  const clientUrl = getClientUrl();
  const safeStudentName = escapeHtml(studentName);
  const safeCourseName = escapeHtml(courseName);
  const safeTitle = escapeHtml(title);
  const safeContent = escapeMultiline(content);
  const subject = `Course Announcement: ${toSingleLine(courseName)} - ${toSingleLine(title)}`;

  const html = `
    <h2 style="margin:0 0 12px; font-size:22px; color:#0f172a;">New course announcement</h2>
    <p style="margin:0 0 12px;">Hello ${safeStudentName}, an update has been posted in <strong>${safeCourseName}</strong>.</p>
    <div style="padding:14px; border:1px solid #e2e8f0; border-radius:8px; background:#f8fafc; margin:0 0 14px;">
      <p style="margin:0 0 8px; font-size:17px; font-weight:700; color:#0f172a;">${safeTitle}</p>
      <p style="margin:0; color:#1f2937;">${safeContent}</p>
    </div>
    <p style="margin:0;">
      <a href="${escapeHtml(`${clientUrl}/dashboard`)}" style="${PRIMARY_BUTTON_STYLE}">Open Course Dashboard</a>
    </p>
  `;

  const text = `
Course Announcement

Hello ${studentName},

New announcement in ${courseName}:

${title}

${content}

Open dashboard: ${clientUrl}/dashboard
  `.trim();

  await sendEmail({ to: email, subject, html, text });
};

/**
 * Send teacher approval notification email
 */
export const sendTeacherApprovalEmail = async (
  email: string,
  teacherName: string
): Promise<void> => {
  const clientUrl = getClientUrl();
  const safeTeacherName = escapeHtml(teacherName);
  const subject = 'Teacher Access Approved - MabiniLMS';

  const html = `
    <h2 style="margin:0 0 12px; font-size:22px; color:#0f172a;">Your teacher account is approved</h2>
    <p style="margin:0 0 12px;">Hello ${safeTeacherName},</p>
    <p style="margin:0 0 12px;">Your teacher access has been approved by an administrator. You can now sign in and manage your classes.</p>
    <p style="margin:0 0 6px;"><strong>You now have access to:</strong></p>
    <ul style="margin:0 0 14px 18px; padding:0; color:#1f2937;">
      <li>Create and organize courses</li>
      <li>Publish assignments and materials</li>
      <li>Review submissions and release grades</li>
      <li>Monitor class progress and engagement</li>
    </ul>
    <p style="margin:0;">
      <a href="${escapeHtml(`${clientUrl}/login`)}" style="${SUCCESS_BUTTON_STYLE}">Sign In to Teacher Portal</a>
    </p>
  `;

  const text = `
Teacher Access Approved

Hello ${teacherName},

Your teacher account has been approved by an administrator.

You now have full access to all teacher features, including:
- Create and manage courses
- Create assignments and grade submissions
- Manage course materials
- View analytics and student progress

Visit: ${clientUrl}/login

Need help? Contact: ${supportEmail()}
  `.trim();

  await sendEmail({ to: email, subject, html, text });
};

/**
 * Send teacher rejection notification email
 */
export const sendTeacherRejectionEmail = async (
  email: string,
  teacherName: string,
  reason?: string
): Promise<void> => {
  const safeTeacherName = escapeHtml(teacherName);
  const safeReason = reason ? escapeHtml(reason) : '';
  const subject = 'Teacher Application Update - MabiniLMS';

  const html = `
    <h2 style="margin:0 0 12px; font-size:22px; color:#0f172a;">Update on your teacher application</h2>
    <p style="margin:0 0 12px;">Hello ${safeTeacherName},</p>
    <p style="margin:0 0 12px;">Thank you for your interest in joining MabiniLMS as a teacher.</p>
    <p style="margin:0 0 12px;">After review, we are unable to approve your teacher account request at this time.</p>
    ${safeReason ? `<p style="margin:0 0 12px;"><strong>Reason provided:</strong> ${safeReason}</p>` : ''}
    <p style="margin:0; color:#475569;">If you believe this decision is in error, please contact support at ${escapeHtml(supportEmail())}.</p>
  `;

  const text = `
Teacher Application Update

Hello ${teacherName},

Thank you for your interest in becoming a teacher on MabiniLMS.

After review, we are unable to approve your teacher account at this time.
${reason ? `\nReason: ${reason}` : ''}

If you believe this is an error, contact support at ${supportEmail()}.
  `.trim();

  await sendEmail({ to: email, subject, html, text });
};

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
  const safeStudentName = escapeHtml(studentName);
  const safeUsername = escapeHtml(username);
  const safeTemporaryPassword = escapeHtml(temporaryPassword);
  const subject = 'Your MabiniLMS Student Account Credentials';

  const html = `
    <h2 style="margin:0 0 12px; font-size:22px; color:#0f172a;">Your student account is ready</h2>
    <p style="margin:0 0 12px;">Hello ${safeStudentName}, your student account has been prepared by your administrator.</p>
    <p style="margin:0 0 10px;">Use the credentials below for your first sign-in:</p>
    <div style="padding:14px; border:1px solid #e2e8f0; border-radius:8px; background:#f8fafc; margin:0 0 14px;">
      <p style="margin:0 0 6px;"><strong>Username / Email:</strong> ${safeUsername}</p>
      <p style="margin:0;"><strong>Temporary Password:</strong> <code style="background:#e2e8f0; padding:2px 6px; border-radius:4px;">${safeTemporaryPassword}</code></p>
    </div>
    <p style="margin:0 0 8px;"><strong>Security reminder:</strong> You will be required to set a new password after first login.</p>
    <p style="margin:0 0 14px; color:#475569;">Do not share your temporary password with anyone.</p>
    <p style="margin:0;">
      <a href="${escapeHtml(`${clientUrl}/login`)}" style="${PRIMARY_BUTTON_STYLE}">Sign In to MabiniLMS</a>
    </p>
  `;

  const text = `
Welcome to MabiniLMS!

Hello ${studentName},

An administrator has created a student account for you. Below are your login credentials:

Username/Email: ${username}
Temporary Password: ${temporaryPassword}

Important: You will be required to change your password on first login.

Login at: ${clientUrl}/login

For security, do not share these credentials with anyone.
  `.trim();

  await sendEmail({ to: email, subject, html, text });
};

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
  const safeAdminName = escapeHtml(adminName);
  const subject = `${pendingCount} Teacher Account${pendingCount > 1 ? 's' : ''} Awaiting Approval - MabiniLMS`;

  const teacherList = teacherNames.slice(0, 5).join(', ') + (teacherNames.length > 5 ? `, and ${teacherNames.length - 5} more` : '');
  const safeTeacherList = escapeHtml(teacherList);

  const html = `
    <h2 style="margin:0 0 12px; font-size:22px; color:#0f172a;">Pending teacher approvals</h2>
    <p style="margin:0 0 12px;">Hello ${safeAdminName},</p>
    <p style="margin:0 0 12px;">There ${pendingCount === 1 ? 'is' : 'are'} currently <strong>${pendingCount}</strong> teacher account${pendingCount > 1 ? 's' : ''} awaiting review.</p>
    <p style="margin:0 0 14px;"><strong>Recent applicants:</strong> ${safeTeacherList}</p>
    <p style="margin:0;">
      <a href="${escapeHtml(`${clientUrl}/admin/teachers/pending`)}" style="${PRIMARY_BUTTON_STYLE}">Review Pending Teachers</a>
    </p>
  `;

  const text = `
Pending Teacher Approvals

Hello ${adminName},

There ${pendingCount === 1 ? 'is' : 'are'} currently ${pendingCount} teacher account${pendingCount > 1 ? 's' : ''} waiting for your approval.

Recent applicants: ${teacherList}

Review at: ${clientUrl}/admin/teachers/pending
  `.trim();

  await sendEmail({ to: adminEmail, subject, html, text });
};
