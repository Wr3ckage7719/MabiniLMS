# Two-Factor Authentication (2FA) Guide

## Overview

MabiniLMS supports Time-based One-Time Password (TOTP) two-factor authentication using authenticator apps like Google Authenticator, Microsoft Authenticator, or Authy.

## Features

- **TOTP-based authentication** - Standard RFC 6238 implementation
- **QR code setup** - Easy scanning with authenticator apps
- **Backup codes** - 10 one-time use codes for emergency access
- **Rate limiting** - Protection against brute force attacks (5 attempts per 5 minutes)
- **Audit logging** - All 2FA attempts tracked for security monitoring
- **Optional enforcement** - Can be made mandatory for specific users by admins

---

## User Guide

### Enabling 2FA

#### 1. Setup 2FA

**Request:**
```http
POST /api/2fa/setup
Authorization: Bearer <your-access-token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "backupCodes": [
      "A1B2C3D4",
      "E5F6G7H8",
      ...
    ]
  }
}
```

#### 2. Scan QR Code

1. Open your authenticator app (Google Authenticator, Microsoft Authenticator, Authy, etc.)
2. Tap "Add account" or "Scan QR code"
3. Scan the QR code displayed
4. Your app will show a 6-digit code that refreshes every 30 seconds

#### 3. Save Backup Codes

⚠️ **IMPORTANT:** Store backup codes in a safe place!
- You'll receive 10 one-time use codes
- Use these if you lose access to your authenticator app
- Each code works only once

#### 4. Verify and Enable

**Request:**
```http
POST /api/2fa/verify
Authorization: Bearer <your-access-token>
Content-Type: application/json

{
  "token": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "2FA enabled successfully"
  }
}
```

### Logging In with 2FA

Once 2FA is enabled, the login flow changes:

#### Step 1: Initial Login

**Request:**
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password"
}
```

**Response (2FA required):**
```json
{
  "success": true,
  "data": {
    "user": { ...user profile... },
    "session": {
      "access_token": "",
      "refresh_token": "",
      "expires_in": 0,
      "token_type": "bearer"
    },
    "requires2FA": true,
    "tempToken": "temporary-token-for-verification"
  }
}
```

#### Step 2: Complete Login with 2FA Code

**Request:**
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password",
  "twoFactorCode": "123456"
}
```

**Response (success):**
```json
{
  "success": true,
  "data": {
    "user": { ...user profile... },
    "session": {
      "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expires_in": 3600,
      "token_type": "bearer"
    }
  }
}
```

### Using Backup Codes

If you lose access to your authenticator app, use a backup code:

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password",
  "twoFactorCode": "A1B2C3D4"
}
```

**Note:** Each backup code works only once and is automatically deleted after use.

### Checking 2FA Status

**Request:**
```http
GET /api/2fa/status
Authorization: Bearer <your-access-token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "enabledAt": "2026-04-07T10:30:00.000Z",
    "backupCodesRemaining": 8
  }
}
```

### Regenerating Backup Codes

If you've used several backup codes or suspect they're compromised:

**Request:**
```http
POST /api/2fa/backup-codes
Authorization: Bearer <your-access-token>
Content-Type: application/json

{
  "token": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "backupCodes": [
      "I9J0K1L2",
      "M3N4O5P6",
      ...
    ]
  }
}
```

⚠️ **This invalidates all previous backup codes!**

### Disabling 2FA

**Request:**
```http
POST /api/2fa/disable
Authorization: Bearer <your-access-token>
Content-Type: application/json

{
  "token": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "2FA disabled successfully"
  }
}
```

---

## Admin Guide

### Requiring 2FA for Specific Users

Admins can flag users to require 2FA:

```sql
UPDATE profiles
SET two_factor_required = TRUE
WHERE email = 'user@example.com';
```

**Future enhancement:** Admin UI for managing 2FA requirements.

### Monitoring 2FA Attempts

Admins can query 2FA attempts for security monitoring:

```sql
SELECT 
  tfa.user_id,
  p.email,
  tfa.ip_address,
  tfa.success,
  tfa.created_at
FROM two_factor_attempts tfa
JOIN profiles p ON tfa.user_id = p.id
WHERE tfa.created_at > NOW() - INTERVAL '24 hours'
  AND tfa.success = FALSE
ORDER BY tfa.created_at DESC;
```

### Disabling 2FA for User (Emergency)

If a user loses both their authenticator app and backup codes:

```sql
-- Check current status
SELECT id, email, two_factor_enabled 
FROM profiles 
WHERE email = 'user@example.com';

-- Disable 2FA for user
UPDATE two_factor_auth
SET is_enabled = FALSE
WHERE user_id = '<user-id>';

-- This will also update the profile flag via trigger
```

**⚠️ Only do this after verifying user identity through alternative means (email verification, ID check, etc.)**

---

## Security Considerations

### Rate Limiting

2FA verification is rate-limited to prevent brute force attacks:
- **5 attempts per 5 minutes** per user
- After 5 failed attempts, user must wait 5 minutes
- Rate limiting is IP-independent (prevents distributed attacks)

### Audit Logging

All 2FA events are logged:
- Setup initiated
- 2FA enabled
- 2FA disabled
- Verification attempts (success/failure)
- Backup code usage
- IP address and user agent tracked

View logs:
```sql
SELECT * FROM two_factor_attempts
WHERE user_id = '<user-id>'
ORDER BY created_at DESC
LIMIT 50;
```

### Backup Code Security

- Backup codes are hashed using SHA-256 before storage
- Each code works only once (deleted after use)
- Regenerating codes invalidates all previous codes

### TOTP Algorithm

- **Algorithm:** SHA-1 (standard for authenticator apps)
- **Period:** 30 seconds
- **Window:** ±2 periods (allows for slight clock skew)
- **Digits:** 6

---

## Troubleshooting

### "Invalid verification code"

**Causes:**
1. Time sync issue between server and authenticator app
2. Typo in code
3. Code expired (codes change every 30 seconds)
4. 2FA not properly set up

**Solutions:**
1. Ensure device time is set to automatic/network time
2. Try the next code if current one just expired
3. Use a backup code
4. Disable and re-enable 2FA

### "Too many failed attempts"

**Cause:** Rate limit reached (5 attempts in 5 minutes)

**Solution:** Wait 5 minutes and try again with correct code

### Lost Authenticator App

**Solutions:**
1. Use a backup code (each works once)
2. If no backup codes remain, contact admin for account recovery

### QR Code Not Scanning

**Solutions:**
1. Try manual entry instead:
   - In authenticator app, select "Enter a setup key"
   - Enter account name: "MabiniLMS (your-email@example.com)"
   - Enter secret key (provided alongside QR code)
2. Increase screen brightness
3. Try different authenticator app

---

## Database Schema

### `two_factor_auth` Table

```sql
CREATE TABLE two_factor_auth (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES profiles(id),
  secret TEXT NOT NULL,
  backup_codes TEXT[] NOT NULL,
  is_enabled BOOLEAN DEFAULT FALSE,
  enabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `two_factor_attempts` Table

```sql
CREATE TABLE two_factor_attempts (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Profiles Columns

```sql
ALTER TABLE profiles
ADD COLUMN two_factor_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN two_factor_required BOOLEAN DEFAULT FALSE;
```

---

## API Reference

### Endpoints

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/2fa/setup` | Yes | Generate QR code and backup codes |
| POST | `/api/2fa/verify` | Yes | Enable 2FA after verifying TOTP code |
| POST | `/api/2fa/disable` | Yes | Disable 2FA (requires verification) |
| GET | `/api/2fa/status` | Yes | Check 2FA status and backup codes remaining |
| POST | `/api/2fa/backup-codes` | Yes | Regenerate backup codes |
| POST | `/api/auth/login` | No | Login (with optional `twoFactorCode` field) |

### Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `TWO_FACTOR_REQUIRED` | 401 | 2FA verification needed |
| `INVALID_INPUT` | 400 | Invalid TOTP code or backup code |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded (5 attempts/5min) |
| `NOT_FOUND` | 404 | 2FA not set up or not enabled |
| `UNAUTHORIZED` | 401 | Authentication required |

---

## Frontend Integration Example

### React Component

```typescript
// Enable 2FA
const enable2FA = async () => {
  // Step 1: Setup
  const setupResponse = await fetch('/api/2fa/setup', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const { qrCode, backupCodes } = await setupResponse.json();
  
  // Display QR code and backup codes to user
  setQrCode(qrCode);
  setBackupCodes(backupCodes);
  
  // Step 2: User enters code from authenticator app
  const code = await promptUserForCode();
  
  // Step 3: Verify
  const verifyResponse = await fetch('/api/2fa/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ token: code })
  });
  
  if (verifyResponse.ok) {
    alert('2FA enabled successfully!');
  }
};

// Login with 2FA
const login = async (email: string, password: string, twoFactorCode?: string) => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, twoFactorCode })
  });
  
  const data = await response.json();
  
  if (data.requires2FA) {
    // Prompt user for 2FA code
    const code = await promptUserFor2FACode();
    return login(email, password, code);
  }
  
  return data;
};
```

---

**Document Version:** 1.0.0  
**Last Updated:** April 7, 2026  
**Supports:** TOTP (RFC 6238), Google Authenticator, Microsoft Authenticator, Authy
