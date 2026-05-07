import type { MaterialType } from '@/services/materials.service';

export const ALLOWED_READING_MATERIAL_MIME_TYPES = new Set([
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
]);

export const ALLOWED_READING_MATERIAL_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
  'jpg', 'jpeg', 'png', 'gif', 'mp4', 'webm', 'zip',
]);

export const getFileExtension = (fileName: string): string => {
  const segment = fileName.split('.').pop();
  return (segment || '').trim().toLowerCase();
};

export const inferMaterialTypeFromFile = (file: File): MaterialType | null => {
  const mimeType = (file.type || '').trim().toLowerCase();

  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'video/mp4' || mimeType === 'video/webm') return 'video';
  if (ALLOWED_READING_MATERIAL_MIME_TYPES.has(mimeType)) return 'document';

  const extension = getFileExtension(file.name);
  if (extension === 'pdf') return 'pdf';
  if (extension === 'mp4' || extension === 'webm') return 'video';
  if (ALLOWED_READING_MATERIAL_EXTENSIONS.has(extension)) return 'document';

  return null;
};
