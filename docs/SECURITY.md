# MabiniLMS Security Guide

## Overview
This document outlines security best practices, configurations, and recommendations for deploying and maintaining MabiniLMS in production.

## Security Architecture

### Defense in Depth
MabiniLMS implements multiple layers of security:

1. **Transport Layer:** HTTPS/TLS encryption
2. **Application Layer:** Helmet.js security headers, CORS, rate limiting
3. **Authentication Layer:** JWT tokens, session management, email verification
4. **Authorization Layer:** Role-based access control (RBAC), Row Level Security (RLS)
5. **Database Layer:** RLS policies, prepared statements, connection limits
6. **Audit Layer:** Comprehensive logging of all sensitive actions

---

## Security Features (Current Implementation)

### ✅ Implemented Security Measures

#### 1. Security Headers (Helmet.js)
```typescript
// server/src/index.ts
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", supabaseUrl],
      // ... full CSP configuration
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  frameguard: { action: 'deny' },
  // ... additional headers
})
```

#### 2. CORS Protection
- Strict origin validation
- No wildcard origins in production
- Credentials allowed only for whitelisted origins

#### 3. Rate Limiting
- Auth endpoints: 5 requests/15min (with skipSuccessfulRequests)
- General API: 100 requests/15min
- Admin operations: 50 requests/15min
- Batch operations: 10 requests/hour
- Search: 30 requests/minute
- Exports: 20 requests/hour

#### 4. Session Management
- Configurable timeout (default 8 hours)
- Session invalidation on password change
- Automatic expiration tracking
- Token refresh mechanism

#### 5. Input Validation
- Zod schema validation on all endpoints
- Request body size limits (JSON: 1MB, raw: 5MB)
- Parameter count limits (1000 max)
- SQL injection prevention via parameterized queries

#### 6. Audit Logging
- All authentication events
- Password changes
- Profile updates
- Assignment submissions
- Grade assignments
- Admin actions

#### 7. Row Level Security (RLS)
- Enabled on all tables
- Users can only access their own data
- Teachers access their courses' data
- Admins have controlled elevated access

---

## Security Checklist

### Pre-Deployment Security

#### Environment & Configuration
- [ ] `NODE_ENV=production` set
- [ ] All secrets in environment variables (not code)
- [ ] `.env` files in `.gitignore`
- [ ] Different secrets for dev/staging/prod
- [ ] Strong database password (16+ characters, mixed)
- [ ] Service role key never exposed to client

#### HTTPS/SSL
- [ ] Valid SSL certificate installed
- [ ] HSTS header enabled (max-age=31536000)
- [ ] HTTP redirects to HTTPS
- [ ] TLS 1.2+ only (disable older versions)
- [ ] Test with SSL Labs: https://www.ssllabs.com/

#### CORS Configuration
- [ ] Production domains whitelisted explicitly
- [ ] No wildcard (`*`) origins
- [ ] Credentials restricted to trusted origins
- [ ] CORS errors tested in browser

#### Rate Limiting
- [ ] All endpoints protected
- [ ] Auth endpoints have stricter limits
- [ ] IP-based tracking enabled
- [ ] Headers exposed for rate limit info

#### Authentication
- [ ] Email verification required
- [ ] Strong password requirements enforced
- [ ] Session timeout configured
- [ ] Password change invalidates other sessions
- [ ] Failed attempts logged and monitored

#### Database
- [ ] All migrations applied
- [ ] RLS enabled on ALL tables
- [ ] Service role key used server-side only
- [ ] Connection pooling configured
- [ ] Automated backups enabled

### Production Security Monitoring

#### Daily Checks
- [ ] Review failed login attempts
- [ ] Check error rates and 5xx errors
- [ ] Monitor API response times
- [ ] Verify WebSocket connections stable
- [ ] Check disk/memory usage

#### Weekly Checks
- [ ] Review audit logs for suspicious activity
- [ ] Check for unauthorized admin access attempts
- [ ] Review rate limit violations
- [ ] Test backup restore procedure
- [ ] Update dependencies (`npm audit`)

#### Monthly Checks
- [ ] Rotate secrets and keys
- [ ] Review and update RLS policies
- [ ] Analyze security logs for patterns
- [ ] Test disaster recovery plan
- [ ] Security training for team

---

## Threat Model

### Identified Threats & Mitigations

#### 1. SQL Injection
**Threat:** Attacker injects malicious SQL via user input

**Mitigations:**
- ✅ Parameterized queries (Supabase client)
- ✅ Input validation with Zod schemas
- ✅ RLS prevents unauthorized data access
- ✅ Service role key used only server-side

#### 2. Cross-Site Scripting (XSS)
**Threat:** Attacker injects malicious JavaScript

**Mitigations:**
- ✅ React escapes output by default
- ✅ CSP headers restrict script sources
- ✅ X-XSS-Protection header enabled
- ✅ Input sanitization on backend

#### 3. Cross-Site Request Forgery (CSRF)
**Threat:** Attacker tricks user into unwanted actions

**Mitigations:**
- ✅ Strict CORS policy
- ✅ SameSite cookies (Supabase default)
- ✅ JWT tokens (not session cookies)
- ⚠️ TODO: Double-submit cookie pattern for extra protection

#### 4. Brute Force Attacks
**Threat:** Attacker tries many password combinations

**Mitigations:**
- ✅ Rate limiting on auth endpoints (5 attempts/15min)
- ✅ Failed login attempts logged
- ✅ IP address tracking
- ⚠️ TODO: Account lockout after X failed attempts
- ⚠️ TODO: CAPTCHA after 3 failed attempts

#### 5. Session Hijacking
**Threat:** Attacker steals and reuses session token

**Mitigations:**
- ✅ HTTPS enforced (encrypted transport)
- ✅ Secure HttpOnly cookies (Supabase)
- ✅ Session timeout (8 hours)
- ✅ Token invalidation on password change
- ✅ User agent and IP tracking in audit logs

#### 6. Privilege Escalation
**Threat:** User gains unauthorized elevated access

**Mitigations:**
- ✅ Role-based access control (RBAC)
- ✅ Row Level Security (RLS)
- ✅ Admin actions audited
- ✅ Authorization checks on every request
- ✅ Service functions verify permissions

#### 7. Data Exposure
**Threat:** Unauthorized access to sensitive data

**Mitigations:**
- ✅ RLS prevents cross-user data access
- ✅ Minimal data in JWT tokens
- ✅ Sensitive fields excluded from API responses
- ✅ Audit logs track data access
- ⚠️ TODO: Data encryption at rest (database)

#### 8. Denial of Service (DoS)
**Threat:** Attacker overwhelms server with requests

**Mitigations:**
- ✅ Rate limiting on all endpoints
- ✅ Request body size limits
- ✅ Connection timeouts
- ✅ Graceful degradation
- ⚠️ TODO: CDN for DDoS protection
- ⚠️ TODO: IP blocking for repeated violations

---

## Secure Coding Practices

### Input Validation

**✅ DO:**
```typescript
// Use Zod for schema validation
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Validate before processing
const { email, password } = loginSchema.parse(req.body);
```

**❌ DON'T:**
```typescript
// Never trust user input
const email = req.body.email;  // No validation!
const query = `SELECT * FROM users WHERE email = '${email}'`;  // SQL injection!
```

### Authentication

**✅ DO:**
```typescript
// Always verify JWT token
const { data: { user }, error } = await supabase.auth.getUser(token);
if (error || !user) {
  throw new ApiError(ErrorCode.UNAUTHORIZED, 'Invalid token', 401);
}

// Check authorization
if (userRole !== UserRole.ADMIN && userId !== resourceOwnerId) {
  throw new ApiError(ErrorCode.FORBIDDEN, 'Insufficient permissions', 403);
}
```

**❌ DON'T:**
```typescript
// Never skip authentication
if (req.headers.authorization) {  // Don't just check if header exists!
  // Process request
}

// Never assume roles
if (req.user) {
  // Grant admin access without checking role!
}
```

### Error Handling

**✅ DO:**
```typescript
// Log detailed errors server-side
logger.error('Database error', { error: err.message, userId, query });

// Return generic errors to client
throw new ApiError(ErrorCode.INTERNAL_ERROR, 'An error occurred', 500);
```

**❌ DON'T:**
```typescript
// Never expose internal details
res.status(500).json({
  error: err.stack,  // Exposes system info!
  query: sqlQuery,   // Exposes database structure!
  dbPassword: process.env.DB_PASSWORD  // Critical security issue!
});
```

### Secrets Management

**✅ DO:**
```typescript
// Load from environment variables
const dbPassword = process.env.DB_PASSWORD;

// Validate required secrets on startup
if (!process.env.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing required environment variable');
}
```

**❌ DON'T:**
```typescript
// Never hardcode secrets
const apiKey = 'sk_live_abc123xyz';  // Security breach!

// Never log secrets
logger.info('Starting with API key:', process.env.API_KEY);  // Don't log!
```

---

## Security Incident Response

### Incident Response Plan

#### 1. Detection
- Monitor logs for suspicious activity
- Set up alerts for:
  - Multiple failed login attempts (> 10/hour from same IP)
  - Unauthorized admin access attempts
  - Abnormal traffic patterns (> 1000 req/minute)
  - Database errors (> 10/minute)
  - High error rates (> 5% 5xx errors)

#### 2. Assessment
- Determine scope and severity
- Identify affected systems and data
- Document timeline of events
- Preserve evidence (logs, database snapshots)

#### 3. Containment
- Isolate affected systems
- Block malicious IPs
- Revoke compromised tokens/keys
- Disable affected user accounts
- Enable maintenance mode if needed

#### 4. Eradication
- Remove malicious code/data
- Patch vulnerabilities
- Update credentials and secrets
- Deploy security updates

#### 5. Recovery
- Restore from clean backups
- Verify system integrity
- Re-enable services gradually
- Monitor for recurring issues

#### 6. Post-Incident
- Document incident details
- Conduct post-mortem analysis
- Update security policies
- Notify affected users (if required by law)
- Implement preventive measures

### Emergency Contacts

```
Security Team Lead: security@your-domain.com
Database Admin: dba@your-domain.com
DevOps: devops@your-domain.com
Legal: legal@your-domain.com
```

---

## Compliance Considerations

### GDPR (General Data Protection Regulation)

**Personal Data Collected:**
- Email addresses
- Names
- IP addresses (in audit logs)
- User-generated content (assignments, submissions)

**GDPR Rights:**
- ✅ Right to access: Users can download their data
- ✅ Right to erasure: Cascade delete on account removal
- ✅ Right to rectification: Users can update their profiles
- ⚠️ TODO: Automated data export functionality
- ⚠️ TODO: Data processing agreement templates

### FERPA (Family Educational Rights and Privacy Act)

**Educational Records:**
- Grades
- Assignments
- Attendance records (if implemented)
- Course materials

**FERPA Compliance:**
- ✅ Access limited to students, teachers, authorized admins
- ✅ Audit logs track all access to student records
- ✅ Parental access not implemented (post-secondary focus)
- ✅ Data shared only with authorized parties

### COPPA (Children's Online Privacy Protection Act)

**Current Implementation:**
- System designed for post-secondary education (18+)
- No age verification implemented
- Not targeted at children under 13

**If Used for K-12:**
- ⚠️ Implement parental consent mechanism
- ⚠️ Age verification required
- ⚠️ Enhanced privacy controls

---

## Security Roadmap

### Completed (Phase 5)
- ✅ Helmet.js security headers
- ✅ CSRF protection (via strict CORS)
- ✅ Request body size limits
- ✅ CORS configuration hardening
- ✅ Session timeout implementation
- ✅ Comprehensive rate limiting
- ✅ User action audit trail

### In Progress
- 🔄 Two-Factor Authentication (2FA) - sec-08

### Planned (Future Phases)
- [ ] Account lockout after failed login attempts
- [ ] CAPTCHA integration
- [ ] Enhanced DDoS protection (Cloudflare)
- [ ] Automated security scanning (Snyk, Dependabot)
- [ ] Penetration testing
- [ ] Security awareness training materials
- [ ] Incident response automation
- [ ] Real-time security monitoring dashboard
- [ ] Data encryption at rest
- [ ] Secrets rotation automation

---

## Security Testing

### Manual Testing

```bash
# 1. Test SQL Injection
curl -X POST https://api.your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com OR 1=1--","password":"test"}'
# Should be blocked by validation

# 2. Test XSS
curl -X POST https://api.your-domain.com/api/courses \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"<script>alert(1)</script>","description":"test"}'
# Should be sanitized

# 3. Test Rate Limiting
for i in {1..10}; do
  curl -X POST https://api.your-domain.com/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
done
# Should return 429 after 5 attempts

# 4. Test CORS
curl -X POST https://api.your-domain.com/api/courses \
  -H "Origin: https://malicious-site.com" \
  -H "Authorization: Bearer $TOKEN"
# Should be blocked

# 5. Test Session Timeout
# Get token, wait 8+ hours, try to use
curl -X GET https://api.your-domain.com/api/auth/me \
  -H "Authorization: Bearer $OLD_TOKEN"
# Should return 401 Unauthorized
```

### Automated Testing

```typescript
// Example security test
describe('Security', () => {
  it('should prevent SQL injection', async () => {
    const maliciousInput = "admin' OR '1'='1";
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: maliciousInput, password: 'test' });
    
    expect(response.status).toBe(400);  // Validation error
  });
  
  it('should rate limit failed logins', async () => {
    for (let i = 0; i < 6; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'wrong' });
    }
    
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'wrong' });
    
    expect(response.status).toBe(429);  // Rate limited
  });
});
```

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://github.com/goldbergyoni/nodebestpractices#6-security-best-practices)
- [Supabase Security](https://supabase.com/docs/guides/platform/security)
- [Helmet.js Documentation](https://helmetjs.github.io/)

---

**Document Version:** 1.0.0  
**Last Updated:** April 7, 2026  
**Next Review:** July 7, 2026
