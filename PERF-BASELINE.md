# MabiniLMS — Performance Baseline (2026-05-07)

## Build output (`client/dist/assets/`)

**Total JS:** 3,139.4 KB  
**Total CSS:** 142.0 KB

### Largest 5 JS chunks

| Chunk | Size (KB) | gzip (KB) |
|---|---|---|
| vendor-misc-B2SoOJCP.js | 1,102.2 | 324.9 |
| vendor-pdf-ipPuXVoP.js | 365.1 | 122.5 |
| vendor-pdfjs-W9bjHs_D.js | 351.3 | 106.1 |
| vendor-supabase-Ccxbanmu.js | 181.0 | 49.3 |
| index-BB-_6Ldi.js | 166.9 | 47.2 |

### Other notable chunks

| Chunk | Size (KB) |
|---|---|
| TeacherDashboard-D1eu6n6n.js | 143.6 |
| vendor-radix-DFE1XugC.js | 119.1 |
| vendor-jszip-n1HaO7Fu.js | 95.1 |
| ClassDetail-AWnKs4DZ.js | 77.9 |
| AssignmentBuilderPage-CGKh-Vpu.js | 62.3 |
| vendor-mammoth-DvZw-Wsl.js | 54.3 |
| vendor-query-BeZUfbr1.js | 38.4 |
| vendor-icons-DFBU6dSe.js | 36.8 |
| MaterialPreviewDialog-4gqD5IbN.js | 34.5 |

## Network measurements (manual — Fast 3G, DevTools)

*(Fill in after running the dev server with live data)*

| Page | Total transferred | Finish time | XHR count |
|---|---|---|---|
| `/login` (cold) | TBD | TBD | TBD |
| `/teacher` (cold, hard reload) | TBD | TBD | ~16 |
| `/class/<id>` (cold, ≥1 lesson/assignment/announcement) | TBD | TBD | ~8 |

## Known hot-path issues identified

- `authenticate` middleware: 3-5 DB round-trips per API call (profiles, system_settings, two_factor_auth, session_logs)
- `listCourses`: SELECT * + N+1 teacher attach + N+1 enrollment-count query
- `listAssignments`: SELECT * ships full JSON
- `ClassDetail` page: 8 parallel queries on mount
- `useTeacherDashboard`: ~16 sequential-ish requests
- `useAssignments()` (no courseId): N+1 fan-out per enrolled course
- `GradesPage`: N weighted-grade requests (one per enrolled class)
- `AppLayout`: password-status check fires on every route navigation
- `useMaterials`: eager precache of all material URLs on class open
- `loadUserData` (AuthContext): 3 round-trips to bootstrap user
- `vendor-pdfjs` + `vendor-pdf` + `vendor-mammoth` + `vendor-jszip` in initial graph
