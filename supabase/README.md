# Supabase Directory

This folder exists for Supabase CLI tooling (`supabase db push`, local dev stack, etc.).

## Migration Note

The file `migrations/20260424_mabini_grading_model.sql` was written as a standalone
Supabase CLI migration. Its logic is also covered by the numbered migration files in
`server/migrations/` which are the canonical source of truth for schema changes.

**Do not add new migrations here** — use `server/migrations/` instead and apply them
via the app's own migration runner (`npm run db:migrate`).
