# API and Backend Audit Report

Date: 2026-04-09
Scope: Full workspace scan focused on backend/API health and frontend-to-backend contract alignment.

## Commands executed

1. `npm install`
2. `npm run lint --workspace=server`
3. `npm run build --workspace=server`
4. `npm run test --workspace=server`
5. `npm run lint --workspace=client`
6. `npm run build --workspace=client`
7. `npm run test --workspace=client`
8. `npm run start --workspace=server`

## Verification summary

- Server build: PASS
- Server lint: PASS (warnings only)
- Server tests: PASS
- Client build: PASS
- Client tests: PASS
- Client lint: PASS (warnings only)
- Server runtime startup: PASS (with configured env variables)

## Deployment verification (Render + Vercel)

- Render API health endpoint check: PASS (`GET /api/health` returned 200)
- Render API database connectivity check: PASS (`GET /api/db-test` returned 200)
- CORS preflight from frontend origins: PASS
  - `https://mabini-lms-client.vercel.app`
  - `https://mabinilms.vercel.app`
- Vercel frontend availability: PASS (responding, including redirect behavior)

## Remediation status (completed)

- Fixed auth contract mismatches in frontend services (signup name mapping, verify-email method, reset-password token flow, change-password endpoint).
- Fixed user profile/search endpoint mismatches in frontend services.
- Fixed assignments route and grading endpoint mismatches in frontend services.
- Added submission payload compatibility mapping in frontend service layer.
- Fixed grades API consumption by aligning frontend service with existing backend grade routes.
- Fixed enrollments service call path to existing backend endpoints.
- Fixed teacher dashboard submissions retrieval without relying on a missing backend endpoint.
- Fixed announcement creation payload to include required title.
- Added backend test environment defaults for Supabase variables in test setup.
- Added server-specific ESLint config and resolved backend lint errors.
- Fixed remaining frontend lint blocker in Tailwind config.

## Current status

- All previously identified contract mismatches in this report have been addressed in code.
- Backend and frontend validation pipelines are green (warnings remain, no blocking errors).
- Runtime and deployment connectivity are verified with configured environment variables.
- Remaining work is optional hardening (e.g., reducing lint warnings, adding stricter contract tests).

## Runtime and tooling blockers

### 1) Backend cannot start without Supabase env
- Evidence:
  - `Error: Missing Supabase environment variables` at server startup
  - `server/src/lib/supabase.ts` throws if vars are absent
- Impact:
  - Local backend runtime fails immediately if `.env` is not configured.
  - Some tests fail before suites execute.
- Recommended fix:
  - Ensure `server/.env` is present with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` from `server/.env.example`.
  - In tests, mock Supabase module or provide isolated test env values.

### 2) Server lint fails due missing React ESLint plugin in root config
- Evidence:
  - `npm run lint --workspace=server` fails with: `ESLint couldn't find the plugin "eslint-plugin-react"`
  - Root config references `plugin:react/recommended` and `plugin:react-hooks/recommended`.
- Impact:
  - Backend lint cannot run cleanly in CI/local under current dependency/config state.
- Recommended fix:
  - Either install missing plugins at root (`eslint-plugin-react`, `eslint-plugin-react-hooks`) or split server/client ESLint configs so server does not inherit React-only rules.

## Historical findings (resolved)

### A) Auth and profile contract mismatches

1. Signup payload mismatch
- Client sends `full_name`.
- Server requires `first_name` and `last_name`.
- Risk: signup validation failure.
- Fix options:
  - Update client to send `first_name`/`last_name`, or
  - Add backend compatibility mapping for `full_name`.

2. Verify email method mismatch
- Client uses `POST /auth/verify-email` with JSON body.
- Server exposes `GET /auth/verify-email` with query validation.
- Risk: frontend verification flow fails.
- Fix options:
  - Change client to GET with `?token=...`, or
  - Add POST alias endpoint in backend.

3. Reset password payload mismatch
- Client sends `{ token, new_password }` to `/auth/reset-password`.
- Server `/auth/reset-password` expects bearer token + `{ password }`.
- Separate endpoint `/auth/reset-password-token` exists for token-in-body flow.
- Risk: password reset fails depending on flow.
- Fix options:
  - Point client token flow to `/auth/reset-password-token` with `{ token, password }`, or
  - Add backend compatibility for `{ token, new_password }`.

4. Change password endpoint mismatch
- Client calls `/users/me/change-password`.
- Server exposes `/auth/change-password`.
- Risk: password change always 404 from current client service.

5. User profile field mismatch
- Client update profile type includes `full_name`, `bio`.
- Server `updateProfileSchema` accepts `first_name`, `last_name`, `avatar_url` only.
- Risk: profile fields silently ignored or validation errors.

6. Missing user search endpoint
- Client calls `/users/search`.
- Server routes expose `/users`, `/users/me`, `/users/:id`, `/users/:id/role`, `/users/:id` delete.
- Risk: user search feature cannot work through current endpoint path.

### B) Assignments and submissions contract mismatches (high impact)

1. Path prefix mismatch for assignment routes
- Client uses `/courses/:courseId/assignments/...` for most operations.
- Server mounts assignment router at `/api/assignments`.
- Existing server routes are under `/api/assignments/...` (including `/:id`, `/:assignmentId/submit`, `/:assignmentId/submissions`).
- Risk: assignment pages/actions can fail with 404.

2. Create assignment route location mismatch
- Client expects `POST /api/courses/:courseId/assignments`.
- Server currently defines `POST /api/assignments/courses/:courseId/assignments`.
- Risk: create flow fails unless client uses server-specific path.

3. Submission payload schema mismatch
- Client `SubmissionData` sends `submission_text`, `submission_url`, `attachments`.
- Server `createSubmissionSchema` requires `drive_file_id`, `drive_file_name` (+ optional `content`).
- Risk: submission creation fails validation.

4. Grade submission endpoint mismatch
- Client calls nested endpoint `/courses/:courseId/assignments/:assignmentId/submissions/:submissionId/grade`.
- Server grading is handled by `POST /api/grades` (and grade update paths under `/api/grades/:id`).
- Risk: teacher grading action fails.

### C) Grades and enrollments endpoint mismatches

1. Missing enrollments list endpoint
- Client service calls `GET /enrollments?course_id=...&user_id=...`.
- Server enrollments routes do not expose `GET /api/enrollments` list endpoint.
- Risk: enrollment list screens cannot load from this service call.

2. Grade routes mismatch
- Client calls:
  - `/courses/:courseId/grades`
  - `/courses/:courseId/students/:studentId/grades`
  - `/courses/:courseId/grades/statistics`
- Server exposes grade endpoints under `/api/grades`:
  - `/my-grades`
  - `/assignment/:assignmentId`
  - `/assignment/:assignmentId/stats`
  - `/:id`, `/submission/:submissionId`, etc.
- Risk: several grade-related frontend flows can fail with 404.

### D) Teacher service mismatch

1. Missing aggregated submissions endpoint
- Client calls `/assignments/submissions?...`.
- Server only exposes `GET /api/assignments/:assignmentId/submissions`.
- Risk: teacher dashboard recent submissions aggregation cannot load from this endpoint.

2. Announcement create payload mismatch
- Teacher service sends `{ content }`.
- Announcement schema requires `title` and `content`.
- Risk: announcement creation fails validation.

## Missing components check

- No compile-time missing component/import errors were detected in frontend production build (`npm run build --workspace=client` passed).
- There are many lint errors, but they are mostly typing/hooks/style issues rather than missing files/components.

## Priority remediation plan

1. Fix contract-critical API mismatches first (auth, assignments, grades, enrollments).
2. Choose one source of truth:
   - Option A: adapt frontend services to existing backend routes/schemas.
   - Option B: add backend compatibility endpoints to match current frontend expectations.
3. Add contract tests per domain (auth, assignments, grades) to prevent future drift.
4. Stabilize test/lint environment:
   - backend test env setup/mocks for Supabase,
   - ESLint config split or missing plugin installation.

## Suggested implementation strategy

- Short term (fastest path):
  - Patch client service paths/payloads to current backend contracts.
  - Add minimal backend aliases only where changing client is high-risk.
- Medium term:
  - Generate shared API contract docs (OpenAPI + typed client generation).
  - Add CI check that validates client service paths against OpenAPI.
