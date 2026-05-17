# Mobile UX Improvement Plan — MabiniLMS PWA

> **Scope:** Student-facing mobile view only. Web/desktop layout must not be drastically altered — changes are constrained to responsive breakpoints (`< md:` i.e., < 768 px) unless stated otherwise. Button rearrangement is the primary mechanism; existing component logic and data flow are preserved.

---

## Observations from Screenshots

Three screens were reviewed:

| Screen | File |
|---|---|
| Assessment modal (scrolled up, "Start Quiz" hidden) | Screenshot 1 |
| Assessment modal (scrolled down, "Start Quiz" visible) | Screenshot 2 |
| Lesson detail page (completed lesson) | Screenshot 3 |

### Pain Points Identified

1. **"Start Quiz" button buried at bottom** — students must scroll to find the primary action inside the assessment modal.
2. **Tab labels are abbreviated** — "Cmnts(0)" and "Submit(0)" look cryptic and inconsistent.
3. **Close (×) button is small** — difficult to tap precisely on a phone.
4. **Material card row is cramped** — icon + truncated filename + Read badge + download icon + chevron all fight for horizontal space.
5. **Assessment card truncates the title** — "SOFTWARE ENGINEERING ASSESME…" loses context.
6. **ALL CAPS titles** — hard to read quickly on a small screen.
7. **"Back to lessons" and "Lesson 01"** header links are small; touch target is too small.
8. **Lesson completion card** sits inline inside scrollable content — students may miss it or need to scroll back up after reading.
9. **Status badge row** (date + Overdue + Assigned) gets tight on narrow screens.
10. **Section headings** ("MATERIALS", "ASSESSMENTS", "NEXT UP") feel corporate/cold.

---

## Improvement Areas

---

### 1. Navigation Header (`LessonDetailPage.tsx` — sticky header)

**Current:** Small text `← Back to lessons` on the left, `Lesson 01` label on the right. Both are plain text with minimal padding.

**Problem:** Touch target below the 44 px minimum recommended by Apple HIG / 48 dp by Material Design. No visual cue that "Lesson 01" is context, not a button.

**Plan:**

- **Back button** — wrap in a pill/icon-button with at least `min-h-[44px] min-w-[44px]` padding. Keep the `←` chevron icon + "Back" label (shorter label avoids wrapping on small screens). On desktop, keep the existing "Back to lessons" text unchanged.
- **Lesson label** — keep it as a non-interactive label but increase font size slightly (`text-sm → text-base`) and add subtle opacity to distinguish it as metadata, not a button.
- **Progress indicator (optional enhancement)** — add a thin linear progress bar directly below the sticky header (e.g., `h-1 bg-primary/20` track, `bg-primary` fill based on `viewed / total materials`). This gives students a quick sense of where they are. Visible only on mobile.

**Files to touch:** `client/src/pages/LessonDetailPage.tsx` (header JSX, ~lines 380–420)

**Tailwind strategy:** Add `sm:hidden` / `md:hidden` classes or conditionally apply mobile-only padding classes. Desktop header remains identical.

---

### 2. Lesson Title & Status Badge (`LessonDetailPage.tsx`)

**Current:** Title renders in `font-bold text-2xl md:text-3xl` in ALL CAPS (title text comes from the database as-is, the component does not transform case). Status badge ("Done" / "Locked") floats above the title.

**Problem:** ALL CAPS is visually taxing on mobile. The status badge position (top-left, before the title) may be missed by users who start reading from the title.

**Plan:**

- **Case transform** — apply `capitalize` or CSS `text-transform: capitalize` via Tailwind `capitalize` utility *only* on mobile using `capitalize md:normal-case`. This lets the existing uppercase DB values render correctly on desktop while improving readability on mobile without touching data.
- **Status badge repositioning** — on mobile, place the status badge (`Done` / `Locked` / `In Progress`) inline to the left of the title, not above it. This groups status + title in one visual unit and saves vertical space.
- **Font size** — reduce mobile title to `text-xl` (currently `text-2xl`) to reduce the amount of vertical space the title consumes, giving more room to the content below.

**Files to touch:** `client/src/pages/LessonDetailPage.tsx` (title section JSX)

---

### 3. Section Headings ("MATERIALS", "ASSESSMENTS", "NEXT UP")

**Current:** All-caps `text-xs tracking-widest text-muted-foreground` labels used as section dividers.

**Problem:** On mobile, these read as very technical/corporate. They are also easily overlooked due to low contrast.

**Plan:**

- **Typography change on mobile only** — switch to `text-sm font-semibold` (slightly larger, not all-caps) using `capitalize` to render "Materials", "Assessments", "Next Up". Add a short left-side accent bar (`border-l-4 border-primary pl-2`) for visual structure. Desktop stays unchanged (`text-xs tracking-widest`).
- **Spacing** — increase top margin above each section heading on mobile from current `mt-6` to `mt-8` so sections breathe more.

**Files to touch:** `client/src/pages/LessonDetailPage.tsx` (section heading JSX — search for `MATERIALS`, `ASSESSMENTS`, `NEXT UP` string literals)

---

### 4. Material Card Row (`MaterialRow` component, `LessonDetailPage.tsx`)

**Current layout (horizontal, single line):**
```
[📄 icon] [TRUNCATED TITLE  DOCUMENT · 37 KB]  [✅ Read]  [⬇]  [›]
```
Five distinct interactive or informational elements compete horizontally.

**Problem:** The file name is truncated. The download icon and the "open" chevron are both small tap targets placed close together — easy to mis-tap.

**Plan:**

- **Two-line layout on mobile** — restructure the card content into a 2-row layout:
  - **Row 1:** `[📄 icon]  [File name — full, wraps to 2 lines max]  [✅ Read badge]`
  - **Row 2 (metadata):** `[DOCUMENT · 37 KB]` on the left, `[⬇ Download]  [›]` on the right
- **Touch targets** — ensure the download button is at least `h-9 w-9` and the open chevron is at least `h-10 w-10` with visible padding. The entire card row remains tappable (opens the material).
- **Desktop unchanged** — the existing single-row layout stays as-is for `md:` and above breakpoints.
- **"Tap to open" affordance** — if the material has not been viewed yet, show a faint `Tap to open →` label in the metadata row on mobile to encourage interaction.

**Files to touch:** `client/src/pages/LessonDetailPage.tsx` — `MaterialRow` sub-component (currently inlined or extracted — adjust JSX using `flex-col md:flex-row` pattern)

---

### 5. "Lesson Completed" Card (Mark as Done CTA)

**Current:** Rendered inline inside the scrollable content between Materials and Assessments sections. Uses `sticky bottom-4` positioning.

**Problem:** Even with `sticky` positioning, on mobile the card can be partially obscured by the browser navigation bar or the Android system bar. Also, the "Done" button inside is currently muted/faded when already marked done, providing no "what next" guidance.

**Plan:**

- **Sticky bottom bar on mobile** — on screens `< md`, move the "Mark lesson as done" / "Done" action out of the inline card and into a **fixed bottom action bar** (`fixed bottom-0 left-0 right-0 z-30`). The bar should:
  - Be `h-16` with `safe-area-inset-bottom` padding for iOS notch support
  - Show: `[Lesson completed ✓]  [→ Next lesson]` when done, or `[N of M materials viewed]  [Mark as Done]` when pending
  - Have a `backdrop-blur` + slight background tint for legibility over content
- **Remove the inline card on mobile** — hide the inline "Lesson completed" card on mobile (`hidden md:block`) since the fixed bar replaces it. Desktop keeps the existing inline card.
- **Disabled state clarity** — when requirements are not yet met, show the unmet count inside the bar: e.g., "View 1 more material to unlock".

**Files to touch:** `client/src/pages/LessonDetailPage.tsx` — sticky card JSX + add new mobile bar JSX. CSS: add `pb-16 md:pb-0` to the main scroll container so content is not hidden behind the bar.

---

### 6. Assessment Card Row (`AssessmentRow` component, `LessonDetailPage.tsx`)

**Current layout:**
```
[📋 icon]  [QUIZ  3 pts]  [SOFTWARE ENGINEERING ASSESME...]  [Take assessment]  [›]
```
Title truncates. "Take assessment" secondary text is small.

**Plan:**

- **Allow title to wrap** — remove `truncate` / `line-clamp-1` on mobile and allow the title to use up to 2 lines (`line-clamp-2`). This prevents "…" cuts. Desktop keeps single-line truncation.
- **Prominent status call-to-action** — replace the small "Take assessment" plain text with a colored `Badge` or small `Button` variant:
  - Locked → amber `Badge` with lock icon "Locked"
  - Available → blue `Badge` "Start"
  - Submitted → green `Badge` "Submitted"
  - Graded → green `Badge` with score "82%"
- **Points badge** — keep it but make it `text-xs` and style as a soft chip to save horizontal space.
- **Touch target** — ensure the entire card row is tappable (`cursor-pointer` + hover state). Min height `h-14`.

**Files to touch:** `client/src/pages/LessonDetailPage.tsx` — `AssessmentRow` sub-component

---

### 7. Assessment Modal Tabs (`AssignmentDetailDialog.tsx`)

**Current tabs:**
```
[Details]  [Cmnts(0)]  [Submit(0)]
```
Labels are abbreviated oddly. Count badges are embedded in the label string rather than a visual badge.

**Plan:**

- **Full labels with count badges** — use icon + full label + count chip pattern:
  - `Details` → stays "Details" (no count needed)
  - `Cmnts(0)` → "Comments" + a small numeric badge chip (`rounded-full bg-muted text-xs px-1`)
  - `Submit(0)` → "Submissions" + numeric badge chip
- **On very small screens (< 360 px)** — allow icons only for Comments and Submissions tabs using `<span class="sr-only">` for accessibility.
- **Tab bar styling** — increase tab height to `h-10` minimum for easy tapping. Ensure active tab has a visible indicator (underline or filled pill).

**Files to touch:** `client/src/components/AssignmentDetailDialog.tsx` — `TabsList` / `TabsTrigger` JSX (around lines where tabs are defined)

---

### 8. Assessment Modal — Sticky "Start Quiz" Button

**Current:** "Start Quiz" / "Start Proctored Exam" button is at the bottom of the Details tab content. Students must scroll down to see it.

**Problem:** This is the single most important action in the modal. It should never be hidden behind a scroll.

**Plan:**

- **Sticky CTA inside the modal on mobile** — add a fixed-to-modal-bottom action strip inside the dialog on mobile. The strip:
  - Contains only the primary action button ("Start Quiz", "Start Exam", "Submit Activity", etc.)
  - Is `hidden md:hidden` — only shown on mobile
  - Sits at `sticky bottom-0` inside the `DialogContent` scroll container
  - Has a subtle top border + background to separate it from content
- **Remove the button from its current inline position on mobile** — on `< md`, hide the inline button (`hidden md:block`) to avoid duplication. The sticky strip is the only version on mobile.
- **Disabled state** — if the quiz is locked (gate not met), the sticky button shows "Locked — view materials first" with a lock icon and amber color instead of the normal primary style.

**Files to touch:** `client/src/components/AssignmentDetailDialog.tsx` — Details tab content area + add sticky strip inside `DialogContent`

---

### 9. Assessment Modal — Header & Close Button

**Current:** The `×` close button is a small `Button variant="ghost" size="icon"` in the top-right corner of the dialog. The dialog header also contains the assignment icon circle + title in ALL CAPS.

**Problems:**
- `×` button is often only 32–36 px — too small for mobile.
- Dialog title in ALL CAPS is hard to read quickly.

**Plan:**

- **Larger close button** — increase the close button to `size="lg"` or add explicit `className="h-11 w-11"` to ensure 44 px tap target. Keep position top-right.
- **Add drag handle** — on mobile, add a `div` styled as a drag indicator (`mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30`) at the very top of the dialog sheet. This signals to users that the modal can be dismissed by swiping down (visual affordance even if gesture is not implemented).
- **Title case on mobile** — same strategy as Lesson title: apply `capitalize md:normal-case` so "SOFTWARE ENGINEERING ASSESSMENT" renders as "Software Engineering Assessment" on mobile.
- **Assignment type badge** — move the "Quiz" / "Exam" / "Activity" badge to sit inline to the left of the title on mobile (currently it's below the title) to save vertical space.

**Files to touch:** `client/src/components/AssignmentDetailDialog.tsx` — dialog header JSX (top section with icon, title, badge)

---

### 10. Assessment Modal — Status Metadata Row

**Current:** Single horizontal row with `[📅 May 5, 3:59 PM]  [🔴 Overdue]  [Assigned]` — all badges side-by-side.

**Problem:** On narrow screens (< 360 px), this row can overflow or wrap awkwardly.

**Plan:**

- **Two-row layout on mobile** — use `flex-wrap` so the badges naturally wrap to the next line if needed. Add `gap-2` so wrapped items have breathing room.
- **"Overdue" badge prominence** — keep the red color but increase text to `text-sm` (currently `text-xs`) on mobile so it's harder to miss.
- **"Assigned" badge** — currently styled identically to Overdue but with a neutral color. On mobile, consider using an outlined/ghost variant to visually de-emphasize it relative to the Overdue badge.
- **Submission status** — if the assignment has been submitted, add a green "Submitted ✓" badge in this row for quick status at a glance.

**Files to touch:** `client/src/components/AssignmentDetailDialog.tsx` — metadata badges section

---

## Summary Table

| # | Area | Current Problem | Mobile Fix | Web Impact |
|---|---|---|---|---|
| 1 | Navigation header | Small touch targets | Larger back button pill, min 44px | None |
| 2 | Lesson title | ALL CAPS, too large | `capitalize` + smaller `text-xl` | None (desktop unchanged) |
| 3 | Section headings | All-caps, low contrast | `capitalize` + left accent bar | None |
| 4 | Material card | Cramped single row | Two-row layout on mobile | None |
| 5 | Mark as Done CTA | Inline, easy to miss | Fixed bottom action bar | Inline card stays on desktop |
| 6 | Assessment card | Truncated title | 2-line title, badge status | None |
| 7 | Modal tabs | Ugly abbreviations | Full labels + count badges | Minor tab label improvement |
| 8 | Start Quiz button | Hidden below scroll | Sticky bottom strip in modal | None |
| 9 | Modal close button | Too small (< 44px) | `h-11 w-11` + drag handle | Slightly larger × button |
| 10 | Status badge row | Overflow risk | `flex-wrap`, larger Overdue badge | None |

---

## Implementation Notes

- All changes use **Tailwind responsive prefixes** (`md:`, `sm:`) — no separate mobile stylesheet needed.
- Use `md:hidden` to hide mobile-only elements on desktop and `hidden md:block` to keep desktop-only elements.
- No changes to routing, data fetching, business logic, or API calls.
- No changes to teacher-facing pages (`LessonEditorPage`, teacher dashboard).
- `safe-area-inset-bottom` for the fixed bottom bar requires CSS env() — already supported by modern mobile browsers. Add `pb-[env(safe-area-inset-bottom)]` to the bar.
- Test on viewport widths: 360 px (small Android), 390 px (iPhone 14), 430 px (iPhone 14 Pro Max).

---

## Files Affected (Summary)

| File | Changes |
|---|---|
| `client/src/pages/LessonDetailPage.tsx` | Items 1, 2, 3, 4, 5, 6 |
| `client/src/components/AssignmentDetailDialog.tsx` | Items 7, 8, 9, 10 |
| `client/src/index.css` | Safe-area padding rule for fixed bar (if not already present) |
