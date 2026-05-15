# MabiniLMS — Full-Stack Audit & Remediation Plan

**Branch:** `claude/full-stack-audit-plan-jtEvC`
**Target executor:** Claude Sonnet (or any contributor)
**Production safety priority:** CRITICAL — every change must preserve existing API contracts, data, and live UX. Default to behind-flag or pure-cleanup edits.
**Date drafted:** 2026-05-15

---

## 0. How to use this plan

1. Work on the branch named above. Do **not** push to `main`. One PR at the end.
2. Each task block has: **Why**, **Files**, **Change**, **Risk**, **Verify**.
3. The **Risk** column drives ordering. Ship LOW-risk fixes first, then MEDIUM, then HIGH (HIGH requires explicit user approval before merge).
4. Anything labelled **DO NOT TOUCH** is load-bearing and outside this plan's scope.
5. Anything labelled **DECISION NEEDED** must be paused on; ask the user before implementing.
6. After every batch of changes:
   - `npm run lint` (root)
   - `npm test --workspace=server`
   - `npm test --workspace=client`
   - `npm run build` (root) — must succeed
7. Commit cadence: one commit per *coherent* batch (e.g. "fix: missing authorize() on enrollments routes"). Do **not** mix unrelated changes in one commit. The PR will collect them.

### Branch hygiene

```bash
git checkout claude/full-stack-audit-plan-jtEvC
git pull --rebase origin claude/full-stack-audit-plan-jtEvC   # if it exists upstream
# work…
git push -u origin claude/full-stack-audit-plan-jtEvC
```

Do **NOT** force-push. Do **NOT** rebase onto `main` until the user OKs it.

---

## 1. Executive summary of findings

The codebase is in good shape overall. Four parallel audits (backend, database, frontend overview, critical-pages deep dive) found:

**Severity breakdown:**

- **2 CRITICAL security gaps** — missing authorization on enrollment-mutation routes (§3.1).
- **2 CRITICAL data-integrity risks** — (a) `profiles` ON DELETE CASCADE wipes student work; (b) `TIMESTAMP` (no TZ) columns in migration 001 still leak into prod.
- **3 HIGH-RISK items requiring user decision** — dual migration directories; `TIMESTAMP` → `TIMESTAMPTZ` migration; cascade-delete redesign. All paused in §10.
- **~25 MEDIUM bugs** in heavy pages (memoization defeats, race conditions in modal state, partial-update inconsistencies, `Promise.all` vs `Promise.allSettled`, magic numbers, no debouncing). Catalogued in §6 by file.
- **~30 LOW issues** — status codes, dead query params, accessibility quick wins, dead constants, missing down migrations.

**What's genuinely good (do NOT touch):**

- All client routes are registered and resolve to real components. No 404-waiting-to-happen.
- All client service endpoints exist on the backend. No missing handlers.
- All dialogs are properly imported and conditionally rendered. No dead modals.
- Loading / error / empty states present on every major page.
- React Query is well-configured (per-hook `staleTime` overrides, `gcTime: 30m`, sane retry policy).
- 100% RLS coverage in Supabase. ARIA labels present. shadcn used consistently.
- Zero TODO/FIXME/HACK markers in `client/src` — the codebase is well-maintained.

### What we will ship in this PR (post-decisions 2026-05-15)

**Security & correctness**
✅ CRITICAL auth fixes on enrollment routes, with regression tests.
✅ Validate previously-loose query params on search and grades.

**Data integrity**
✅ **Soft-delete on `profiles`** (replace cascade-delete behaviour, with admin "hard delete" requiring confirmation). See §5.2.

**Performance**
✅ Composite indexes on `submissions` — applied manually via `psql` after merge. See §4.1.
✅ React Query key alignment for lessons.
✅ Memoization fixes on hot pages (`ClassDetail`, `TeacherAssignmentDetail`, others).

**Cleanups & UX**
✅ Route `TeacherSettingsPage` through `apiClient`.
✅ Page-by-page bug fixes catalogued in §6.bis.
✅ Race-condition fixes in modal close handlers (silent-data-loss class).
✅ Accessibility sweep (`aria-label` on icon-only buttons).
✅ Magic numbers extracted to `client/src/lib/constants.ts`.

**Feature wiring**
✅ Delete dead files: `client/src/pages/CoursesPage.tsx`, `client/src/pages/StudentDashboard.tsx`.
✅ **Build out the student `/archived` view** (mirroring `/teacher/archived`).
✅ **Wire `MaterialEngagementPanel`** to a new `GET /api/materials/:id/engagement` endpoint.

**Migrations bookkeeping**
✅ Down migrations for 037, 040, 041.

**Deferred (NOT in this PR)**
❌ `TIMESTAMP` → `TIMESTAMPTZ` — separate scheduled deployment (§10.1).
❌ `supabase/migrations` consolidation — pending decision (§10.3).
❌ Migration-runner `-- migrate:no-transaction` directive — backlog.
❌ Heavy-component refactors (>30 KB files) — backlog, separate PRs.

---

## 2. Risk dial — what counts as "destroying production"

The user has flagged that a previous large change broke prod. To prevent recurrence:

| Action | Risk | Rule in this plan |
|---|---|---|
| Edit a React component's JSX | LOW | OK, ship |
| Add a missing React Query key | LOW | OK, ship |
| Add a route-level `authorize()` middleware | MEDIUM | OK, ship with a test that fails without it |
| Add a Postgres index `CONCURRENTLY` | MEDIUM | OK, ship via new migration file |
| Change a Postgres column type | HIGH | **PROPOSE ONLY**, do not run |
| `ALTER TABLE DROP CONSTRAINT` | HIGH | **PROPOSE ONLY** |
| Backfill > 10k rows in a migration | HIGH | **PROPOSE ONLY** |
| Change an API response shape | HIGH | **PROPOSE ONLY** |
| Add a new endpoint | LOW–MEDIUM | OK if not consumed yet, off by default |
| Rename a frontend route | HIGH | **NO** |
| Modify auth-token shape / TTL | HIGH | **NO** |

Every change in §3–§9 below is LOW or MEDIUM by these rules. §10 is a separate, paused HIGH-risk doc.

---

## 3. Backend — bugs and security

### 3.1 [CRITICAL] Missing authorize() on enrollment mutation routes

**Why.** Any authenticated user can mutate any enrollment row — change status, unenroll a student, read other students' enrollment data — because the route guards stop at `authenticate` and the service layer does not re-check ownership for these specific endpoints.

**Files.**
- `server/src/routes/enrollments.ts:40–44` — `GET /:id`
- `server/src/routes/enrollments.ts:46–51` — `PATCH /:id/status`
- `server/src/routes/enrollments.ts:53–57` — `DELETE /:id`
- `server/src/routes/enrollments.ts:59–63` — `GET /course/:courseId/status`

**Change.** Add a per-route ownership guard. The simplest correct pattern is a service helper, since UserRole alone isn't enough — a student can hold the role and still be unauthorized for *another student's* row.

1. In `server/src/services/enrollments.ts`, add (or reuse if it exists):
   ```ts
   export async function assertEnrollmentAccess(
     enrollmentId: string,
     userId: string,
     role: UserRole,
   ): Promise<EnrollmentRow> {
     const row = await getEnrollmentById(enrollmentId);
     if (!row) throw new NotFoundError('Enrollment not found');
     if (role === UserRole.ADMIN) return row;
     if (role === UserRole.TEACHER) {
       const course = await getCourseById(row.course_id);
       if (course?.teacher_id !== userId) throw new ForbiddenError();
       return row;
     }
     if (row.student_id !== userId) throw new ForbiddenError();
     return row;
   }
   ```
2. In each affected controller, call `assertEnrollmentAccess(req.params.id, req.user.id, req.user.role)` before the existing logic.
3. For `GET /course/:courseId/status`, the check is "user is admin OR user enrolled in course OR user teaches course". Add `assertCourseAccess(...)` analogous helper.

**Risk.** MEDIUM. Failure mode is "user gets 403 when they should get 200" — a clear, recoverable error.

**Verify.**
- Add `server/tests/integration/enrollments.auth.test.ts` with three cases per endpoint: owner allowed, other-student forbidden, teacher-of-course allowed, admin allowed.
- Manually: log in as student A, try to PATCH student B's enrollment via curl → expect `403`.

---

### 3.2 [LOW] `POST /api/auth/signup` returns 200 instead of 201

**Files.** `server/src/controllers/auth.ts:74`
**Change.** `res.status(201).json(...)`. Update any frontend code that checks `=== 200` (there is none — it uses axios `try/catch`).
**Risk.** LOW. Confirm no test asserts `status === 200`.
**Verify.** `npm test --workspace=server` and grep client for `signup.*200`.

---

### 3.3 [LOW] DELETE endpoints respond 200 with `{message}` instead of 204

**Files.** Multiple controllers — examples:
- `server/src/controllers/enrollments.ts` (unenroll)
- `server/src/controllers/materials.ts` (delete material)
- `server/src/controllers/grades.ts` (delete grade)
- `server/src/controllers/assignments.ts` (delete assignment)

**Decision.** **DO NOT CHANGE** in this PR. The frontend reads `res.data.message` on success; flipping to 204 with no body breaks those toasts. Track as backlog only.

**Why I'm calling this out anyway.** So we don't accidentally "fix" it later thinking it's a no-op.

---

### 3.4 [LOW] Unbounded global search

**Files.**
- `server/src/services/global-search.ts` (no upper bound on result merge)
- `server/src/routes/search.ts`

**Change.** In the route file, add a zod schema for query: `q: z.string().min(1).max(200), limit: z.coerce.number().min(1).max(50).default(10), types: z.string().optional()`. Pass to `validate()` middleware. In the service, hard-cap each sub-search at `limit`.

**Risk.** LOW. Anyone hitting search with limit>50 today gets a slower response; capped at 50 they get a faster one. Document in `docs/API_BACKEND_AUDIT_*.md`.

**Verify.** `npm test --workspace=server`. Try `/api/search?q=a&limit=9999` → returns 50 max.

---

### 3.5 [LOW] `req.query.student_id` cast without validation

**Files.** `server/src/controllers/grades.ts:81`
**Change.** Add a zod query schema `studentId: z.string().uuid().optional()` to the route (`server/src/routes/grades.ts`) and use `req.validatedQuery.studentId` in the controller. Use existing `validate()` middleware pattern.
**Risk.** LOW.
**Verify.** Send `?student_id=notauuid` → expect 400.

---

### 3.6 [LOW] Response-envelope inconsistencies

**Files.**
- `server/src/controllers/batch.ts:196` — Excel export uses `res.send(buffer)` (correct for binary)
- `server/src/controllers/batch.ts:230` — CSV export uses `res.send(csv)` (correct for text)

**Decision.** **DO NOT CHANGE**. Binary/CSV exports must not be wrapped in JSON envelopes. The current code is correct. This is just a note so future audits don't flag it.

---

### 3.7 [LOW] Soft refactor opportunity (skip if time-boxed)

`server/src/services/teacher-engagement.ts:153–155` maps over students with `async`. This is `Promise.all`-bounded, so it's not unbounded, but if `students.length > 200` it'll hammer Supabase.

**Change.** Use `pLimit(8)` or a manual chunked-batch helper. If `p-limit` isn't already a dep, **do not add it for this** — instead, write a 6-line `chunkedBatch` helper.

**Risk.** LOW.

---

## 4. Backend — performance

### 4.1 [MEDIUM] Add composite indexes on submissions

**Why.** Top hot queries from grade view, student dashboard, and grading flows are:
- `WHERE student_id = ? ORDER BY submitted_at DESC`
- `WHERE assignment_id = ? AND status = ?`

Existing single-column indexes don't cover these.

**Change.** New migration `server/migrations/044_submissions_composite_indexes.sql`:

```sql
-- 044_submissions_composite_indexes.sql
-- Up

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_student_submitted_at
  ON submissions (student_id, submitted_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_assignment_status
  ON submissions (assignment_id, status);

-- Down (commented; reversible by hand if needed)
-- DROP INDEX IF EXISTS idx_submissions_student_submitted_at;
-- DROP INDEX IF EXISTS idx_submissions_assignment_status;
```

**Risk.** LOW with `CONCURRENTLY` — no table lock. Will take a few seconds on prod data.

**Verify.**
- Run `EXPLAIN ANALYZE` against the two query shapes before/after; expect index scan.
- Watch for failure mode: `CONCURRENTLY` cannot run inside a transaction. The runner wraps SQL in `BEGIN`, so this migration must be applied **manually** (decision 2026-05-15, Option B). Procedure:
  1. Connect to Supabase: `psql "$SUPABASE_DB_URL"`.
  2. Run the two `CREATE INDEX CONCURRENTLY` statements directly.
  3. Insert a row into `schema_migrations`: `INSERT INTO schema_migrations (version, name, applied_at) VALUES ('044', '044_submissions_composite_indexes', NOW());` (adjust columns to match the actual table shape — verify with `SELECT * FROM schema_migrations LIMIT 1` first).
  4. Verify with `\d+ submissions` that the two indexes appear.
- Keep the `.sql` file in source so the migration is reproducible on staging / new clones (the runner will skip it because of the inserted `schema_migrations` row).

---

### 4.2 [LOW] Pagination on global search

Already in §3.4 — composite improvement.

### 4.3 [LOW] Eager-load reduction in `services/courses.ts`

**Why.** A `getCourseWithDetails(courseId)` call (≈ line 200–400 of `services/courses.ts`) loads enrollments, materials, lessons, and announcements regardless of consumer. The frontend has separate React Query queries for each, so the eager load is wasted.

**Decision.** **DO NOT change** the service contract. Add an optional `include` parameter (`'enrollments' | 'materials' | 'lessons' | 'announcements'`) and default to current behavior. Frontend can opt into smaller payloads later.

**Risk.** LOW (additive).

---

## 5. Database / migrations

### 5.1 [HIGH — DECISION NEEDED] Naive TIMESTAMP columns in migration 001

`profiles.created_at/updated_at`, `courses.*`, `enrollments.enrolled_at`, `assignments.due_date`, `submissions.submitted_at`, `grades.graded_at`, `course_materials.uploaded_at`, `google_tokens.*` are `TIMESTAMP` (no TZ). Everything created after migration 002 uses `TIMESTAMPTZ`. The recent fix "treat naive TIMESTAMP columns as UTC + readable proctor banner" (commit `002b210`) was a frontend workaround. The DB type is still wrong.

**Why don't fix now.** `ALTER COLUMN TYPE TIMESTAMPTZ` rewrites the table — full table lock, downtime for prod-size tables. Plus it changes how Supabase serializes rows. We need a maintenance window.

**Proposal (write into §10, do not run).**
1. Take a Supabase snapshot.
2. Run during off-hours: `ALTER TABLE profiles ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';` (and so on per column).
3. Verify backend code paths assume UTC (the frontend workaround can stay until verified).
4. Remove the frontend "naive timestamp" branches once DB is canonical.

**Risk.** HIGH if rushed. **DECISION NEEDED.**

---

### 5.2 [APPROVED] Cascade-delete → soft-delete on profiles

**Decision (2026-05-15).** Ship in this PR.

Hard-deleting a row in `profiles` cascades through 10+ tables (submissions, grades, exam_attempts, lesson_progress, audit logs…). A misclick in the admin "delete user" flow can erase a semester's worth of student work.

**Execution plan.**

1. **New migration `server/migrations/045_profiles_soft_delete.sql`:**
   ```sql
   -- Up
   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
   CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON profiles (deleted_at)
     WHERE deleted_at IS NULL;
   -- Down
   -- DROP INDEX IF EXISTS idx_profiles_deleted_at;
   -- ALTER TABLE profiles DROP COLUMN IF EXISTS deleted_at;
   ```
   Pure additive — no downtime, no table rewrite.

2. **Service layer changes in `server/src/services/admin.ts`:**
   - `deleteUser(id)` → behavior change: set `deleted_at = now()` instead of `DELETE`. Rename internally to `softDeleteUser(id)`. Keep the HTTP endpoint shape unchanged.
   - Add `hardDeleteUser(id, { confirmationName })`: verifies the passed name matches the profile's name, then executes the original `DELETE`. Admin-only, logged to audit.
   - Add `restoreUser(id)`: set `deleted_at = NULL`. Admin-only.

3. **Query filter audit.** Every query in `server/src/services/*.ts` that selects from `profiles` must add `.is('deleted_at', null)` UNLESS the call site explicitly wants soft-deleted rows (admin restore screen, audit log lookups).
   Sites to check (grep `from('profiles')` and `JOIN profiles`):
   - `services/auth.ts` — login (must reject soft-deleted users with a generic "invalid credentials" error)
   - `services/users.ts` — directory listing
   - `services/admin.ts` — user list (add an `includeDeleted` flag)
   - `services/courses.ts` — teacher lookup
   - `services/classes.ts` — student roster
   - `services/notifications.ts` — recipient resolution
   - Anywhere `profiles` is joined for `first_name/last_name` display

4. **Frontend changes in `client/src/pages/admin/StudentManagementPage.tsx` and `PendingTeachersPage.tsx`:**
   - Hard-delete button → opens a typed-confirmation dialog ("type the student's full name to confirm"). Pattern: see `AlertDialog` usage in `ClassCard.tsx`.
   - Add a new "Restore" action for soft-deleted users (admin-only list filter "Show deleted").

5. **Test coverage:**
   - `server/tests/integration/admin.soft-delete.test.ts` — soft-delete hides user from listings, prevents login, preserves submissions/grades.
   - `server/tests/integration/admin.hard-delete.test.ts` — typed-name confirmation required; cascades only with explicit hard-delete; audit-log entry created.

**Risk.** MEDIUM. The mechanical risk is missing a `WHERE deleted_at IS NULL` filter in a listing query (soft-deleted users would appear). The mitigation: comprehensive grep and tests. The data-loss failure mode of the *current* code is far worse than the soft-delete failure mode.

**Verify.**
- Manual: soft-delete a test student → log in as that student → expect failure; list students as admin → user gone; check that their old submissions are still visible to the teacher of their old class.
- Hard-delete with wrong name typed → blocked.
- Restore soft-deleted user → can log in again.

---

### 5.3 [HIGH — DECISION NEEDED] Dual migration directories

`server/migrations/000–043.sql` and `supabase/migrations/20260424_mabini_grading_model.sql` both contain schema changes. Two sources of truth = drift.

**Proposal.**
- Make `server/migrations` the only source of truth.
- Port the supabase migration's content into a new `server/migrations/045_mabini_grading_model.sql` (idempotent with `IF NOT EXISTS`).
- Add a note to `supabase/migrations/README.md` saying "moved to server/migrations; do not add files here."

**Risk.** MEDIUM — if a deploy already applied the supabase migration to prod, re-applying it must be a no-op (idempotent). Verify in staging first. **DECISION NEEDED.**

---

### 5.4 [LOW] Add down migrations for 037, 040, 041

**Why.** Rollback is currently impossible.

**Change.** Append `-- Down` sections to each migration file with the inverse DDL. The CLI in `server/src/cli/migrate.ts` already supports `down`.

**Risk.** LOW (writing-only).

---

### 5.5 [LOW] Dead columns: `material_engagement_tracking`

Migration 028 added `download_count`, `current_scroll_position`, `pages_viewed`, `interaction_events` to `material_progress`. No service reads them.

**Decision.** **DO NOT DROP**. Wire them into the existing `MaterialEngagementPanel.tsx` component instead — see §6.7. The data may already be written by the frontend `material-progress-queue.service.ts`; need to check.

**Risk.** LOW.

---

## 6. Frontend — bugs, missing pieces, dead code

### 6.1 [LOW] `TeacherSettingsPage` imports `axios` directly

**Files.** `client/src/pages/TeacherSettingsPage.tsx:19`, plus uses at lines 215, 216, 252, 265, 339.

**Why.** Like the earlier `SettingsPage` fix, bare axios bypasses the centralized client, auth header, and 401 handling.

**Change.** Replace with `apiClient` from `@/services/api-client.ts`. Where the code uses `axios.isAxiosError` for narrowing, keep `import { isAxiosError } from 'axios'` (type-only) but route requests through `apiClient`.

**Risk.** LOW — same fix pattern as `SettingsPage`.

**Verify.** Settings page should still save and show toasts. Run through "change password", "update profile", "regenerate token" flows.

---

### 6.2 [LOW] Tiny re-export files — verify, don't delete

These look like stubs but are intentional barrels. **Do not delete.**

| File | Size | Status | Action |
|---|---|---|---|
| `CreateAssignmentDialog.tsx` | 78 B | Re-exports from `assignment-builder/` | Keep |
| `MaterialPreviewDialog.tsx` | 60 B | Re-exports from `material-preview/` | Keep |
| `TeacherClassStream.tsx` | 61 B | Re-exports from `teacher-class-stream/` | Keep |
| `AdminDashboard.tsx` | 97 B | Re-exports `admin/AdminDashboardPage` | Keep |
| `CoursesPage.tsx` | 103 B | Re-exports Dashboard | **DECISION NEEDED** |
| `StudentDashboard.tsx` | 108 B | Re-exports Dashboard | **DECISION NEEDED** |

**Decision (2026-05-15):** Delete both `CoursesPage.tsx` and `StudentDashboard.tsx`. Pre-check: `grep -r "from.*CoursesPage\|from.*StudentDashboard" client/src` returns nothing → safe to remove.

---

### 6.3 [LOW] `App.tsx` route registry — gaps

Read of `client/src/App.tsx`:

- `/archived` routes to `Dashboard` (line 159). Looks placeholder. Either implement an archived classes view (matching `/teacher/archived`) or remove.
- No `/student/dashboard` — student lands on `/dashboard`. Fine.
- No 403 page — `NotFound` is used for everything. `ProtectedRoute` redirects to `/login`. **OK** for now.

**Decision (2026-05-15):** **BUILD OUT** the student archived view.

**Execution plan.**
1. Create `client/src/pages/ArchivedPage.tsx` (~80 lines) mirroring `client/src/pages/teacher/TeacherArchivedPage.tsx`. Pattern:
   - Fetch via `useClasses()` then filter where `is_archived === true` OR student-archived flag.
   - Render list of `ClassCard` with an "Unarchive" / "Restore" action that calls the existing `archive.service.ts` unarchive method.
   - Empty state: "No archived classes yet."
2. Update `App.tsx`: replace `<Route path="/archived" element={<Dashboard />} />` with `<Route path="/archived" element={<ArchivedPage />} />`. Lazy-load it.
3. Ensure the side nav already links to `/archived`; if not, add a link in `Sidebar.tsx` visible only when the user has at least one archived class.

**Risk.** LOW (additive UI, reuses existing backend).

---

### 6.4 [LOW] `vite.config.ts` opens `/teacher` on dev start

**Files.** `client/vite.config.ts:8`
**Change.** `open: "/"` or remove the property. Already flagged in the previous review; verify whether it was applied.
**Risk.** Zero.

---

### 6.5 [LOW] React Query keys consistency in `LessonEditorPage`

**Files.** `client/src/pages/LessonEditorPage.tsx` lines 492, 596–597, 786.

The page invalidates `['lessons', 'teacher', classId]` and `['lessons', 'student', classId]`. Make sure every place that *reads* lessons uses the same keys. Grep `client/src/hooks-api/useLessons.ts` to confirm.

**Change.** If `useLessons` reads `['lessons', classId, 'teacher']` (positional swap), unify on one shape and update both. Pure refactor, zero behavior change.

**Risk.** MEDIUM if positions swap and you miss a site — caches won't invalidate. After change, do a manual lesson-edit + reload test.

---

### 6.6 [LOW] Missing loading / empty / error states

To audit page-by-page. As a starting list:

| Page | Loading state | Empty state | Error state | Action |
|---|---|---|---|---|
| `Dashboard.tsx` | ✓ | ✓ | partial | OK |
| `GradesPage.tsx` | check | check | check | Audit |
| `UpcomingPage.tsx` | check | check | check | Audit |
| `CalendarPage.tsx` | wraps `InteractiveCalendar` | n/a | check | Audit |
| `ClassDetail.tsx` | ✓ | check | check | Audit |
| `LessonDetailPage.tsx` | check | check | check | Audit |
| `LessonEditorPage.tsx` | ✓ | n/a | check | Audit |
| `MaterialReaderPage.tsx` | check | n/a | check | Audit |
| `SettingsPage.tsx` | check | n/a | partial | Audit |
| `TeacherSettingsPage.tsx` | check | n/a | partial | Audit |

For each "check", the Sonnet executor must: open the file, locate the data-fetching hook, verify that `isLoading`, `isError`, and the empty branch are handled (Skeleton / "Nothing yet" / "Something went wrong" UI). Add minimal handling where missing. Cite existing patterns from `Dashboard.tsx` to keep visual consistency.

**Risk.** LOW.

---

### 6.7 [APPROVED] `MaterialEngagementPanel` — wire backend data

**Decision (2026-05-15):** Ship in this PR.

Component exists at `client/src/components/MaterialEngagementPanel.tsx` (5KB). Migration 028 has the data columns. Currently no API endpoint exposes them.

**Execution plan.**

1. **Backend.** New endpoint `GET /api/materials/:id/engagement`.
   - File: `server/src/routes/materials.ts` — add route, `authenticate` + teacher-or-admin authorize.
   - File: `server/src/controllers/materials.ts` — new `getMaterialEngagement` handler.
   - File: `server/src/services/materials.ts` — new `getEngagementAggregate(materialId)` returning:
     ```ts
     {
       download_count: number,
       average_scroll_pct: number,
       average_view_seconds: number,
       students_viewed: number,
       students_total: number,
       pages_viewed_distribution: Array<{ page: number, viewers: number }>
     }
     ```
   - Source columns: `material_progress.download_count`, `current_scroll_position`, `pages_viewed`, `interaction_events` (migration 028). Aggregate via SQL `AVG`, `COUNT DISTINCT student_id`, and `jsonb_array_elements` for pages.
   - Ownership: only the class teacher (or admin) may call; reject 403 otherwise.

2. **Service-layer auth helper.** Reuse `assertMaterialAccess(materialId, userId, role)` if it exists; otherwise add one. Pattern matches `assertEnrollmentAccess` (§3.1).

3. **Frontend.**
   - New hook `client/src/hooks-api/useMaterialEngagement.ts` with `useQuery(['material-engagement', materialId], …)`. `staleTime: 60_000`.
   - Update `client/src/components/MaterialEngagementPanel.tsx` to call the new hook; render an `Empty` state when zero student views, a `Skeleton` while loading, and an error toast on failure.
   - Place the panel inside the teacher's material-detail / lesson-builder UI where it already had a slot (or add it under `LessonEditorPage`'s material card if there isn't one).

4. **Tests.**
   - `server/tests/integration/materials.engagement.test.ts` — owner allowed, non-teacher 403, empty data returns zeros not 404.

**Risk.** LOW (additive, behind admin-or-teacher auth).

---

### 6.8 [LOW] Accessibility quick wins

For Sonnet to scan and fix (cheap, no behavior change):

- Icon-only buttons missing `aria-label` (Header.tsx, Sidebar.tsx, TeacherHeader.tsx, NotificationsPopover.tsx).
- `<img>` without `alt` (search the components folder).
- Color-only status indicators in grade tables — add a sr-only span with the label.

**Risk.** Zero.

---

### 6.9 [LOW] Heavy components — track, don't refactor

Files > 30KB are candidates for code-split but **leave untouched in this PR**:

- `LessonEditorPage.tsx` (79KB)
- `AssignmentDetailDialog.tsx` (57KB)
- `LandingPage.tsx` (58KB)
- `TeacherAssignmentDetail.tsx` (70KB)
- `ProctoredExamDialog.tsx` (63KB)
- `ClassDetail.tsx` (36KB)
- `SettingsPage.tsx` (38KB)
- `TeacherClassesSection.tsx` (30KB)
- `LessonViewsPanel.tsx` + `AnnouncementCommentsPanel.tsx` and other panels — fine

**Backlog item:** Split each heavy dialog into a top-level shell + 2–3 lazy-loaded tabs. Memoize tab bodies. Out of scope here.

---

### 6.10 [LOW] Forms — `react-hook-form` audit

For each `<form>` in the codebase, confirm:
- Resolver (`zodResolver(schema)`) is wired
- `onSubmit` returns a promise and disables the submit button while pending
- Field-level validation messages render in a `<FormMessage />`

Likely problem spots (size > 5KB form-bearing components):
- `EditClassDialog.tsx` (20KB)
- `TeacherCreateClassDialog.tsx` (20KB)
- `InviteStudentDialog.tsx` (9KB)
- `BulkImportStudentsModal.tsx` (12KB)
- `CreateStudentModal.tsx` (10KB)

**Risk.** LOW. Document any missing validation, add minimal fixes.

---

## 6.bis Critical-pages deep audit — concrete bug list

This section is the per-file output of the deep audit. Each item is small, targeted, and LOW-MEDIUM risk. Sonnet should triage by file and apply only the items marked **FIX** in this PR. Items marked **NOTE** are documented but deferred to backlog.

### 6.bis.1 `client/src/pages/LessonDetailPage.tsx`

| Item | Line | Severity | Action |
|---|---|---|---|
| `useAssignment(selectedAssignmentId ?? '')` fires with empty string on mount → unnecessary API call | ~399 | MEDIUM | **FIX**: pass `{ enabled: !!selectedAssignmentId }` to the underlying React Query call, or wrap with `useMemo(() => selectedAssignmentId, [selectedAssignmentId])` and gate the hook. |
| Hardcoded `2000` ms download cooldown × 2 sites | ~248, ~260 | LOW | **FIX**: extract `const DOWNLOAD_COOLDOWN_MS = 2000` at top of file. |
| `nextLesson!.id` non-null assertion in mobile bottom bar | ~736 | LOW | **FIX**: replace with `nextLesson && <Button …>` guard. |
| Modal close doesn't check for unsaved exam answers | ~770–773 | MEDIUM | **NOTE** — handled in `ProctoredExamDialog` itself; closing parent dialog should already cascade. Verify only. |
| `MaterialRow` / `AssessmentRow` not memoized | ~600, ~665 | LOW | **NOTE** — backlog. Only do if profile shows wasted renders. |

### 6.bis.2 `client/src/pages/MaterialReaderPage.tsx`

| Item | Line | Severity | Action |
|---|---|---|---|
| Scroll tracking calls server on every page flip — no debounce | ~332–336 | MEDIUM | **FIX**: debounce 300–500 ms before posting. Pattern: `useDebouncedCallback`. |
| PDF render re-runs on every zoom slider tick (no debounce) | ~322 | MEDIUM | **FIX**: debounce 150 ms on zoom changes. |
| Material metadata fetched with raw service call, no React Query | ~175 | MEDIUM | **NOTE** — refactor to `useMaterial(materialId)` hook. Defer unless trivial. |
| `handle.destroy()` cleanup not error-wrapped | ~219–220 | LOW | **FIX**: `await handle.destroy().catch(() => {})`. |
| Hardcoded `ZOOM_MIN/MAX/STEP` magic | ~142–144 | LOW | **FIX**: already named — but move out of component body to module scope. |
| Pages array length 0 silently allowed | ~250–251 | LOW | **FIX**: `if (!pages.length) throw new Error('Empty document');` |

### 6.bis.3 `client/src/pages/ClassDetail.tsx`

| Item | Line | Severity | Action |
|---|---|---|---|
| `assignmentGrades` Map rebuilt every render | ~184–198 | MEDIUM | **FIX**: wrap in `useMemo([grades])`. |
| `useEffect` on `availableTopics` may incorrectly reset filter to 'all' if assignments arrive late | ~157–161 | MEDIUM | **FIX**: only reset when `assignments.length > 0 && !availableTopics.includes(filter)`. |
| Search-param effect sets `selectedAssignment` even when same ID | ~169–182 | LOW | **FIX**: add equality guard. |
| `cls.id.slice(0,8)` may show truncated UUID; this is the class join-code | ~304–305 | LOW | **FIX**: if cls.id < 8 chars, render full id or "INVALID". |
| Avatar fallback fails silently if first/last name missing | ~509–511 | LOW | **FIX**: defensive `(name || 'User').split(' ')`. |
| `examAssignment` orphaned when assignment-detail dialog closes mid-exam-start | ~801–813 | MEDIUM | **FIX**: when closing assignment-detail, also `setExamAssignment(null)`. |

### 6.bis.4 `client/src/pages/SettingsPage.tsx`

| Item | Line | Severity | Action |
|---|---|---|---|
| Dual localStorage + API load → last-write-wins race | ~152–207 | MEDIUM | **FIX**: skip localStorage hydration once API responds; or only hydrate if API has not returned in 200 ms. |
| `accountNameDrafts` state causes full re-render on every keystroke across all linked-account inputs | ~127–131 | MEDIUM | **NOTE** — backlog. Proper fix is a `<LinkedAccountRow>` child with its own draft state. |
| Hardcoded `5 * 1024 * 1024` avatar max | ~333 | LOW | **FIX**: extract `const MAX_AVATAR_BYTES = 5 * 1024 * 1024`. |
| Profile save + notification settings save not transactional — partial failure leaves inconsistent state | ~377–396 | MEDIUM | **FIX**: on notification-settings failure, surface a "Profile saved, but notification preferences failed" toast with a retry button. |
| Password requirements `useMemo` on every keystroke | ~301–311 | LOW | **NOTE** — pure functions are fine; not a bug. |

### 6.bis.5 `client/src/pages/TeacherSettingsPage.tsx`

Already covered in §6.1 (apiClient migration). All sub-items from §6.bis.4 apply analogously — apply the same fixes.

### 6.bis.6 `client/src/pages/LandingPage.tsx`

| Item | Line | Severity | Action |
|---|---|---|---|
| Bug-report email format not validated | ~252–259 | LOW | **FIX**: add zod schema `email: z.string().email()`, surface inline error. |
| Bug-report form resets even on error | ~237–248, ~291 | LOW | **FIX**: only reset on success path. |
| Device gallery `useMemo` with `[]` deps → stale on prop change | ~977–984 | LOW | **FIX**: include `mode` in deps if `mode` is a real prop here. |
| Bug-report error narrowing assumes `err.response` exists | ~280, ~292–304 | LOW | **FIX**: `axios.isAxiosError(err) ? err.response?.data?.error?.message : 'Network error'`. |
| Carousel `5000` ms hardcoded | ~1004 | LOW | **FIX**: extract `const CAROUSEL_INTERVAL_MS`. |

### 6.bis.7 `client/src/pages/GradesPage.tsx`

| Item | Line | Severity | Action |
|---|---|---|---|
| N+1: `useWeightedCourseGrade(cls.id)` called per class in a map | ~34, ~269–314 | **HIGH (perf)** | **FIX**: add a batch endpoint `GET /api/grades/weighted/batch?classIds=…` and a single `useWeightedCourseGrades(classIds[])` hook. OR keep per-class but ensure each call's query key is stable so dedupe works. Default for this PR: keep per-class but verify `enabled: !!cls.id` and that `staleTime` is at least 60s. |
| Filename regex `/[^a-z0-9-_]+/gi` — `gi` redundant since regex literal already has flags | ~193 | LOW | **FIX**: cosmetic — leave as is (`gi` works). |
| `URL.revokeObjectURL` not called on error / rapid double-click | ~290–291 | LOW | **FIX**: revoke in a `finally`. |
| Error messages leak raw `error.message` | ~193, ~200 | LOW | **FIX**: replace with a user-friendly fallback. |

### 6.bis.8 `client/src/pages/Dashboard.tsx`

| Item | Line | Severity | Action |
|---|---|---|---|
| Rapid archive/restore race possible | ~108–187 | LOW | **FIX**: disable action buttons while mutations in-flight. Use mutation's `isPending`. |
| `void refetch()` swallows errors | ~187 | LOW | **FIX**: `await refetch().catch((e) => toast(...))`. |
| `ClassCard` not memoized | ~247–257 | LOW | **NOTE** — backlog. |

### 6.bis.9 `client/src/components/AssignmentDetailDialog.tsx`

| Item | Line | Severity | Action |
|---|---|---|---|
| `Promise.all` for submission + exam attempt — exam failure cancels submission load | ~302–305 | **MEDIUM** | **FIX**: change to `Promise.allSettled`. Update consumers. |
| `loadSubmission` memo missing `assignment?.rawType` dep | ~290–346 | MEDIUM | **FIX**: add to deps array. |
| `loadComments` no retry / empty-state distinction | ~349–374 | LOW | **FIX**: show "No comments yet" on empty success; show retry on error. |
| Submit can be double-clicked while mutation in flight | ~412–473 | LOW | **FIX**: `<Button disabled={mutation.isPending}>`. |
| Avatar initials fail on empty name | ~279 | LOW | **FIX**: `(firstName || '?')[0]`. |
| Hardcoded `10s` `gapi.load` timeout | ~188 | LOW | **FIX**: extract constant. |

### 6.bis.10 `client/src/components/TeacherAssignmentDetail.tsx`

| Item | Line | Severity | Action |
|---|---|---|---|
| Submissions normalized & avatar-extracted inline on every render | ~413–450 | MEDIUM | **FIX**: wrap in `useMemo([rawSubmissions])`. |
| Violations grouped inline on every render | ~391–395 | MEDIUM | **FIX**: `useMemo`. |
| Grade save flow can leave status `under_review` if grade create fails | ~627–719 | **HIGH (data)** | **FIX**: on grade-create failure, roll back the status transition. Or set status only after grade create succeeds. |
| Violations fetch hardcoded `limit: 500` — silent truncation | ~375 | MEDIUM | **FIX**: paginate or fetch until exhausted. For now, show a "showing first 500" notice. |
| `editedTopics` 10-item cap only enforced post-typing | ~1232, ~1242 | LOW | **FIX**: disable "Add topic" button at 10. |
| Grade display "85//100" parsing bug if grade string already has slash | ~1498–1500 | LOW | **FIX**: regex-strip existing denominator before composing. |
| 10-topic max and 160 px DevTools threshold and 200 ms search-debounce — magic numbers | various | LOW | **FIX**: extract into a `client/src/lib/constants.ts`. |

### 6.bis.11 `client/src/components/ProctoredExamDialog.tsx`

| Item | Line | Severity | Action |
|---|---|---|---|
| `reportViolation` memo deps include `session` object — re-created every render | ~167–226 | MEDIUM | **FIX**: depend on `session?.id` and `session?.attemptId`, not the whole object. |
| `timeoutSubmitInFlightRef` left true on submit failure → exam never auto-submits | ~382–412 | **HIGH** | **FIX**: wrap `submitAttempt('timeout')` in `try/finally` that resets the ref. |
| Submit double-click possible during slow network | ~745 | MEDIUM | **FIX**: disable submit button on `submitting === true`. |
| `document.exitFullscreen()` may throw on auto-submit | ~204–206 | LOW | **FIX**: wrap in `try/catch`. |
| Optimistic answer state diverges on mutation failure | ~253–284 | MEDIUM | **FIX**: on `onError`, revert local state to last server-confirmed value. |
| Pending text-answer save failure silently swallowed | ~316–379 | MEDIUM | **FIX**: track failures, block final submit with "X answers failed to save — retry?" |
| Hardcoded 160 px DevTools threshold, 800 ms visibility debounce, 1400 ms violation throttle | ~24, ~432, ~519 | LOW | **FIX**: constants. |

### 6.bis.12 `client/src/components/TeacherClassesSection.tsx`

| Item | Line | Severity | Action |
|---|---|---|---|
| `sortClassItems` recomputed for both active + archived from same `classes` array | ~85–125 | LOW | **FIX**: `useMemo` once over the sorted full list, then partition. |
| Confirm dialog stays open on action failure | ~156–181 | LOW | **FIX**: close dialog only on success; show inline error on failure. |
| `sortBy` type coercion without validation | ~303 | LOW | **FIX**: switch with default fallback. |

### 6.bis.13 `client/src/components/Header.tsx`

| Item | Line | Severity | Action |
|---|---|---|---|
| 200 ms search debounce fires `applySearchQuery` on possibly-unmounted component | ~87–92 | LOW | **FIX**: clear timeout in cleanup. |
| Logout error not caught | ~96 | LOW | **FIX**: `try/catch`, log to Sentry. |
| Search-clear leaves stale `?q=` in URL | ~75 | LOW | **FIX**: when `nextValue === ''` and on search route, replace URL without `q`. |

### 6.bis.14 `client/src/hooks/useTeacherData.ts` (from frontend overview audit)

| Item | Line | Severity | Action |
|---|---|---|---|
| Aggregation hook silently logs failures via `console.error`; UI shows no degraded state | many (45, 88, 131, 174, 238, 249…) | MEDIUM | **FIX (preferred)**: refactor to compose individual React Query hooks (each owns its own loading/error). **FIX (minimum)**: surface a non-fatal toast on first failure of each section. |

---

## 7. UI / UX consistency pass

Pure styling and consistency. All LOW risk.

### 7.1 Button variants

Grep for `<Button variant="`. Audit that:
- Destructive actions use `variant="destructive"`
- Cancel uses `variant="ghost"` or `variant="outline"`
- Primary uses default (no variant)

Fix any drift. No layout changes.

### 7.2 Dialog footers

The previous review (§1.4 of `CODEBASE_REVIEW_2026-05-09.md`) flagged `AlertDialogCancel/Action` siblings without `AlertDialogFooter` in `ClassCard.tsx:184–203`. Verify whether that was fixed; if not, fix it. Then grep for the same pattern across all dialogs.

### 7.3 Toast verbosity

Some flows show one toast per affected row (bulk grade, bulk invite). Replace with one summary toast: "Graded 12 submissions (2 failed)". Reference: existing patterns in `services/batch.service.ts` consumers.

### 7.4 Mobile layout duplication

`ClassCard.tsx:77–175` renders two trees (mobile + desktop). Backlog only — do not refactor in this PR.

---

## 8. Performance pass — what's safe to ship

Slight perf wins that meet the "non-breaking" bar:

1. **Composite indexes** on `submissions` (§4.1). Estimated 5–10× speedup for student grade view.
2. **React Query key audit** (§6.5). Eliminates duplicate fetches when invalidations miss.
3. **Memoize heavy list rows.** Wrap the row component inside `TeacherClassesSection`, `SubmissionsTab`, and `LessonListBoard` with `React.memo`. Verify props are stable refs (use `useMemo` where parents create them inline).
4. **Lazy-load icons.** `lucide-react` is tree-shaken already, but verify no `import * as Icons from 'lucide-react'` exists. Grep and fix.
5. **`useCallback` audit.** Don't sprinkle — only add to handlers passed to memoized children.

Anything bigger (route-level code splitting beyond what's already there, dialog tab splitting, virtualizing large lists) is **backlog**.

---

## 9. Testing & rollout strategy

### 9.1 Tests to add

- `server/tests/integration/enrollments.auth.test.ts` — covers §3.1.
- `server/tests/integration/search.validation.test.ts` — covers §3.4.
- `server/tests/integration/grades.query-validation.test.ts` — covers §3.5.
- `client/src/pages/__tests__/TeacherSettingsPage.test.tsx` — covers §6.1 (apiClient is called, not axios).

### 9.2 Manual QA checklist (run before merge)

- [ ] Student login → dashboard → join a class → submit an assignment → see grade.
- [ ] Teacher login → create class → invite student → grade a submission → bulk grade.
- [ ] Admin login → view pending teachers → approve one → view audit logs.
- [ ] Proctored exam start → trigger violation → submit → teacher sees violation.
- [ ] Cross-tab: open two tabs as same teacher, edit lesson in tab A, see update in tab B after refocus.
- [ ] Mobile viewport (375px): no horizontal scroll on any main page.

### 9.3 Rollout

1. Push branch, open PR with title `chore: full-stack audit fixes (no breaking changes)`.
2. Wait for CI green.
3. **DECISION NEEDED:** user approves merge.
4. Deploy to staging Vercel + render. Smoke-test §9.2.
5. Deploy to prod.
6. Run new migration `044_submissions_composite_indexes.sql` separately, **CONCURRENTLY** — see §10.4 for runner caveats.

### 9.4 Rollback plan

- The PR is one merge commit on `main`. Reverting it reverts everything.
- The index migration is reversible by `DROP INDEX IF EXISTS …` — but indexes don't *break* anything if they're left in place during a code revert. Safe asymmetry: code can revert without rolling the index back.

---

## 10. Decisions recorded (2026-05-15)

The user made the following decisions on the items that were originally paused:

| # | Item | Decision |
|---|---|---|
| 10.1 | `TIMESTAMP` → `TIMESTAMPTZ` migration | **DEFERRED to a separately scheduled deployment.** Not in this PR. Keep frontend band-aid. |
| 10.2 | Replace cascade delete with soft delete | **APPROVED.** Ship in this PR. |
| 10.3 | Consolidate `supabase/migrations` into `server/migrations` | **PAUSED.** Not addressed in this PR (no decision yet). |
| 10.4 | Index migration via `psql` (Option B) | **APPROVED.** Apply 044 manually after merge; mark applied in `schema_migrations`. |
| 10.5 | `CoursesPage` / `StudentDashboard` / `/archived` | **DELETE the two dead re-export files. BUILD OUT the student `/archived` view** mirroring `/teacher/archived`. |
| 10.6 | (covered by 10.5) | — |
| 10.7 | `MaterialEngagementPanel` data wiring | **APPROVED.** Ship a new `GET /api/materials/:id/engagement` endpoint and wire the panel. |
| 10.8 | Heavy-component code splitting | **DEFERRED.** Backlog, separate PRs per page. |

Sections below reflect those decisions. The original "paused" wording has been moved into a follow-up backlog at §10.bis.

### 10.bis Items still paused (require user input later)

- **10.1 `TIMESTAMPTZ` migration** — needs a scheduled maintenance window and a Supabase snapshot. Worth doing in a future quiet weekend.
- **10.3 Migration directory consolidation** — needs idempotency verification in staging before merging.
- **10.4-followup Migration runner directive** — `-- migrate:no-transaction` support in `server/src/services/migration.ts` so future `CONCURRENTLY` indexes don't need manual `psql` application. Backlog.
- **10.8 Heavy-component refactors** — `LessonEditorPage`, `AssignmentDetailDialog`, `TeacherAssignmentDetail`, `ProctoredExamDialog`. Each is its own focused PR.

---

## 11. Out-of-scope (do not touch)

- Auth-token shape, JWT TTLs, refresh-token flow — production-critical.
- WebSocket / Socket.io message contracts.
- Anything in `server/src/services/email.ts`, `services/google-oauth.ts`, `services/google-drive.ts` beyond cosmetic.
- `server/src/services/migration.ts` (apart from the directive in §10.4).
- The Supabase row-level security policies. RLS is currently 100% covered; tampering risks lockout.
- Push notification VAPID keys.

---

## 12. Final commit & PR template

### Commit suggestions (one per logical batch — apply in this order)

```
# 1. Plan + bookkeeping
docs: full-stack audit and remediation plan
chore(server): add down migrations for 037/040/041

# 2. CRITICAL security
fix(server): require ownership check on enrollment mutation routes
test(server): cover enrollment authorization regressions

# 3. Soft-delete (data-integrity)
feat(db): add profiles.deleted_at for soft-delete
feat(server): soft-delete users by default; explicit hard-delete with typed confirmation
test(server): cover soft-delete, restore, hard-delete flows
feat(client): typed-confirmation dialog for admin hard-delete + restore action

# 4. Material engagement feature wiring
feat(server): GET /api/materials/:id/engagement aggregate endpoint
test(server): material engagement authorization + zero-data shape
feat(client): wire MaterialEngagementPanel to new endpoint via React Query

# 5. Student archived view
feat(client): student ArchivedPage mirroring TeacherArchivedPage
chore(client): delete unused CoursesPage and StudentDashboard re-exports

# 6. Server validation tightening
fix(server): validate global search query parameters
fix(server): validate grades student_id query parameter

# 7. Perf
perf(db): composite indexes on submissions (CONCURRENTLY — applied manually)

# 8. Client correctness — page-by-page from §6.bis
fix(client): route TeacherSettingsPage through apiClient
fix(client): gate useAssignment on selectedAssignmentId in LessonDetailPage
fix(client): debounce scroll & zoom tracking in MaterialReaderPage
fix(client): memoize assignmentGrades, submissions, violations on heavy pages
fix(client): use Promise.allSettled for submission + exam fetch in AssignmentDetailDialog
fix(client): rollback grade-save status transition on grade-create failure
fix(client): reset timeoutSubmitInFlightRef on submit failure in ProctoredExamDialog
fix(client): clear examAssignment state when closing parent assignment dialog
fix(client): disable double-submit on assignment + exam submit buttons
fix(client): close confirm dialog only on success in TeacherClassesSection
fix(client): bug-report form — email validation + only-reset-on-success

# 9. Polish
chore(client): extract magic numbers to lib/constants.ts
chore(client): aria-label icon-only buttons across Header/Sidebar/TeacherHeader
chore(client): align React Query keys for lessons
chore(client): clear stale ?q= URL on search clear
chore(client): vite dev-server open path "/"
```

### PR template

```
## Summary
- Fixed missing authorization on enrollment routes (CRITICAL)
- Added composite indexes on submissions (~5–10× speedup for student grade view)
- Validated previously-loose query params on search and grades
- Routed TeacherSettingsPage through the central apiClient
- Cosmetic / accessibility pass
- Documented HIGH-risk items as paused decisions (see docs/FULL_STACK_AUDIT_AND_REMEDIATION_PLAN.md §10)

## Risk
LOW–MEDIUM. No public API shape changed. No data migration. The index migration is `CONCURRENTLY` and must be applied via the runbook in §10.4.

## Test plan
- [ ] CI green
- [ ] Manual QA checklist (plan §9.2) on staging
- [ ] `EXPLAIN ANALYZE` on the two new queries shows index scan
- [ ] Login, join class, submit, grade — happy path on prod-mirror
```

---

## 13. Quick-reference: files Sonnet will touch

### Server
```
server/src/routes/enrollments.ts                    (§3.1 — authorize())
server/src/services/enrollments.ts                  (§3.1 — assertEnrollmentAccess)
server/src/routes/search.ts                         (§3.4 — zod query schema)
server/src/controllers/search.ts                    (§3.4 — use validated query)
server/src/routes/grades.ts                         (§3.5 — zod query schema)
server/src/controllers/grades.ts                    (§3.5 — typed studentId)
server/src/routes/materials.ts                      (§6.7 — engagement route)
server/src/controllers/materials.ts                 (§6.7 — engagement handler)
server/src/services/materials.ts                    (§6.7 — getEngagementAggregate)
server/src/services/admin.ts                        (§5.2 — softDeleteUser, hardDeleteUser, restoreUser)
server/src/services/auth.ts                         (§5.2 — reject login when deleted_at)
server/src/services/users.ts                        (§5.2 — filter deleted_at)
server/src/services/courses.ts                      (§5.2 — filter deleted_at on teacher joins)
server/src/services/classes.ts                      (§5.2 — filter deleted_at on roster)
server/src/services/notifications.ts                (§5.2 — filter recipients)
server/migrations/044_submissions_composite_indexes.sql   (NEW — §4.1, applied via psql)
server/migrations/045_profiles_soft_delete.sql            (NEW — §5.2)
server/migrations/037_lesson_centric_flow.sql             (append Down — §5.4)
server/migrations/040_lesson_views.sql                    (append Down — §5.4)
server/migrations/041_lesson_builder_enhancements.sql     (append Down — §5.4)
server/tests/integration/enrollments.auth.test.ts         (NEW)
server/tests/integration/search.validation.test.ts        (NEW)
server/tests/integration/grades.query-validation.test.ts  (NEW)
server/tests/integration/admin.soft-delete.test.ts        (NEW — §5.2)
server/tests/integration/admin.hard-delete.test.ts        (NEW — §5.2)
server/tests/integration/materials.engagement.test.ts     (NEW — §6.7)
```

### Client — focused targeted edits (no big refactors)
```
client/src/lib/constants.ts                                (NEW — magic numbers)
client/src/App.tsx                                         (§6.3 — register ArchivedPage)
client/src/pages/ArchivedPage.tsx                          (NEW — §6.3, student archived view)
client/src/pages/CoursesPage.tsx                           (DELETE — §6.2)
client/src/pages/StudentDashboard.tsx                      (DELETE — §6.2)
client/src/pages/TeacherSettingsPage.tsx                   (§6.1 — apiClient)
client/src/pages/LessonDetailPage.tsx                      (§6.bis.1 — enabled flag, constants)
client/src/pages/MaterialReaderPage.tsx                    (§6.bis.2 — debounce zoom & scroll, destroy catch)
client/src/pages/ClassDetail.tsx                           (§6.bis.3 — memoize, examAssignment reset)
client/src/pages/SettingsPage.tsx                          (§6.bis.4 — partial-save toast, MAX_AVATAR_BYTES)
client/src/pages/LandingPage.tsx                           (§6.bis.6 — bug-report email + reset)
client/src/pages/GradesPage.tsx                            (§6.bis.7 — finally revoke, error msgs)
client/src/pages/Dashboard.tsx                             (§6.bis.8 — disable while pending)
client/src/pages/admin/StudentManagementPage.tsx           (§5.2 — typed confirmation + restore action)
client/src/pages/admin/PendingTeachersPage.tsx             (§5.2 — typed confirmation on reject-and-delete)
client/src/components/MaterialEngagementPanel.tsx          (§6.7 — wire to new hook, empty/loading states)
client/src/components/AssignmentDetailDialog.tsx           (§6.bis.9 — allSettled, dep fix, disable submit)
client/src/components/TeacherAssignmentDetail.tsx          (§6.bis.10 — memo, rollback, 500-cap notice)
client/src/components/ProctoredExamDialog.tsx              (§6.bis.11 — finally on ref, memo deps, try/catch)
client/src/components/TeacherClassesSection.tsx            (§6.bis.12 — one memo, close-on-success only)
client/src/components/Header.tsx                           (§6.bis.13 — cleanup timeout, logout try/catch, clear ?q=)
client/src/hooks/useTeacherData.ts                         (§6.bis.14 — surface failure toast)
client/src/hooks-api/useLessons.ts                         (§6.5 — query key normalization)
client/src/hooks-api/useMaterialEngagement.ts              (NEW — §6.7)
client/src/services/admin.service.ts                       (§5.2 — restoreUser, hardDeleteUser client methods)
client/src/services/materials.service.ts                   (§6.7 — getEngagement client method)

# Pure accessibility / aria-label sweep
client/src/components/Sidebar.tsx                          (§6.3 — add archived nav link + aria-label)
client/src/components/TeacherHeader.tsx
client/src/components/NotificationsPopover.tsx
client/src/components/ClassCard.tsx                        (verify AlertDialogFooter is wrapped)

# Dev-experience
client/vite.config.ts                                      (open path → "/")

# Tests
client/src/pages/__tests__/TeacherSettingsPage.test.tsx    (NEW)
client/src/pages/__tests__/ArchivedPage.test.tsx           (NEW — §6.3, empty / has-classes / restore)
client/src/components/__tests__/MaterialEngagementPanel.test.tsx (NEW — §6.7, loading / empty / data)
```

Files **NOT** touched in this PR (>30KB and out of scope unless explicitly approved):
- `LessonEditorPage.tsx` (79KB) — surgical edits only, no refactor
- `LandingPage.tsx` (58KB) — only bug-report form fix
- `AssignmentDetailDialog.tsx` (57KB) — only the listed bug fixes
- `TeacherAssignmentDetail.tsx` (70KB) — only the listed bug fixes
- `ProctoredExamDialog.tsx` (63KB) — only the listed bug fixes
- All admin pages — out of scope (already audited as fine)
- `assignment-builder/index.tsx` (56KB) — out of scope
- `teacher-class-stream/index.tsx` (54KB) — out of scope

---

## 14. Decisions log (2026-05-15)

| # | Question | User decision |
|---|---|---|
| 1 | Soft-delete users vs hard cascade | **Soft delete.** Ship in this PR. |
| 2 | `TIMESTAMP` → `TIMESTAMPTZ` migration | **Separate scheduled deployment.** Not in this PR. |
| 3 | `CoursesPage` / `StudentDashboard` / `/archived` | **Delete the two re-export files. Build out the student `/archived` view.** |
| 4 | `MaterialEngagementPanel` wiring | **Wire it up.** Ship in this PR. |
| 5 | Index migration application | **Option B — apply manually via `psql` after merge.** Don't change the runner. |

The Sonnet executor may proceed with everything marked APPROVED above without re-asking.

---

*End of plan.*
