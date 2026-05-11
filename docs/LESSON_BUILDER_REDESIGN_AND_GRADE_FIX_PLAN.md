# Lesson Builder Redesign + Grade Save Bug Fix — Implementation Plan

**Branch:** `claude/fix-image-redesign-builder-GoQvU`
**Target executor:** Claude Sonnet (or any contributor)
**Production safety priority:** HIGH — every change must preserve existing API contracts and data, ship behind feature flags or as pure UI improvements where possible.
**Date drafted:** 2026-05-11

---

## 0. Executive summary

Two independent pieces of work, kept in the same plan because they share the same teacher-facing workflow.

| # | Task | Risk | Scope |
|---|------|------|-------|
| **A** | Fix "Grade already exists" save failure on `SubmissionsTab` | LOW | Frontend only |
| **B** | Redesign the lesson builder page (`LessonEditorPage`) | MEDIUM | UI-only, no schema or API change in Phase 1 |
| **C** | New lesson-builder features (Phase 2+) | VARIES | Some require schema migration; gate them |

Do **A** first (one-line bug, immediate teacher pain). Then **B** (UI-only, big UX win). **C** is an opt-in backlog — only implement features the user explicitly approves.

---

## 1. TASK A — Fix the "Grade already exists" error

### 1.1 What the user sees

When the teacher clicks **Save Grade & Feedback** on a submission that has already been graded (typically by the auto-grader for exams), the UI shows a red toast:

> **Save failed**
> Grade already exists for this submission. Use update instead.

The submission stays unsaved.

### 1.2 Root cause

`client/src/services/teacher.service.ts:252-260` always POSTs to `/api/grades`:

```ts
async gradeSubmission(submissionId: string, data: {...}): Promise<{ data: any }> {
  return apiClient.post(`/grades`, { submission_id: submissionId, ...data });
}
```

The backend `createGrade` service (`server/src/services/grades.ts:163-176`) rejects with a 409 if a row already exists in `grades` for that `submission_id`. Auto-graded exams (`server/src/services/exams.ts`) insert that row, so the manual UI save then collides.

A working pattern already exists server-side in `bulkGrade` (`grades.ts:763-811`): it calls `getGradeBySubmissionId` first and routes to `createGrade` or `updateGrade`. We just need the single-submission UI to follow the same pattern.

### 1.3 Recommended fix (frontend-only, lowest risk)

**Goal:** never change the existing REST contract. POST stays "create only," PUT stays "update only," and the UI picks the right one.

#### Step 1 — Add an upsert helper to `teacher.service.ts`

Replace `gradeSubmission` with logic that fetches the existing grade first:

```ts
async gradeSubmission(submissionId: string, data: {
  points_earned: number;
  feedback?: string;
}): Promise<{ data: any }> {
  // 1. Check whether a grade already exists for this submission.
  //    GET /api/submissions/:submissionId/grade returns the grade or null.
  let existingGradeId: string | null = null;
  try {
    const response = await apiClient.get(`/submissions/${submissionId}/grade`);
    existingGradeId = response?.data?.id ?? null;
  } catch (error) {
    // 404 here just means "no grade yet" — fall through to POST.
    existingGradeId = null;
  }

  if (existingGradeId) {
    // 2a. Update path
    return apiClient.put(`/grades/${existingGradeId}`, {
      points_earned: data.points_earned,
      feedback: data.feedback,
    });
  }

  // 2b. Create path — wrap in a 409 fallback so a race condition
  //     (e.g. auto-grader writing between our GET and POST) still
  //     succeeds instead of showing the red toast.
  try {
    return await apiClient.post(`/grades`, {
      submission_id: submissionId,
      ...data,
    });
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 409) {
      // Re-fetch the grade ID that just appeared and PUT instead.
      const retry = await apiClient.get(`/submissions/${submissionId}/grade`);
      const retryId = retry?.data?.id;
      if (retryId) {
        return apiClient.put(`/grades/${retryId}`, {
          points_earned: data.points_earned,
          feedback: data.feedback,
        });
      }
    }
    throw error;
  }
}
```

**Why this design:**
- Zero backend changes — production data and contracts untouched.
- Handles the race condition where the auto-grader writes between our GET and POST.
- Uses endpoints that already exist (`GET /submissions/:id/grade`, `PUT /grades/:id`).

#### Step 2 — Verify the consumer

`SubmissionsTab.handleSaveSubmissionGrade` (`teacher-class-stream/index.tsx:351`) already calls `teacherService.gradeSubmission(...)`. No change needed there — it picks up the new behavior automatically.

#### Step 3 — Toast copy

The current error toast surfaces the backend `error.message` directly. After the fix the 409 path is invisible, so no copy change is needed. Optional: change the success toast to "Grade saved" → "Grade updated" when we took the PUT path, by returning a flag from the helper.

### 1.4 Test plan

Manual:
1. **Fresh submission (no grade):** open a submission with `gradedAt: null`, set Grade=8, save → success toast, grade appears.
2. **Already-graded submission (this bug):** open the auto-graded exam from the screenshot (1/10), change Grade to 5, save → success toast, grade updates to 5, feedback updates.
3. **Race condition:** open an ungraded submission, in a second tab trigger the auto-grader, then save in the first tab → success (one of POST/PUT succeeds).
4. **Validation errors still work:** enter Grade=11 on a 10-pt assignment → backend rejects with "Points cannot exceed assignment maximum of 10" → toast shows that message.

Automated (optional, only if test infra is easy):
- Add a Vitest unit test for `teacher.service.ts:gradeSubmission` mocking the apiClient: assert PUT is called when GET returns a grade, POST when GET returns null, PUT fallback when POST 409s.

### 1.5 Out of scope (deliberately)

- **Do NOT** add an upsert endpoint server-side. That widens the API contract and changes semantics for every other caller of `POST /grades`.
- **Do NOT** add a UNIQUE constraint on `grades.submission_id`. The schema currently has none (per `database-schema-complete.sql:79-86`); the service layer enforces uniqueness. Adding a constraint is a migration with backfill considerations — out of scope for a UI bug fix.
- **Do NOT** change `gradeSubmission`'s function signature. Other callers (`SubmissionsTab`, possibly elsewhere) rely on it.

---

## 2. TASK B — Redesign the lesson builder page

### 2.1 Current state

File: `client/src/pages/LessonEditorPage.tsx` (635 lines)
Route: `/class/:id/lessons/:lessonId/edit`

The page is one long vertical column of 6 cards stacked on top of each other:

```
┌─────────────────────────────────────────┐
│ Header: ← Back   ClassName    Lesson 06 │
├─────────────────────────────────────────┤
│ H1: New lesson / Edit lesson            │
│ Subtitle paragraph                      │
├─────────────────────────────────────────┤
│ Card 1: Title / Topic tags / Description│
├─────────────────────────────────────────┤
│ Card 2: Materials                       │
│   + Add reading material                │
├─────────────────────────────────────────┤
│ Card 3: Completion rule                 │
│   • Mark as done  • View all  • Time    │
├─────────────────────────────────────────┤
│ Card 4: Assessments                     │
│   + Activity  + Quiz  + Exam            │
├─────────────────────────────────────────┤
│ Card 5: Chain (next lesson)             │
├─────────────────────────────────────────┤
│ Card 6: Danger zone (delete)            │
├─────────────────────────────────────────┤
│ Footer: [Draft]    Save draft  Publish  │
└─────────────────────────────────────────┘
```

#### What's good — keep it
- Sticky header + sticky footer with Save/Publish — predictable.
- Auto-save before navigating away to add materials/assessments (`silentlyPersistDraft`).
- shadcn/ui primitives + Tailwind — already consistent with the rest of the app.
- React Query cache invalidation logic on return from sub-pages.
- Alert dialog on destructive actions.

#### What's painful
1. **Vertical-only layout** wastes horizontal space on desktop. Teachers building a lesson scroll a lot.
2. **No sense of progress** — first-time teachers don't know how many sections to fill or which are required.
3. **"Add reading material" is a full page navigation** that auto-saves and bounces away — slow, breaks flow.
4. **No preview** — teachers can't see what students will see without leaving the page and re-entering as a student.
5. **No reordering of materials** — they appear in upload order and can't be rearranged.
6. **Plain-textarea description** — no formatting, no embedded links, no images.
7. **No validation feedback** — clicking Publish with no title shows a toast but doesn't highlight the field.
8. **Title-only requirement is implicit** — teachers don't realize they can publish an empty lesson.
9. **No lesson duplication** — teachers re-create similar lessons from scratch.
10. **No learning-objectives field** — pedagogically important and required by many curricula (incl. Mabini's).
11. **Danger zone always visible** — pulls the eye on every load.
12. **Auto-save UX is invisible** — `silentlyPersistDraft` runs only when adding materials/assessments; teachers can't tell when their work is safe.

### 2.2 Phase-1 redesign (UI-only, ship-safe)

The goal of Phase 1: a clearly better UX with **zero schema changes** and **zero new API endpoints**. Everything below works against the existing `Lesson` shape (`client/src/lib/data.ts:178-203`) and `LessonEditorPayload` (`services/lessons.service.ts`).

#### 2.2.1 Two-column layout on desktop (≥ lg breakpoint)

Mobile keeps the current single-column flow.
Desktop becomes:

```
┌──────────────────────────────────────────────────────────────┐
│  Header: ← Back to lessons   ClassName   Lesson 06           │
├──────────────────────────┬───────────────────────────────────┤
│ LEFT (sticky, w-64)      │ RIGHT (scroll)                    │
│                          │                                   │
│ Setup checklist          │ Section: Basics                   │
│ ☑ Title                  │   Title, Topics, Description,     │
│ ☑ Description            │   Learning objectives             │
│ ☐ Materials              │                                   │
│ ☐ Completion rule        │ Section: Materials                │
│ ☐ Assessments            │   Drag-and-drop list              │
│ ☐ Chain                  │                                   │
│ — — — — — — — — — — — —  │ Section: Completion rule          │
│ Quick actions            │                                   │
│ • Preview as student     │ Section: Assessments              │
│ • Duplicate lesson       │                                   │
│ • Delete (modal)         │ Section: Chain                    │
└──────────────────────────┴───────────────────────────────────┘
│ Footer: [Draft / autosaved 5s ago]   Save draft  Publish     │
└──────────────────────────────────────────────────────────────┘
```

**Implementation notes:**
- Use Tailwind's `lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8`.
- Sticky checklist: `lg:sticky lg:top-20`.
- Each section gets `id="section-basics"`, `id="section-materials"`, etc., and the checklist items are anchor links with smooth scroll.

#### 2.2.2 Setup checklist (derived state, no schema change)

The checklist is purely derived from `draft` + `lesson`:

```ts
const checklist = useMemo(() => [
  { id: 'title',       label: 'Title',           done: draft.title.trim().length > 0 },
  { id: 'description', label: 'Description',     done: draft.description.trim().length > 0 },
  { id: 'materials',   label: 'Add materials',   done: lesson.materials.length > 0,         optional: true },
  { id: 'completion',  label: 'Completion rule', done: true /* always set; default mark_as_done */ },
  { id: 'assessment',  label: 'Assessments',     done: lesson.assessments.length > 0,       optional: true },
  { id: 'chain',       label: 'Next lesson',     done: draft.chainNextId !== '__none__',    optional: true },
], [draft, lesson]);
```

Show a "X / Y complete" header. Required (non-optional) items must be done before **Publish** is enabled.

#### 2.2.3 Inline validation + Publish guards

Today `persist(true)` only checks the title. Expand to:

```ts
const validationErrors = useMemo(() => {
  const errs: { field: string; message: string }[] = [];
  if (draft.title.trim().length === 0) {
    errs.push({ field: 'title', message: 'Title is required to publish.' });
  }
  // Optional: warn (don't block) on empty description or no materials.
  return errs;
}, [draft]);
```

- Disable the **Publish lesson** button while `validationErrors.length > 0`.
- Show inline red text under the title input when title is empty *after a first publish attempt* (don't pre-yell at the user).
- A small "Why is publish disabled?" tooltip on the disabled button explains.

#### 2.2.4 Visible autosave indicator

Add an `autosaveStatus` state: `'idle' | 'saving' | 'saved' | 'error'` and surface it in the footer next to the Draft badge:

```
[Draft] · Saved 8s ago
```

Trigger autosave on a 1.5s debounce of any `draft` field change (only when the lesson is already persisted, i.e. has an ID). Reuse `silentlyPersistDraft` — it already exists and does the right thing.

```ts
useEffect(() => {
  if (!draft || !lesson) return;
  const handle = setTimeout(() => { void silentlyPersistDraft(); }, 1500);
  return () => clearTimeout(handle);
}, [draft]);
```

**Caveat:** debounce on changes only — don't autosave on mount. Use a ref to skip the first effect.

#### 2.2.5 Drag-to-reorder materials and assessments

Add `dnd-kit/sortable` (already common in shadcn ecosystems — verify it isn't installed before adding; if too heavy, fall back to up/down arrow buttons).

**No schema change** if we use the order-of-array on save: the `LessonEditorPayload` already passes through unchanged fields; the order in `lesson.materials` and `lesson.assessments` is what's persisted. Verify with the backend before shipping — if the backend re-sorts by `created_at`, this requires an `ordering` column. **Action for Sonnet:** read `server/src/services/lessons.ts` (or similar) and confirm whether `materials` and `assessments` carry an `ordering` field; if not, ship reorder behind a flag.

If ordering is not persisted server-side, defer this feature to Phase 2 (it's a backend change).

#### 2.2.6 Inline material upload (drag-and-drop area)

Replace "Add reading material" navigation with a drag-and-drop zone *embedded in the Materials section*. The existing `/new/reading-material` page handles upload — extract its upload logic into a reusable `<MaterialDropzone />` component and mount it inline.

**Risk:** the upload page does file-type validation, progress tracking, and title/description editing. Extracting cleanly is real work. Phase 1 can keep the navigation behavior and **only** improve the empty state (clearer copy, larger button). True inline upload moves to Phase 2.

#### 2.2.7 "Preview as student" button

A new button in the left sidebar that opens a modal previewing the lesson as a student would see it:
- Title, description, materials list, completion rule, assessments, next-lesson hint.
- Read-only — no API calls.

This is pure client-side rendering of the existing `lesson` object through a slimmed-down version of the student lesson view. Look at `client/src/pages/` for the student lesson page and reuse its presentation component if one exists.

#### 2.2.8 Move Danger Zone to a menu

Replace the always-visible red card with a "⋯" overflow menu in the header that opens to **Duplicate** and **Delete**. Less cognitive noise on every load.

#### 2.2.9 Tighten copy

- H1: "Edit lesson" / "New lesson" — keep.
- Subtitle: shorten to one sentence: "Lessons are the building blocks of a class. Add materials, then attach assessments."
- Materials empty state: keep but shorten.
- Completion-rule labels: keep as-is; they're already good.

#### 2.2.10 Keyboard shortcuts

- `Cmd/Ctrl + S` → Save draft.
- `Cmd/Ctrl + Enter` → Publish (only when validation passes).
- `Esc` → close any open modal.

Use a single `useEffect` with `window.addEventListener('keydown', ...)` and clean up on unmount.

### 2.3 Files touched in Phase 1

| File | Change |
|------|--------|
| `client/src/pages/LessonEditorPage.tsx` | Major refactor: introduce two-column layout, sidebar checklist, autosave indicator, validation state, keyboard shortcuts, move danger zone to menu. **Keep all existing handlers and state names** so React Query keys and mutations stay identical. |
| `client/src/components/lesson-editor/LessonEditorSidebar.tsx` *(new)* | Sticky left column with checklist + quick actions. |
| `client/src/components/lesson-editor/LessonPreviewDialog.tsx` *(new)* | Read-only student-eye preview. |
| `client/src/components/lesson-editor/AutosaveBadge.tsx` *(new)* | The "Saved 8s ago" badge. |
| `client/src/components/ui/dropdown-menu.tsx` | Likely already exists from shadcn; verify before importing. |

**No** changes to:
- `client/src/services/lessons.service.ts`
- `client/src/hooks-api/useLessons.ts`
- `server/src/routes/lessons.ts`
- `server/src/controllers/lessons.ts`
- `server/src/services/lessons.ts` (or wherever the service lives)
- `client/src/lib/data.ts` (Lesson types)
- Any database migration

### 2.4 Production safety guardrails for Phase 1

1. **Feature-flag the new layout** if a flag system exists. Search for `featureFlags`, `useFeatureFlag`, or `import.meta.env.VITE_*` patterns. If no flag system exists, ship behind a one-line check like `const NEW_LESSON_BUILDER = true;` near the top of the file so it's easy to revert.
2. **Don't rename props or types** — purely add new components, don't break consumers.
3. **Mobile must remain identical** at first. Use `lg:` breakpoint exclusively for the two-column layout. Test at 375px, 768px, 1024px, 1440px.
4. **Keep the existing `useEffect` that refetches lesson queries on mount** — this is load-bearing for material/assessment add flows.
5. **Don't change React Query cache keys** — they're shared with the lessons list page.
6. **Preserve `silentlyPersistDraft` behavior exactly** — sub-pages depend on it auto-saving before navigation. Just add the autosave timer on top.
7. **Run `npm run lint` and `npm run build:client`** before pushing. The build must pass — Vercel deploys from this.

### 2.5 Test plan for Phase 1

Manual (desktop, 1440px):
1. Load an existing lesson with materials + assessments → all data renders in the right column, checklist on the left reflects state.
2. Edit title → checklist updates live; autosave badge shows "Saving…" then "Saved Xs ago".
3. Empty the title and click Publish → button is disabled, tooltip explains why; inline error appears under the title field.
4. Click "Add reading material" → navigates to upload page; on return, new material appears in the list (existing behavior, must still work).
5. Click overflow menu → Duplicate (placeholder, see Phase 2) and Delete present.
6. Click Delete → confirmation modal → delete works, navigates back to lessons list.
7. Press Cmd+S → Save draft fires; press Cmd+Enter with valid state → Publish fires.

Manual (mobile, 375px):
1. Layout is single-column, identical to today.
2. Sidebar collapses to a horizontal pill chip near the top with "3/4 sections complete" — or is hidden entirely. Verify the page is no taller than today.

Cross-browser: Chrome, Safari, Firefox latest stable.

### 2.6 What to do if Sonnet hits a snag

- If `dnd-kit` isn't installed and the user doesn't want a new dep: skip reorder, document it in Phase 2.
- If the existing student lesson view is tangled: skip the preview dialog for Phase 1, ship the rest.
- If autosave starts triggering on lessons that don't exist yet (no ID): guard with `if (!lesson?.id) return;` inside the debounced effect.

---

## 3. TASK C — Quick-win feature suggestions (Phase 2)

Every item below is **scoped to fit in ≤ 2 hours of focused work**, uses zero new top-level dependencies, and either avoids schema changes entirely or adds a single nullable column. Pick whichever the user wants — they're all independent.

Hard rules:
- No new npm packages.
- No new database table.
- At most one additive nullable column per item.
- Pure client-side wherever possible.

### C1. Lesson emoji icon — **~30 min, client-only**
- **What:** A small emoji picker next to the title. Stored in `localStorage` keyed by `lesson.id` for Phase 2; we can promote to a real column later if users like it.
- **Files:** `LessonEditorPage.tsx` only.
- **Effort:** A `<select>` with ~20 hand-picked emojis (📚 📐 ⚗️ 💻 🎨 …) is enough — no real picker library.
- **Win:** Lessons list page becomes scannable at a glance.

### C2. Lesson templates picker — **~45 min, client-only**
- **What:** When the teacher creates a new lesson, offer 4 hard-coded templates that pre-fill draft fields: *Reading + Quiz*, *Lecture*, *Lab Activity*, *Exam Review*. Each is just a constant object: `{ title, description, topicsRaw, ruleType, ... }`.
- **Files:** `LessonEditorPage.tsx` + a new `templates.ts` constants file.
- **Effort:** A modal with 4 cards. On click, calls `setDraft(...)`. Existing save flow handles the rest.
- **Win:** Onboarding accelerator, no blank-page paralysis. **No schema change.**

### C3. Inline lesson stats badge — **~30 min, client-only**
- **What:** `lesson.stats` already exists in the teacher view (see `client/src/lib/data.ts:178-203`). Surface it: a small badge next to the Draft/Published pill showing "12 students · 78% avg · 9 done".
- **Files:** `LessonEditorPage.tsx` footer area only.
- **Effort:** Read `lesson.stats`, render a few badges. Hide if `lesson.stats` is null.
- **Win:** Teachers see engagement without leaving the editor.

### C4. Topic tag autocomplete from recent lessons — **~45 min, client-only**
- **What:** Below the topics input, show the 5 most-recently-used topics across the teacher's other lessons as clickable chips. Click → append to topics.
- **Files:** `LessonEditorPage.tsx`. Pulls from `lessonsQuery.data` which is already loaded.
- **Effort:** A `useMemo` that flattens `allLessons.map(l => l.topics)`, dedupes, counts frequency, takes top 5.
- **Win:** Teachers stop re-typing the same tags inconsistently ("Hardware" vs "hardware").

### C5. Description word/character counter — **~15 min, client-only**
- **What:** Below the description textarea, show "143 characters · ~24 words · suggested 100–500". Turns amber under 100, green between 100–500, gray above.
- **Files:** `LessonEditorPage.tsx` description block.
- **Effort:** Trivial. A `<p>` reading `draft.description.length`.
- **Win:** Nudges teachers to write descriptions that are actually useful.

### C6. Confirm-before-leave guard — **~30 min, client-only**
- **What:** If `draft` differs from the saved `lesson` and the teacher navigates away (browser back, route change), show a "You have unsaved changes" confirmation.
- **Files:** `LessonEditorPage.tsx`. Use `useBeforeUnload` from `react-router-dom` (already a dep) and `window.addEventListener('beforeunload', …)` for the tab-close case.
- **Effort:** One `useEffect` and a `isDirty` memo.
- **Win:** Stops accidental data loss. Pairs well with the Phase-1 autosave indicator.

### C7. Copy student link — **~10 min, client-only**
- **What:** A small "Copy link" button in the header that copies the student-facing URL of the lesson (`/class/{classId}/lessons/{lessonId}` or whatever the student route is — confirm in `client/src/App.tsx` routes).
- **Files:** `LessonEditorPage.tsx` header.
- **Effort:** One `navigator.clipboard.writeText(...)` + toast.
- **Win:** Easy share-out to chat/email.

### C8. Print / Export-to-PDF view — **~30 min, client-only**
- **What:** A "Print" button that opens a print-friendly view (clean H1, description, materials list with links, assessments list). Uses `window.print()` and a `@media print` Tailwind stylesheet.
- **Files:** `LessonEditorPage.tsx` + a small `@media print` block in `client/src/index.css` (or wherever global styles live).
- **Effort:** Hide chrome (`.print:hidden`), keep content (`.print:block`). Browser's print-to-PDF handles the rest.
- **Win:** Teachers can hand out lesson outlines on paper or PDF.

### C9. Duplicate lesson (client-only version) — **~45 min, client-only**
- **What:** "Duplicate" in the overflow menu. On click, creates a new draft lesson via the existing `createDraft` mutation (POST `/api/lessons/courses/{classId}`), then immediately PATCHes it with this lesson's title (+" copy"), description, topics, completion rule, and chain. Materials and assessments are NOT copied.
- **Files:** `LessonEditorPage.tsx`, plus a helper in `useLessons.ts` if cleanest.
- **Effort:** Sequential mutation: `createDraft → update`. No new endpoint needed.
- **Win:** Cuts re-creation time for similar lessons.
- **Note:** Pure client-orchestrated — no backend change required because both endpoints already exist.

### C10. "Mark as required" toggle on materials/assessments (UI hint only) — **~20 min, client-only**
- **What:** A visual "Required" / "Optional" pill on each MaterialChip and AssessmentChip. Already partially implemented for assessments (`assessment.is_optional`). Just surface it more clearly. For materials, *don't* add a new field — instead derive: a material is "required" if the lesson's `completionRule.type === 'view_all_files'`. Otherwise it's "optional reading".
- **Files:** `LessonEditorPage.tsx` chip components.
- **Effort:** A `<Badge>` per chip.
- **Win:** Clarifies what students must do vs. can skim.

---

### 3.x Recommended Phase 2 bundle

If the user says "do them all," ship in this order (cheapest first, each is an independent commit):

1. **C5** description counter (15 min)
2. **C7** copy student link (10 min)
3. **C10** required/optional pills (20 min)
4. **C3** inline stats badge (30 min)
5. **C6** unsaved-changes guard (30 min)
6. **C1** lesson emoji (30 min)
7. **C8** print view (30 min)
8. **C4** topic tag autocomplete (45 min)
9. **C2** lesson templates (45 min)
10. **C9** duplicate lesson (45 min)

Total estimated effort: **~5 hours** for all ten. Each is a clean revert point if something breaks.

### 3.x Deferred (NOT in this plan — require real engineering)

Listed here only so the user knows they were considered and intentionally skipped:

| Feature | Why deferred |
|---|---|
| Learning objectives field | Needs schema migration + student-side rendering. |
| Estimated duration auto-compute | Needs schema column + heuristic + student-side display. |
| Markdown rich-text description | Needs editor library + sanitizer + student-side renderer. |
| Drag-to-reorder materials/assessments | Needs `ordering` column on join tables + new dep (`dnd-kit`). |
| AI-suggested content | Needs server-side Anthropic key, prompt caching, cost monitoring. |
| Scheduled publish | Needs cron/job runner or read-time check. |
| Conditional / branching release | Curriculum-design complexity. |
| Version history / revert | New table + storage growth concern. |
| Bulk actions on materials | Multi-select state + new endpoints. |
| Inline drag-and-drop upload | Refactor of `MaterialUploadPage`. |
| Per-lesson discussion threads | New table or scoping change to existing discussions. |
| Cover image upload | Storage bucket + new column. |

Pull any of these into a separate plan when the user asks for them by name.

---

## 4. Cross-cutting non-negotiables

1. **Branch:** all work goes to `claude/fix-image-redesign-builder-GoQvU`. Never push to `main`.
2. **Commits:** small, focused. Suggested split:
   - Commit 1: Task A (grade fix) + its tests.
   - Commit 2: Phase 1 redesign skeleton (two-column layout, sidebar, no new behavior yet).
   - Commit 3: Phase 1 features (autosave indicator, validation, keyboard shortcuts).
   - Commit 4: Polish + copy.
3. **Lint + build must pass** before push: `npm run lint && npm run build:client`.
4. **Do not introduce new top-level dependencies** without explicit approval. Reuse what's in `client/package.json`.
5. **Do not delete or rename existing files** — only add new ones and modify `LessonEditorPage.tsx` and `teacher.service.ts`.
6. **Production data is live.** Never run migrations, never run `db:migrate:reset`, never touch `supabase/`. All Phase 1 work is client-only.
7. **Accessibility:** keep `aria-label`s on icon buttons; new buttons get the same treatment. Radio groups in the completion-rule section already have implicit labels — preserve that.
8. **Toasts:** match existing voice — short title, optional description, `variant: 'destructive'` for errors. See existing `toast(...)` calls in the file.

---

## 5. Acceptance criteria checklist

### Task A (grade fix)
- [ ] Submitting a grade on a never-graded submission still works (POST path).
- [ ] Submitting a grade on an already-graded submission succeeds (PUT path) — no "Grade already exists" toast.
- [ ] The toast on success says "Grade saved".
- [ ] No backend file is modified.
- [ ] `npm run lint` passes.
- [ ] `npm run build:client` passes.

### Task B (Phase 1 redesign)
- [ ] Desktop (≥ 1024px) shows two columns with sticky left sidebar.
- [ ] Mobile (< 1024px) remains visually identical to today.
- [ ] Setup checklist on the left reflects live form state.
- [ ] Autosave indicator visible in the footer and updates within ~2s of edits.
- [ ] Publish button is disabled when title is empty.
- [ ] Cmd/Ctrl + S triggers Save draft; Cmd/Ctrl + Enter triggers Publish (when enabled).
- [ ] Danger zone moved into an overflow menu in the header.
- [ ] All existing flows (add material, add quiz/activity/exam, remove material/assessment, save/publish, delete lesson) still work end-to-end.
- [ ] No schema migration committed.
- [ ] No `lessons.service.ts` or backend file modified.
- [ ] `npm run lint` passes.
- [ ] `npm run build:client` passes.

---

## 6. Appendix — useful file references

| Concern | File |
|---|---|
| Lesson editor page | `client/src/pages/LessonEditorPage.tsx` |
| Lesson types | `client/src/lib/data.ts:122-203` |
| Lesson client service | `client/src/services/lessons.service.ts` |
| Lesson React Query hooks | `client/src/hooks-api/useLessons.ts` |
| Submissions / grade UI | `client/src/components/teacher-class-stream/SubmissionsTab.tsx` + `.../index.tsx` |
| Grade client service | `client/src/services/teacher.service.ts:252-260` |
| Grade backend service | `server/src/services/grades.ts` |
| Grade backend controller | `server/src/controllers/grades.ts` |
| Existing upsert reference | `server/src/services/grades.ts:763-811` (`bulkGrade`) |
| Existing 409 path | `server/src/services/grades.ts:163-176` |
| Submission grade GET | `GET /api/submissions/:submissionId/grade` → `getSubmissionGrade` controller |

---

**End of plan.** Hand this file to Claude Sonnet (or any contributor). Execute Task A first, then Phase 1 of Task B. Stop and confirm with the user before starting Phase 2 (Task C).
