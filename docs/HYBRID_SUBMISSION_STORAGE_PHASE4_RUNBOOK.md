# Hybrid Submission Storage Phase 4 Runbook

Updated: 2026-04-21

## Scope
This runbook operationalizes Phase 4 for the hybrid submission storage rollout:
- P4-01: Staging migration and backfill verification
- P4-02: Metadata integrity monitoring and alert thresholds
- P4-03: Production cutover checklist and rollback drill
- P4-04: Post-rollout monitoring window and issue triage

## Prerequisites
- Teacher or admin access token with access to target courses.
- Backend deployed with diagnostics endpoint available:
  - `GET /api/assignments/:assignmentId/submissions/storage-diagnostics`
- Node.js runtime available in repo root.

## P4-01 Staging Verification Procedure
1. Ensure database migrations are current in staging.
2. Run rollout diagnostics check against staging API.
3. Save report artifact under `tmp/`.
4. Block promotion if threshold is exceeded.

Example command:

```bash
npm run rollout:submission-storage:check -- \
  --api-url "https://staging-api.example.com/api" \
  --token "${STAGING_TEACHER_TOKEN}" \
  --limit 100 \
  --fail-threshold 0 \
  --report "tmp/submission-storage-rollout/staging-report.json"
```

Pass criteria:
- Script exit code is `0`.
- `thresholdExceeded` is `false` in report.
- `inconsistentSubmissions` is `0` or within approved exception budget.

## P4-02 Integrity Dashboard and Alerts
Use these metrics from diagnostics reports and direct SQL checks.

Recommended alert thresholds:
- Critical: inconsistent submissions ratio `> 1%` in 15-minute window.
- Warning: inconsistent submissions ratio `> 0.2%` in 60-minute window.
- Watchlist: any new issue code not seen in baseline.

Ad hoc SQL probe (via linked Supabase CLI):

```bash
npm run supabase:query -- "
select
  count(*) as total_rows,
  count(*) filter (
    where coalesce(provider_file_id, '') = ''
      or coalesce(storage_provider, '') = ''
      or submission_snapshot_at is null
  ) as inconsistent_rows,
  round(
    100.0 * count(*) filter (
      where coalesce(provider_file_id, '') = ''
        or coalesce(storage_provider, '') = ''
        or submission_snapshot_at is null
    ) / nullif(count(*), 0),
    3
  ) as inconsistent_ratio_pct
from submissions;
"
```

Operational dashboard fields:
- Total submissions scanned
- Inconsistent submissions
- Inconsistent ratio percent
- Issue breakdown by consistency code
- Top affected assignments (by inconsistent count)

## P4-03 Production Cutover and Rollback Drill
Pre-cutover checklist:
- [ ] Staging report archived and approved.
- [ ] Rollback owner and on-call engineer assigned.
- [ ] Support channel opened with incident template pinned.
- [ ] Baseline metrics captured (last 24 hours).

Cutover checklist:
- [ ] Deploy backend and frontend artifacts that include Phase 2/3 changes.
- [ ] Run production diagnostics check with report output.
- [ ] Confirm `thresholdExceeded=false`.
- [ ] Validate assignment submit and grade flows manually on one teacher course.

Rollback drill checklist:
- [ ] Simulate threshold breach by forcing fail threshold below observed value.
- [ ] Execute documented rollback path (previous backend/frontend release).
- [ ] Re-run diagnostics and verify regression is cleared.
- [ ] Record drill duration and blockers.

## P4-04 Post-Rollout Monitoring and Triage
Monitoring windows:
- 0 to 2 hours: run diagnostics every 15 minutes.
- 2 to 24 hours: run diagnostics hourly.
- 24 to 72 hours: run diagnostics every 4 hours.

Triage protocol:
1. Classify issue severity by inconsistent ratio and impacted assignments.
2. Gather latest diagnostics report artifact and affected assignment IDs.
3. Escalate to backend owner for read-path normalization defects.
4. Escalate to frontend owner for payload generation defects.
5. Open incident note with timeline, fix, and follow-up action.

Closure criteria:
- No critical alerts for 72 hours.
- No increasing trend in inconsistent ratio over two consecutive windows.
- All incidents have documented root cause and remediation.
