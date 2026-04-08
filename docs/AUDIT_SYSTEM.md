# User Audit Trail System

## Overview
The MabiniLMS audit system tracks all sensitive user actions for security, compliance, and debugging purposes.

## Database Schema

### Table: `user_audit_logs`
```sql
CREATE TABLE public.user_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  event_type VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  details JSONB DEFAULT '{}'::JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Tracked Events

### Authentication Events
- `LOGIN_SUCCESS` - Successful login
- `LOGIN_FAILED` - Failed login attempt
- `LOGOUT` - User logout
- `SESSION_EXPIRED` - Session timeout
- `TOKEN_REFRESH` - Token refresh request

### Password Events
- `PASSWORD_CHANGED` - Password changed by user
- `PASSWORD_RESET_REQUESTED` - Forgot password initiated
- `PASSWORD_RESET_COMPLETED` - Password reset completed
- `TEMP_PASSWORD_USED` - Student used temporary password

### Profile Events
- `PROFILE_UPDATED` - Profile information changed
- `AVATAR_UPDATED` - Avatar image changed
- `EMAIL_CHANGED` - Email address changed

### Account Events
- `ACCOUNT_CREATED` - New account created
- `ACCOUNT_VERIFIED` - Email verified
- `ACCOUNT_DISABLED` - Account disabled by admin
- `ACCOUNT_ENABLED` - Account re-enabled

### Course Events
- `COURSE_CREATED` - Course created
- `COURSE_UPDATED` - Course updated
- `COURSE_DELETED` - Course deleted
- `COURSE_ENROLLED` - Student enrolled
- `COURSE_UNENROLLED` - Student unenrolled

### Assignment Events
- `ASSIGNMENT_CREATED` - Assignment created
- `ASSIGNMENT_UPDATED` - Assignment updated
- `ASSIGNMENT_SUBMITTED` - Student submitted
- `ASSIGNMENT_RESUBMITTED` - Student resubmitted

### Grade Events
- `GRADE_VIEWED` - Student viewed grade
- `GRADE_ASSIGNED` - Teacher assigned grade
- `GRADE_UPDATED` - Teacher updated grade

## Usage Examples

### Logging Events

```typescript
import * as auditService from './services/audit.js';
import { AuditEventType } from './services/audit.js';

// Log login
await auditService.logAuthEvent(
  userId,
  AuditEventType.LOGIN_SUCCESS,
  ipAddress,
  userAgent
);

// Log assignment submission
await auditService.logAssignmentEvent(
  userId,
  AuditEventType.ASSIGNMENT_SUBMITTED,
  assignmentId,
  {
    submission_id: submissionId,
    assignment_title: 'Homework 1',
    is_late: false,
  }
);

// Log profile update
await auditService.logProfileUpdate(
  userId,
  ['first_name', 'last_name'],
  ipAddress,
  userAgent
);
```

### Querying Audit Logs

```typescript
// Get user's recent activity
const logs = await auditService.getUserAuditLogs(userId, 50, 0);

// Get all logins in date range
const { data, total } = await auditService.queryAuditLogs({
  event_type: 'login_success',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  limit: 100,
});

// Get activity for a specific course
const courseActivity = await auditService.getResourceActivity(
  'course',
  courseId,
  20
);
```

## Row-Level Security (RLS)

### User Access
Users can only see their own audit logs:
```sql
CREATE POLICY user_audit_logs_user_select ON user_audit_logs
  FOR SELECT USING (user_id = auth.uid());
```

### Admin Access
Admins can see all audit logs:
```sql
CREATE POLICY user_audit_logs_admin_select ON user_audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

### Teacher Access
Teachers can see audit logs for their courses:
```sql
CREATE POLICY user_audit_logs_teacher_select ON user_audit_logs
  FOR SELECT USING (
    resource_type = 'course' AND
    EXISTS (
      SELECT 1 FROM courses
      WHERE id = resource_id AND teacher_id = auth.uid()
    )
  );
```

## Automatic Logging

### Profile Updates (Trigger)
Profile changes are automatically logged via database trigger:
```sql
CREATE TRIGGER trigger_log_profile_update
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_log_profile_update();
```

### Service-Level Logging
Most events are logged at the service layer for better control and context.

## Data Retention

### Purge Old Logs
```typescript
// Delete logs older than 1 year (default)
const deletedCount = await auditService.purgeOldAuditLogs(365);

// Delete logs older than 90 days
const deletedCount = await auditService.purgeOldAuditLogs(90);
```

### Recommended Retention Policy
- **Login/Logout**: 1 year
- **Password changes**: Permanent
- **Assignment submissions**: Permanent
- **Profile updates**: 2 years
- **Grade views**: 6 months

## Best Practices

### 1. Always Log Sensitive Actions
```typescript
// ❌ Don't skip audit logging
await changePassword(userId, newPassword);

// ✅ Always log security-sensitive actions
await changePassword(userId, newPassword);
await auditService.logPasswordEvent(
  userId,
  AuditEventType.PASSWORD_CHANGED,
  ipAddress,
  userAgent
);
```

### 2. Include Context in Details
```typescript
// ❌ Not enough context
await auditService.logAuditEvent({
  user_id: userId,
  event_type: 'grade_updated',
});

// ✅ Include relevant details
await auditService.logGradeEvent(
  userId,
  AuditEventType.GRADE_UPDATED,
  gradeId,
  {
    old_points: 85,
    new_points: 90,
    assignment_id: assignmentId,
    updated_by: teacherId,
  }
);
```

### 3. Never Block on Audit Failures
Audit logging is wrapped in try/catch and never throws errors to prevent breaking normal operations.

### 4. Batch for Performance
```typescript
// For multiple events, use batch insert
const events = users.map(u => ({
  user_id: u.id,
  event_type: AuditEventType.ACCOUNT_CREATED,
  details: { created_by: adminId },
}));

await auditService.logAuditEventsBatch(events);
```

## Compliance & Privacy

### GDPR Considerations
- Audit logs contain personal data (IP addresses, user IDs)
- Must be included in user data export requests
- Must be deleted on user account deletion (CASCADE)
- Retention policy should align with legal requirements

### FERPA Considerations
- Grade views are logged but don't include grade values
- Access logs help prove security of student records
- Can demonstrate proper access controls

## Monitoring & Alerts

### Suspicious Activity Detection
```typescript
// Example: Detect multiple failed logins
const failedLogins = await auditService.queryAuditLogs({
  user_id: userId,
  event_type: 'login_failed',
  start_date: new Date(Date.now() - 3600000).toISOString(), // Last hour
});

if (failedLogins.total >= 5) {
  // Trigger alert or account lock
}
```

### Admin Dashboard Queries
```typescript
// Recent administrative actions
const adminActivity = await auditService.queryAuditLogs({
  event_type: 'admin_action',
  limit: 50,
});

// All password changes today
const passwordChanges = await auditService.queryAuditLogs({
  event_type: 'password_changed',
  start_date: new Date().toISOString().split('T')[0],
});
```

## Future Enhancements

1. **Real-time Alerts**: WebSocket notifications for critical events
2. **Anomaly Detection**: ML-based suspicious activity detection
3. **Export Functionality**: CSV/JSON export for compliance reports
4. **Visualization**: Charts and graphs for audit trends
5. **Integration**: Connect to SIEM systems for enterprise security

## API Endpoints

### Get User's Audit Logs
```
GET /api/users/:userId/audit-logs?limit=50&offset=0
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "event_type": "login_success",
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0...",
      "created_at": "2026-04-07T12:00:00Z"
    }
  ],
  "total": 100
}
```

### Query Audit Logs (Admin Only)
```
GET /api/admin/audit-logs?event_type=login_success&start_date=2026-01-01
Authorization: Bearer <admin-token>

Response:
{
  "success": true,
  "data": [...],
  "total": 500
}
```

## Migration

To apply the audit system:
```bash
# Run migration
psql -U postgres -d mabinilms -f server/migrations/006_user_audit_logs.sql
```

## Testing

```typescript
// Test audit logging
describe('Audit Service', () => {
  it('should log login events', async () => {
    await auditService.logAuthEvent(
      testUserId,
      AuditEventType.LOGIN_SUCCESS,
      '127.0.0.1',
      'Test Agent'
    );
    
    const logs = await auditService.getUserAuditLogs(testUserId);
    expect(logs[0].event_type).toBe('login_success');
  });
});
```
