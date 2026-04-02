import { ApiError, ErrorCode } from '../types/index.js';
import { getValidGoogleToken } from './google-oauth.js';
import logger from '../utils/logger.js';

/**
 * Google Drive API base URL
 */
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

/**
 * Get file metadata from Google Drive
 */
export const getFileMetadata = async (
  fileId: string,
  userId: string
): Promise<{
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  size?: string;
}> => {
  const token = await getValidGoogleToken(userId);

  const response = await fetch(
    `${DRIVE_API_BASE}/files/${fileId}?fields=id,name,mimeType,webViewLink,size`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    logger.error('Failed to get file metadata', { fileId, error });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to access file from Google Drive',
      500
    );
  }

  return response.json() as Promise<{
    id: string;
    name: string;
    mimeType: string;
    webViewLink: string;
    size?: string;
  }>;
};

/**
 * Share a file with another user (grant permission)
 */
export const shareFileWithUser = async (
  fileId: string,
  emailAddress: string,
  role: 'reader' | 'writer' | 'commenter',
  userId: string
): Promise<void> => {
  const token = await getValidGoogleToken(userId);

  const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'user',
      role,
      emailAddress,
      sendNotificationEmail: false, // Don't spam teacher
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    logger.error('Failed to share file', { fileId, emailAddress, error });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to share file with teacher',
      500
    );
  }
};

/**
 * Check if a user has access to a file
 */
export const checkFileAccess = async (
  fileId: string,
  userId: string
): Promise<boolean> => {
  try {
    await getFileMetadata(fileId, userId);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Get Drive quota information for a user
 */
export const getDriveQuota = async (userId: string): Promise<{
  limit: string;
  usage: string;
  usageInDrive: string;
  usageInDriveTrash: string;
}> => {
  const token = await getValidGoogleToken(userId);

  const response = await fetch(
    `${DRIVE_API_BASE}/about?fields=storageQuota`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    logger.error('Failed to get Drive quota');
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to check Drive storage',
      500
    );
  }

  const data = await response.json() as { storageQuota: any };
  return data.storageQuota;
};

/**
 * Batch get file metadata (for multiple files)
 */
export const batchGetFileMetadata = async (
  fileIds: string[],
  userId: string
): Promise<Record<string, any>> => {
  await getValidGoogleToken(userId); // Validate token
  const results: Record<string, any> = {};

  // Google Drive API doesn't have native batch endpoint for files.get
  // So we'll make parallel requests (limited to 10 at a time to avoid rate limits)
  const batchSize = 10;
  for (let i = 0; i < fileIds.length; i += batchSize) {
    const batch = fileIds.slice(i, i + batchSize);
    const promises = batch.map(async (fileId) => {
      try {
        const metadata = await getFileMetadata(fileId, userId);
        results[fileId] = metadata;
      } catch (error) {
        logger.error('Failed to get file in batch', { fileId });
        results[fileId] = null;
      }
    });
    await Promise.all(promises);
  }

  return results;
};

/**
 * Generate Drive viewer iframe URL
 */
export const getDriveViewerUrl = (fileId: string): string => {
  return `https://drive.google.com/file/d/${fileId}/preview`;
};

/**
 * Generate Drive web view URL
 */
export const getDriveWebViewUrl = (fileId: string): string => {
  return `https://drive.google.com/file/d/${fileId}/view`;
};

/**
 * Validate file size before submission (prevent huge uploads)
 */
export const validateFileSize = async (
  fileId: string,
  userId: string,
  maxSizeMB: number = 100
): Promise<boolean> => {
  const metadata = await getFileMetadata(fileId, userId);
  
  if (!metadata.size) {
    // If size is not available, allow it
    return true;
  }

  const sizeMB = parseInt(metadata.size) / (1024 * 1024);
  return sizeMB <= maxSizeMB;
};
