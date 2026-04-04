# Migration File Format Guide

## File Naming Convention

**Pattern:** `{version}_{name}.sql`

- **Version:** 3-digit number (000, 001, 002, ...)
- **Name:** snake_case description
- **Extension:** `.sql`

### Examples:
```
000_migrations_system.sql
001_initial_schema.sql
002_email_verification.sql
003_add_notifications.sql
004_course_categories.sql
```

---

## File Structure

Every migration file must contain:

1. **Header Comment Block** - Metadata about the migration
2. **UP Section** - SQL to apply the migration
3. **DOWN Section** - SQL to rollback the migration

---

## Template

```sql
-- ============================================
-- Migration: {version}_{name}
-- Description: {Brief description of what this migration does}
-- Dependencies: {comma-separated list of required migrations, or "None"}
-- Author: {Your name or team}
-- Created: {YYYY-MM-DD}
-- ============================================

-- UP
-- Apply migration: {Brief description}

{SQL statements to apply migration}

-- DOWN
-- Rollback migration: {Brief description}

{SQL statements to rollback migration}
```

---

## Example: Create Table Migration

```sql
-- ============================================
-- Migration: 003_add_notifications
-- Description: Create notifications table for user alerts
-- Dependencies: 001_initial_schema
-- Author: MabiniLMS Team
-- Created: 2026-04-03
-- ============================================

-- UP
-- Apply migration: Create notifications table

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);

COMMENT ON TABLE public.notifications IS 'User notifications and alerts';

-- DOWN
-- Rollback migration: Drop notifications table

DROP INDEX IF EXISTS idx_notifications_user_id;
DROP INDEX IF EXISTS idx_notifications_created_at;
DROP TABLE IF EXISTS public.notifications CASCADE;
```

---

## Example: Alter Table Migration

```sql
-- ============================================
-- Migration: 004_add_user_preferences
-- Description: Add preferences column to profiles table
-- Dependencies: 001_initial_schema
-- Author: MabiniLMS Team
-- Created: 2026-04-03
-- ============================================

-- UP
-- Apply migration: Add preferences JSONB column

ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

CREATE INDEX idx_profiles_preferences 
  ON public.profiles USING gin(preferences);

COMMENT ON COLUMN public.profiles.preferences IS 
  'User preferences and settings stored as JSON';

-- DOWN
-- Rollback migration: Remove preferences column

DROP INDEX IF EXISTS idx_profiles_preferences;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS preferences;
```

---

## Example: Data Migration

```sql
-- ============================================
-- Migration: 005_set_default_roles
-- Description: Update existing users with default student role
-- Dependencies: 001_initial_schema
-- Author: MabiniLMS Team
-- Created: 2026-04-03
-- ============================================

-- UP
-- Apply migration: Set default role for users without one

UPDATE public.profiles 
SET role = 'student' 
WHERE role IS NULL;

-- Make role column NOT NULL after setting defaults
ALTER TABLE public.profiles 
  ALTER COLUMN role SET NOT NULL;

-- DOWN
-- Rollback migration: Make role nullable again

ALTER TABLE public.profiles 
  ALTER COLUMN role DROP NOT NULL;
```

---

## Best Practices

### ✅ DO:

1. **Use IF EXISTS / IF NOT EXISTS**
   ```sql
   CREATE TABLE IF NOT EXISTS ...
   DROP TABLE IF EXISTS ...
   ```

2. **Add indexes for foreign keys**
   ```sql
   CREATE INDEX idx_enrollments_student_id 
     ON public.enrollments(student_id);
   ```

3. **Use CASCADE carefully**
   ```sql
   DROP TABLE IF EXISTS table_name CASCADE;
   ```

4. **Add helpful comments**
   ```sql
   COMMENT ON TABLE ... IS 'Detailed description';
   ```

5. **Test both UP and DOWN**
   - Always test rollback functionality
   - Ensure DOWN completely reverses UP

6. **Keep migrations atomic**
   - One conceptual change per migration
   - If it fails, everything rolls back

### ❌ DON'T:

1. **Don't modify applied migrations**
   - Create new migration instead
   - Checksums detect file changes

2. **Don't use DROP without IF EXISTS in DOWN**
   - Rollback should be idempotent

3. **Don't forget indexes**
   - Add indexes for foreign keys
   - Add indexes for commonly queried columns

4. **Don't mix DDL and DML without care**
   - Structure changes (DDL) vs data changes (DML)
   - Test transaction behavior

5. **Don't hardcode values that change**
   - Use environment-specific migrations if needed

---

## Migration Categories

### Schema Migrations (DDL)
- CREATE/ALTER/DROP TABLE
- CREATE/DROP INDEX
- CREATE/DROP CONSTRAINT
- ALTER COLUMN

### Data Migrations (DML)
- INSERT/UPDATE/DELETE data
- Data transformations
- Backfilling columns

### Mixed Migrations
- Add column + populate with data
- Rename column + update references

---

## Dependency Format

In the header comment, list dependencies:

```sql
-- Dependencies: None
-- Dependencies: 001_initial_schema
-- Dependencies: 001_initial_schema, 002_email_verification
```

The migration system will:
1. Parse dependencies from comments
2. Verify all dependencies are applied
3. Block migration if dependencies missing

---

## Checksum Validation

The system calculates SHA-256 checksums of migration files:

1. When migration is applied, checksum is stored
2. On subsequent runs, checksum is recalculated
3. If checksums don't match, warning is shown
4. Prevents silent modification of applied migrations

**To modify an applied migration:**
1. Create a new migration that reverses the changes
2. Then create another migration with the correct changes

---

## Transaction Wrapping

Each migration runs in a transaction:

```sql
BEGIN;
  -- UP section statements
COMMIT;
```

If any statement fails:
- Transaction is rolled back
- Migration is NOT marked as applied
- Error is reported
- Database state is unchanged

---

## File Organization

```
server/migrations/
├── 000_migrations_system.sql      # Migration tracking table
├── 001_initial_schema.sql          # Core tables
├── 002_email_verification.sql      # Email verification
├── 003_add_notifications.sql       # New feature
├── 004_alter_user_preferences.sql  # Schema change
└── ...
```

---

## Version Numbering

- Start at 000 (migration system itself)
- Increment by 1 for each migration
- Always use 3 digits: 000, 001, 002, ... 099, 100
- Never reuse version numbers
- Never skip numbers (for clarity)

---

## Template Generator

The migration system includes a generator:

```bash
npm run db:migrate:create add_course_tags

# Creates: server/migrations/005_add_course_tags.sql
# With template pre-filled
```

---

## Testing Migrations

Before committing a migration:

1. **Test UP**
   ```bash
   npm run db:migrate:up
   ```

2. **Verify schema changes**
   - Check tables/columns exist
   - Check indexes are created
   - Check constraints work

3. **Test DOWN**
   ```bash
   npm run db:migrate:down
   ```

4. **Verify rollback**
   - Check tables/columns removed
   - Check indexes are dropped
   - Database is in pre-migration state

5. **Test UP again**
   - Ensure idempotent (can run multiple times)

---

## Example Workflow

```bash
# 1. Check current status
npm run db:migrate:status

# 2. Create new migration
npm run db:migrate:create add_quiz_timer

# 3. Edit migration file
# Add UP and DOWN SQL

# 4. Apply migration
npm run db:migrate:up

# 5. Test in application
# Verify feature works

# 6. If needed, rollback
npm run db:migrate:down

# 7. Fix migration, apply again
npm run db:migrate:up

# 8. Commit migration to Git
git add server/migrations/XXX_add_quiz_timer.sql
git commit -m "Add quiz timer migration"
```

---

## Summary

- **Use template format** for all migrations
- **Test UP and DOWN** before committing
- **Keep atomic** - one change per migration
- **Add comments** for clarity
- **Follow naming convention** strictly
- **Never modify** applied migrations
- **Always use IF EXISTS/IF NOT EXISTS** for idempotency
