# MabiniLMS Feature Delivery Reference
Date: April 11, 2026  
Status: Approved baseline and sprint kickoff

## 1. Approval Record

Phase boundaries and effort estimates are approved exactly as follows.

| Phase | Window | Tickets | Total Effort |
|---|---|---|---|
| Now | 0-30 days | LMS-003, LMS-004, LMS-006, LMS-008, LMS-009 | 73 person-days |
| Next | 31-60 days | LMS-001, LMS-002, LMS-005, LMS-007 | 62 person-days |
| Later | 61-90 days | LMS-010, LMS-011, LMS-012 | 43 person-days |

Total planned effort: 178 person-days.

---

## 2. Sprint 1 Kickoff

Sprint 1 window: April 13, 2026 to May 1, 2026  
Committed Sprint 1 scope:
- LMS-003 Direct teacher enrollment by institutional email
- LMS-004 Institutional weighted grading engine (40/30/30)
- LMS-006 Submission status pipeline and revision loop

Expected unlock for Sprint 2:
- LMS-008 Immediate course access on login
- LMS-009 Real-time Current Standing

Sprint 1 exit criteria:
- [x] LMS-003 merged and deployed behind agreed rollout controls
- [x] LMS-004 merged and validated with sample calculations
- [x] LMS-006 merged with transition rules and history auditing
- [x] Regression tests pass for enrollment, assignments, and grading flows
- [ ] QA signoff for student and teacher core workflows

---

## 3. Core Formula Baseline

Institutional weighted grading target:

$$
Final = 0.4 \cdot Exam + 0.3 \cdot Quiz + 0.3 \cdot Activity
$$

---

## 4. Ticket Backlog Summary

| ID | Title | Phase | Story Points | Depends On |
|---|---|---|---:|---|
| LMS-001 | Offline submission queue and auto-sync | Next | 13 | None |
| LMS-002 | Adaptive network policy and low-bandwidth throttling | Next | 8 | LMS-001 (recommended) |
| LMS-003 | Direct teacher enrollment by institutional email | Now | 8 | None |
| LMS-004 | Institutional weighted grading engine (40/30/30) | Now | 13 | None |
| LMS-005 | One-click registrar export in PDF and XLSX | Next | 13 | LMS-004 |
| LMS-006 | Submission status pipeline and revision loop | Now | 21 | None |
| LMS-007 | Browser push deadline reminders | Next | 13 | LMS-001 (optional) |
| LMS-008 | Immediate course access on login for assigned students | Now | 5 | LMS-003 |
| LMS-009 | Real-time Current Standing with weighted logic | Now | 8 | LMS-004, LMS-006 |
| LMS-010 | Proctored exam lock using visibility and fullscreen controls | Later | 13 | None |
| LMS-011 | Fisher-Yates randomization for question and choice order | Later | 8 | LMS-010 (recommended) |
| LMS-012 | Exam interaction restrictions hardening | Later | 8 | LMS-010 |

---

## 5. Traceability Matrix (Proposal Statement -> Engineering Work)

| Proposal Statement | Status | API Tasks | DB Tasks | UI Tasks | Ticket |
|---|---|---|---|---|---|
| Centralized repository for syllabi/lectures/resources | Implemented | Maintain materials API and regression tests | Maintain indexes and integrity | Maintain stream/material pages | Maintenance |
| Native PWA installability via web app manifest | Implemented | None net-new | None net-new | Maintain install CTA and install checks | Maintenance |
| Responsive Tailwind UI for desktop/tablet/mobile | Implemented | None net-new | None net-new | Continue responsive QA sweeps | Maintenance |
| Offline-first submission buffer with auto-sync | Missing | Sync-safe submission and idempotency | Sync key tracking | Queue/sync states and retry UI | LMS-001 |
| Resource throttling and adaptive timeout for low-bandwidth users | Partial | Network profile aware API behavior | Optional policy config | Text-first mode and adaptive behavior | LMS-002 |
| RBAC across Admin/Teacher/Student | Implemented | Maintain authorization checks | Maintain role policies/RLS | Keep role-aware route guards | Maintenance |
| Direct enrollment by institutional email | Implemented | Enroll-by-email endpoints | Email normalization index + enrollment audit | Teacher roster email-add flow | LMS-003 |
| Automated final grades using 40/30/30 | Implemented | Weighted grading endpoints | Category mapping + weight config | Weighted breakdown views | LMS-004 |
| One-click registrar export to PDF/Excel official format | Missing | PDF/XLSX export endpoints | Template metadata + export logs | Export controls and download states | LMS-005 |
| Centralized announcement stream | Implemented | Maintain announcement APIs/events | Existing structure sufficient | Maintain teacher announcement UX | Maintenance |
| Submission and approval pipeline with revision loop | Implemented | Transition + revision endpoints | Status expansion + history tables | Status timeline and revision UX | LMS-006 |
| Digital archiving of grade/submission changes | Partial | Ensure complete audit emission | Add missing audit history coverage | Audit views for admins/teachers | LMS-006 |
| Browser push deadline reminders | Missing | Push subscription + dispatch APIs | Subscription + delivery log tables | Permission flow + notification settings | LMS-007 |
| Immediate course access upon login | Implemented | Login-time enrollment sync | Optional assignment mapping | Auto-populate student dashboard | LMS-008 |
| Real-time Current Standing | Implemented | Standing endpoint + realtime updates | Standing aggregates/materialized view if needed | Current standing widgets | LMS-009 |
| Secure testing via visibility and fullscreen controls | Implemented | Proctoring attempt + violation APIs | Attempt + violation persistence | Exam shell lock behavior | LMS-010 |
| Fisher-Yates question and choice randomization | Implemented | Seeded randomized attempt generation | Persist seed and rendered order | Render per-attempt shuffle | LMS-011 |
| Disable right-click/copy/paste/print during exams | Implemented | Violation ingestion + policy API | Violation type taxonomy | Interaction guards in proctored mode | LMS-012 |
| Granular student-only performance visibility | Implemented | Maintain scoped data endpoints | Maintain RLS policies | Keep student-only views | Maintenance |

---

## 6. GitHub Issue Bodies (Ready to Paste)

### LMS-001
Title: LMS-001 Offline submission queue and auto-sync  
Labels: type:feature, phase:next, priority:p1, area:api, area:db, area:ui, area:reliability  
Story Points: 13  
Dependencies: None

## Summary
Implement offline-first submission buffering. If network is unavailable, submissions queue locally and auto-sync when connectivity returns.

## Scope
- [ ] Add client-side durable submission queue with sync token.
- [ ] Add reconnect listener and automatic sync runner.
- [ ] Add idempotency handling for submission sync at API layer.
- [ ] Add UI states: queued, syncing, synced, failed.
- [ ] Add retry and conflict handling with clear messages.

## Acceptance Criteria
- [ ] Student can submit while offline and see queued state.
- [ ] Reconnect triggers sync without manual refresh.
- [ ] Server creates exactly one submission per sync token.
- [ ] Sync failures expose retry action and preserve payload.
- [ ] End-to-end offline-to-online scenario passes.

## Definition of Done
- [ ] Unit tests for queue/retry logic.
- [ ] Integration tests for idempotent submission handling.
- [ ] Telemetry for queue depth and sync outcomes.
- [ ] API docs updated.

---

### LMS-002
Title: LMS-002 Adaptive network policy and low-bandwidth throttling  
Labels: type:feature, phase:next, priority:p1, area:api, area:ui, area:performance  
Story Points: 8  
Dependencies: LMS-001 (recommended)

## Summary
Add adaptive network behavior to prioritize text data and adjust timeouts/retries under degraded connectivity.

## Scope
- [ ] Add client network profile detection.
- [ ] Prioritize text-first workflows over heavy media.
- [ ] Apply adaptive timeout and retry policies.
- [ ] Add optional reduced payload API mode.
- [ ] Add metrics for degraded-network operation.

## Acceptance Criteria
- [ ] Low-bandwidth mode reduces non-essential heavy requests.
- [ ] Core text-based actions remain usable under poor network.
- [ ] Timeout and retry behavior changes by profile.
- [ ] Measured improvement in completion rate under weak connectivity.

## Definition of Done
- [ ] Integration tests for normal and degraded profiles.
- [ ] Feature flag for rollout control.
- [ ] Documentation for policy behavior.

---

### LMS-003
Title: LMS-003 Direct teacher enrollment by institutional email  
Labels: type:feature, phase:now, sprint:s1, priority:p0, area:api, area:db, area:ui  
Story Points: 8  
Dependencies: None

## Summary
Enable teachers to directly enroll students by institutional email in one action.

## Scope
- [ ] Add single and bulk enroll-by-email endpoints.
- [ ] Validate institutional domain and student role.
- [ ] Add idempotent handling for already-enrolled students.
- [ ] Return per-email result reporting for bulk operations.
- [ ] Add enrollment audit trail.
- [ ] Add teacher roster UI action for email-based enrollment.

## Acceptance Criteria
- [ ] Teacher can enroll valid student institutional email directly.
- [ ] Invalid/non-student/non-institutional emails return clear errors.
- [ ] Existing enrollments are deduplicated and reported.
- [ ] Roster updates immediately on success.
- [ ] Audit record exists for every direct enrollment action.

## Definition of Done
- [ ] API contracts documented.
- [ ] Integration tests for single and bulk enroll-by-email.
- [ ] UI QA completed on key breakpoints.

---

### LMS-004
Title: LMS-004 Institutional weighted grading engine (40/30/30)  
Labels: type:feature, phase:now, sprint:s1, priority:p0, area:api, area:db, area:ui  
Story Points: 13  
Dependencies: None

## Summary
Implement weighted final-grade computation using institutional 40/30/30 category weights.

## Scope
- [ ] Add assignment-to-category mapping.
- [ ] Add weighted aggregation service per student/course.
- [ ] Add API endpoint for weighted breakdown and final.
- [ ] Define deterministic handling for incomplete category data.
- [ ] Add teacher/student UI for category contribution visibility.

## Acceptance Criteria
- [ ] Final grade follows 40/30/30 formula exactly.
- [ ] Weighted breakdown is transparent and traceable.
- [ ] Grade edits trigger immediate recomputation.
- [ ] Edge cases for missing data are deterministic and documented.
- [ ] Tests validate formula across representative scenarios.

## Definition of Done
- [ ] Migration for category mapping applied.
- [ ] Unit and integration tests pass.
- [ ] API and UX docs updated.

---

### LMS-005
Title: LMS-005 One-click registrar export in PDF and XLSX  
Labels: type:feature, phase:next, priority:p1, area:api, area:db, area:ui, area:reporting  
Story Points: 13  
Dependencies: LMS-004

## Summary
Provide registrar-ready one-click exports in PDF and XLSX matching official format.

## Scope
- [ ] Extend export API to pdf and xlsx formats.
- [ ] Apply official registrar template layout and required columns.
- [ ] Include weighted finals from LMS-004.
- [ ] Add export audit logs and metadata.
- [ ] Add export controls and progress state in UI.

## Acceptance Criteria
- [ ] PDF export matches official grading sheet format.
- [ ] XLSX export includes required fields and order.
- [ ] Exported weighted values match gradebook values.
- [ ] Export action is logged with actor and timestamp.
- [ ] Registrar sample validation passes.

## Definition of Done
- [ ] Template signoff captured.
- [ ] Automated tests validate file structure and core values.
- [ ] Documentation updated.

---

### LMS-006
Title: LMS-006 Submission status pipeline and revision loop  
Labels: type:feature, phase:now, sprint:s1, priority:p0, area:api, area:db, area:ui, area:workflow  
Story Points: 21  
Dependencies: None

## Summary
Implement full submission pipeline and revision loop:
Draft, Submitted, Late, Under Review, Graded.

## Scope
- [ ] Expand status model and transition rules.
- [ ] Add status transition APIs.
- [ ] Add revision request and resubmission APIs.
- [ ] Add immutable status history records.
- [ ] Add timeline UI for students and teachers.

## Acceptance Criteria
- [ ] All five statuses exist with valid transitions enforced.
- [ ] Teacher can request revision from under-review context.
- [ ] Student can resubmit while retaining history.
- [ ] Status changes are timestamped and auditable.
- [ ] Regression tests pass for grading and notifications.

## Definition of Done
- [ ] Migration for statuses/history applied.
- [ ] Transition matrix documented.
- [ ] Permission tests pass per role.

---

### LMS-007
Title: LMS-007 Browser push deadline reminders  
Labels: type:feature, phase:next, priority:p1, area:api, area:db, area:ui, area:notifications  
Story Points: 13  
Dependencies: LMS-001 (optional)

## Summary
Add browser push reminders for approaching deadlines with subscription management.

## Scope
- [ ] Add push subscription register/unregister endpoints.
- [ ] Add reminder scheduler and dispatch.
- [ ] Add delivery logs and retry strategy.
- [ ] Add permission and preferences UI.
- [ ] Add in-app fallback when push unavailable.

## Acceptance Criteria
- [ ] Student can opt in/out of push reminders.
- [ ] Reminders deliver at configured intervals.
- [ ] Failures are logged and retried.
- [ ] Settings persist and are respected.

## Definition of Done
- [ ] Subscription schema and logs in place.
- [ ] End-to-end tests for subscribe and reminder delivery.
- [ ] Documentation updated.

---

### LMS-008
Title: LMS-008 Immediate course access on login for assigned students  
Labels: type:feature, phase:now, priority:p1, area:api, area:db, area:ui, area:onboarding  
Story Points: 5  
Dependencies: LMS-003

## Summary
Ensure assigned students get immediate course access after login without manual join steps.

## Scope
- [ ] Add login-time enrollment sync for eligible students.
- [ ] Ensure dashboard reflects assignments immediately.
- [ ] Preserve strict authorization boundaries.
- [ ] Keep manual join path for exceptional use.

## Acceptance Criteria
- [ ] Assigned student sees courses on first post-login load.
- [ ] No join code needed for pre-assigned courses.
- [ ] Access remains scoped to authorized courses.

## Definition of Done
- [ ] Integration tests pass for login and immediate visibility.
- [ ] Student dashboard QA signoff complete.

---

### LMS-009
Title: LMS-009 Real-time Current Standing with weighted logic  
Labels: type:feature, phase:now, priority:p1, area:api, area:db, area:ui, area:analytics  
Story Points: 8  
Dependencies: LMS-004, LMS-006

## Summary
Deliver real-time Current Standing based on weighted grading and active submission state.

## Scope
- [ ] Add standing calculation endpoint.
- [ ] Emit standing update events on grade/status changes.
- [ ] Add student and teacher standing components.
- [ ] Enforce student-only visibility for personal standing.

## Acceptance Criteria
- [ ] Standing reflects 40/30/30 weighted values.
- [ ] Standing updates near real-time after grade/status events.
- [ ] Student cannot access peers' standing data.
- [ ] Teacher/admin views stay role-scoped.

## Definition of Done
- [ ] Role access tests pass.
- [ ] Accuracy checks pass against sample calculations.
- [ ] API/UI docs updated.

---

### LMS-010
Title: LMS-010 Proctored exam lock using visibility and fullscreen controls  
Labels: type:feature, phase:later, priority:p2, area:api, area:db, area:ui, area:security  
Story Points: 13  
Dependencies: None

## Summary
Add proctored exam lock behavior with visibility and fullscreen violation handling.

## Scope
- [ ] Add exam attempt lifecycle and policy controls.
- [ ] Add client lock shell for fullscreen/visibility monitoring.
- [ ] Add violation ingestion and policy action APIs.
- [ ] Add teacher audit view of violations.

## Acceptance Criteria
- [ ] Tab switch and fullscreen exit are logged as violations.
- [ ] Policy thresholds trigger configured outcomes.
- [ ] Teacher can review violation history per attempt.
- [ ] Attempt integrity events are timestamped and traceable.

## Definition of Done
- [ ] Security review completed.
- [ ] Functional and abuse-path tests pass.

---

### LMS-011
Title: LMS-011 Fisher-Yates randomization for question and choice order  
Labels: type:feature, phase:later, priority:p2, area:api, area:db, area:ui, area:assessment  
Story Points: 8  
Dependencies: LMS-010 (recommended)

## Summary
Generate unique exam instances using Fisher-Yates randomization with deterministic reproducibility.

## Scope
- [ ] Add seeded attempt generation.
- [ ] Shuffle question and choice order per attempt.
- [ ] Persist seed and rendered order for replay/audit.
- [ ] Ensure scoring maps correctly after randomization.

## Acceptance Criteria
- [ ] Different attempts have varied order.
- [ ] Same seed reproduces exact order.
- [ ] Correct-answer mapping remains valid.
- [ ] Randomization applies to questions and choices.

## Definition of Done
- [ ] Unit tests validate shuffle determinism and integrity.
- [ ] Integration tests validate scoring correctness.

---

### LMS-012
Title: LMS-012 Exam interaction restrictions hardening  
Labels: type:feature, phase:later, priority:p2, area:api, area:db, area:ui, area:security  
Story Points: 8  
Dependencies: LMS-010

## Summary
Restrict right-click, copy/paste shortcuts, and print shortcuts during active proctored attempts.

## Scope
- [ ] Add exam-mode interaction guards on client.
- [ ] Add violation capture for restricted interactions.
- [ ] Apply restrictions only during active proctored attempts.
- [ ] Add accessibility-safe exceptions and messaging.

## Acceptance Criteria
- [ ] Restricted actions are blocked only in proctored attempt context.
- [ ] Violation events are logged for blocked actions.
- [ ] Restrictions are removed immediately when attempt ends.
- [ ] Accessibility exceptions are documented and tested.

## Definition of Done
- [ ] Security and accessibility review completed.
- [ ] Browser compatibility QA passed.

---

## 7. Immediate Execution Order

Execution sequence for active work:
1. LMS-003
2. LMS-004
3. LMS-006
4. LMS-008
5. LMS-009
6. LMS-001
7. LMS-002
8. LMS-005
9. LMS-007
10. LMS-010
11. LMS-011
12. LMS-012