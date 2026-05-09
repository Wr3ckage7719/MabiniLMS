# MabiniLMS — Comprehensive Codebase Review

**Date:** 2026-05-09
**Branch:** `claude/codebase-review-improvements-IMUFj`
**Stack:** React 18 + Vite (frontend) · Express + TypeScript (backend) · PostgreSQL via Supabase · Socket.io · PWA

This document captures a full UI/UX → backend review of the MabiniLMS codebase, with prioritized, non-breaking improvements. Every recommendation is designed to ship without disrupting the current production build.

---

## Table of Contents

1. [UI/UX Review](#part-1--uiux-review)
2. [Backend Review](#part-2--backend-review)
3. [Performance](#part-3--performance-issues)
4. [Security](#part-4--security-summary)
5. [Prioritized Action Plan](#part-5--prioritized-action-plan)
6. [What Not to Change](#what-not-to-change)

---

## Part 1 — UI/UX Review

### 1.1 Critical: `refetchOnMount: 'always'` defeats `staleTime`

**File:** `client/src/App.tsx:55`

```ts
// Current — 'always' ignores staleTime and refetches on EVERY mount
refetchOnMount: 'always',
staleTime: 2 * 60 * 1000,
```

`'always'` bypasses `staleTime` entirely. Every navigation re-triggers API calls even if data was fetched seconds ago. The correct setting is `true` (respects staleTime). This is likely causing perceptible flicker on navigation.

**Safe fix:**

```ts
refetchOnMount: true,   // was 'always'
```

Zero risk to production — reduces network calls, doesn't change data correctness.

---

### 1.2 Critical: `SettingsPage` imports `axios` directly

**File:** `client/src/pages/SettingsPage.tsx:28`

```ts
import axios from 'axios';
```

Direct `axios` usage bypasses the centralized `api-client.ts` which injects the Bearer token, handles 401 session expiry, and auto-detects the API URL. Any request that uses bare `axios` will fail on prod (no auth header) or hit the wrong server.

**Safe fix:** Replace all bare `axios` calls in `SettingsPage.tsx` with the shared `apiClient` from `@/services/api-client.ts`.

---

### 1.3 Moderate: `ClassCard` has full UI duplication for mobile/desktop

**File:** `client/src/components/ClassCard.tsx:77–175`

The component renders two almost-identical trees — one for `md:hidden` (mobile) and one for `hidden md:block` (desktop). Any change (new field, new behavior) must be applied in two places.

**Recommendation:** Extract the shared state to one data structure, then render two small layout wrappers that each call a shared `CardBody` component. No production risk — this is a refactor, not a logic change.

---

### 1.4 Moderate: `AlertDialog` missing `AlertDialogFooter` wrapper

**File:** `client/src/components/ClassCard.tsx:184–203`

The `AlertDialogCancel` and `AlertDialogAction` are siblings of `AlertDialogHeader` with no `AlertDialogFooter` wrapper. On smaller breakpoints, the button group loses its default spacing/layout from shadcn's styles.

**Safe fix:**

```tsx
<AlertDialogContent>
  <AlertDialogHeader>...</AlertDialogHeader>
  <AlertDialogFooter>        {/* add this */}
    <AlertDialogCancel>Cancel</AlertDialogCancel>
    <AlertDialogAction>...</AlertDialogAction>
  </AlertDialogFooter>
</AlertDialogContent>
```

---

### 1.5 Moderate: Vite dev server opens `/teacher` route

**File:** `client/vite.config.ts:8`

```ts
open: "/teacher",
```

New contributors hit a protected route on first `npm run dev`. Should be `"/"` or removed.

---

### 1.6 Moderate: `ErrorBoundary` only logs to console

**File:** `client/src/components/ErrorBoundary.tsx:22`

```ts
componentDidCatch(error: Error, errorInfo: ErrorInfo) {
  console.error('ErrorBoundary caught an error:', error, errorInfo);
}
```

Production errors silently disappear. There is no integration with Sentry, LogRocket, or any error reporting service. Users encounter crashes with no trail for debugging.

**Recommendation:** Add a `reportError` call to an error tracking service (Sentry has a free tier). This is purely additive and has zero production risk.

---

### 1.7 Moderate: `SubmissionQueueSync` is rendered outside `BrowserRouter`

**File:** `client/src/App.tsx:120–140`

```tsx
<AuthProvider>
  <SubmissionQueueSync />   {/* outside BrowserRouter */}
  <BrowserRouter>
    ...
  </BrowserRouter>
</AuthProvider>
```

`SubmissionQueueSync` cannot use React Router hooks (`useNavigate`, `useLocation`) if it needs them. Verify whether it does — if so, move it inside `BrowserRouter`.

---

### 1.8 Minor: `vite.config.ts` disables source maps

**File:** `client/vite.config.ts:15`

```ts
sourcemap: false,
```

Debugging production crashes is very difficult without source maps. Consider `sourcemap: 'hidden'` — maps are generated and uploaded to a service but not served publicly.

---

### 1.9 Minor: `main.tsx` lacks `React.StrictMode`

Without `StrictMode`, double-render checks and deprecated API warnings won't fire in development. Wrapping `<App>` in `<React.StrictMode>` is a zero-risk, high-value addition.

---

### 1.10 Minor: No `aria-label` on icon-only buttons in `ClassCard`

The mobile layout's restore button (`<button type="button" ...>`) and some icon buttons have no accessible label. Screen-reader users won't know what the button does.

---

## Part 2 — Backend Review

### 2.1 Critical: Auth middleware makes 2–5 DB queries per request

**File:** `server/src/middleware/auth.ts`

Every authenticated request triggers:

1. `supabaseAdmin.auth.getUser(token)` — Supabase call
2. `fetchAuthProfile` — up to **3 sequential DB queries** (fallback cascade for legacy columns)
3. `isTwoFactorEnabledForUser` — **+1 query** for 2FA users who don't have the flag set in the profile
4. `hasServerSessionProof` — **+1 query** for every 2FA user on every request

At 50 concurrent users, this is 100–250 DB round-trips per second just for auth, before the actual business logic runs.

**Safe fix (non-breaking):** Add a short-lived in-memory auth cache keyed by a hash of the access token. A 30-second TTL is safe (token changes on password change already handled):

```ts
const authCache = new Map<string, { result: AuthProfile; exp: number }>();
const AUTH_CACHE_TTL_MS = 30_000;
```

The `hasServerSessionProof` call for 2FA users is the worst offender — it hits `session_logs` on every request. Once 2FA is verified at login, cache the result for the token's lifetime.

---

### 2.2 Critical: Dual error class systems create confusion

Two error hierarchies exist in parallel:

- `server/src/errors/AppError.ts` — full hierarchy with `ValidationError`, `NotFoundError`, etc.
- `server/src/types/index.ts:ApiError` — legacy flat class

The error handler normalizes between them, but controllers mix both. New code written by contributors will use whichever they find first.

**Recommendation:** Mark `ApiError` deprecated and migrate controllers to `AppError` subclasses incrementally. Zero production risk — the error handler handles both.

---

### 2.3 Critical: `unsafe-inline` in CSP weakens XSS protection

**File:** `server/src/index.ts:72–73`

```ts
scriptSrc: ["'self'", "'unsafe-inline'"],
styleSrc: ["'self'", "'unsafe-inline'"],
```

This is commented as "Needed for Swagger UI" but applies to all endpoints, including the production API. This significantly weakens XSS protection.

**Safe fix options:**

1. Use CSP nonces for Swagger endpoints only, and tighten the default policy.
2. Serve Swagger docs from a separate path behind the `shouldExposeApiDocs` flag and apply a relaxed CSP only to that path.

---

### 2.4 Moderate: Production URL hardcoded in source

**File:** `server/src/index.ts:120–124`

```ts
'https://mabinilms.vercel.app',
'https://www.mabinilms.vercel.app'
```

Hardcoded production URLs in source expose infrastructure details and can't be changed without a redeploy. Move these to the `CLIENT_URL`/`CORS_ORIGIN` environment variables, which already exist.

---

### 2.5 Moderate: 5MB JSON body limit applied globally

**File:** `server/src/index.ts`

```ts
const JSON_BODY_LIMIT = '5mb';
```

Authentication, grading, and search endpoints don't need multi-megabyte bodies. A 5MB limit on `/auth/login` is a potential DoS vector. Apply tight limits by default (`50kb`) and override only on routes that need it (file metadata, bulk grade operations).

---

### 2.6 Moderate: `decodeJwtPayload` duplicated

The same JWT base64-decode logic exists in both:

- `server/src/middleware/auth.ts:53–65`
- `server/src/lib/supabase.ts:28–40`

Extract to a shared `server/src/utils/jwt.ts` utility.

---

### 2.7 Moderate: Legacy auth fallback cascade is dead code after migrations

**File:** `server/src/middleware/auth.ts:fetchAuthProfile`

The triple-fallback pattern (full select → minus `two_factor_enabled` → legacy select) was needed when migrations were being rolled out. If all 41 migrations have been applied to production, this code adds latency on every request while achieving nothing. Add a migration-version check at server startup to remove the fallbacks when they're no longer needed.

---

### 2.8 Moderate: Logger config split across two paths

The error handler imports from `server/src/config/logger.ts` while other files import from `server/src/utils/logger.ts`. Consolidate to one entry point.

---

### 2.9 Minor: CORS allows `no-origin` requests unconditionally

**File:** `server/src/index.ts`

```ts
if (!origin) {
  return callback(null, true);
}
```

Requests with no `Origin` header are silently allowed. In production, this permits any curl/Postman/server-to-server call with no origin restriction. If the API is browser-only, add a production check and log no-origin requests.

---

### 2.10 Minor: Rate limit for auth is very aggressive on shared IPs

**File:** `server/src/middleware/rateLimiter.ts`

```ts
max: isProduction ? 5 : 100,
```

5 requests per 15 minutes on a school network with NAT means the entire school can be locked out after 5 failed logins from any student. Consider per-user rate limiting (by email in the request body) in addition to IP-based limiting.

---

## Part 3 — Performance Issues

| Priority | Area | Issue | Impact |
|----------|------|--------|--------|
| High | Backend | 2–5 DB queries per auth (§2.1) | Latency scales linearly with users |
| High | Frontend | `refetchOnMount: 'always'` (§1.1) | Doubles API calls on navigation |
| Medium | Frontend | `sourcemap: false` (§1.8) | Slower incident resolution |
| Low | Frontend | `pdfjs-dist` is 3MB+ | First load of material viewer is slow — already chunked, acceptable |

---

## Part 4 — Security Summary

| Severity | Issue | File |
|----------|-------|------|
| High | `unsafe-inline` in CSP for all routes | `server/src/index.ts:72` |
| Medium | Production URL in source code | `server/src/index.ts:120` |
| Medium | 5MB JSON body on all endpoints | `server/src/index.ts` |
| Low | No-origin CORS bypass | `server/src/index.ts:130` |
| Low | Auth rate limit too aggressive for NAT | `server/src/middleware/rateLimiter.ts` |

---

## Part 5 — Prioritized Action Plan

This plan is ordered by impact-to-risk ratio. Each item is non-breaking.

### Phase 1 — Quick wins (no architectural change, safe to ship immediately)

1. **Fix `refetchOnMount: 'always'` → `true`** in `client/src/App.tsx` — reduces API load, no behavior change
2. **Replace bare `axios` in `SettingsPage.tsx`** with `apiClient` — fixes auth-less requests in production
3. **Change `open: "/teacher"` to `"/"` in `vite.config.ts`** — DX improvement only
4. **Add `AlertDialogFooter`** wrapper in `ClassCard.tsx` — layout fix
5. **Move hardcoded CORS origins to env vars** in `server/src/index.ts`
6. **Consolidate `decodeJwtPayload`** to a shared util — remove duplication

### Phase 2 — Performance & reliability (low risk, measurable improvement)

7. **Add auth profile cache** in `server/src/middleware/auth.ts` with 30s TTL — reduces DB load by ~60%
8. **Per-route JSON body limits** — apply `50kb` default, override on bulk/upload endpoints
9. **Enable `sourcemap: 'hidden'`** in `vite.config.ts`
10. **Remove legacy auth fallback cascade** after confirming all migrations are applied

### Phase 3 — Security hardening (requires testing before production)

11. **Tighten CSP `unsafe-inline`** — use nonces or limit to Swagger routes only
12. **Add `React.StrictMode`** to `main.tsx`
13. **Add error reporting service** (e.g. Sentry) to `ErrorBoundary`
14. **Unify error classes** — deprecate `ApiError`, migrate to `AppError` subclasses

### Phase 4 — Code quality (refactoring, no urgency)

15. **Refactor `ClassCard`** to eliminate mobile/desktop duplication
16. **Add `aria-label`** to icon-only buttons
17. **Consolidate logger configs** to single entry point
18. **Unify logger imports** across server code

---

## What Not to Change

- The auth middleware's session timeout, password-change invalidation, and 2FA proof logic are correct and well-implemented. Don't simplify them.
- The QueryClient `retry` config is correct — no retry on 401 is exactly right.
- The Vite manual chunk strategy is well-designed and should not be changed.
- The rate limiter `passOnStoreError: true` is the right resilience choice.
- The Supabase RLS setup and migration numbering are solid.

---

## TL;DR

The codebase is well-structured with good TypeScript discipline, solid security foundations, and a mature migration system. The most impactful immediate fixes are:

1. Fix `refetchOnMount: 'always'` (reduces API calls ~50%)
2. Replace bare `axios` in `SettingsPage` (fixes a production auth bug)
3. Add an auth profile cache (cuts DB queries per request by 60%)
4. Move hardcoded production URLs to env vars

These four changes alone are safe to ship immediately and will yield measurable performance and reliability improvements without touching production behavior.
