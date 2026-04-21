import multer from 'multer';
import { Request } from 'express';
import { ApiError, ErrorCode } from '../types/index.js';

// Allowed image MIME types for avatars
const ALLOWED_AVATAR_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

// Max file size: 5MB
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

const ALLOWED_MATERIAL_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'video/mp4',
  'video/webm',
  'application/zip',
  'application/x-zip-compressed',
];

const MAX_MATERIAL_SIZE = 50 * 1024 * 1024;

// File filter for avatar uploads
const avatarFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) => {
  if (ALLOWED_AVATAR_TYPES.includes(file.mimetype)) {
    callback(null, true);
  } else {
    callback(
      new ApiError(
        ErrorCode.VALIDATION_ERROR,
        'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.',
        400
      )
    );
  }
};

const materialFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) => {
  if (ALLOWED_MATERIAL_TYPES.includes(file.mimetype)) {
    callback(null, true);
  } else {
    callback(
      new ApiError(
        ErrorCode.VALIDATION_ERROR,
        'Invalid file type. Allowed types: PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, JPG, PNG, GIF, MP4, WEBM, ZIP.',
        400
      )
    );
  }
};

// Multer configuration for avatar uploads (memory storage)
export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_AVATAR_SIZE,
  },
  fileFilter: avatarFileFilter,
});

export const materialUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_MATERIAL_SIZE,
  },
  fileFilter: materialFileFilter,
});

export {
  ALLOWED_AVATAR_TYPES,
  ALLOWED_MATERIAL_TYPES,
  MAX_AVATAR_SIZE,
  MAX_MATERIAL_SIZE,
};
