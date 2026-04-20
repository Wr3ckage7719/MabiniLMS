import { ApiError, ErrorCode } from '../types/index.js';
import { CreateSubmissionInput, SubmissionStorageProvider } from '../types/assignments.js';
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
