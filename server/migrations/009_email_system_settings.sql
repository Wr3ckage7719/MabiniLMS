-- Migration: 009_email_system_settings
-- Description: Add configurable email provider/SMTP keys to system_settings
-- Dependencies: 004_admin_system

INSERT INTO public.system_settings (key, value, description)
VALUES
  ('email_provider', '"mock"'::JSONB, 'Email provider: mock, smtp, or gmail'),
  ('email_from', '"noreply@mabinilms.edu.ph"'::JSONB, 'From email address for outbound emails'),
  ('email_from_name', '"MabiniLMS"'::JSONB, 'From display name for outbound emails'),
  ('smtp_host', '"smtp.gmail.com"'::JSONB, 'SMTP server host'),
  ('smtp_port', '587'::JSONB, 'SMTP server port'),
  ('smtp_secure', 'false'::JSONB, 'Enable secure SMTP transport (TLS/SSL)'),
  ('smtp_user', '""'::JSONB, 'SMTP username'),
  ('smtp_pass', '""'::JSONB, 'SMTP password or app password')
ON CONFLICT (key) DO NOTHING;
