# MabiniLMS — Performance & Bandwidth Optimization Plan

**Audience:** Claude Sonnet (executor).
**Author:** Claude Opus (planner).
**Date:** 2026-05-07.
**Branch:** branch off current `fix/teacher-dashboard-loading-due-cutoff`.

This plan describes **concrete, file-level changes** to materially reduce loading time and bandwidth consumption across the MabiniLMS stack (Vite/React client + Express/Supabase server). Each task is self-contained, includes acceptance criteria, and lists the **exact files** to edit. Work the phases in order — each phase builds on the previous one's invariants.

---

## How to use this document

1. **Each task has an ID** (e.g. `B1`, `F3`). Mark them off in commit messages: `perf(B1): cache auth profile`.
2. **Do NOT change feature behavior**. Every change is observably equivalent to today; only the wire bytes / round-trips / latency change.
3. **One commit per task** (or per tightly related cluster). Keeps PRs reviewable.
4. **After each phase:** run `npm run build` (root), `npm run lint --workspaces`, `npm test --workspaces`. Don't proceed until green.
5. **Don't break the optional-column compatibility shims** — courses.ts and assignments.ts retry without `tags`/`completion_policy`/etc. when migrations 033/032 haven't run. Keep that behavior.
6. **Don't introduce new dependencies** unless the task explicitly authorizes it. Brotli is already supported by Node 14+; React Query is already installed.

## Feature preservation guarantee

**Goal of this plan:** make the system faster and consume less bandwidth without changing what it does.

The audit below was performed before this plan was finalized. Every existing student and teacher feature was traced against every task; no current functionality is removed, hidden, or behaviorally altered. The two intentional UX deltas are listed at the bottom of this section — they are improvements aligned with the LMS pivot spec, not regressions.

### What this plan does NOT change (verified)

**Authentication & authorization:**
- Login flows (institutional student email, teacher with admin approval, Google OAuth, 2FA, account switch).
- Session timeout, password-change-forces-relogin, pending-teacher block, institutional-domain enforcement.
- Role-based route gating (student → `/dashboard`, teacher → `/teacher`, admin → `/admin`).
- Temporary-password banner UX (text, dismiss, link to settings).

**Course management:**
- Class list rendering on student dashboard, teacher dashboard, sidebar, archived view, search.
- Cover image, room, schedule, section/block/level, color, tags, teacher name on every class card.
- Create/archive/unarchive/unenroll flows.
- Class detail tabs (Lessons, Stream, People, Grades for students; Lessons, Stream, People, Submissions, Insights for teachers).
- Course metadata parsing (description + syllabus → derived fields).
- Optional-column compatibility shims (migrations 031, 032, 033, 037, 039, 040 may or may not be applied).

**Assignments & assessments:**
- Assignment list, filtering by topic, grading-period chips.
- Assignment detail dialog (full description, attachments, comments, submission status, due-date countdown).
- Quiz/exam proctoring rules (fullscreen, tab-switch, clipboard block, time limit, auto-submit, agreement).
- Assessment gating (required materials must be viewed before quiz/exam unlocks).
- Submission: text answer, URL, Google Drive attachment.
- Offline submission queue (30s polling, online-event flush, persistent local storage, conflict-handling).
- Grade computation (Mabini 4-period model, weighted categories, GP scale, remarks).
- Report card PDF export.

**Lessons:**
- Student lesson list with progress bar, locked/active/done states, topic filter.
- Lesson detail with material reader (PDF, DOCX, PPTX, image, video).
- Mark-as-done eligibility (every material opened + time-on-material rule).
- Lesson chain (next-lesson unlocks on submit / pass / done).
- Teacher lesson editor, reorder, chain-target select, draft/published toggle.
- Lesson view tracking, scroll progress, download tracking.

**Communication:**
- Class announcements (post, edit, pin, delete, comments).
- Class discussion stream (post, like, hide, delete).
- Notifications (popover, mark-read, mark-all-read, real-time WebSocket push, browser push).

**Admin:**
- Pending teacher approval, student management, audit logs, system settings, bug reports.

**Offline & PWA:**
- Service worker app-shell caching, hashed-asset stale-while-revalidate.
- Material offline cache (best-effort, opens cached when offline) — see UX delta in F5.
- Offline submission and progress queue replay.
- Add-to-homescreen, notification badge.

### Two intentional UX deltas (improvements, not regressions)

These are the only behavior changes. Both align with the LMS pivot spec.

1. **F5 — material offline precache becomes opt-in.** Today, opening a class silently downloads every material in the background. After F5, materials are cached only when the student actually opens them. **Why this is an improvement:** the LMS pivot spec calls for "pragmatic 50 MB ceiling for offline LM caching"; eager precache could exceed it on a class with many large PDFs. The recommended mitigation (an explicit "Save for offline" button on the lesson page) restores the opt-in equivalent of today's behavior. Existing cached materials remain available offline.

2. **F13 — WebSocket connects after first paint instead of on mount.** Today, the realtime notification socket connects immediately when the layout mounts. After F13, it waits ~1.5s (or until `requestIdleCallback`). **Why this is an improvement:** first paint is faster on slow connections; notifications are eventually-consistent (they also poll on focus + WebSocket-onopen catch-up), so the 1.5s delay is invisible. Existing offline submission queue (separate component) is NOT deferred — it stays on the original mount path.

### What this plan deliberately does NOT do

- No new dependencies (except possibly bumping `compression` for built-in Brotli).
- No schema migrations except B7 (index-only, all `IF NOT EXISTS`, fully reversible).
- No removal of any endpoint, hook, component, page, or feature toggle.
- No change to RLS policies, auth headers, or cookies.
- No change to URL structure or routing.
- No change to the data model (no column renames, no type changes).

### How to verify the guarantee after each phase

The smoke-test list in V2 (Phase 5) covers every feature listed above. Run it after each phase before merging. If any item fails, the change is wrong — revert and re-derive.

---

## Phase 0 — Baseline measurement (do this first, ~30 min)

### M1. Capture baseline metrics

**Why:** so you can prove improvements numerically and avoid regressions.

**What:**
1. Run `cd client && npm run build` and record:
   - Total `dist/assets/*.js` size (sum).
   - `dist/assets/*.css` size (sum).
   - Largest 5 chunks by name + size.
2. With the dev server running, in Chrome DevTools (Network tab, "Disable cache", throttling = "Fast 3G"):
   - Cold load `/login`. Record total transferred + finish time.
   - Cold load `/teacher` (after login, hard reload). Record total transferred + finish time + count of XHR requests.
   - Cold load `/class/<id>` for a class with ≥1 lesson, ≥1 assignment, ≥1 announcement. Record same.
3. Save as `PERF-BASELINE.md` (uncommitted, local only). You'll compare against it after each phase.

**Acceptance:** `PERF-BASELINE.md` exists with the 3 page measurements.

---

## Phase 1 — Backend hot-path wins (high impact, low risk)

These are surgical server-side fixes that reduce both bandwidth and per-request latency. Do them first because everything else builds on a faster API.

### B1. Cache auth profile lookup per-request (and across requests)

**Why:** [server/src/middleware/auth.ts](server/src/middleware/auth.ts) calls `supabaseAdmin.auth.getUser()` + `profiles` SELECT + `system_settings` SELECT + sometimes `two_factor_auth` SELECT + `session_logs` SELECT on **every authenticated request**. That's 3-5 DB round-trips per API call. Most of this data changes at most once per minute.

**What:**
1. Open [server/src/middleware/auth.ts](server/src/middleware/auth.ts).
2. Add a module-level LRU-style profile cache keyed by `userId`, with a 60s TTL:
   ```ts
   type CachedAuthProfile = { profile: AuthProfile; cachedAt: number };
   const PROFILE_CACHE_TTL_MS = 60_000;
   const profileCache = new Map<string, CachedAuthProfile>();
   const PROFILE_CACHE_MAX = 5_000;
   ```
3. Wrap `fetchAuthProfile` so the cache is consulted first; on miss, populate; evict oldest entries when size > `PROFILE_CACHE_MAX`.
4. Cache the `is_enabled` lookup from `two_factor_auth` for the same TTL when `profile.two_factor_enabled` is null/false (the slow path).
5. **Do not cache** `hasServerSessionProof()` — that one validates the actual JWT against `session_logs` and must run fresh per token. But you can short-circuit it: if the cached profile says `two_factor_enabled === false`, skip it entirely (already done — keep that branch).
6. Add an exported `invalidateAuthProfileCache(userId: string)` and call it from places where the profile changes:
   - [server/src/services/auth.ts](server/src/services/auth.ts) — after password change, role change, approval, signup completion.
   - [server/src/services/admin.ts](server/src/services/admin.ts) — after `approveTeacher`, `updateUserRole`, anything that mutates `profiles`.
   - [server/src/services/twoFactor.ts](server/src/services/twoFactor.ts) — after enable/disable.

**Files to edit:**
- [server/src/middleware/auth.ts](server/src/middleware/auth.ts)
- [server/src/services/auth.ts](server/src/services/auth.ts)
- [server/src/services/admin.ts](server/src/services/admin.ts)
- [server/src/services/twoFactor.ts](server/src/services/twoFactor.ts)
- [server/src/services/users.ts](server/src/services/users.ts) (search for `profiles.update` calls)

**Safety check:**
- **60-second stale window:** the cache TTL is 60s. If a teacher gets approved/role-changed/2FA-flag-changed between cache fills, the user could see stale auth state for up to 60s. The invalidation hooks at the mutation sites (admin.ts, twoFactor.ts, auth.ts) close most of this window — but if the mutation runs on a different server instance and the cache is in-memory per process, the other instances still serve stale until TTL expiry. **Mitigation: this LMS runs on a single Render dyno (no horizontal scaling), so in-memory cache is consistent.** If multi-instance is ever introduced, swap the in-memory Map for Redis (the existing `redisClient` in [server/src/middleware/rateLimiter.ts](server/src/middleware/rateLimiter.ts) is reusable).
- **Specific 2FA risk:** if a user enables 2FA, then has an existing-token request hit a stale cache for up to 60s, the `is_enabled === false` branch skips the `hasServerSessionProof` check. Net effect: a 60s window where the just-enabled-2FA user's existing pre-2FA session continues working. This is acceptable: the user just enabled 2FA voluntarily; the next session refresh forces them through the proper 2FA flow. **Verified by re-reading the auth.ts logic** — the two_factor_auth fast-path query is gated on `profile.two_factor_enabled === false`, so a true-cache profile correctly forces the deep check.
- **Profile bootstrap path:** [auth.ts](server/src/middleware/auth.ts) line 320 has a "backfill missing profile" branch. The cache MUST NOT cache a `null` profile that was just bootstrapped — the cache fill happens AFTER the bootstrap completes, returning the freshly inserted profile. Verified by tracing the order of operations in the existing code.
- **Sites that mutate `profiles` (audit complete — 5 sites total):**
  1. [admin.ts](server/src/services/admin.ts) line 366 (`updateManagedUser`)
  2. [admin.ts](server/src/services/admin.ts) — `approveTeacher`, `rejectTeacher`, `deleteManagedUser` (all touch the profile row).
  3. [auth.ts](server/src/services/auth.ts) line 1738 (password change → `password_changed_at`).
  4. [google-oauth.ts](server/src/services/google-oauth.ts) line 196 (`profiles.upsert` on Google sign-in).
  5. [users.ts](server/src/services/users.ts) `updateProfile` (avatar/name change).
  6. [auth.ts](server/src/middleware/auth.ts) line 343 (profile backfill upsert).
  7. [cli/create-admin.ts](server/src/cli/create-admin.ts) (admin script — manual, not request-time, no need to invalidate cache).

  **Each request-time site (1-6) must call `invalidateAuthProfileCache(userId)` after the mutation succeeds.** The CLI script (7) is run out-of-band by ops and the cache will naturally drain in <60s.

**Acceptance:**
- A user making 10 sequential authenticated GETs causes exactly **1** `profiles` SELECT in the server logs (verify by adding a temporary `logger.info('profiles.fetch')` in `fetchAuthProfile`, run the 10 requests, then remove the log).
- Logout + relogin clears the cache for that user.
- Approving a pending teacher allows them to sign in within the same 60s window (cache invalidated by `invalidateAuthProfileCache` in the approve flow).
- Existing tests in [server/tests/](server/tests/) still pass.

### B2. Stop using `SELECT *` on hot list endpoints

**Why:** courses, assignments, materials, profiles tables have wide rows (`description`, `syllabus`, `content`, `proctoring_policy` JSON, `category_weights` JSON, `completion_policy` JSON). Lists ship hundreds of KB of unused JSON to clients that only render `id, title, status, due_date`.

**What:**
1. **Courses list** — [server/src/services/courses.ts](server/src/services/courses.ts) line 54:
   - Replace `const COURSE_BASE_SELECT = '*';` with an explicit list: `'id, title, description, syllabus, section, room, schedule, cover_image, status, teacher_id, created_at, updated_at, tags, completion_policy, category_weights, enrolment_key'`.
   - **Why `description` and `syllabus` MUST stay in the list select:** [client/src/services/data-transformer.ts](client/src/services/data-transformer.ts) line 146-147 (`transformCourseToClassItem`) calls `parseCourseMetadataFromDescription(course.description)` and `parseCourseMetadataFromSyllabus(course.syllabus)` to derive `room`, `schedule`, `section`, `block`, `level`, `coverImage` for **every** card on the dashboard, sidebar, and class list. Dropping these would cause every class card to render as "Room TBA / Schedule TBA / Section A" — a real feature regression. Verified by reading the full transformer in this audit.
   - Keep the optional-column retry logic — when retry kicks in (because migration 033 isn't applied), drop `tags`, `completion_policy`, `category_weights`, `enrolment_key` from the select string in addition to the payload. Look at how `extractMissingCourseColumn` is used at line 66 and follow the same pattern.
   - **The savings come from `getCourseById` using a separate variant** — that endpoint already returns the full row but is called less often. There's no further savings to chase on the courses list shape itself; the win for courses comes from B3 (single join) and B4 (count aggregation), not B2.
   - **Net effect:** courses list size is roughly unchanged after B2 (it's already a thin enough table). The point of listing courses in B2 is just to switch from `'*'` to an explicit allowlist so future column additions don't accidentally bloat the list payload. Set the SELECT explicitly; don't expect a size win on courses.
2. **Assignments list** — [server/src/services/assignments.ts](server/src/services/assignments.ts) line 1139:
   - The current `select('*, course:courses(...)', ...)` ships every assignment field. The list view (used by [client/src/services/data-transformer.ts](client/src/services/data-transformer.ts) line 31) only needs: `id, course_id, title, description, due_date, max_points, assignment_type, grading_period, submissions_open, submission_open_at, submission_close_at, topics, attachments_count, status, submission_status`.
   - Build a constant `ASSIGNMENT_LIST_SELECT` and use it in `listAssignments`. Keep `'*'` only in `getAssignmentById`.
   - Make sure `description` is preserved in the list select — `transformAssignment` reads it.
3. **Materials list** — [server/src/services/courses.ts](server/src/services/courses.ts) `listMaterials`:
   - Find the function (search for `export const listMaterials`). Trim the select to: `id, course_id, title, description, type, file_type, file_size, file_url, page_count, uploaded_by, uploaded_at, created_at, download_count`. Drop `content` (which can be huge for embedded HTML/text material).
   - Keep `content` in `getMaterialById` (the reader page needs it).

**Files to edit:**
- [server/src/services/courses.ts](server/src/services/courses.ts)
- [server/src/services/assignments.ts](server/src/services/assignments.ts)

**Acceptance:**
- Run `curl -H "Authorization: Bearer <token>" http://localhost:3000/api/courses?limit=10 | wc -c` before and after; size should drop noticeably (target: ≥20% smaller for a teacher with a few courses, ≥40% for a course with long syllabus).
- Frontend pages that already use these endpoints render identically (manual smoke test: `/teacher`, `/dashboard`, `/class/<id>`).
- Optional-column retry still works on databases without migration 033 (smoke-test by simulating: git stash migration 033 only).

### B3. Replace N+1 teacher attach with a single join

**Why:** [server/src/services/courses.ts](server/src/services/courses.ts) line 623 (`attachTeachersToCourses`) does a follow-up `profiles.in('id', teacherIds)` query after the courses query. This adds a serial RTT to every list call. Postgres can do it in one shot.

**What:**
1. In [server/src/services/courses.ts](server/src/services/courses.ts), modify the `select` strings used by `getCourseById` and `listCourses` to include the embedded teacher join:
   ```ts
   const COURSE_BASE_SELECT_WITH_TEACHER =
     `${COURSE_BASE_SELECT}, teacher:profiles!courses_teacher_id_fkey(id, email, first_name, last_name)`;
   ```
2. Use `COURSE_BASE_SELECT_WITH_TEACHER` for reads. `attachTeachersToCourses` and `attachTeacherToCourse` become trivial pass-throughs (they normalize the `teacher` field which Supabase may return as `Teacher | Teacher[]`).
3. Keep the legacy fallback path: if the join causes an error (e.g. FK doesn't exist on a stale schema), retry once without it and fall back to the existing follow-up query.

**Files to edit:**
- [server/src/services/courses.ts](server/src/services/courses.ts)

**Acceptance:**
- `/api/courses` produces 1 SQL statement instead of 2 (verify with Supabase logs or add a temporary counter in the service).
- `course.teacher` shape on the wire is unchanged — frontend `transformCourseToClassItem` still works without modification.

### B4. Replace N+1 enrollment-count attach with a Postgres count

**Why:** [server/src/services/courses.ts](server/src/services/courses.ts) line 669 (`attachEnrollmentCountsToCourses`) fetches **every active enrollment row** for the visible courses to compute counts in JS. For a teacher with 5 classes × 30 students each, that's 150 rows of JSON when an integer-per-course is all we need.

**What:**
1. Replace the `enrollments.select('course_id, student_id')` with a per-course count using Postgres' RPC pattern. Two acceptable approaches:
   - **Preferred:** add a SQL view `course_active_enrollment_counts` (migration 041), then `select id, count from course_active_enrollment_counts where course_id in (...)`.
   - **Alternative (no migration):** Issue one `count: 'exact', head: true` query per course in `Promise.all`. With 5 courses, that's 5 fast HEAD queries vs. one large body. Indexed on `(course_id, status)` (B7 below adds that index), each takes <5ms.
2. Pick the alternative for now (no migration), but leave a TODO referencing the view.

**Files to edit:**
- [server/src/services/courses.ts](server/src/services/courses.ts)

**Acceptance:**
- `/api/courses?include_enrollment_count=true` returns the same `enrollment_count` field; bytes shipped from Supabase are bounded by `O(courses)` not `O(enrollments)`.

### B5. Switch `compression()` to Brotli when supported

**Why:** [server/src/index.ts](server/src/index.ts) line 188 uses the default `compression` middleware which only does gzip. Brotli yields 15-25% smaller JSON on average. The `compression` package supports it via the `brotli` option since v1.7+, but the cleanest path is to add a small middleware in front.

**What:**
1. Install `shrink-ray-current` is overkill — instead, add a lightweight branch in front of `compression`:
   ```ts
   import { brotliCompressSync, constants } from 'zlib';
   ```
2. Actually, simplest: replace the `compression` middleware with a wrapper that prefers Brotli when `Accept-Encoding` includes `br`, falls back to gzip otherwise. A clean implementation is ~30 lines using `zlib.createBrotliCompress` as a Transform stream.
3. **OR** add `compression: { brotli: { enabled: true, zlib: { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } } } }` if you bump `compression` to its latest version that supports it. Check `npm view compression version` first.
4. Keep `threshold: 1024` and the SSE/x-no-compression filter exactly as-is.
5. **Quality level matters:** Brotli quality 11 is too slow for hot-path API responses (>50ms compress time). Use quality 4 — produces output very close to gzip-9 size, costs <2ms.

**Files to edit:**
- [server/src/index.ts](server/src/index.ts)
- [server/package.json](server/package.json) if a version bump is needed.

**Acceptance:**
- Curl with `-H 'Accept-Encoding: br, gzip'` against `/api/courses` returns `Content-Encoding: br`.
- Curl with `-H 'Accept-Encoding: gzip'` still returns `gzip`.
- Response body size is smaller with Brotli (verify by curling both, comparing `Content-Length`).

### B6. Add HTTP caching headers to read-only endpoints

**Why:** browsers + service workers can skip identical requests entirely if the server returns `ETag` or `Cache-Control: max-age=N, must-revalidate`. Currently every GET is treated as fresh.

**What:**
1. Add a small middleware [server/src/middleware/httpCache.ts](server/src/middleware/httpCache.ts) that:
   - Computes a weak ETag from the response JSON (using `crypto.createHash('sha1').update(body).digest('base64')`, stable across servers).
   - Compares against `If-None-Match`. If matched, sends 304 with no body.
   - Sets `Cache-Control: private, max-age=0, must-revalidate` so the browser still revalidates on each navigation but a 304 ships ~80 bytes vs. 5 KB.
2. **Only apply to safe endpoints**:
   - `GET /api/courses`
   - `GET /api/courses/:id`
   - `GET /api/courses/:id/materials`
   - `GET /api/assignments`
   - `GET /api/courses/:courseId/announcements`
   - `GET /api/lessons/...` (read-only)
   - `GET /api/notifications/count`
   - `GET /api/grades/...`
   - **NOT** `/api/notifications` (mutates `last_read_at` on read paths in some flows — leave alone).
3. Mount the middleware ONLY on those route paths, after `requestLogger` but before route handlers. Keep responses identical when `If-None-Match` doesn't match.

**Files to edit:**
- new file: [server/src/middleware/httpCache.ts](server/src/middleware/httpCache.ts)
- [server/src/index.ts](server/src/index.ts) — wire it on the right routes.
- [server/src/middleware/index.ts](server/src/middleware/index.ts) — export it.
- [client/src/services/api-client.ts](client/src/services/api-client.ts) — Axios already handles `If-None-Match` automatically when the server's previous response ETag is honored. **Verify**: in Network tab, second load of `/api/courses` should show 304.

**Acceptance:**
- Reload `/teacher` twice. The second load shows `Status: 304` for the courses request, with `Content-Length` near 0.
- Mutation endpoints (POST/PATCH/DELETE) are unaffected.

### B7. Add missing composite indexes

**Why:** queries that filter by `course_id` AND `status` (very common in this codebase — enrollments, assignments, submissions) currently use the single-column index on `course_id` and then filter `status` in memory. Composite indexes serve them in one btree lookup.

**What:**
1. Create new migration [server/migrations/041_perf_composite_indexes.sql](server/migrations/041_perf_composite_indexes.sql):
   ```sql
   -- Enrollment queries are always filtered by course AND status
   CREATE INDEX IF NOT EXISTS idx_enrollments_course_status
     ON public.enrollments(course_id, status);

   -- Student dashboard queries filter their own enrollments by status
   CREATE INDEX IF NOT EXISTS idx_enrollments_student_status
     ON public.enrollments(student_id, status);

   -- Assignment list filtered by course + sorted by due_date
   CREATE INDEX IF NOT EXISTS idx_assignments_course_due
     ON public.assignments(course_id, due_date NULLS LAST);

   -- Submissions filtered by assignment + status (teacher grading view)
   CREATE INDEX IF NOT EXISTS idx_submissions_assignment_status
     ON public.submissions(assignment_id, status);

   -- Material progress lookups for a course's students
   CREATE INDEX IF NOT EXISTS idx_material_progress_course_user
     ON public.material_progress(course_id, user_id);

   -- Lesson progress lookups
   CREATE INDEX IF NOT EXISTS idx_lesson_progress_student_lesson
     ON public.lesson_progress(student_id, lesson_id);

   -- Notifications for a user, ordered by created_at
   CREATE INDEX IF NOT EXISTS idx_notifications_user_created
     ON public.notifications(user_id, created_at DESC);
   ```
2. Read [server/migrations/README.md](server/migrations/README.md) before adding — match the existing migration style + comment header.
3. Test on a copy of prod data (or local dev DB seeded similarly): `EXPLAIN ANALYZE SELECT ... FROM enrollments WHERE course_id = $1 AND status IN (...)` — should now show `Index Scan using idx_enrollments_course_status`.

**Files to edit:**
- new file: [server/migrations/041_perf_composite_indexes.sql](server/migrations/041_perf_composite_indexes.sql)

**Acceptance:**
- `npm run db:migrate:status` shows the new migration as pending then applied.
- `EXPLAIN ANALYZE` on the targeted queries uses the new indexes (no seq scans).

---

## Phase 2 — Eliminate client-side N+1 fetch storms

### F1. New backend endpoint: `/api/courses/:id/dashboard` (single-call class view)

**Why:** [client/src/pages/ClassDetail.tsx](client/src/pages/ClassDetail.tsx) issues **8 parallel queries** on mount: class, assignments, announcements, materials, students, grades, weighted-grade, discussion-posts. Each pays the auth-middleware tax (now reduced by B1 but still real). One aggregated endpoint cuts that to 1 round-trip and lets the server do the joins efficiently.

**What:**
1. Add controller [server/src/controllers/courses.ts](server/src/controllers/courses.ts) function `getCourseDashboard`.
2. Add route in [server/src/routes/courses.ts](server/src/routes/courses.ts): `GET /:id/dashboard` (authenticated).
3. Implement in [server/src/services/courses.ts](server/src/services/courses.ts) `getCourseDashboard(courseId, userId, userRole)`:
   ```ts
   // Run all reads in parallel — they're independent.
   const [course, assignments, announcements, materials, students, grades, weightedGrade, discussionPostCount] =
     await Promise.all([
       getCourseById(courseId, false, userId, userRole),
       listAssignments({ course_id: courseId, limit: 100, offset: 0, include_past: 'true' }, userId, userRole),
       listAnnouncements(courseId, { limit: 50, offset: 0 }),
       listMaterials(courseId, userId, userRole),
       getCourseStudents(courseId, userId, userRole),
       userRole === UserRole.STUDENT
         ? gradesService.getMyGradesForCourse(userId, courseId)
         : Promise.resolve([]),
       userRole === UserRole.STUDENT
         ? gradesService.getWeightedCourseGrade(courseId, userId)
         : Promise.resolve(null),
       discussionsService.countPosts(courseId),
     ]);
   return { course, assignments, announcements, materials, students, grades, weighted_grade: weightedGrade, discussion_post_count: discussionPostCount };
   ```
4. **Important:** reuse the existing service functions, don't duplicate logic. They already enforce permission boundaries (student must be enrolled, etc.).
5. **Important:** the existing endpoints stay live and work. The aggregator is purely additive — old clients keep working.
6. Client side: in [client/src/hooks-api/useClasses.ts](client/src/hooks-api/useClasses.ts), add a `useClassDashboard(classId)` hook that calls the new endpoint, with React Query `staleTime: 60_000`. It returns the same shape as the union of the 8 individual queries.
7. In [client/src/pages/ClassDetail.tsx](client/src/pages/ClassDetail.tsx), replace the 8 individual `useX` calls with one `useClassDashboard(classId)`. Pass each slice into the existing rendering code as `data.assignments`, `data.announcements`, etc.
8. **Cache priming:** when the dashboard hook loads, write each slice into React Query cache under the keys the legacy hooks expect:
   ```ts
   queryClient.setQueryData(['assignments', classId], data.assignments);
   queryClient.setQueryData(['announcements', classId], data.announcements);
   // ... etc
   ```
   This way nested components like `AnnouncementCard` that still read from the legacy hooks get hits instead of misses.
9. **Update invalidation:** [client/src/lib/query-invalidation.ts](client/src/lib/query-invalidation.ts) `invalidateClassData` currently invalidates the 9 legacy keys. Add the new dashboard key to the invalidation list:
   ```ts
   queryClient.invalidateQueries({ queryKey: ['class-dashboard', classId] }),
   ```
   **This is critical.** Without it, after a teacher posts an announcement (or any mutation that calls `invalidateClassData`), the legacy hooks would refetch but `useClassDashboard` would still serve stale data. The class detail UI would appear inconsistent until a hard reload.
10. **Audit every `invalidateQueries` call site for the 9 legacy keys** to ensure the new dashboard key is also invalidated where appropriate. Search: `grep -rn "queryKey:\s*\['\(assignments\|announcements\|materials\|students\|my-grades\|course-grades\|weighted-course-grade\|discussion-posts\|class'\)" client/src/`. For each match outside of `query-invalidation.ts`, add the dashboard-key invalidation if the mutation affects class-detail content.

**Files to edit:**
- [server/src/services/courses.ts](server/src/services/courses.ts)
- [server/src/controllers/courses.ts](server/src/controllers/courses.ts)
- [server/src/routes/courses.ts](server/src/routes/courses.ts)
- [client/src/services/courses.service.ts](client/src/services/courses.service.ts) — add `getCourseDashboard`.
- [client/src/hooks-api/useClasses.ts](client/src/hooks-api/useClasses.ts) — add `useClassDashboard`.
- [client/src/pages/ClassDetail.tsx](client/src/pages/ClassDetail.tsx) — wire it.

**Acceptance:**
- Cold-load `/class/<id>` shows **1** XHR for class data (plus auth + lessons, which is a separate hook by design).
- All tabs (Lessons, Stream, People, Grades) render the same content as before.
- Mutations (post announcement, archive class, etc.) still invalidate properly — verify the existing `invalidateClassData` call sites.

### F2. Fix `useTeacherDashboard` N+1 fan-out

**Why:** [client/src/hooks/useTeacherData.ts](client/src/hooks/useTeacherData.ts) line 444-503 fetches courses, then loops 5 courses, then loops 3 assignments per course. That's ~16 sequential-ish requests for the dashboard.

**What:**
1. Add backend endpoint `GET /api/teachers/dashboard-summary` that returns:
   ```ts
   {
     courses: TeacherCourse[],
     totalStudents: number,
     recentSubmissions: SubmissionWithAssignment[],   // last 5
     upcomingDeadlines: TeacherAssignment[],          // next 7 days, up to 5
     needsGradingCount: number,
   }
   ```
2. Implement in [server/src/services/teacher-engagement.ts](server/src/services/teacher-engagement.ts) (the file exists and already has the right utility scope) or in a new `dashboard.ts` if the engagement file feels off-topic.
   - Use `IN` clauses across all assignments in one query, all submissions in one query, etc.
   - Don't `SELECT *` — the dashboard only needs `submissions: id, assignment_id, student_id, submitted_at, status, student.first_name, student.last_name, student.email, student.avatar_url, grade.id, grade.points_earned`.
3. Mount route in [server/src/routes/index.ts](server/src/routes/index.ts) (add a `teacherRoutes` if you want to keep URLs clean — `/api/teacher/dashboard-summary`). Or add it under `/api/courses/dashboard-summary` (teacher-only, no path param) for fewer route files. Pick one and stay consistent.
4. Client: replace the body of `useTeacherDashboard` ([client/src/hooks/useTeacherData.ts](client/src/hooks/useTeacherData.ts) line 434) to call the new endpoint. Keep the `TeacherDashboardData` shape so the consuming component (TeacherDashboard.tsx) doesn't change.

**Files to edit:**
- new endpoint in [server/src/controllers/](server/src/controllers/) and [server/src/routes/](server/src/routes/).
- new service code in [server/src/services/teacher-engagement.ts](server/src/services/teacher-engagement.ts) or [server/src/services/dashboard.ts](server/src/services/dashboard.ts).
- [client/src/hooks/useTeacherData.ts](client/src/hooks/useTeacherData.ts) — `useTeacherDashboard`.
- [client/src/services/teacher.service.ts](client/src/services/teacher.service.ts) — add `getDashboardSummary`.

**Acceptance:**
- Cold-load `/teacher` shows 1 dashboard XHR instead of ~16.
- Stat tiles show the same numbers as before.
- "Recent submissions" and "Upcoming deadlines" lists are byte-identical.

### F3. Kill the implicit fan-out in `useAssignments()` (no courseId)

**Why:** [client/src/hooks-api/useAssignments.ts](client/src/hooks-api/useAssignments.ts) line 14 — when called with no `courseId`, it fetches all courses then loops `getAssignments(course.id)` per course. Triggered from [client/src/pages/Dashboard.tsx](client/src/pages/Dashboard.tsx) line 35 (`useAssignments()`) on every student dashboard load.

**What:**
1. Backend already supports `GET /api/assignments` without `course_id` (see [server/src/services/assignments.ts](server/src/services/assignments.ts) line 1132 — it auto-scopes to enrolled courses for students). **Use it.**
2. In [client/src/hooks-api/useAssignments.ts](client/src/hooks-api/useAssignments.ts), replace the no-courseId branch with a single call:
   ```ts
   if (!courseId) {
     const response = await assignmentsService.getAllAssignments(); // calls /assignments?include_past=false&limit=200
     return transformAssignments(response.data?.assignments || []);
   }
   ```
3. Add `getAllAssignments()` to [client/src/services/assignments.service.ts](client/src/services/assignments.service.ts) if it doesn't already exist.
4. Verify the backend `listAssignments` returns assignments scoped to the requesting student. It does (line 1153-1166), so this is just a wiring fix.

**Files to edit:**
- [client/src/hooks-api/useAssignments.ts](client/src/hooks-api/useAssignments.ts)
- [client/src/services/assignments.service.ts](client/src/services/assignments.service.ts)

**Acceptance:**
- Dashboard load makes 1 `/api/assignments` request (not 1 + N).
- Same assignments appear in the UI.

### F4. Tune React Query global defaults

**Why:** [client/src/App.tsx](client/src/App.tsx) line 43 sets `refetchOnMount: 'always'`. That overrides `staleTime` and forces a refetch on every page visit. Combined with the SPA's heavy navigation pattern, this triples API calls.

**What:**
1. In [client/src/App.tsx](client/src/App.tsx), change `refetchOnMount: 'always'` → `refetchOnMount: true` (default). With `staleTime: 2 * 60 * 1000` already set, this means: refetch on mount only if data is stale. Fresh data is reused.
2. Bump default `staleTime` from 2 min → 5 min for read-mostly resources. Keep per-hook overrides where present (notifications, weighted grades = 60s).
3. Set `networkMode: 'offlineFirst'` so when the SW serves a cached material, queries don't retry against a non-existent network.
4. Verify the auth flow still works — the `enabled: !authLoading && isLoggedIn` gating already prevents premature fetches.

**Files to edit:**
- [client/src/App.tsx](client/src/App.tsx)

**Acceptance:**
- Navigating from `/dashboard` to `/upcoming` and back within 5 minutes does NOT refetch courses.
- After 5 minutes (staleTime), navigating refetches. Verify with `staleTime: 30 * 1000` temporarily and watching the Network tab.

### F5. Stop precaching every material URL on `useMaterials`

**Why:** [client/src/hooks-api/useMaterials.ts](client/src/hooks-api/useMaterials.ts) line 18 calls `precacheMaterialUrls` for every material in the response on every load. On a class with 30 PDFs, that's 30 background fetches the student didn't ask for. Real bandwidth waste on mobile data.

**Important UX delta — read before implementing:**

Today's behavior: opening a class triggers eager precache of every material URL. After this task, materials are cached only when the student actually opens them. This is a **deliberate change** that aligns with the LMS pivot spec's "pragmatic 50 MB ceiling for offline LM caching" — eager precache on a class with many large PDFs could already exceed that.

**Functional impact:**
- A student who opens a class while online and then loses connectivity **without opening any material** will not have offline material access in that class. Today, they would have (best-effort, subject to file size limits). This is a small offline-readiness regression for students who explicitly rely on the eager-precache behavior.
- A student who opens a material online — even briefly — keeps offline access to that specific material exactly as before.

**Mitigation (recommended but not blocking):** add an explicit "Save for offline" button in the lesson UI that the student can tap to bulk-precache a lesson's materials. This restores the opt-in equivalent of today's eager behavior without burning data for students who don't need offline access.

**What:**
1. Move precaching from "on materials list load" to "on material open". Specifically, in [client/src/components/MaterialPreviewDialog.tsx](client/src/components/MaterialPreviewDialog.tsx) and [client/src/pages/MaterialReaderPage.tsx](client/src/pages/MaterialReaderPage.tsx), call `precacheMaterialUrls([material.url])` once when the dialog/page opens.
2. Optionally add an "available offline" toggle in [client/src/components/lessons/](client/src/components/lessons/) for the lesson view that lets a student opt-in to whole-lesson precache. Don't block this task on it — just remove the eager precache for now.
3. Remove the precache call from [client/src/hooks-api/useMaterials.ts](client/src/hooks-api/useMaterials.ts).

**Files to edit:**
- [client/src/hooks-api/useMaterials.ts](client/src/hooks-api/useMaterials.ts)
- [client/src/components/MaterialPreviewDialog.tsx](client/src/components/MaterialPreviewDialog.tsx)
- [client/src/pages/MaterialReaderPage.tsx](client/src/pages/MaterialReaderPage.tsx)

**Safety check:**
- Once a student opens a material online, the SW caches it. Going offline + reopening still works — verified against [client/public/sw.js](client/public/sw.js) line 138 (`isMaterialRequest`) which checks the registered URLs set, populated when the material is opened.
- Already-cached materials from previous sessions remain cached — F5 only changes future behavior, not the existing material cache. No purge.
- Previously-registered URLs in the persistent material cache still serve offline. Students who already have materials cached from prior sessions are unaffected.

**Acceptance:**
- Open `/class/<id>` with 5+ materials. Network tab shows only the materials.json XHR, no 5 background asset fetches.
- Open one material — that material is then registered with the SW (verify via DevTools → Application → Cache Storage → `mabini-materials-v1`).
- Open a material once online; go offline; close and reopen the dialog/page — the material loads from SW cache.

### F6. Collapse `loadUserData` from 3 calls to 1

**Why:** [client/src/contexts/AuthContext.tsx](client/src/contexts/AuthContext.tsx) line 372 fires `Promise.all([supabase.auth.getUser(), authService.getCurrentUser(), supabase.from('profiles').select(...)])`. That's 3 round-trips to bootstrap a user — and `authService.getCurrentUser()` hits our backend, which also hits Supabase + profiles internally.

**Caveat — verified before writing this task:** `authService.getCurrentUser()` calls `GET /api/users/me`, which is backed by `userService.getUserById()` in [server/src/services/users.ts](server/src/services/users.ts) line 80. That function currently selects `id, email, first_name, last_name, role, avatar_url, created_at, updated_at` — it **does NOT include `pending_approval` or `requires_google_student_setup`**. The current `loadUserData` reads `pending_approval` from the API response (line 434 of AuthContext) and uses it to block pending teachers from accessing the app. **If F6 lands without extending `getUserById`, teacher pending-approval blocking will silently break.**

**What:**
1. **Backend first:** in [server/src/services/users.ts](server/src/services/users.ts) `getUserById` (line 80) and `updateProfile` (line 102), extend the SELECT list to include `pending_approval`. Update the `UserProfile` type in [server/src/types/users.ts](server/src/types/users.ts) (or wherever it's defined).
2. Also surface `requires_google_student_setup`. This is currently derived inside `authService.getCurrentUser` (separate route — check [server/src/controllers/auth.ts](server/src/controllers/auth.ts) for the `getCurrentUser` handler vs `users.ts`). Pick whichever endpoint the client will call and ensure it returns: `{ id, email, role, first_name, last_name, avatar_url, pending_approval, requires_google_student_setup }`. **Do not** invent a new endpoint — extend the existing one.
3. **Client:** in [client/src/contexts/AuthContext.tsx](client/src/contexts/AuthContext.tsx) `loadUserData` (line 372):
   - Remove the `supabase.from('profiles').select(...)` direct call.
   - Remove the redundant `supabase.auth.getUser()` when `authUser` was already passed in (the SIGNED_IN handler at line 503 and the `login` flow at line 691 already pass it).
   - Keep the API call. Result: 1 backend call (which itself makes 0-1 DB calls thanks to B1's profile cache).
4. **Verify the institutional-domain enforcement still fires.** [AuthContext.tsx](client/src/contexts/AuthContext.tsx) line 330 (`enforceInstitutionalStudentPolicy`) reads `candidateUser.role` and `email` — the new payload supplies both, so this keeps working.
5. **Verify the teacher pending-approval block still fires.** Line 344 (`enforceTeacherApprovalPolicy`) reads `candidateUser.pending_approval` — must come through the API payload (step 1 above).

**Files to edit:**
- [server/src/services/users.ts](server/src/services/users.ts) — extend SELECT.
- [server/src/types/users.ts](server/src/types/users.ts) — extend `UserProfile`.
- [server/src/controllers/users.ts](server/src/controllers/users.ts) — verify the response shape.
- [server/src/controllers/auth.ts](server/src/controllers/auth.ts) — if `requires_google_student_setup` lives there instead, surface it consistently. Pick one endpoint as canonical.
- [client/src/contexts/AuthContext.tsx](client/src/contexts/AuthContext.tsx) — drop the redundant calls.

**Safety check:**
- **Teacher login (pending approval):** Create a fresh teacher account; do NOT approve it; attempt login. The expected behavior is `TEACHER_PENDING_APPROVAL_MESSAGE` shown and forced sign-out (line 350 of AuthContext). Verify this still happens.
- **Teacher login (approved):** Approve the teacher; log in; lands on `/teacher`. Verify.
- **Student login (institutional email):** standard flow, lands on `/dashboard`.
- **Student login (non-institutional email — should be impossible but check the guard):** verify `enforceInstitutionalStudentPolicy` still fires.
- **Google student setup:** if `requires_google_student_setup === true`, the user should be redirected to `/auth/google-student-setup`. AppLayout line 94 checks this.
- **Settings page avatar update** — [SettingsPage.tsx](client/src/pages/SettingsPage.tsx) likely calls `updateMyProfile` and re-fetches user data. Verify the new SELECT list returns the same shape on update too.

**Acceptance:**
- After login, the Network tab shows 1 `/api/users/me` request (not 1 backend + 1 direct Supabase).
- The user's name + avatar still render correctly for both students and teachers.
- Pending teacher accounts are still blocked at login.
- Google-student-setup flow still triggers the redirect for accounts that need it.

---

## Phase 2.5 — Student-side fan-out & micro-optimizations

These tasks target student-only flows: the student dashboard, GradesPage, UpcomingPage, CalendarPage, LessonDetailPage, and MaterialReaderPage. **Each task here was audited against the existing student feature surface** — the "Safety check" line on each one names specifically what was checked and why the change is observably equivalent. Do not skip the safety checks.

### Teacher-side blast radius for Phase 2.5

I audited each S-task against teacher-side code paths before writing this phase. Some of the "student" tasks touch shared code that teachers also use; here's the full audit summary so you don't have to re-derive it. **Read this before starting any S-task.**

| Task | Touches teacher code? | What I verified | What you must preserve |
|------|-----------------------|-----------------|------------------------|
| **S1** (grades batch) | YES — `useWeightedCourseGrade` is also called from [TeacherClassPeople.tsx:364](client/src/components/TeacherClassPeople.tsx) (per-student dialog). | The teacher hook signature `useWeightedCourseGrade(courseId, studentId, opts)` is on-demand, not N+1. | Add `useWeightedCourseGrades` (plural) as a NEW hook for GradesPage. **Do NOT replace or remove** the existing single-student hook. Cache priming uses key `'me'`, teacher uses `studentId` — different keys, no collision. |
| **S2** (password status cache) | YES — `passwordStatusService` is called from [SettingsPage.tsx:212](client/src/pages/SettingsPage.tsx), reachable by teachers. | Cache key is `['password-status', userId]`, per-user not per-role. Both teachers and students benefit. | Migrate SettingsPage's own `useEffect` fetch to the same `useQuery` cache key — don't create two separate cache keys. |
| **S3** (student home wrapper) | NO — purely additive new hook. | The wrapper sits on top of the existing `useClasses`/`useAssignments`. Teacher consumers of those hooks are untouched. | Don't import `useStudentHomeData` from teacher code. |
| **S4** (PDF audit) | INDIRECT — both teachers (registrar export) and students (report card) use jspdf. | The lazy-load pattern is identical for both; F7 already covered it. | If a teacher screen statically imports jspdf (audit catches it), convert to dynamic import. |
| **S5** (assignment summary fields) | NO if implemented as opt-in `?fields=summary` — full shape stays default. | Teacher screens (TeacherClassStream classwork, AssignmentBuilderPage) don't pass the param, so they keep full shape. | Make `fields` opt-in. Default behavior must be the existing full shape. |
| **S6** (quizMode pause) | YES — `useDiscussionPosts`, `useGrades`, `useWeightedCourseGrade` are also used in teacher screens (TeacherClassStream, TeacherClassPeople). | `quizMode` is set ONLY by `ProctoredExamDialog`, which is only mounted from student-facing flows. Teachers never trigger it; for them `quizMode` stays `false` permanently. | Default `quizMode = false`. Only flip true inside the student exam dialog. Never expose a teacher-callable setter. |
| **S7** (lesson list trim) | YES — same `loadLessonRowsForCourse` serves both `useStudentLessons` and `useTeacherLessons`. | `LessonListBoard` (teacher list) does NOT render `lesson.description`. `LessonEditorPage` uses the single-lesson loader (still `*`), so the editor still has description. | Verified by reading line-by-line. Trim is safe for both list endpoints; single-lesson endpoints stay `*`. |
| **S8** (memo cards) | YES — `ClassCard` is rendered in both Dashboard (student) and TeacherClassesSection (teacher). | Teacher passes no `completion` prop (JSDoc explicitly says omit on teacher views). `React.memo` works for both. | Wrap `onArchive`/`onUnenroll`/`onRestore` in `useCallback` on BOTH the student Dashboard and the teacher TeacherClassesSection — otherwise the memo bails out. |

**Phase 1 backend tasks (B1-B7) and Phase 2 frontend tasks (F1-F6) were already audited for teacher impact when written.** F1 specifically mentions teachers use the same `getCourseDashboard` shape; F2 builds the teacher dashboard summary; F6 has been amended (see below) to ensure the `pending_approval` field is preserved through the `getUserById` change.

**Net teacher-side impact of Phase 2.5:** zero behavior changes for teachers. Teachers benefit from S2's password-status cache (less DB load), S7's lesson list payload reduction (their list view loads faster), and S8's memo (fewer re-renders on archive). Everything else is student-only.

### S1. Eliminate `GradesPage` per-class weighted-grade N+1

**Why:** [client/src/pages/GradesPage.tsx](client/src/pages/GradesPage.tsx) line 31 — every `<ClassGradeCard>` calls `useWeightedCourseGrade(cls.id)` independently. For a student in 5 classes that's **5 separate weighted-grade requests** firing at once on `/grades` mount, each running a per-course grade-computation pipeline on the backend (see [server/src/services/grades.ts](server/src/services/grades.ts) line 910 — that endpoint probes columns, scans all assignments, joins submissions, joins grades, then runs the Mabini period math). Slow + expensive.

**What:**
1. **Backend:** add a batch endpoint `GET /api/grades/weighted-courses?course_ids=<csv>` (max 30 ids) that returns:
   ```ts
   { breakdowns: Record<string /* courseId */, WeightedCourseGradeBreakdown | { error: string }> }
   ```
   Implement in [server/src/services/grades.ts](server/src/services/grades.ts). Reuse the existing `getWeightedCourseGrade` function; loop the requested course ids, run them in `Promise.allSettled`, and embed each result. **Per-course errors must be embedded in the response** (not throw 500), so a single forbidden / not-enrolled course doesn't poison the whole batch.
   - Skip the duplicated per-call permission probe by hoisting the `requesterId/Role` check once at the top of the controller; for each course id, only re-check `course.teacher_id` ownership for teachers.
2. **Backend route:** add to [server/src/routes/grades.ts](server/src/routes/grades.ts).
3. **Backend controller:** in [server/src/controllers/grades.ts](server/src/controllers/grades.ts), parse `course_ids` from query, dedupe + clamp to 30, call the service, return.
4. **Client:** add `useWeightedCourseGrades(courseIds: string[])` hook in [client/src/hooks-api/useGrades.ts](client/src/hooks-api/useGrades.ts). It calls the batch endpoint and **prime the per-course React Query cache** so existing `useWeightedCourseGrade(courseId)` callers (notably [client/src/pages/ClassDetail.tsx](client/src/pages/ClassDetail.tsx) line 109) get instant hits:
   ```ts
   queryClient.setQueryData(['weighted-course-grade', courseId, 'me'], breakdown);
   ```
5. **Client GradesPage rewrite:** in [client/src/pages/GradesPage.tsx](client/src/pages/GradesPage.tsx), call `useWeightedCourseGrades(classes.map(c => c.id))` ONCE at the top of `GradesPage`. Replace `<ClassGradeCard>`'s internal `useWeightedCourseGrade(cls.id)` with a `weighted` prop passed in from the parent. The card remains the same render logic; only the data source moves up.
6. **Don't break the report-card export.** `handleExportMyGrade` ([GradesPage.tsx](client/src/pages/GradesPage.tsx) line 161) consumes the `mabini` block — that's read from the same breakdown shape, so it keeps working.

**Files to edit:**
- [server/src/services/grades.ts](server/src/services/grades.ts)
- [server/src/controllers/grades.ts](server/src/controllers/grades.ts)
- [server/src/routes/grades.ts](server/src/routes/grades.ts)
- [client/src/services/grades.service.ts](client/src/services/grades.service.ts)
- [client/src/hooks-api/useGrades.ts](client/src/hooks-api/useGrades.ts)
- [client/src/pages/GradesPage.tsx](client/src/pages/GradesPage.tsx)

**Safety check:**
- Per-class permission errors (403/404) used to short-circuit retries on a per-card basis. The batch endpoint embeds them per course; the GradesPage still renders each card with `gradeDisplay = '—'` when its breakdown is missing. **Verify** by manually 404-ing one class id (e.g., archive a class then unarchive); the other 4 cards should still show grades.
- The Mabini period chips and percentage average ([GradesPage.tsx](client/src/pages/GradesPage.tsx) line 119, 141) read from the same `mabini` and `classGrades` shapes — unchanged.
- The fallback `percentageAverage` (computed locally from `useGrades()` not the weighted endpoint) is preserved exactly — line 40-47.
- **TEACHER-SIDE COMPATIBILITY (verified):** `useWeightedCourseGrade(classId, studentId, opts)` is also called from [TeacherClassPeople.tsx](client/src/components/TeacherClassPeople.tsx) line 364, inside the StudentDetailsDialog when a teacher clicks a single student. That call site is on-demand (not N+1) and must keep working. **Therefore: do NOT remove or replace the existing `useWeightedCourseGrade` hook signature.** Add `useWeightedCourseGrades(courseIds[])` as a NEW hook. Both hooks call the same backend service internally, but the single-student hook keeps the existing per-call endpoint, and only GradesPage migrates to the batch hook.
- The cache priming step (`queryClient.setQueryData(['weighted-course-grade', courseId, 'me'], breakdown)`) only primes the **'me'** key. The teacher's per-student lookup uses key `['weighted-course-grade', courseId, studentId]` — different cache key, no collision.

**Acceptance:**
- `/grades` cold load fires **1** batch request, not N. Verify with DevTools Network tab.
- Each class card shows the same grade, period chips, and progress bar as today.
- Report card PDF export still works for each class.
- **Teacher StudentDetailsDialog** still loads the per-student weighted grade correctly (open a class as teacher → People tab → click a student → weighted breakdown appears).

### S2. Cache the password-status check across page navigations

**Why:** [client/src/layouts/AppLayout.tsx](client/src/layouts/AppLayout.tsx) line 28-69 fires `passwordStatusService.requiresPasswordChange(user.id)` on every layout mount, which itself does **2 direct Supabase queries** ([password-status.service.ts](client/src/services/password-status.service.ts)) — `temporary_passwords` then `profiles`. AppLayout re-mounts on every student navigation between routes inside the layout, so this fires on `/dashboard` → `/grades` → `/calendar` → `/upcoming` round-trips.

**What:**
1. Wrap `passwordStatusService.requiresPasswordChange` with a React Query hook in [client/src/services/password-status.service.ts](client/src/services/password-status.service.ts) — actually, simpler: wrap it where it's called.
2. In [client/src/layouts/AppLayout.tsx](client/src/layouts/AppLayout.tsx), replace the `useEffect`-based fetch with a React Query `useQuery`:
   ```ts
   const { data: requiresPasswordChange = false } = useQuery({
     queryKey: ['password-status', user?.id],
     queryFn: () => passwordStatusService.requiresPasswordChange(user!.id),
     enabled: isLoggedIn && Boolean(user?.id),
     staleTime: 5 * 60 * 1000, // 5 minutes — temp-password expiry isn't second-precise
     gcTime: 30 * 60 * 1000,
     retry: false,                 // matches the existing catch-and-suppress behavior
     refetchOnWindowFocus: false,
   });
   const [passwordNoticeDismissed, setPasswordNoticeDismissed] = useState(false);
   const mustChangePassword = requiresPasswordChange;
   ```
3. Drop the `useEffect`, the `mustChangePassword` state, and the `isActive` cleanup pattern.
4. **Invalidate** the cache key when the user changes their password. Find the password-change mutation site (search for `passwordStatusService` usages or the password-update API call in [client/src/pages/SettingsPage.tsx](client/src/pages/SettingsPage.tsx) and the temporary-password reset path) and add `queryClient.invalidateQueries({ queryKey: ['password-status', user.id] })` after success.

**Files to edit:**
- [client/src/layouts/AppLayout.tsx](client/src/layouts/AppLayout.tsx)
- [client/src/pages/SettingsPage.tsx](client/src/pages/SettingsPage.tsx) (or wherever password change is wired — grep for `temporary_passwords` and password reset).

**Safety check:**
- The "must change password" banner UX needs to reappear when applicable. Verify by: (a) issue a temp password via admin; (b) login as that student; (c) navigate around — banner shows on every page within 5 minutes of login, and disappears immediately after a successful password change (because of step 4's invalidation).
- The dismiss button still works (state is local, separate from the query).
- **TEACHER-SIDE COMPATIBILITY (verified):** `passwordStatusService.requiresPasswordChange` is ALSO called from [SettingsPage.tsx](client/src/pages/SettingsPage.tsx) line 212, which is reachable by teachers (`/settings` is in the AppLayout but teachers redirect to `/teacher` BEFORE settings is rendered… EXCEPT the temp-password banner in AppLayout fires for any logged-in user). Verify SettingsPage's own call also benefits from the same React Query cache (use the same query key `['password-status', userId]`) — if SettingsPage uses a separate `useEffect`-based fetch, migrate it to the same `useQuery` so the cache is shared. **Do not** create two separate cache keys; one shared key per user.
- Teacher accounts can also be issued temporary passwords (admin-driven password reset). The cache is per-user, not per-role, so teachers also benefit. No teacher-specific change required.

**Acceptance:**
- Logging in then navigating between `/dashboard`, `/grades`, `/upcoming` fires the temp-password check **at most once per 5 minutes**. Verify in Network tab — `temporary_passwords` Supabase query appears once.
- Same behavior verified for a teacher navigating `/teacher` → `/settings` → back.

### S3. Combine `useClasses` + `useAssignments` reads on student dashboard

**Why:** [client/src/pages/Dashboard.tsx](client/src/pages/Dashboard.tsx), [client/src/components/StatsBar.tsx](client/src/components/StatsBar.tsx), [client/src/components/UpcomingWidget.tsx](client/src/components/UpcomingWidget.tsx), [client/src/components/Sidebar.tsx](client/src/components/Sidebar.tsx), [client/src/pages/UpcomingPage.tsx](client/src/pages/UpcomingPage.tsx), [client/src/pages/CalendarPage.tsx](client/src/pages/CalendarPage.tsx) **all** call `useClasses()` and `useAssignments()` (no courseId). Once **F3** (Phase 2) lands, these are 2 calls each (instead of 1 + N). But on a cold load of `/dashboard` they're still 2 cold queries. They can be served as one aggregate.

**What:**
1. After F3 lands, add **a thin client-side wrapper** `useStudentHomeData()` in a new file [client/src/hooks-api/useStudentHome.ts](client/src/hooks-api/useStudentHome.ts) that internally calls `useClasses()` + `useAssignments()` + `useStudentProgressSummary()` and returns `{ classes, assignments, progressSummary, isLoading, error }`. **No new endpoint** — this is a pure client-side ergonomic wrapper. The TanStack Query cache already dedupes if multiple components subscribe.
2. **Skip** doing a backend `/student/home` aggregator. The existing endpoints, once F3 fixes the assignments fan-out, are already fast. Adding a dedicated student-home endpoint would duplicate logic without enough win.
3. **Optional micro-win:** after auth ready, call `queryClient.prefetchQuery(['classes', userId, undefined])` from [client/src/contexts/AuthContext.tsx](client/src/contexts/AuthContext.tsx)'s `loadUserData` — the dashboard then renders with data already in flight. Trade-off: this also prefetches for users who land on `/settings` and never see the dashboard. Only do this if the `/dashboard` cold-load is still the bottleneck after F3+F4.

**Files to edit:**
- new file: [client/src/hooks-api/useStudentHome.ts](client/src/hooks-api/useStudentHome.ts)
- optionally [client/src/pages/Dashboard.tsx](client/src/pages/Dashboard.tsx) to consume it.

**Safety check:**
- This task is only worth doing if F3 lands first. F3 makes `useAssignments()` cheap; without it, the wrapper still triggers the fan-out. Mark this task as a **soft dependency** on F3 — don't tackle S3 before F3 is merged.
- The wrapper hook returns the same data shapes the components already consume — no rendering changes downstream.
- **TEACHER-SIDE COMPATIBILITY:** `useStudentHomeData` is a NEW hook used only on student-facing pages (Dashboard, StatsBar, UpcomingWidget, UpcomingPage). It does not replace `useClasses`/`useAssignments` — those existing hooks stay live and are still used by every other consumer (teacher pages, class detail, sidebar). Adding the wrapper has zero teacher-side impact.

**Acceptance:**
- After F3 + S3, cold `/dashboard` shows: 1 `/api/courses`, 1 `/api/assignments`, 1 `/api/lessons/me/progress-summary`. No N+1.
- StatsBar and UpcomingWidget render the same numbers.
- The Sidebar's class list (under "Your Classes") still updates on archive/unenroll.

### S4. Lazy-load the report-card PDF generator (likely already done)

**Why:** [client/src/pages/GradesPage.tsx](client/src/pages/GradesPage.tsx) line 169 already does `await import('@/lib/report-card-pdf')` dynamically. Good. **Audit and verify** no other student-side site eagerly imports the PDF helper, dragging jspdf into the initial bundle.

**What:**
1. Run `grep -r "report-card-pdf\|jspdf" client/src/`. Every match should be `await import(...)` inside a function body, never a top-level static import.
2. Same audit for `mammoth`, `pdfjs-dist`, `pptx-parser` if any. If found, convert to dynamic import.
3. **Don't change the dialog flows** — the existing UX shows a "Generating PDF…" spinner while the chunk loads (line 109-113), which is the right pattern.

**Files to audit:**
- [client/src/pages/GradesPage.tsx](client/src/pages/GradesPage.tsx) — already correct.
- [client/src/pages/MaterialReaderPage.tsx](client/src/pages/MaterialReaderPage.tsx) — line 21 statically imports `@/lib/pdf-reader`. Convert to dynamic — wrap the PDF-render branch in an `async function loadPdfReader() { return import('@/lib/pdf-reader') }` and call it inside the `useEffect` at line 196.
- [client/src/lib/material-preview.ts](client/src/lib/material-preview.ts) — check for `import mammoth`. Convert.

**Safety check:**
- The "open PDF material" path involves a brief delay (~50-100ms) the first time as the chunk loads. The existing loading spinner ("Loading material…") at MaterialReaderPage covers this. Verify by hard-refreshing on `/class/:id/lessons/:lessonId/materials/:materialId` for a PDF — the page renders, spinner shows, PDF appears.
- View-tracking (`trackViewStart`) at line 192 of MaterialReaderPage MUST still fire. It runs after `meta` is set, before the PDF chunk loads — keep that ordering.

**Acceptance:**
- `npm run build` no longer puts pdfjs in the initial chunk graph (already true if F7 was done). This task is a final audit pass to make sure nothing regresses on the student-specific paths.

### S5. Use `count: 'exact'` on student dashboard list endpoints

**Why:** the student dashboard renders `pendingAssignments` count, "Submitted", "Overdue" — all derived **client-side** from the full assignment list ([StatsBar.tsx](client/src/components/StatsBar.tsx) line 10-12). When a student has, say, 60 assignments across the term, all 60 ship to compute 4 numbers.

**Caveat:** the dashboard ALSO uses the full assignment list to render the UpcomingWidget item rows — so we still need the bulk of the data. Where this matters is `/api/assignments` size: the wider the row select (B2), the more this adds up.

**What:**
1. After B2 (trim assignment list select), the per-row size should already be ~60% smaller. Verify the cumulative size on a cold `/dashboard` load and decide whether this task is still worth doing.
2. **Only if** dashboard list size is still >40 KB after B2: add `?fields=summary` query param to `/api/assignments` that returns a thinner shape (`id, course_id, title, due_date, max_points, submission_status, status, type`) — drop `description, topics, attachments_count, submission_open_at, submission_close_at`. Use the thin shape on student dashboard / StatsBar / UpcomingWidget; use the current shape on ClassDetail and AssignmentDetailDialog.
3. **Don't** add a separate `/api/assignments/counts` endpoint. The per-status counts are cheap to derive client-side and the list is already needed for UpcomingWidget rendering.

**Files to edit (only if needed):**
- [server/src/services/assignments.ts](server/src/services/assignments.ts) — add `fields` param branch.
- [server/src/controllers/assignments.ts](server/src/controllers/assignments.ts)
- [client/src/services/assignments.service.ts](client/src/services/assignments.service.ts)
- [client/src/hooks-api/useAssignments.ts](client/src/hooks-api/useAssignments.ts) — accept a `fields: 'summary' | 'full'` option, default `'full'`. **Cache key MUST include `fields`** — use `['assignments', courseId, fields]` (extend the existing `['assignments', courseId]` key with the third element). Otherwise, summary and full responses share a cache slot, which causes random renders against whichever shape was fetched last.
- [client/src/pages/Dashboard.tsx](client/src/pages/Dashboard.tsx), [StatsBar.tsx](client/src/components/StatsBar.tsx), [UpcomingWidget.tsx](client/src/components/UpcomingWidget.tsx), [UpcomingPage.tsx](client/src/pages/UpcomingPage.tsx) — pass `fields: 'summary'`.
- **Update [client/src/lib/query-invalidation.ts](client/src/lib/query-invalidation.ts):** invalidating `['assignments', classId]` no longer matches the new key format. Switch to a partial-key invalidation: `queryClient.invalidateQueries({ queryKey: ['assignments', classId], exact: false })` so both `[..., 'summary']` and `[..., 'full']` slots are invalidated together.

**Safety check:**
- AssignmentDetailDialog reads `description`, `topics`, `submissionOpenAt`, `submissionCloseAt` etc. — it is opened from `/class/:id` ClassDetail (after F1 it gets these from the dashboard payload). Make sure the dialog's data source is the full-shape variant.
- The `transformAssignment` function in [client/src/services/data-transformer.ts](client/src/services/data-transformer.ts) tolerates undefined fields (defaults to `''`, `false`, etc.). It will not crash if `description`/`topics` are missing on the summary shape.
- **Cache key collision risk:** without the `fields` discriminator on the cache key, a summary response could overwrite a full response in cache (or vice-versa), causing the AssignmentDetailDialog to render with `description = ''`. Adding `fields` to the cache key prevents this. **Verify** by alternately calling `useAssignments(courseId, { fields: 'full' })` and `useAssignments(courseId, { fields: 'summary' })` from two components — both should keep their own cache slot.
- **TEACHER-SIDE COMPATIBILITY:** The `?fields=summary` query param defaults to "full" when omitted (existing behavior). Teacher screens — TeacherClassStream's classwork list, TeacherDashboard's upcoming deadlines, AssignmentBuilderPage — do NOT pass `fields=summary`, so they keep the full shape. Only opt-in student dashboard widgets switch. Teacher behavior is bit-for-bit identical.
- B2 already trimmed the "full" shape's payload server-side (dropped never-used columns), so even teacher endpoints are smaller. S5 is purely additive on top of that for student dashboards.

**Acceptance:**
- `/dashboard` cold load `/api/assignments` response is ≤25 KB for a student with 60 assignments.
- Opening an assignment detail dialog still shows full description and topic chips.

### S6. Don't refetch lessons/grades while the student is taking a quiz/exam

**Why:** during a proctored exam ([client/src/components/ProctoredExamDialog.tsx](client/src/components/ProctoredExamDialog.tsx)), background refetches (lessons, grades, weighted-grade) are wasteful and can cause subtle lag during answer-saving. The dialog runs inside the same SPA, so React Query refetches still fire.

**What:**
1. Add a top-level `quizMode` boolean state to [client/src/contexts/RoleContext.tsx](client/src/contexts/RoleContext.tsx) (or a new `ExamModeContext`) that any component can flip when a proctored exam dialog opens.
2. In [client/src/components/ProctoredExamDialog.tsx](client/src/components/ProctoredExamDialog.tsx), set `quizMode = true` on `open` and reset on `close`.
3. In each background hook that doesn't matter during an exam — `useStudentLessons`, `useStudentProgressSummary`, `useGrades`, `useWeightedCourseGrade`, `useDiscussionPosts` — read `quizMode` and pass `enabled: !quizMode` (combined with the existing `enabled` clauses).
4. **DO NOT** disable `useAssessmentLockState`, `useRequiredMaterials`, or anything in the submission/grade-write path. Those are the exam's own data dependencies.
5. **DO NOT** disable `SubmissionQueueSync` — it must run during the exam in case of intermittent connectivity.

**Files to edit:**
- [client/src/contexts/RoleContext.tsx](client/src/contexts/RoleContext.tsx)
- [client/src/components/ProctoredExamDialog.tsx](client/src/components/ProctoredExamDialog.tsx)
- [client/src/hooks-api/useLessons.ts](client/src/hooks-api/useLessons.ts)
- [client/src/hooks-api/useGrades.ts](client/src/hooks-api/useGrades.ts)
- [client/src/hooks-api/useDiscussions.ts](client/src/hooks-api/useDiscussions.ts)

**Safety check:**
- Exam answer-save round-trips MUST still happen — verify by inspecting the network tab while submitting an answer mid-exam (background refetches paused, answer requests still fire).
- After the exam closes, the disabled hooks resume normal behavior. Ensure `quizMode` flips back to `false` even when the dialog is closed by the proctor, by submission, or by escape key.
- Lesson `useStudentLesson(classId, lessonId)` (single-lesson view) used in [LessonDetailPage.tsx](client/src/pages/LessonDetailPage.tsx) is called outside the exam dialog and should NOT be disabled.
- **TEACHER-SIDE COMPATIBILITY (verified):** `useDiscussionPosts` is also used in [TeacherClassStream.tsx](client/src/components/TeacherClassStream.tsx) line 251. `useGrades` and `useWeightedCourseGrade` are used in teacher screens too (TeacherClassPeople, ClassDetail's grades tab when viewed as student, etc.). Gating these with `!quizMode` is **safe** because `quizMode` is set ONLY by [ProctoredExamDialog.tsx](client/src/components/ProctoredExamDialog.tsx). That dialog is mounted only from student-facing pages ([AssignmentDetailDialog.tsx](client/src/components/AssignmentDetailDialog.tsx) opens it via `onStartExam`, which only fires for the student role). Teachers never trigger the dialog, so for them `quizMode` stays `false` permanently and behavior is unchanged.
- **Defensive coding:** the `quizMode` flag should default to `false` and live in a context that initializes to `false` on every layout mount. Even if a teacher somehow reaches a state where `quizMode === true`, the only effect is delayed background refetches — not data loss. Mutations and writes are unaffected.

**Acceptance:**
- Open a proctored exam dialog. In DevTools Network tab, no background `/api/lessons/...` or `/api/grades/...` requests fire while the exam is in progress.
- Submit the exam — `/api/assignments/:id/submissions` fires; after close, the lessons/grades caches refresh.
- Submission queue still flushes if connection drops mid-exam (manual offline test).

### S7. Trim the data shipped from `/api/lessons/...` student listings

**Why:** [server/src/services/lessons.ts](server/src/services/lessons.ts) `loadLessonRowsForCourse` uses `select('*')` (line 202). Lesson rows include `description` (potentially long) and a bunch of completion-rule fields that the lesson list view doesn't need.

**What:**
1. In [server/src/services/lessons.ts](server/src/services/lessons.ts), introduce a `LESSON_LIST_SELECT` constant: `'id, course_id, title, sort_order, is_published, is_general, completion_rule_type, completion_rule_min_minutes, next_lesson_id, unlock_on_submit, unlock_on_pass, pass_threshold_percent, topics, created_at, updated_at'`. **Drop `description`** for the list path. Keep `'*'` for `loadSingleLessonRow`.
2. Update the `LessonView` shape in [client/src/lib/data.ts](client/src/lib/data.ts) — `description` is already typed `string | null`. The list response will simply send `null`.
3. Update the lesson card in [client/src/components/lessons/LessonCard.tsx](client/src/components/lessons/LessonCard.tsx) — verify it doesn't render `description` in the list view (only the title + topics). If it does, it now shows `null` / empty, which matches the lesson detail page being the canonical place to read description.

**Files to edit:**
- [server/src/services/lessons.ts](server/src/services/lessons.ts)
- audit [client/src/components/lessons/LessonCard.tsx](client/src/components/lessons/LessonCard.tsx) for description rendering.

**Safety check:**
- Lesson detail page ([LessonDetailPage.tsx](client/src/pages/LessonDetailPage.tsx)) calls `useStudentLesson(classId, lessonId)` which goes through `loadSingleLessonRow` — that one still selects `*`, so the description IS available on the detail screen.
- LessonsTab ([client/src/components/lessons/LessonsTab.tsx](client/src/components/lessons/LessonsTab.tsx)) only reads `lesson.title`, `lesson.topics`, `lesson.status` — not `description`. Safe.
- **TEACHER-SIDE COMPATIBILITY (verified):** [LessonListBoard.tsx](client/src/components/lessons/LessonListBoard.tsx) (teacher-side, used inside [TeacherClassStream.tsx](client/src/components/TeacherClassStream.tsx)) was inspected line-by-line. It renders `lesson.title`, `lesson.topics`, `lesson.materials.length`, `lesson.assessments.length`, `lesson.stats`, `lesson.chain`, `lesson.isPublished` — **never `lesson.description`** in the list view. The teacher's lesson editor at [LessonEditorPage.tsx](client/src/pages/LessonEditorPage.tsx) line 80 reads `lesson.description ?? ''`, but that uses `useTeacherLesson(classId, lessonId)` which calls `loadSingleLessonRow` (still `*`), so the description is preserved on the editor screen. **Trim is safe for both teacher and student list endpoints.**

**Acceptance:**
- Cold load of `/class/:id` (lessons tab, student) — the lessons response payload is smaller (verify with curl). Lesson cards still render correctly.
- Cold load of teacher's `LessonListBoard` — same payload reduction, list rendering unchanged.
- Open a single lesson (student or teacher editor) — description is present.

### S8. Memoize student-card progress to avoid recomputation on archive/unarchive

**Why:** [client/src/pages/Dashboard.tsx](client/src/pages/Dashboard.tsx) line 36-65 — `completionByClass` recomputes on every render where `progressSummary` or `allAssignments` change. Right now the dependency array is fine, but [client/src/components/ClassCard.tsx](client/src/components/ClassCard.tsx) accepts a `completion` prop. If ClassCard is rendered inside a `.map(...)` that re-creates the array on every render, React will reconcile and re-render every card on archive (because `onArchive` and `onUnenroll` callbacks have new identities each render).

**What:**
1. In [client/src/pages/Dashboard.tsx](client/src/pages/Dashboard.tsx) lines 107-119, wrap `handleArchiveClass`, `handleUnenrollClass`, `handleRestoreClass` in `useCallback` with `[handleArchive, handleUnenroll, handleRestore, refetch]` deps.
2. Wrap `<ClassCard>` in [client/src/components/ClassCard.tsx](client/src/components/ClassCard.tsx) with `React.memo()` so it only re-renders when its props change. Add a custom comparator if the `completion` object is recreated each render — alternatively, pre-stabilize the completion object identity in `completionByClass` (it's already `useMemo`'d, so the inner objects are stable as long as their inputs are).
3. Audit [client/src/components/UpcomingWidget.tsx](client/src/components/UpcomingWidget.tsx) and [client/src/pages/UpcomingPage.tsx](client/src/pages/UpcomingPage.tsx) for the same pattern — buttons inside `.map(...)` with inline arrow handlers. The current implementation is fine for ≤6 items; don't over-engineer.

**Files to edit:**
- [client/src/pages/Dashboard.tsx](client/src/pages/Dashboard.tsx)
- [client/src/components/ClassCard.tsx](client/src/components/ClassCard.tsx)

**Safety check:**
- Archive/unenroll/restore confirmation dialogs are local to each ClassCard (`confirmAction` state). With `React.memo`, the dialog state still works because each card has its own component instance.
- Progress ring updates after a submission ARE expected — invalidating the assignments cache (which already happens on submission) re-runs `useAssignments`, which changes `allAssignments`, which re-runs the `useMemo`. Verify by submitting an assignment and confirming the ring percentage updates without a full page reload.
- **TEACHER-SIDE COMPATIBILITY:** [ClassCard.tsx](client/src/components/ClassCard.tsx) is rendered in [Dashboard.tsx](client/src/pages/Dashboard.tsx) (student) AND in [TeacherClassesSection.tsx](client/src/components/TeacherClassesSection.tsx) (teacher classes list). `React.memo` is safe for both because the `completion` prop is omitted on teacher views (per the JSDoc at [ClassCard.tsx](client/src/components/ClassCard.tsx) line 22: "Omit on teacher views — the ring only renders when this is provided"). The teacher's ClassCard re-renders only when the class data changes, which is the desired behavior.
- Teacher's `TeacherClassesSection` passes `onArchive` / `onUnenroll` callbacks too. **Verify those callbacks are also wrapped in `useCallback`** in [TeacherClassesSection.tsx](client/src/components/TeacherClassesSection.tsx) — otherwise the memo comparator will see new function identities every render and bail out. If they aren't already memoized, add the same `useCallback` wrapping there.

**Acceptance:**
- Adding/removing tag filters in the search bar doesn't visibly stutter even with 20+ classes.
- Archiving a class updates only that one card; the others don't re-render (verify with React DevTools Profiler).

---

## Phase 3 — Frontend bundle & asset trimming

### F7. Lazy-load heavy library chunks at usage site

**Why:** [client/vite.config.ts](client/vite.config.ts) already buckets `pdfjs-dist`, `mammoth`, `jspdf`, `jszip`, `papaparse` into separate chunks. But because they're statically imported from at least one source file, Rollup emits them in the initial graph. Switch to dynamic `import()` so they only load on demand.

**What:**
1. **pdfjs-dist** — used by [client/src/lib/pdf-reader.ts](client/src/lib/pdf-reader.ts). Verify all callers `await import('@/lib/pdf-reader')` instead of static-importing it. The file itself can statically import pdfjs internally — but its callers should be dynamic. Search for `from '@/lib/pdf-reader'` and audit each.
2. **mammoth** — used for `.docx` material rendering. Find all `import mammoth from 'mammoth'` and convert to dynamic `import('mammoth')` inside the function that uses it.
3. **jspdf + jspdf-autotable** — used by [client/src/lib/report-card-pdf.ts](client/src/lib/report-card-pdf.ts). Convert that file's exports into async functions that dynamic-import jspdf.
4. **jszip** — used by `material-cache.service.ts` and registrar export. Same pattern.
5. **papaparse** — used by CSV import flows. Same pattern.
6. **recharts** — used by [client/src/components/](client/src/components/) anywhere there's a chart. Wrap chart-bearing components in `React.lazy()` so the recharts chunk only loads when the parent route mounts.
7. After the conversion, run `npm run build` and inspect `dist/assets/`. The `vendor-pdfjs`, `vendor-mammoth`, `vendor-pdf`, `vendor-jszip`, `vendor-papaparse`, `vendor-charts` chunks should NOT appear in the initial HTML's preload list.

**Files to audit & edit:**
- [client/src/lib/pdf-reader.ts](client/src/lib/pdf-reader.ts) and its callers (grep for `pdf-reader`).
- [client/src/lib/report-card-pdf.ts](client/src/lib/report-card-pdf.ts) and its callers.
- Any `import mammoth`, `import jszip`, `import Papa` site.
- [client/src/components/](client/src/components/) with charts.

**Acceptance:**
- `npm run build` output: largest chunk in initial graph drops by ≥1.5 MB (roughly the size of pdfjs alone).
- Login page Network tab shows fewer JS chunks downloaded.
- PDF preview still works after lazy load.

### F8. Drop the legacy 700KB JPG fallback

**Why:** [client/public/backgroundlms.jpg](client/public/backgroundlms.jpg) is 700 KB. The responsive WebP set (768/1280/1920) covers all viewports.

**What:**
1. Search for `backgroundlms.jpg` references across the repo: `grep -r "backgroundlms.jpg" client/`.
2. If only `vercel.json` references it (cache header rule), update the rule to drop the JPG match.
3. If a CSS background-image references it as a fallback, replace with the JPG version that's already smaller, or drop the fallback (modern browsers all support WebP).
4. Delete `client/public/backgroundlms.jpg`.
5. Keep `backgroundlms-1920.jpg` as the no-WebP fallback if needed (only 372 KB, half the size).

**Files to edit:**
- [client/vercel.json](client/vercel.json)
- delete [client/public/backgroundlms.jpg](client/public/backgroundlms.jpg)

**Acceptance:**
- `git ls-files | grep backgroundlms` no longer lists the 700KB JPG.
- Login page renders identically on Chrome, Firefox, Safari.

### F9. Convert PNG icons to WebP/AVIF where safe

**Why:** [client/public/icons/](client/public/icons/) contains PNGs totaling ~280 KB. Most modern browsers + iOS 14+ render WebP for non-favicon icon contexts.

**What:**
1. Generate WebP versions of `icon-192x192.png`, `icon-384x384.png`, `icon-512x512.png` (the largest). Tool of choice: `sharp` CLI or `cwebp`.
2. Update [client/public/manifest.json](client/public/manifest.json) to add `image/webp` entries alongside the PNG entries — browsers pick the format they support.
3. **Don't replace the favicon** (.ico is the universal fallback) and **don't replace the apple-touch-icon** in [client/index.html](client/index.html) (Safari/iOS still want PNG there).

**Files to edit:**
- new files: `client/public/icons/icon-{192,384,512}.webp`.
- [client/public/manifest.json](client/public/manifest.json)

**Acceptance:**
- Manifest validates (`https://manifest-validator.appspot.com/`).
- "Install app" still works on Chrome / Edge / Android.

### F10. Add Vite preview-mode optimizations

**Why:** dev iteration speed. Not a production bandwidth win, but devs feel it.

**What:**
1. In [client/vite.config.ts](client/vite.config.ts), add:
   ```ts
   optimizeDeps: {
     include: [
       'react', 'react-dom', 'react-router-dom',
       '@tanstack/react-query', '@supabase/supabase-js',
       'lucide-react', 'date-fns', 'zod',
     ],
   },
   ```
2. Pre-bundles the most-used deps so HMR updates don't re-resolve them every time.

**Files to edit:**
- [client/vite.config.ts](client/vite.config.ts)

**Acceptance:**
- `npm run dev` first-time start time is unchanged or faster. Subsequent restarts are noticeably faster.

---

## Phase 4 — Streaming & operational hygiene

### F11. Stream the lesson-builder material/PDF uploads

**Why:** large PDF uploads (>5 MB) currently buffer through Express body parsers. Memory pressure on Render's 512 MB free dynos.

**SECURITY WARNING — read before starting:** F11 changes the trust boundary for material uploads. Today, every upload passes through `createMaterial` in [server/src/services/courses.ts](server/src/services/courses.ts), which validates: (a) requesting user is the course teacher or admin (line 484-491 of B2 file), (b) MIME type is in `MATERIALS_ALLOWED_MIME_TYPES`, (c) file size is within `MATERIALS_FILE_SIZE_LIMIT` (50 MB). Direct-to-Supabase uploads bypass (b) and (c) unless the bucket has matching RLS + storage constraints.

Before enabling direct uploads:
1. Confirm the `course-materials` bucket has `allowedMimeTypes` and `fileSizeLimit` set in Supabase Storage settings — read [server/src/services/courses.ts](server/src/services/courses.ts) line 268 (`createBucket`) for the values to mirror. The `ensureMaterialsBucketExists` call configures these on first run; verify they're actually applied in production.
2. Confirm RLS on `storage.objects` for the `course-materials` bucket allows INSERT only when `auth.uid()` is the teacher of the course id encoded in the path. The signed-URL path encodes the course id at line 252 of courses.ts. Write a Supabase RLS policy that matches.
3. Keep the existing buffer-based `createMaterial` server path for files <5 MB. **Do not deprecate it** — it's the safety net when direct uploads can't be authorized (e.g., browser doesn't support PUT, or the student's network blocks direct Supabase access).

**This task is OPTIONAL.** It's the most invasive change in the plan and the only one that touches the security model. If you have any doubt, **skip F11**. The bandwidth/memory wins are real but not critical at current scale.

**What (only if proceeding):**
1. Audit `multer` usage in [server/src/middleware/upload.ts](server/src/middleware/upload.ts). If it's `multer.memoryStorage()`, switch to `multer.diskStorage()` with a `tmp/` dir, or use `busboy` directly to stream multipart fields straight to Supabase Storage.
2. **Caveat:** the current flow uploads to Supabase Storage from the server. Streaming from req → Supabase needs a pipe; Supabase JS SDK accepts a Buffer or ArrayBuffer but not a Node stream directly. Either:
   - Sign a direct-upload URL from the backend, then have the **client** PUT directly to Supabase Storage. This is the long-term fix and saves server bandwidth too. **Requires the RLS + bucket-config audit above.**
   - Buffer to disk first, then upload to Supabase. Less memory pressure but adds disk I/O. **No security model change — preferred if F11 is attempted.**
3. Pick option (b) — disk-buffered — unless you can complete the security audit in (1) above. The signed URL endpoint goes in [server/src/services/courses.ts](server/src/services/courses.ts) `createMaterialSignedUrl`.

**Files to edit:**
- [server/src/middleware/upload.ts](server/src/middleware/upload.ts)
- [server/src/services/courses.ts](server/src/services/courses.ts)
- [server/src/routes/courses.ts](server/src/routes/courses.ts)
- [client/src/services/materials.service.ts](client/src/services/materials.service.ts)
- [client/src/pages/MaterialUploadPage.tsx](client/src/pages/MaterialUploadPage.tsx)

**Safety check:**
- An unauthorized user must NOT be able to PUT files into `course-materials/<other-teacher's-course>/`. Test this manually: log in as teacher A, get a signed URL for course X (which teacher A owns), then try to use it with a path that names course Y (teacher B's course) — must 403.
- MIME type and size limits enforced by Supabase Storage configuration must match the server-side validation. Read both lists side-by-side.
- Existing materials uploaded through the old code path remain accessible — F11 doesn't migrate or touch existing material rows.

**Acceptance:**
- Uploading a 30 MB PDF doesn't spike server memory above baseline + 32 MB (option b: disk; option a: a few MB only).
- The completed material URL is the same shape as today.
- Material listing, opening, downloading, view-tracking, and delete all work identically (verify each).

### F12. Add `Cache-Control` to the SW fetch handler for hashed Vite assets

**Why:** [client/public/sw.js](client/public/sw.js) line 190 already does stale-while-revalidate for hashed assets. Add a long max-age response header in the SW response so even bypass-SW direct loads benefit from browser cache. (Vercel headers already handle this in prod, but the SW path was missing it.)

**What:**
1. In [client/public/sw.js](client/public/sw.js) `handleAppShellFetch`, after a hashed-asset response is fetched fresh, before caching, set a `Cache-Control: public, max-age=31536000, immutable` header on the response when serving it back. (This is a no-op when Vercel already sets it, but defensive.)
2. **Test:** open DevTools → Application → Cache Storage → `mabini-classroom-v4`. Hashed JS asset should appear with the long max-age.

**Files to edit:**
- [client/public/sw.js](client/public/sw.js)

**Acceptance:**
- Hashed JS chunks are served with `cache-control: public, max-age=31536000, immutable` from the SW.
- The TTL doesn't apply to `index.html` or `manifest.json`.

### F13. Defer non-critical work after first paint

**Why:** [client/src/App.tsx](client/src/App.tsx) renders `<SubmissionQueueSync />` and the AppLayout / TeacherPanel call `useRealtimeNotifications` on mount. The WS connection is non-critical for first paint.

**Caveats — read before changing:**
- **Do NOT lazy-load `<SubmissionQueueSync />`.** It runs a 30s polling loop (line 83 of [SubmissionQueueSync.tsx](client/src/components/SubmissionQueueSync.tsx)) and listens for the browser `online` event. A student who lost connection mid-quiz, queued a submission, and then closed the laptop relies on this. If the component mounts late, queued submissions can sit unsynced past the time window. Keep it eagerly mounted; instead, just make sure it doesn't *do* work until needed (it already has the `getSubmissionQueueCount() === 0` early-out at line 30 — that's enough).
- The WebSocket deferral is safe: notifications are eventually-consistent (they also poll on focus + websocket-onopen catch-up), so a 1-2s delay before the socket connects is invisible to users.

**What:**
1. In [client/src/components/TeacherPanel.tsx](client/src/components/TeacherPanel.tsx) line 11 and [client/src/layouts/AppLayout.tsx](client/src/layouts/AppLayout.tsx) line 20, defer `useRealtimeNotifications()` until after the first paint:
   ```ts
   const [wsEnabled, setWsEnabled] = useState(false);
   useEffect(() => {
     const id = window.requestIdleCallback?.(() => setWsEnabled(true)) ?? window.setTimeout(() => setWsEnabled(true), 1500);
     return () => {
       if (typeof id === 'number') window.clearTimeout(id);
       else window.cancelIdleCallback?.(id);
     };
   }, []);
   useRealtimeNotifications(wsEnabled);
   ```
2. Update [client/src/hooks/useWebSocket.ts](client/src/hooks/useWebSocket.ts) `useRealtimeNotifications` to accept an `enabled` boolean (default `true`, so any other caller that isn't passing the flag keeps current behavior). When `enabled === false`, return early before the `io()` call.

**Files to edit:**
- [client/src/components/TeacherPanel.tsx](client/src/components/TeacherPanel.tsx)
- [client/src/layouts/AppLayout.tsx](client/src/layouts/AppLayout.tsx)
- [client/src/hooks/useWebSocket.ts](client/src/hooks/useWebSocket.ts)

**Acceptance:**
- First paint of `/teacher` and `/dashboard` happens before WebSocket connection logs in DevTools console.
- Realtime notifications still arrive within ~2 seconds of mount.
- Offline submission queue still flushes within 30s of regaining connectivity (test: set browser offline, submit a quiz, set online — toast appears).

### F14. Add response-time SLO logging (optional, ops-only)

**Why:** so future regressions are caught before users notice.

**What:**
1. In [server/src/middleware/requestLogger.ts](server/src/middleware/requestLogger.ts), if the request takes >1000ms, log at WARN level with route + duration.
2. Don't add new dependencies; use the existing winston logger.

**Files to edit:**
- [server/src/middleware/requestLogger.ts](server/src/middleware/requestLogger.ts)

**Acceptance:**
- Slow requests appear in `server/logs/*.log` with a `slowRequest` tag.

---

## Phase 5 — Verification

### V1. Re-measure against Phase 0 baseline

1. Run the same measurement protocol from M1.
2. Targets:
   - Total client JS in initial graph: **−40% or more**.
   - Cold `/teacher` total transferred: **−50% or more**.
   - Cold `/teacher` XHR count: **down from ~16 to ~3-4**.
   - Cold `/dashboard` (student) XHR count: **down from ~5-7 to ~3** (after F3 + S3).
   - Cold `/grades` XHR count: **down from 1 + N (per class) to 2-3** (after S1).
   - Cold `/class/<id>` XHR count: **down from ~9 to ~2-3**.
   - 95p server response time on cached endpoints: **<50ms** (304 response).
3. Document in `PERF-RESULTS.md` (uncommitted, attach to PR description).

### V2. Smoke-test critical paths

**Teacher paths:**
- [ ] Login (teacher email — pre-approved).
- [ ] Teacher dashboard renders stats + recent submissions + upcoming deadlines.
- [ ] Teacher class detail tabs (lessons, stream, people, submissions, insights).
- [ ] Grade a submission; student sees grade after refetch.
- [ ] Post an announcement; comment on it.
- [ ] Create / edit a lesson; reorder; chain to next.
- [ ] Upload a 30 MB material (F11 path).

**Student paths (verify ALL — these are the highest-traffic flows):**
- [ ] Login (institutional student email — `@mabinicolleges.edu.ph`).
- [ ] Student dashboard renders classes + completion rings + StatsBar + UpcomingWidget.
- [ ] Sidebar lists active classes; click navigates to that class.
- [ ] Calendar page shows assignments on the right dates.
- [ ] Upcoming page shows pending / submitted / overdue counts and the upcoming deadline list.
- [ ] **Grades page** loads quickly with one batch request; each class card shows GP, period chips, percent, progress.
- [ ] Download report card PDF for a class — file generates correctly.
- [ ] Open a class — Lessons tab shows progress bar, locked/active/done states correctly.
- [ ] Open a lesson — materials list shows; required materials are flagged as locked when not yet viewed.
- [ ] Open a PDF material — content renders, scroll tracks progress, "mark as read" works.
- [ ] Open a DOCX material — mammoth renders, paginates correctly.
- [ ] Open a PPTX material — slides render.
- [ ] Mark a lesson as done — progress updates without full reload; next lesson unlocks.
- [ ] Take a proctored quiz — proctoring rules fire, no background refetches during exam (S6).
- [ ] Submit a quiz / exam — confirmation appears, lesson chain advances if pass-gated.
- [ ] **Offline submission test:** disconnect network mid-quiz, submit; reconnect; verify queued submission flushes.
- [ ] **Offline material test:** open a PDF online, disconnect, reopen — cached material still loads (F5 changed precache trigger).
- [ ] Stream tab — post a comment, like a comment, comments persist.
- [ ] Class discussion — open from header, post + like work.
- [ ] Archive a class — moves to /archived, doesn't disappear from sidebar until refetch.
- [ ] Unarchive (restore) — class reappears in active list.
- [ ] Notifications popover lists items + marks read.
- [ ] Settings page — change name, avatar, password (verify password-status banner clears after change — S2).
- [ ] Switch student account (linked accounts) — second user's data renders cleanly, no leaked cache from previous user.
- [ ] Logout; login as different role (teacher↔student); data refreshes.

### V3. Run full test suites

```bash
npm run lint --workspaces
npm test --workspaces
cd client && npm run test:e2e
```

All should pass. If E2E breaks, the tests need updating to match new aggregate endpoints — that's allowed but document each updated test in the PR.

---

## Risks & rollback

- **B1 (auth cache):** if profiles are mutated outside of the invalidation paths, users can see stale role/approval state for up to 60s. Mitigation: cap TTL low (60s), invalidate aggressively. Rollback: delete the cache map and the wrapper.
- **B6 (HTTP cache headers):** clients may serve stale data if ETag computation has a bug. Mitigation: weak ETag based on full body hash is deterministic. Rollback: remove middleware mount from index.ts.
- **F1 (aggregated dashboard):** if the new endpoint is buggy, ClassDetail breaks. Mitigation: keep old endpoints alive; behind a feature flag if you want belt-and-suspenders. Rollback: revert ClassDetail to the 8-hook variant.
- **F7 (lazy-load chunks):** dynamic imports add a chunk-loading delay (~50ms on a fast connection) at usage time. Acceptable for rarely-used flows (PDF/DOCX preview), unacceptable for first-paint-critical paths. Don't lazy-load anything used by the login page or the dashboard skeleton.

## Out of scope (deliberately not addressed here)

- Server-side rendering / Next.js migration. Vite SPA is fine for the user count.
- HTTP/2 server push or 103 Early Hints. Render's free tier doesn't support HTTP/2 push reliably.
- Edge caching / CDN for API responses. Render handles this; not worth Cloudflare integration at current scale.
- Database read replicas. Supabase free tier doesn't support them.
- Replacing axios with fetch. Cosmetic; axios is already tree-shaken to ~13 KB.

## Done when

- All `B*`, `F1`-`F9`, and `S1`-`S8` tasks are merged.
- `PERF-RESULTS.md` shows the measured improvements (including the student-side XHR-count targets in V1).
- All smoke tests in V2 pass — both teacher AND student lists in full.
- All test suites in V3 pass.
- No new dependencies were added (except possibly `compression@^1.8` if the version bump is needed for Brotli).

---

## Cross-task dependency map

```
M1 (baseline)
  └─ B1 (auth cache) ──┬─ B6 (HTTP caching)
                       └─ B7 (indexes) ── B4 (count agg)
  B2 (trim selects) ── S5 (summary fields) ── S7 (lesson list trim)
  B3 (teacher join)
  B5 (Brotli)

  F1 (class dashboard agg) ── (uses B1, B2, B3)
  F2 (teacher dashboard agg) ── (uses B1, B2)
  F3 (assignments fan-out fix) ──┬── S3 (student home wrapper)
                                  └── S5 (summary fields)
  F4 (RQ defaults) — independent
  F5 (material precache fix) — independent
  F6 (loadUserData) — independent

  S1 (grades batch) ── (uses B1, can land independently of F1)
  S2 (password status cache) — independent
  S6 (quiz mode pause) — independent
  S8 (memo cards) — independent

  F7-F10 (bundle/asset) — independent
  F11-F14 (streaming/hygiene) — independent

V1 + V2 + V3 — final.
```

**Suggested merge order (each batch can be one PR):**

1. **B1 + B7** (caching + indexes — foundational, no client changes)
2. **B2 + B3 + B4** (server payload trim + N+1 fixes)
3. **B5 + B6** (compression + HTTP caching)
4. **F1 + F2** (aggregated dashboards — biggest perceived speedup)
5. **F3 + S3** (student dashboard fan-out fix)
6. **S1** (GradesPage batch)
7. **F4 + F5 + F6** (React Query + material precache + loadUserData)
8. **S2 + S6 + S8** (student micro-optimizations)
9. **F7 + F8 + F9 + F10** (bundle/asset)
10. **F11** (streaming uploads — big effort, deploy carefully)
11. **F12 + F13 + F14 + S4 + S7** (final polish + hygiene)
12. Run V1 + V2 + V3.
