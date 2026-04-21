type SubmissionStorageProvider = 'google_drive';

export interface SubmissionStorageConsistencyIssue {
  code: string;
  message: string;
  severity: 'warning' | 'error';
  fallback_applied: boolean;
}

export interface SubmissionStorageMetadataInput {
  storage_provider?: string | null;
  provider_file_id?: string | null;
  provider_file_name?: string | null;
  provider_view_link?: string | null;
  provider_revision_id?: string | null;
  provider_mime_type?: string | null;
  provider_size_bytes?: number | string | null;
  provider_checksum?: string | null;
  submission_snapshot_at?: string | null;
  storage_metadata_complete?: boolean | null;
  storage_consistency_issues?: SubmissionStorageConsistencyIssue[] | null;
  drive_file_id?: string | null;
  drive_file_name?: string | null;
  drive_view_link?: string | null;
  file_url?: string | null;
  content?: string | null;
  submission_text?: string | null;
  submission_url?: string | null;
}

export interface NormalizedSubmissionStorageMetadata {
  storageProvider: SubmissionStorageProvider;
  providerLabel: string;
  providerFileId: string | null;
  providerFileName: string | null;
  providerViewLink: string | null;
  providerRevisionId: string | null;
  providerMimeType: string | null;
  providerSizeBytes: number | null;
  providerChecksum: string | null;
  snapshotAt: string | null;
  metadataComplete: boolean;
  consistencyIssues: SubmissionStorageConsistencyIssue[];
  submissionText: string | null;
  submissionUrl: string | null;
}

const toNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toNonNegativeInteger = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return null;
};

const normalizeIssues = (value: unknown): SubmissionStorageConsistencyIssue[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((issue) => {
      const code = toNonEmptyString((issue as { code?: unknown })?.code);
      const message = toNonEmptyString((issue as { message?: unknown })?.message);
      const severity = (issue as { severity?: unknown })?.severity;
      const fallbackApplied = (issue as { fallback_applied?: unknown })?.fallback_applied;

      if (!code || !message || (severity !== 'warning' && severity !== 'error')) {
        return null;
      }

      return {
        code,
        message,
        severity,
        fallback_applied: Boolean(fallbackApplied),
      };
    })
    .filter((issue): issue is SubmissionStorageConsistencyIssue => issue !== null);
};

const resolveProvider = (value: unknown): SubmissionStorageProvider => {
  return toNonEmptyString(value) === 'google_drive' ? 'google_drive' : 'google_drive';
};

const resolveProviderLabel = (_provider: SubmissionStorageProvider): string => {
  return 'Google Drive';
};

const buildGoogleDriveViewLink = (providerFileId: string | null): string | null => {
  if (!providerFileId) {
    return null;
  }

  return `https://drive.google.com/file/d/${encodeURIComponent(providerFileId)}/view`;
};

export const normalizeSubmissionStorageMetadata = (
  value: SubmissionStorageMetadataInput
): NormalizedSubmissionStorageMetadata => {
  const storageProvider = resolveProvider(value.storage_provider);
  const providerFileId = toNonEmptyString(value.provider_file_id) || toNonEmptyString(value.drive_file_id);
  const providerFileName =
    toNonEmptyString(value.provider_file_name) || toNonEmptyString(value.drive_file_name);
  const providerViewLink =
    toNonEmptyString(value.provider_view_link)
    || toNonEmptyString(value.drive_view_link)
    || toNonEmptyString(value.submission_url)
    || toNonEmptyString(value.file_url)
    || buildGoogleDriveViewLink(providerFileId);
  const consistencyIssues = normalizeIssues(value.storage_consistency_issues);

  return {
    storageProvider,
    providerLabel: resolveProviderLabel(storageProvider),
    providerFileId,
    providerFileName,
    providerViewLink,
    providerRevisionId: toNonEmptyString(value.provider_revision_id),
    providerMimeType: toNonEmptyString(value.provider_mime_type),
    providerSizeBytes: toNonNegativeInteger(value.provider_size_bytes),
    providerChecksum: toNonEmptyString(value.provider_checksum),
    snapshotAt: toNonEmptyString(value.submission_snapshot_at),
    metadataComplete:
      typeof value.storage_metadata_complete === 'boolean'
        ? value.storage_metadata_complete
        : consistencyIssues.length === 0,
    consistencyIssues,
    submissionText: toNonEmptyString(value.content) || toNonEmptyString(value.submission_text),
    submissionUrl: providerViewLink,
  };
};

export const formatProviderFileSize = (sizeBytes: number | null | undefined): string | null => {
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return null;
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = sizeBytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  const display = size >= 10 ? Math.round(size) : Math.round(size * 10) / 10;
  return `${display} ${units[unitIndex]}`;
};
