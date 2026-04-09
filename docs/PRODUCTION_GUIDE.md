# MabiniLMS Production Deployment Guide

## Table of Contents
1. [Environment Variables Reference](#environment-variables-reference)
2. [Supabase Configuration](#supabase-configuration)
3. [Production Checklist](#production-checklist)
4. [Security Best Practices](#security-best-practices)

---

## Environment Variables Reference

### Backend Environment Variables (`server/.env`)

These values seed the email service at startup. In the running app, admins can override the active email provider and SMTP credentials from Admin Settings > System Settings.

```bash
# ============================================
# REQUIRED - Server Configuration
# ============================================
NODE_ENV=production
PORT=3000
CLIENT_URL=https://your-domain.com

# ============================================
# REQUIRED - Supabase
# ============================================
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...  # Get from Supabase Dashboard > Settings > API
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # KEEP SECRET - Server use only

# ============================================
# REQUIRED - Email Service
# ============================================
EMAIL_PROVIDER=smtp  # Options: mock (dev only), smtp, gmail
EMAIL_FROM=noreply@your-domain.com
EMAIL_FROM_NAME=MabiniLMS

# For SMTP (e.g., SendGrid, AWS SES, Mailgun)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxx  # Your SMTP password or API key

# For Gmail (requires App Password)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your-email@gmail.com
# SMTP_PASS=xxxx xxxx xxxx xxxx  # 16-character App Password from Google

# ============================================
# OPTIONAL - Google OAuth (for Drive integration)
# ============================================
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
GOOGLE_REDIRECT_URI=https://your-domain.com/api/google-oauth/callback

# ============================================
# OPTIONAL - CORS (defaults to development if not set)
# ============================================
CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com

# ============================================
# OPTIONAL - Rate Limiting (defaults provided)
# ============================================
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes in ms
RATE_LIMIT_MAX=100  # Max requests per window
```

### Frontend Environment Variables (`client/.env`)

```bash
# Vite requires VITE_ prefix for client-side variables
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...  # Same as backend SUPABASE_ANON_KEY
VITE_API_URL=https://api.your-domain.com  # Your backend URL
VITE_WS_URL=https://api.your-domain.com  # WebSocket URL (usually same as API)
```

---

## Supabase Configuration

### 1. Database Setup

Run migrations in order via Supabase SQL Editor:

1. Go to Supabase Dashboard → SQL Editor
2. Run each migration file in sequence:

```sql
-- 001_initial_schema.sql
-- 002_email_verification.sql
-- 003_analytics.sql
-- 004_admin_system.sql
-- 005_session_management.sql
-- 006_user_audit_logs.sql
```

**Or via psql:**

```bash
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
  -f server/migrations/001_initial_schema.sql
```

### 2. Authentication Settings

Navigate to **Authentication > Settings** in Supabase Dashboard:

```
Site URL: https://your-domain.com

Redirect URLs (one per line):
https://your-domain.com/*
https://your-domain.com/auth/callback
http://localhost:5173/*  (for local development)

Email Auth: ✅ Enabled
Confirm email: ✅ Enabled
Secure email change: ✅ Enabled

Email Templates:
- Confirm signup: Customize with your branding
- Reset password: Customize with your branding
- Magic Link: (if using magic links)
```

### 3. Create Admin User

After deployment, create your first admin:

```bash
# SSH into your server or use Railway/Render console
cd server
node dist/cli/create-admin.js

# Or via npm script
npm run cli:create-admin
```

Enter details when prompted:
- Email: admin@your-domain.com
- Password: (strong password - save securely!)
- First Name: Admin
- Last Name: User

### 4. System Settings Configuration

After admin is created, log in to admin panel and configure:

**Navigate to:** https://your-domain.com/admin/settings

```
Institutional Email Domains:
- your-school.edu
- your-university.edu

Require Teacher Approval: ✅ Yes
Allow Student Self-Signup: ❌ No (admins create student accounts)
Max Upload Size: 50 MB
Session Timeout: 480 minutes (8 hours)
```

---

## Production Checklist

### Pre-Deployment

#### Backend Checklist

- [ ] All environment variables configured
- [ ] `NODE_ENV=production` set
- [ ] Email service configured and tested
- [ ] Database migrations applied
- [ ] Admin user created
- [ ] CORS origins set to production domains only
- [ ] SSL/TLS certificate configured
- [ ] Secrets stored securely (not in code)

#### Frontend Checklist

- [ ] `VITE_API_URL` points to production backend
- [ ] `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set correctly
- [ ] Built with `npm run build`
- [ ] SSL/TLS certificate configured
- [ ] Domain DNS configured

#### Database Checklist

- [ ] All migrations applied successfully
- [ ] Row Level Security (RLS) enabled on all tables
- [ ] Automated backups configured (Supabase Pro plan)
- [ ] Connection limits appropriate for load
- [ ] Test data removed

### Testing After Deployment

1. **Authentication Flow**
   ```bash
   # Test signup
   curl -X POST https://api.your-domain.com/api/auth/signup \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"Test123!","first_name":"Test","last_name":"User","role":"student"}'
   
   # Test login
   curl -X POST https://api.your-domain.com/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@your-domain.com","password":"your-password"}'
   ```

2. **Health Check**
   ```bash
   curl https://api.your-domain.com/api/health
   
   # Expected response:
   {"status":"ok","timestamp":"2026-04-07T12:00:00.000Z"}
   ```

3. **WebSocket Connection**
   ```bash
   # Install wscat: npm install -g wscat
   wscat -c wss://api.your-domain.com
   
   # After connecting, send auth event:
   {"event":"authenticate","token":"your-jwt-token"}
   ```

4. **Email Delivery**
   - Create a test account
   - Verify email arrives
   - Test password reset flow

5. **Admin Panel**
   - Login to https://your-domain.com/admin/login
   - Verify all pages load
   - Test teacher approval workflow
   - Test student creation

### Post-Deployment Monitoring

Set up monitoring for:

- **API Response Times** (target: < 200ms average)
- **Error Rates** (target: < 0.1% for 5xx errors)
- **Database Connections** (monitor connection pool)
- **Memory Usage** (alert if > 80%)
- **Disk Usage** (alert if > 80%)
- **Failed Login Attempts** (security monitoring)
- **WebSocket Connections** (track concurrent users)

---

## Security Best Practices

### 1. Environment Variables

**✅ DO:**
- Store all secrets in environment variables
- Use different secrets for dev/staging/production
- Rotate secrets periodically (quarterly recommended)
- Use a secrets manager (AWS Secrets Manager, Vault, etc.) for production

**❌ DON'T:**
- Commit `.env` files to git
- Share secrets in chat or email
- Use the same secrets across environments
- Store secrets in code or config files

### 2. Database Security

**✅ DO:**
- Enable Row Level Security (RLS) on all tables
- Use service role key only on backend (never expose to client)
- Enable automated backups (Supabase Pro)
- Regularly review and update RLS policies
- Monitor slow queries and optimize indexes

**❌ DON'T:**
- Expose service role key to frontend
- Disable RLS on production tables
- Use weak database passwords
- Grant excessive permissions

### 3. API Security

**✅ DO:**
- Enable all rate limiters
- Use HTTPS everywhere (no HTTP)
- Enable CORS with specific origins only
- Log all authentication failures
- Implement request timeout limits
- Enable Helmet.js security headers (already configured)

**❌ DON'T:**
- Allow CORS from `*` (wildcard)
- Disable rate limiting
- Expose internal error details to clients
- Skip input validation

### 4. Authentication Security

**✅ DO:**
- Enforce email verification
- Require strong passwords (8+ chars, mixed case, numbers, symbols)
- Implement session timeout (8 hours configured)
- Invalidate sessions on password change
- Log all auth events to audit trail
- Enable 2FA for admin accounts (when implemented)

**❌ DON'T:**
- Allow weak passwords
- Skip email verification
- Use long session timeouts (> 24 hours)
- Store passwords in plain text (Supabase handles hashing)

### 5. HTTPS & SSL

**✅ DO:**
- Use valid SSL certificates (Let's Encrypt is free)
- Enable HSTS header (configured via Helmet.js)
- Redirect HTTP to HTTPS
- Use TLS 1.2 or higher
- Test SSL configuration: https://www.ssllabs.com/

**❌ DON'T:**
- Use self-signed certificates in production
- Allow HTTP traffic
- Use outdated TLS versions

### 6. Monitoring & Logging

**✅ DO:**
- Log all authentication events
- Monitor for suspicious patterns (failed logins, etc.)
- Set up alerts for critical errors
- Review logs regularly
- Implement log rotation
- Use structured logging (JSON format)

**❌ DON'T:**
- Log sensitive data (passwords, tokens, PII)
- Ignore error logs
- Disable audit logging
- Keep logs forever (implement retention policy)

### 7. Updates & Maintenance

**✅ DO:**
- Keep dependencies up to date (`npm audit fix`)
- Monitor security advisories
- Test updates in staging first
- Have a rollback plan
- Document all changes

**❌ DON'T:**
- Ignore `npm audit` warnings
- Skip testing updates
- Update directly in production

---

## Quick Deployment Commands

### Backend

```bash
# Install dependencies
npm ci --production

# Build TypeScript
npm run build

# Run migrations
npm run migrate

# Start production server
npm start

# Or with PM2 (recommended)
pm2 start dist/index.js --name mabinilms-api
pm2 save
```

### Frontend

```bash
# Install dependencies
npm ci

# Build for production
npm run build

# Output in dist/ folder - deploy to:
# - Vercel: vercel --prod
# - Netlify: netlify deploy --prod --dir=dist
# - Static server: copy dist/ contents to web root
```

### Database

```bash
# Connect to Supabase
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"

# Run single migration
\i server/migrations/001_initial_schema.sql

# Or all migrations
cat server/migrations/*.sql | psql "postgresql://..."
```

---

## Troubleshooting

### Issue: CORS Errors

**Symptom:** Browser shows "CORS policy" error

**Solution:**
1. Check `CORS_ORIGINS` environment variable includes your frontend domain
2. Verify frontend is using HTTPS (not HTTP)
3. Check browser console for exact origin being blocked
4. Restart backend after changing CORS settings

### Issue: Email Not Sending

**Symptom:** Users not receiving verification emails

**Solution:**
1. Check `EMAIL_PROVIDER` is set to `smtp` or `gmail` (not `mock`)
2. Verify SMTP credentials are correct
3. Test SMTP connection: `telnet smtp.sendgrid.net 587`
4. Check backend logs for email errors
5. Verify email not in spam folder

### Issue: Database Connection Failed

**Symptom:** API returns 500 errors, logs show database connection errors

**Solution:**
1. Verify Supabase project is active (check status.supabase.com)
2. Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correct
3. Test connection: `psql "postgresql://postgres:[PASSWORD]@db..."`
4. Check connection limit not exceeded (Supabase free tier: 60 connections)

### Issue: WebSocket Not Connecting

**Symptom:** Real-time notifications not working

**Solution:**
1. Verify WebSocket URL uses `wss://` (not `ws://`)
2. Check Nginx/proxy has WebSocket upgrade headers:
   ```nginx
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection "upgrade";
   ```
3. Verify firewall allows WebSocket connections
4. Test with wscat: `wscat -c wss://api.your-domain.com`

### Issue: High Memory Usage

**Symptom:** Server crashes or becomes slow

**Solution:**
1. Check for memory leaks in logs
2. Increase memory limit if using PM2:
   ```bash
   pm2 start dist/index.js --max-memory-restart 1G
   ```
3. Enable clustering for load distribution:
   ```bash
   pm2 start dist/index.js -i max
   ```
4. Monitor with `pm2 monit`

---

## Support Resources

- **Documentation:** See `/docs` folder for detailed guides
- **Supabase Docs:** https://supabase.com/docs
- **GitHub Issues:** [Your repository]/issues
- **Email Support:** support@your-domain.com

---

**Last Updated:** April 7, 2026
**Version:** 1.0.0
