#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_API_URL = 'https://mabinilms.vercel.app/api';

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
};

const normalizeApiBase = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return DEFAULT_API_URL;
  }

  return trimmed.replace(/\/+$/, '');
};

const toIso = (value) => {
  try {
    return new Date(value).toISOString();
  } catch {
    return new Date().toISOString();
  }
};

const parseArgs = (argv) => {
  const args = {
    apiUrl: process.env.BASE_API_URL || DEFAULT_API_URL,
    token: process.env.ROLLOUT_TOKEN || process.env.ACCESS_TOKEN || '',
    courseId: process.env.COURSE_ID || '',
    limit: parsePositiveInt(process.env.ASSIGNMENT_LIMIT, 100),
    offset: parsePositiveInt(process.env.ASSIGNMENT_OFFSET, 0),
    failThreshold: parsePositiveInt(process.env.DIAGNOSTICS_FAIL_THRESHOLD, 0),
    reportPath: process.env.REPORT_PATH || '',
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const next = argv[index + 1];

    switch (argument) {
      case '--api-url':
        if (next) {
          args.apiUrl = next;
          index++;
        }
        break;
      case '--token':
        if (next) {
          args.token = next;
          index++;
        }
        break;
      case '--course-id':
        if (next) {
          args.courseId = next;
          index++;
        }
        break;
      case '--limit':
        if (next) {
          args.limit = parsePositiveInt(next, args.limit);
          index++;
        }
        break;
      case '--offset':
        if (next) {
          args.offset = parsePositiveInt(next, args.offset);
          index++;
        }
        break;
      case '--fail-threshold':
        if (next) {
          args.failThreshold = parsePositiveInt(next, args.failThreshold);
          index++;
        }
        break;
      case '--report':
        if (next) {
          args.reportPath = next;
          index++;
        }
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        break;
    }
  }

  args.apiUrl = normalizeApiBase(args.apiUrl);
  args.token = String(args.token || '').trim();
  args.courseId = String(args.courseId || '').trim();
  args.reportPath = String(args.reportPath || '').trim();
  return args;
};

const printHelp = () => {
  console.log(`\nSubmission storage rollout verification\n\nUsage:\n  node scripts/submission-storage-rollout-check.mjs [options]\n\nOptions:\n  --api-url <url>           API base URL (default: ${DEFAULT_API_URL})\n  --token <jwt>             Bearer token for teacher/admin user\n  --course-id <uuid>        Optional course filter\n  --limit <n>               Assignment page size (default: 100)\n  --offset <n>              Assignment offset (default: 0)\n  --fail-threshold <n>      Allowed inconsistent submissions before failure\n  --report <path>           Optional path to write JSON report\n  --help, -h                Show this help\n\nEnvironment fallback:\n  BASE_API_URL, ROLLOUT_TOKEN, ACCESS_TOKEN, COURSE_ID, ASSIGNMENT_LIMIT,\n  ASSIGNMENT_OFFSET, DIAGNOSTICS_FAIL_THRESHOLD, REPORT_PATH\n`);
};

const apiRequest = async ({ apiUrl, token, pathName }) => {
  const url = `${apiUrl}${pathName.startsWith('/') ? pathName : `/${pathName}`}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const bodyText = await response.text();
  let payload = null;
  try {
    payload = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    payload = { raw: bodyText };
  }

  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || bodyText || 'Unknown error';
    throw new Error(`HTTP ${response.status} for GET ${pathName}: ${detail}`);
  }

  return payload;
};

const getAssignments = async ({ apiUrl, token, courseId, limit, offset }) => {
  const params = new URLSearchParams({
    include_past: 'true',
    limit: String(limit),
    offset: String(offset),
  });

  if (courseId) {
    params.set('course_id', courseId);
  }

  const payload = await apiRequest({
    apiUrl,
    token,
    pathName: `/assignments?${params.toString()}`,
  });

  const assignments = Array.isArray(payload?.data) ? payload.data : [];
  return assignments;
};

const getDiagnostics = async ({ apiUrl, token, assignmentId }) => {
  const payload = await apiRequest({
    apiUrl,
    token,
    pathName: `/assignments/${assignmentId}/submissions/storage-diagnostics`,
  });

  return payload?.data || null;
};

const mergeIssueBreakdown = (target, source) => {
  if (!source || typeof source !== 'object') {
    return;
  }

  for (const [code, count] of Object.entries(source)) {
    const normalizedCount = parsePositiveInt(count, 0);
    target[code] = (target[code] || 0) + normalizedCount;
  }
};

const writeReport = (reportPath, report) => {
  const absolutePath = path.isAbsolute(reportPath)
    ? reportPath
    : path.resolve(process.cwd(), reportPath);

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  return absolutePath;
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (!args.token) {
    throw new Error(
      'Missing token. Pass --token or set ROLLOUT_TOKEN/ACCESS_TOKEN environment variable.'
    );
  }

  const startedAt = new Date().toISOString();
  const assignments = await getAssignments(args);

  const report = {
    startedAt,
    finishedAt: null,
    apiUrl: args.apiUrl,
    courseId: args.courseId || null,
    assignmentCount: assignments.length,
    diagnosticsChecked: 0,
    totalSubmissions: 0,
    inconsistentSubmissions: 0,
    issueBreakdown: {},
    assignments: [],
    threshold: args.failThreshold,
    thresholdExceeded: false,
  };

  for (const assignment of assignments) {
    const assignmentId = String(assignment?.id || '').trim();
    if (!assignmentId) {
      continue;
    }

    const diagnostics = await getDiagnostics({
      apiUrl: args.apiUrl,
      token: args.token,
      assignmentId,
    });

    if (!diagnostics) {
      continue;
    }

    report.diagnosticsChecked++;
    report.totalSubmissions += parsePositiveInt(diagnostics.total_submissions, 0);
    report.inconsistentSubmissions += parsePositiveInt(diagnostics.inconsistent_submissions, 0);
    mergeIssueBreakdown(report.issueBreakdown, diagnostics.issue_breakdown);

    report.assignments.push({
      assignmentId,
      assignmentTitle: assignment?.title || null,
      totalSubmissions: parsePositiveInt(diagnostics.total_submissions, 0),
      inconsistentSubmissions: parsePositiveInt(diagnostics.inconsistent_submissions, 0),
      issueBreakdown: diagnostics.issue_breakdown || {},
    });
  }

  report.finishedAt = new Date().toISOString();
  report.thresholdExceeded = report.inconsistentSubmissions > args.failThreshold;

  console.log('Submission storage rollout diagnostics summary');
  console.log(`Started: ${toIso(report.startedAt)}`);
  console.log(`Finished: ${toIso(report.finishedAt)}`);
  console.log(`Assignments scanned: ${report.diagnosticsChecked}/${report.assignmentCount}`);
  console.log(`Total submissions: ${report.totalSubmissions}`);
  console.log(`Inconsistent submissions: ${report.inconsistentSubmissions}`);
  console.log(`Fail threshold: ${args.failThreshold}`);
  console.log(`Threshold exceeded: ${report.thresholdExceeded ? 'YES' : 'NO'}`);

  if (Object.keys(report.issueBreakdown).length > 0) {
    console.log('Issue breakdown:');
    for (const [code, count] of Object.entries(report.issueBreakdown)) {
      console.log(`- ${code}: ${count}`);
    }
  }

  if (args.reportPath) {
    const absolutePath = writeReport(args.reportPath, report);
    console.log(`Report written: ${absolutePath}`);
  }

  if (report.thresholdExceeded) {
    process.exit(2);
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
