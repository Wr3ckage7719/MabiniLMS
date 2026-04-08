# Database Migration System - Bootstrap Instructions

## ⚠️ One-Time Setup Required

Before running migrations, you need to initialize the migration tracking system.

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your MabiniLMS project
3. Navigate to **SQL Editor** (left sidebar)
4. Click **New Query**
5. Copy and paste the SQL below
6. Click **RUN** or press `Ctrl+Enter`

```sql
-- Create migration tracking table
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version VARCHAR(10) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  applied_by VARCHAR(100),
  execution_time_ms INTEGER,
  CONSTRAINT valid_version CHECK (version ~ '^\d{3}$')
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
  ON public.schema_migrations(applied_at DESC);

-- Add comments
COMMENT ON TABLE public.schema_migrations IS
  'Tracks applied database migrations for version control and rollback capability';

COMMENT ON COLUMN public.schema_migrations.version IS
  'Migration version number (e.g., 001, 002, 003)';

COMMENT ON COLUMN public.schema_migrations.checksum IS
  'SHA-256 checksum of migration file to detect modifications';
```

### Option 2: Copy from File

Alternatively, copy the entire contents of `server/migrations/000_migrations_system.sql` (the UP section) and run it in the Supabase SQL Editor.

## ✅ Verify Installation

Run this in the SQL Editor to verify the table was created:

```sql
SELECT * FROM public.schema_migrations;
```

You should see an empty table with columns: version, name, checksum, applied_at, applied_by, execution_time_ms

## 🚀 Next Steps

Once the migration system is initialized, you can run:

```bash
# Apply all pending migrations
npm run db:migrate

# Check migration status
npm run db:migrate:status

# Apply one migration at a time
npm run db:migrate:up

# Rollback last migration
npm run db:migrate:down
```

## 📝 Notes

- This is a **one-time setup** - you only need to do this once per database
- All future migrations will be managed automatically via the CLI
- The migration system tracks which migrations have been applied to prevent duplicates
