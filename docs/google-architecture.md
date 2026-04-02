# Google OAuth & Drive Integration - Complete Architecture

## 🎯 Strategic Decision Summary

MabiniLMS now uses a **Google-centric architecture** that leverages institutional Google Workspace accounts for authentication and file storage, reducing infrastructure costs while improving user experience.

---

## 🏗️ Architecture Overview

### Authentication Layer
```
┌─────────────────────────────────────────────────────────┐
│  User Authentication Flow                               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. User → "Sign in with Google"                        │
│     ↓                                                    │
│  2. Redirect to Google OAuth                            │
│     ↓                                                    │
│  3. Domain Validation (@mabinicolleges.edu.ph)          │
│     ↓                                                    │
│  4. Supabase creates/updates profile                    │
│     ↓                                                    │
│  5. Store Google tokens (Drive access)                  │
│     ↓                                                    │
│  6. Return session to frontend                          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Storage Layer (Google Drive)
```
┌─────────────────────────────────────────────────────────┐
│  Assignment Submission Flow                             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Student Side:                                          │
│  1. Click "Submit Assignment"                           │
│  2. Google Picker opens → Select file from Drive        │
│  3. App gets File ID                                    │
│  4. App requests teacher View permission                │
│  5. Store metadata in Supabase                          │
│                                                          │
│  Teacher Side:                                          │
│  1. View submissions                                    │
│  2. Click file → Drive preview iframe loads             │
│  3. Comment/grade directly in Drive (optional)          │
│  4. Submit grade in LMS                                 │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 Data Flow

### What's Stored Where

| Data Type | Storage Location | Example |
|-----------|------------------|---------|
| User profiles | Supabase (profiles table) | email, name, role |
| Course metadata | Supabase (courses table) | title, description |
| Enrollments | Supabase (enrollments table) | student-course links |
| Assignment details | Supabase (assignments table) | title, due date, points |
| **Submission files** | **User's Google Drive** | **PDFs, docs, images** |
| **File references** | **Supabase (submissions table)** | **drive_file_id, view_link** |
| OAuth tokens | Supabase (google_tokens table) | access_token, refresh_token |
| Grades | Supabase (grades table) | points, feedback |

### Key Insight
**LMS acts as a management layer**. Heavy files stay in user's Drive; only metadata is stored in Supabase.

---

## 🔐 Security Model

### Multi-Layer Security

1. **Authentication**
   - Google OAuth SSO (institutional accounts only)
   - Domain restriction: `@mabinicolleges.edu.ph`
   - Supabase manages JWT tokens
   - No passwords stored/managed

2. **Authorization**
   - Role-based access control (Admin/Teacher/Student)
   - Supabase Row Level Security (RLS)
   - Service role for backend operations

3. **File Access**
   - OAuth scope: `drive.file` (minimal access)
   - App only sees files it creates/opens
   - Auto-share with teacher on submission
   - Google manages file permissions

4. **Token Management**
   - Access tokens: short-lived (1 hour)
   - Refresh tokens: long-lived, encrypted
   - Auto-refresh before expiry (5min buffer)
   - Revocation on logout

---

## 💰 Cost Analysis

### With Google Drive Integration ✅

| Resource | Provider | Cost |
|----------|----------|------|
| **File Storage** | **Student's Google Drive** | **$0 (uses student quota)** |
| Database | Supabase Free Tier | $0 |
| Authentication | Google OAuth | $0 |
| API Calls | Google Drive API | $0 (within limits) |
| Backend Hosting | To be decided | TBD |

### Without (Traditional Storage) ❌

| Resource | Provider | Est. Cost |
|----------|----------|-----------|
| File Storage (1TB) | Supabase Storage | ~$100/month |
| CDN/Bandwidth | Supabase | Variable |
| Database | Supabase | Same |

**Savings**: ~$100/month + Reduced bandwidth costs

---

## 🚀 User Experience Benefits

### For Students
- ✅ Sign in with familiar Google account
- ✅ No new passwords to remember
- ✅ Files stay in their own Drive
- ✅ Use Drive's native features (version history, comments)
- ✅ Access files even after course ends
- ✅ Familiar Drive interface

### For Teachers
- ✅ Single sign-on (no password management)
- ✅ Batch view student submissions
- ✅ Comment directly in Google Docs
- ✅ See version history of submissions
- ✅ No file downloads needed
- ✅ Drive Sync Status dashboard

### For Admins
- ✅ Zero storage infrastructure
- ✅ Automatic backups (Google handles it)
- ✅ Reduced liability (files not on our servers)
- ✅ Google Workspace integration
- ✅ Audit logs via Google Admin

---

## 🛠️ Technical Implementation

### Backend Stack
```
Express.js (API Server)
    ↓
Supabase (Database + Auth)
    ↓
Google OAuth 2.0 (Authentication)
    ↓
Google Drive API (File Access)
```

### Frontend Stack (Future)
```
React PWA
    ↓
Google Picker API (File Selection)
    ↓
Google Drive Viewer (File Preview)
    ↓
Supabase Client (Real-time)
```

### Database Schema
```sql
-- Google tokens for Drive access
google_tokens (
    user_id → UUID (FK to profiles)
    access_token → TEXT
    refresh_token → TEXT
    expires_at → TIMESTAMP
    scope → TEXT
)

-- Submission metadata (file lives in Drive)
submissions (
    id → UUID
    assignment_id → UUID (FK)
    student_id → UUID (FK)
    drive_file_id → TEXT ← Google Drive File ID
    drive_view_link → TEXT ← Web view URL
    drive_file_name → TEXT
    submitted_at → TIMESTAMP
    status → ENUM
)
```

---

## 📋 API Integration Points

### Google APIs Used

1. **Google OAuth 2.0**
   - Endpoint: `https://accounts.google.com/o/oauth2/v2/auth`
   - Purpose: User authentication
   - Scopes: `openid`, `email`, `profile`, `drive.file`

2. **Google Drive API**
   - Endpoint: `https://www.googleapis.com/drive/v3/`
   - Purpose: File operations, permissions
   - Key operations:
     - Get file metadata
     - Share file with teacher
     - Check quota/space

3. **Google Picker API** (Frontend)
   - Purpose: File selection UI
   - Allows users to pick files from Drive
   - Returns File ID to backend

---

## ⚡ Performance Optimizations

### Caching Strategy
```javascript
// Cache file metadata in Supabase
{
  drive_file_id: "abc123",
  drive_view_link: "https://drive.google.com/...",
  drive_file_name: "Assignment1.pdf",
  cached_at: "2026-04-02T15:00:00Z"
}

// Reduces API calls to Google Drive
// Only fetch fresh metadata if needed
```

### Token Management
```javascript
// Auto-refresh before expiry
if (expiresAt - now < 5minutes) {
  await refreshGoogleToken(userId);
}

// Batch API calls
const fileIds = submissions.map(s => s.drive_file_id);
const metadata = await batchGetFileMetadata(fileIds);
```

### Rate Limiting
```javascript
// Google Drive API quotas
{
  queries_per_day: 1_000_000_000,
  queries_per_100_seconds_per_user: 1000
}

// Our strategy: Cache aggressively
// Store file IDs, not content
// Lazy load previews on demand
```

---

## 🎯 Workflow Examples

### Student Submits Assignment

```javascript
// 1. Frontend: Open Google Picker
const picker = new google.picker.PickerBuilder()
  .addView(google.picker.ViewId.DOCS)
  .setCallback(async (data) => {
    if (data.action === 'picked') {
      const fileId = data.docs[0].id;
      
      // 2. Submit to backend
      await fetch('/api/assignments/:id/submit', {
        method: 'POST',
        body: JSON.stringify({
          drive_file_id: fileId
        })
      });
    }
  })
  .build();
picker.setVisible(true);

// 3. Backend: Grant teacher permission
const driveService = new GoogleDriveService(studentToken);
await driveService.shareFile(fileId, teacherEmail, 'reader');

// 4. Store in database
await supabase.from('submissions').insert({
  assignment_id,
  student_id,
  drive_file_id: fileId,
  drive_view_link: `https://drive.google.com/file/d/${fileId}/view`,
  submitted_at: new Date()
});
```

### Teacher Views Submissions

```javascript
// 1. Fetch submissions
const { data } = await fetch('/api/assignments/:id/submissions');

// 2. Render list with Drive previews
data.submissions.forEach(submission => {
  // 3. Embed Drive viewer
  const iframe = `
    <iframe 
      src="${submission.drive_view_link}"
      width="800"
      height="600"
    ></iframe>
  `;
});

// Teacher can comment directly in Drive!
```

---

## 🔄 Migration Path (Future)

If needed, switching storage providers is straightforward:

```javascript
// Abstract storage interface
interface StorageProvider {
  uploadFile(file: File): Promise<string>;
  getFileUrl(fileId: string): Promise<string>;
  shareFile(fileId: string, email: string): Promise<void>;
}

// Current: GoogleDriveProvider
// Future: SupabaseStorageProvider, S3Provider, etc.

class GoogleDriveProvider implements StorageProvider {
  // Implementation
}

class SupabaseStorageProvider implements StorageProvider {
  // Alternative implementation
}
```

Only change one line:
```javascript
// const storage = new GoogleDriveProvider();
const storage = new SupabaseStorageProvider();
```

---

## 📊 Success Metrics

### Target KPIs
- ✅ Zero password reset requests
- ✅ <2s OAuth login time
- ✅ 100% institutional email compliance
- ✅ <100ms file metadata retrieval
- ✅ $0 storage costs
- ✅ 99.9% Google Drive uptime (Google SLA)

---

## 🚧 Limitations & Trade-offs

### Pros
- ✅ Zero storage costs
- ✅ Familiar UX (Google Drive)
- ✅ Built-in collaboration
- ✅ Files persist after course

### Cons
- ❌ Requires institutional Google accounts
- ❌ Dependency on Google services
- ❌ API rate limits (manageable)
- ❌ Complex permission management

### Mitigations
- Cache aggressively (reduce API calls)
- Store File IDs in Supabase (fast lookups)
- Graceful degradation (show cached data if API down)
- Admin fallback authentication (non-Google accounts)

---

**Architecture Status**: ✅ Designed & Documented  
**Backend Implementation**: ✅ Phase 5 Complete  
**Pending**: Google Cloud setup, Frontend integration, Phase 6-9  
