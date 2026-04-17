import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError, ErrorCode } from '../types/index.js';
import {
  UpdateProfileInput,
  UpdateUserRoleInput,
  ListUsersQuery,
  UserProfile,
  PaginatedUsers,
} from '../types/auth.js';
import logger from '../utils/logger.js';

const AVATARS_BUCKET = 'avatars';
const AVATAR_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

const isMissingBucketError = (message?: string): boolean => {
  const normalized = (message || '').toLowerCase();
  return normalized.includes('bucket') && (normalized.includes('not found') || normalized.includes('does not exist'));
};

const isAlreadyExistsBucketError = (message?: string): boolean => {
  const normalized = (message || '').toLowerCase();
  return normalized.includes('already exists') || normalized.includes('duplicate');
};

const ensureAvatarBucketExists = async (): Promise<void> => {
  const { data: bucket, error: getBucketError } = await supabaseAdmin.storage.getBucket(AVATARS_BUCKET);

  if (!getBucketError && bucket) {
    return;
  }

  if (getBucketError && !isMissingBucketError(getBucketError.message)) {
    logger.warn('Could not verify avatars bucket, attempting creation anyway', {
      error: getBucketError.message,
    });
  }

  const { error: createBucketError } = await supabaseAdmin.storage.createBucket(AVATARS_BUCKET, {
    public: true,
    allowedMimeTypes: AVATAR_ALLOWED_MIME_TYPES,
    fileSizeLimit: '5MB',
  });

  if (createBucketError && !isAlreadyExistsBucketError(createBucketError.message)) {
    logger.error('Failed to create avatars bucket', { error: createBucketError.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Avatar upload storage is not configured. Please contact an administrator.',
      500
    );
  }
};

/**
 * Get user profile by ID
 */
export const getUserById = async (userId: string): Promise<UserProfile> => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, first_name, last_name, role, avatar_url, created_at, updated_at')
    .eq('id', userId)
    .single();

  if (error || !data) {
    logger.error('Failed to fetch user', { userId, error: error?.message });
    throw new ApiError(
      ErrorCode.NOT_FOUND,
      'User not found',
      404
    );
  }

  return data as UserProfile;
};

/**
 * Update user profile
 */
export const updateProfile = async (
  userId: string,
  input: UpdateProfileInput
): Promise<UserProfile> => {
  const updateData: Record<string, any> = {
    ...input,
    updated_at: new Date().toISOString(),
  };

  // Remove undefined values
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === undefined) {
      delete updateData[key];
    }
  });

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(updateData)
    .eq('id', userId)
    .select('id, email, first_name, last_name, role, avatar_url, created_at, updated_at')
    .single();

  if (error) {
    logger.error('Failed to update profile', { userId, error: error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to update profile',
      500
    );
  }

  if (!data) {
    throw new ApiError(
      ErrorCode.NOT_FOUND,
      'User not found',
      404
    );
  }

  return data as UserProfile;
};

/**
 * List all users with pagination and filtering (admin only)
 */
export const listUsers = async (query: ListUsersQuery): Promise<PaginatedUsers> => {
  const { page, limit, role, search } = query;
  const offset = (page - 1) * limit;

  // Build query
  let queryBuilder = supabaseAdmin
    .from('profiles')
    .select('id, email, first_name, last_name, role, pending_approval, avatar_url, created_at, updated_at', { count: 'exact' });

  // Apply role filter
  if (role) {
    queryBuilder = queryBuilder.eq('role', role);
  }

  // Apply search filter (search in email, first_name, last_name)
  const normalizedSearch = String(search || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[(),]/g, '');

  if (normalizedSearch.length > 0) {
    const tokens = normalizedSearch
      .split(' ')
      .map((token) => token.trim())
      .filter(Boolean)
      .slice(0, 3);

    const searchConditions = new Set<string>([
      `email.ilike.%${normalizedSearch}%`,
      `first_name.ilike.%${normalizedSearch}%`,
      `last_name.ilike.%${normalizedSearch}%`,
    ]);

    tokens.forEach((token) => {
      searchConditions.add(`email.ilike.%${token}%`);
      searchConditions.add(`first_name.ilike.%${token}%`);
      searchConditions.add(`last_name.ilike.%${token}%`);
    });

    if (tokens.length >= 2) {
      const first = tokens[0];
      const second = tokens[1];

      searchConditions.add(`and(first_name.ilike.%${first}%,last_name.ilike.%${second}%)`);
      searchConditions.add(`and(first_name.ilike.%${second}%,last_name.ilike.%${first}%)`);
    }

    queryBuilder = queryBuilder.or(Array.from(searchConditions).join(','));
  }

  // Apply pagination
  queryBuilder = queryBuilder
    .range(offset, offset + limit - 1)
    .order('created_at', { ascending: false });

  const { data, error, count } = await queryBuilder;

  if (error) {
    logger.error('Failed to list users', { error: error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to fetch users',
      500
    );
  }

  const total = count || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    users: (data || []) as UserProfile[],
    total,
    page,
    limit,
    totalPages,
  };
};

/**
 * Update user role (admin only)
 */
export const updateUserRole = async (
  userId: string,
  input: UpdateUserRoleInput
): Promise<UserProfile> => {
  // First check if user exists
  const { data: existingUser, error: fetchError } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .single();

  if (fetchError || !existingUser) {
    throw new ApiError(
      ErrorCode.NOT_FOUND,
      'User not found',
      404
    );
  }

  // Prevent changing own role (admins can't demote themselves)
  // This check should be done at controller level with req.user.id

  // Update the role
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({
      role: input.role,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id, email, first_name, last_name, role, avatar_url, created_at, updated_at')
    .single();

  if (error) {
    logger.error('Failed to update user role', { userId, error: error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to update user role',
      500
    );
  }

  return data as UserProfile;
};

/**
 * Delete user (admin only)
 */
export const deleteUser = async (userId: string): Promise<void> => {
  // Delete from Supabase Auth (this will cascade to profiles due to FK)
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (error) {
    logger.error('Failed to delete user', { userId, error: error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to delete user',
      500
    );
  }
};

/**
 * Check if a user with the given email exists
 */
export const userExistsByEmail = async (email: string): Promise<boolean> => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    logger.error('Failed to check user existence', { email, error: error.message });
    return false;
  }

  return !!data;
};

/**
 * Upload avatar to Supabase Storage and update user profile
 */
export const uploadAvatar = async (
  userId: string,
  file: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
  }
): Promise<string> => {
  await ensureAvatarBucketExists();

  // Generate unique filename with user ID and timestamp
  const fileExtension = file.originalname.split('.').pop() || 'jpg';
  const fileName = `${userId}/${Date.now()}.${fileExtension}`;

  // Delete any existing avatars for this user (cleanup old files)
  const { data: existingFiles, error: listError } = await supabaseAdmin.storage
    .from(AVATARS_BUCKET)
    .list(userId);

  if (listError && !isMissingBucketError(listError.message)) {
    logger.warn('Failed to list existing avatars before upload', {
      userId,
      error: listError.message,
    });
  }

  if (existingFiles && existingFiles.length > 0) {
    const filesToDelete = existingFiles.map(f => `${userId}/${f.name}`);
    await supabaseAdmin.storage.from(AVATARS_BUCKET).remove(filesToDelete);
  }

  // Upload new avatar
  const { error: uploadError } = await supabaseAdmin.storage
    .from(AVATARS_BUCKET)
    .upload(fileName, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

  if (uploadError) {
    logger.error('Failed to upload avatar', { userId, error: uploadError.message });

    if (isMissingBucketError(uploadError.message)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Avatar storage bucket is missing. Please contact an administrator.',
        500
      );
    }

    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to upload avatar',
      500
    );
  }

  // Get public URL for the uploaded file
  const { data: urlData } = supabaseAdmin.storage
    .from(AVATARS_BUCKET)
    .getPublicUrl(fileName);

  const avatarUrl = urlData.publicUrl;

  // Update user profile with new avatar URL
  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (updateError) {
    logger.error('Failed to update profile avatar URL', { userId, error: updateError.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to update profile with avatar URL',
      500
    );
  }

  logger.info('Avatar uploaded successfully', { userId, avatarUrl });
  return avatarUrl;
};
