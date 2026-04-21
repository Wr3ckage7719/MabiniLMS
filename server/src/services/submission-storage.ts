import { ApiError, ErrorCode } from '../types/index.js';
import {
  CreateSubmissionInput,
  SubmissionStorageProvider,
  SubmissionStorageConsistencyIssue,
  SubmissionStorageConsistencyIssueCode,
} from '../types/assignments.js';
import * as driveService from './google-drive.js';

export interface NormalizedSubmissionStorageInput {
  provider: SubmissionStorageProvider;
  fileId: string;
  requestedFileName: string | null;
}

export interface SubmissionStorageSnapshot {
  storageProvider: SubmissionStorageProvider;
  providerFileId: string;
  providerRevisionId: string | null;
  providerMimeType: string | null;
  providerSizeBytes: number | null;
  providerChecksum: string | null;
  snapshotAt: string;
  legacyDriveFileId: string | null;
  legacyDriveFileName: string | null;
  legacyDriveViewLink: string | null;
}

interface SubmissionStorageContext {
  userId: string;
  teacherEmail: string;
}

interface SubmissionStorageReadRecord {
  storage_provider?: unknown;
  provider_file_id?: unknown;
  provider_revision_id?: unknown;
  provider_mime_type?: unknown;
  provider_size_bytes?: unknown;
  provider_checksum?: unknown;
  submission_snapshot_at?: unknown;
  drive_file_id?: unknown;
  drive_file_name?: unknown;
  drive_view_link?: unknown;
  submitted_at?: unknown;
}

export interface NormalizedSubmissionStorageReadSnapshot {
  storage_provider: SubmissionStorageProvider;
  provider_file_id: string | null;
  provider_revision_id: string | null;
  provider_mime_type: string | null;
  provider_size_bytes: number | null;
  provider_checksum: string | null;
  submission_snapshot_at: string | null;
  provider_file_name: string | null;
  provider_view_link: string | null;
  storage_metadata_complete: boolean;
  storage_consistency_issues: SubmissionStorageConsistencyIssue[];
}

const normalizeNonEmptyString = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const parseFileSizeBytes = (size: string | undefined): number | null => {
  if (!size) {
    return null;
  }

  const parsed = Number.parseInt(size, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
};

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    return parseFileSizeBytes(value);
  }

  return null;
};

const createConsistencyIssue = (
  code: SubmissionStorageConsistencyIssueCode,
  message: string,
  severity: 'warning' | 'error',
  fallbackApplied: boolean
): SubmissionStorageConsistencyIssue => ({
  code,
  message,
  severity,
  fallback_applied: fallbackApplied,
});

export const normalizeSubmissionStorageInput = (
  input: CreateSubmissionInput
): NormalizedSubmissionStorageInput => {
  const provider = (input.provider || 'google_drive') as SubmissionStorageProvider;

  if (provider !== 'google_drive') {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      `Unsupported submission storage provider: ${provider}`,
      400
    );
  }

  const fileId =
    normalizeNonEmptyString(input.provider_file_id)
    || normalizeNonEmptyString(input.drive_file_id);

  if (!fileId) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      'A submission file reference is required',
      400
    );
  }

  const requestedFileName =
    normalizeNonEmptyString(input.provider_file_name)
    || normalizeNonEmptyString(input.drive_file_name);

  return {
    provider,
    fileId,
    requestedFileName,
  };
};

const buildGoogleDriveSnapshot = async (
  input: NormalizedSubmissionStorageInput,
  context: SubmissionStorageContext
): Promise<SubmissionStorageSnapshot> => {
  const hasAccess = await driveService.checkFileAccess(input.fileId, context.userId);
  if (!hasAccess) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Unable to access the specified Drive file',
      403
    );
  }

  const fileMetadata = await driveService.getFileMetadata(input.fileId, context.userId);

  await driveService.shareFileWithUser(
    input.fileId,
    context.teacherEmail,
    'reader',
    context.userId
  );

  const resolvedFileName = input.requestedFileName || fileMetadata.name || 'Drive Submission';

  return {
    storageProvider: 'google_drive',
    providerFileId: input.fileId,
    providerRevisionId: normalizeNonEmptyString(fileMetadata.version),
    providerMimeType: normalizeNonEmptyString(fileMetadata.mimeType),
    providerSizeBytes: parseFileSizeBytes(fileMetadata.size),
    providerChecksum: normalizeNonEmptyString(fileMetadata.md5Checksum),
    snapshotAt: new Date().toISOString(),
    legacyDriveFileId: input.fileId,
    legacyDriveFileName: resolvedFileName,
    legacyDriveViewLink: driveService.getDriveWebViewUrl(input.fileId),
  };
};

export const prepareSubmissionStorageSnapshot = async (
  input: NormalizedSubmissionStorageInput,
  context: SubmissionStorageContext
): Promise<SubmissionStorageSnapshot> => {
  if (input.provider === 'google_drive') {
    return buildGoogleDriveSnapshot(input, context);
  }

  throw new ApiError(
    ErrorCode.VALIDATION_ERROR,
    `Unsupported submission storage provider: ${input.provider}`,
    400
  );
};

export const normalizeSubmissionStorageSnapshotForRead = (
  record: SubmissionStorageReadRecord
): NormalizedSubmissionStorageReadSnapshot => {
  const issues: SubmissionStorageConsistencyIssue[] = [];

  const rawProvider = normalizeNonEmptyString(
    typeof record.storage_provider === 'string' ? record.storage_provider : null
  );

  const storageProvider: SubmissionStorageProvider = 'google_drive';

  if (!rawProvider) {
    issues.push(
      createConsistencyIssue(
        'missing_storage_provider',
        'Submission row is missing storage_provider; defaulted to google_drive.',
        'warning',
        true
      )
    );
  } else if (rawProvider !== 'google_drive') {
    issues.push(
      createConsistencyIssue(
        'invalid_storage_provider',
        `Submission row has unsupported storage_provider "${rawProvider}"; defaulted to google_drive.`,
        'warning',
        true
      )
    );
  }

  const providerFileId = normalizeNonEmptyString(
    typeof record.provider_file_id === 'string' ? record.provider_file_id : null
  );
  const legacyDriveFileId = normalizeNonEmptyString(
    typeof record.drive_file_id === 'string' ? record.drive_file_id : null
  );
  const normalizedProviderFileId = providerFileId || legacyDriveFileId;

  if (!normalizedProviderFileId) {
    issues.push(
      createConsistencyIssue(
        'missing_provider_file_id',
        'Submission row is missing provider_file_id and drive_file_id fallback.',
        'error',
        false
      )
    );
  } else if (!providerFileId && legacyDriveFileId) {
    issues.push(
      createConsistencyIssue(
        'missing_provider_file_id',
        'Submission row is missing provider_file_id; drive_file_id fallback was applied.',
        'warning',
        true
      )
    );
  }

  const snapshotAt = normalizeNonEmptyString(
    typeof record.submission_snapshot_at === 'string' ? record.submission_snapshot_at : null
  );
  const submittedAt = normalizeNonEmptyString(
    typeof record.submitted_at === 'string' ? record.submitted_at : null
  );
  const normalizedSnapshotAt = snapshotAt || submittedAt;

  if (!snapshotAt) {
    issues.push(
      createConsistencyIssue(
        'missing_submission_snapshot_at',
        'Submission row is missing submission_snapshot_at; submitted_at fallback was applied.',
        'warning',
        Boolean(submittedAt)
      )
    );
  }

  const driveViewLink = normalizeNonEmptyString(
    typeof record.drive_view_link === 'string' ? record.drive_view_link : null
  );
  const normalizedViewLink =
    driveViewLink
    || (normalizedProviderFileId ? driveService.getDriveWebViewUrl(normalizedProviderFileId) : null);

  return {
    storage_provider: storageProvider,
    provider_file_id: normalizedProviderFileId,
    provider_revision_id: normalizeNonEmptyString(
      typeof record.provider_revision_id === 'string' ? record.provider_revision_id : null
    ),
    provider_mime_type: normalizeNonEmptyString(
      typeof record.provider_mime_type === 'string' ? record.provider_mime_type : null
    ),
    provider_size_bytes: toNumberOrNull(record.provider_size_bytes),
    provider_checksum: normalizeNonEmptyString(
      typeof record.provider_checksum === 'string' ? record.provider_checksum : null
    ),
    submission_snapshot_at: normalizedSnapshotAt,
    provider_file_name: normalizeNonEmptyString(
      typeof record.drive_file_name === 'string' ? record.drive_file_name : null
    ),
    provider_view_link: normalizedViewLink,
    storage_metadata_complete: issues.length === 0,
    storage_consistency_issues: issues,
  };
};

export const summarizeSubmissionStorageConsistencyIssues = (
  submissions: Array<{ storage_consistency_issues?: SubmissionStorageConsistencyIssue[] }>
): Record<string, number> => {
  const summary: Record<string, number> = {};

  for (const submission of submissions) {
    for (const issue of submission.storage_consistency_issues || []) {
      summary[issue.code] = (summary[issue.code] || 0) + 1;
    }
  }

  return summary;
};
