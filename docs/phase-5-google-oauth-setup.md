# Phase 5: Google OAuth Integration - Setup Guide

## Overview
MabiniLMS now uses Google OAuth SSO with institutional email domain restriction (@mabinicolleges.edu.ph). This eliminates password management and automatically verifies institutional identity.

## ✅ Completed Backend Implementation

### Files Created
1. **Types**
   - `server/src/types/google-oauth.ts` - OAuth schemas, types, and domain validation

2. **Services**
   - `server/src/services/google-oauth.ts` - Google OAuth flow, token management, user info

3. **Controllers**
   - `server/src/controllers/google-oauth.ts` - HTTP handlers for OAuth endpoints

4. **Routes**
   - `server/src/routes/google-oauth.ts` - OAuth route definitions

5. **Database Migration**
   - `database-schema-google-oauth.sql` - Schema updates for Google tokens and Drive integration

### API Endpoints Available
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/google` | Initiate OAuth (redirects to Google) |
| GET | `/api/auth/google/url` | Get OAuth URL (for SPA) |
| GET | `/api/auth/google/callback` | OAuth callback handler |
| POST | `/api/auth/google/refresh` | Refresh Google token |
| POST | `/api/auth/google/revoke` | Revoke Google tokens |

---

## 🔧 Setup Instructions

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name: `MabiniLMS`
4. Click "Create"

### Step 2: Enable Required APIs

1. In the Google Cloud Console, go to "APIs & Services" → "Library"
2. Enable these APIs:
   - **Google+ API** (for user info)
   - **Google Drive API** (for file access)
   - **People API** (optional, for profile data)

### Step 3: Configure OAuth Consent Screen

1. Go to "APIs & Services" → "OAuth consent screen"
2. Select **Internal** (for Google Workspace domain)
   - This restricts access to @mabinicolleges.edu.ph users only
3. Fill in application information:
   - **App name**: MabiniLMS
   - **User support email**: your-email@mabinicolleges.edu.ph
   - **Developer contact**: your-email@mabinicolleges.edu.ph
4. Add scopes:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/drive.file`
5. Save and continue

### Step 4: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth 2.0 Client ID"
3. Application type: **Web application**
4. Name: `MabiniLMS Web Client`
5. Add Authorized JavaScript origins:
   ```
   http://localhost:3000
   http://localhost:5173
   https://your-production-domain.com
   ```
6. Add Authorized redirect URIs:
   ```
   http://localhost:3000/api/auth/google/callback
   http://localhost:5173/auth/callback
   https://your-production-domain.com/api/auth/google/callback
   ```
7. Click "Create"
8. **IMPORTANT**: Copy the Client ID and Client Secret

### Step 5: Update Server Environment Variables

1. Open `server/.env`
2. Add your Google credentials:
   ```env
   GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret-here
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
   ```

### Step 6: Run Database Migration

1. Go to [Supabase SQL Editor](https://supabase.com/dashboard/project/bwzqqifuwqpzfvauwgqq/sql)
2. Copy contents of `database-schema-google-oauth.sql`
3. Paste and execute the SQL
4. Verify tables created:
   - `google_tokens` - stores OAuth tokens
   - Updated `submissions` - added Drive file columns
   - Updated `profiles` - added `google_id` column

### Step 7: Test OAuth Flow

#### Option A: Direct Browser Test
1. Start the server: `npm run dev`
2. Navigate to: http://localhost:3000/api/auth/google
3. You'll be redirected to Google sign-in
4. Sign in with @mabinicolleges.edu.ph email
5. Grant permissions
6. You'll be redirected back with session data

#### Option B: Test with SPA
```javascript
// Get OAuth URL
const response = await fetch('http://localhost:3000/api/auth/google/url');
const { data } = await response.json();

// Redirect user
window.location.href = data.url;

// Handle callback (in your /auth/callback route)
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');
// Store token and use for API calls
```

#### Option C: Test with curl
```bash
# Get OAuth URL
curl http://localhost:3000/api/auth/google/url

# Visit the URL in browser, complete OAuth flow
# Google will redirect to callback with code parameter
```

---

## 🔒 Security Features Implemented

### 1. Domain Restriction
- Only `@mabinicolleges.edu.ph` emails allowed
- Validation happens in `validateInstitutionalEmail()`
- Google Workspace domain hint: `hd=mabinicolleges.edu.ph`

### 2. Token Management
- Access tokens stored securely in database
- Refresh tokens encrypted (Supabase handles this)
- Auto-refresh before expiry (5-minute buffer)
- Token revocation on logout

### 3. Row Level Security (RLS)
- Users can only access their own tokens
- Service role can manage all tokens for backend operations

### 4. Scope Management
- Minimal scopes requested: `openid`, `email`, `profile`, `drive.file`
- `drive.file` scope: App can only access files it creates/opens
- **Not** requesting full Drive access

---

## 📋 How It Works

### Authentication Flow
```
1. User clicks "Sign in with Google"
   ↓
2. Backend redirects to Google OAuth screen
   ↓
3. User signs in with @mabinicolleges.edu.ph email
   ↓
4. Google redirects back with authorization code
   ↓
5. Backend exchanges code for tokens
   ↓
6. Backend validates institutional email domain
   ↓
7. Backend creates/updates user profile
   ↓
8. Backend stores Google tokens in database
   ↓
9. Backend returns session to frontend
```

### Token Refresh Flow
```
1. User makes API call requiring Drive access
   ↓
2. Backend checks if token is expired/expiring
   ↓
3. If yes: Use refresh token to get new access token
   ↓
4. Update database with new token
   ↓
5. Return fresh token to API call
```

---

## 🧪 Testing Checklist

- [ ] Server starts without errors
- [ ] `/api/auth/google/url` returns OAuth URL
- [ ] OAuth URL includes correct redirect URI
- [ ] Can sign in with @mabinicolleges.edu.ph email
- [ ] Non-institutional emails are rejected
- [ ] User profile created in database
- [ ] Google tokens stored in `google_tokens` table
- [ ] Session token works for authenticated endpoints
- [ ] Token refresh works before expiry
- [ ] Logout revokes Google tokens

---

## 🚀 Next Steps (Phase 6)

After Google OAuth is working:
1. Implement Google Drive API service layer
2. Add Google Picker API for file selection
3. Create assignment submission with Drive files
4. Implement file permission sharing (teacher access)
5. Add Drive file preview/iframe support

---

## 🐛 Troubleshooting

### "Google OAuth is not configured"
- Check `.env` file has `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- Restart server after updating `.env`

### "Only @mabinicolleges.edu.ph emails allowed"
- This is expected! Use an institutional email
- For testing, temporarily modify `ALLOWED_DOMAIN` in `types/google-oauth.ts`

### "Redirect URI mismatch"
- Verify redirect URI in Google Cloud Console matches `.env`
- Check for trailing slashes (should not have one)

### Token refresh fails
- User may need to re-authenticate
- Check if refresh token exists in database
- Verify Google credentials are valid

### Database errors
- Run `database-schema-google-oauth.sql` migration
- Check Supabase connection
- Verify RLS policies are not blocking service role

---

## 📚 References

- [Google OAuth 2.0 Docs](https://developers.google.com/identity/protocols/oauth2)
- [Google Drive API Docs](https://developers.google.com/drive/api/guides/about-sdk)
- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)

---

## ⚙️ Configuration Reference

### Environment Variables
```env
# Google OAuth
GOOGLE_CLIENT_ID=            # From Google Cloud Console
GOOGLE_CLIENT_SECRET=        # From Google Cloud Console
GOOGLE_REDIRECT_URI=         # Your callback endpoint

# Supabase (already configured)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

# Server
PORT=3000
CLIENT_URL=http://localhost:5173
```

### OAuth Scopes Used
```javascript
GOOGLE_SCOPES.OPENID         // OpenID Connect
GOOGLE_SCOPES.PROFILE        // Basic profile info
GOOGLE_SCOPES.EMAIL          // Email address
GOOGLE_SCOPES.DRIVE_FILE     // Access to files created by app
```

### Domain Restriction
```javascript
ALLOWED_DOMAIN = 'mabinicolleges.edu.ph'
```

---

**Status**: Phase 5 backend complete ✅  
**Ready for**: Frontend integration and Phase 6 (Google Drive)
