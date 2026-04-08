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
    .select('id, email, first_name, last_name, role, avatar_url, created_at, updated_at', { count: 'exact' });

  // Apply role filter
  if (role) {
    queryBuilder = queryBuilder.eq('role', role);
  }

  // Apply search filter (search in email, first_name, last_name)
  if (search) {
    queryBuilder = queryBuilder.or(
      `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`
    );
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
  // Generate unique filename with user ID and timestamp
  const fileExtension = file.originalname.split('.').pop() || 'jpg';
  const fileName = `${userId}/${Date.now()}.${fileExtension}`;

  // Delete any existing avatars for this user (cleanup old files)
  const { data: existingFiles } = await supabaseAdmin.storage
    .from('avatars')
    .list(userId);

  if (existingFiles && existingFiles.length > 0) {
    const filesToDelete = existingFiles.map(f => `${userId}/${f.name}`);
    await supabaseAdmin.storage.from('avatars').remove(filesToDelete);
  }

  // Upload new avatar
  const { error: uploadError } = await supabaseAdmin.storage
    .from('avatars')
    .upload(fileName, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

  if (uploadError) {
    logger.error('Failed to upload avatar', { userId, error: uploadError.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to upload avatar',
      500
    );
  }

  // Get public URL for the uploaded file
  const { data: urlData } = supabaseAdmin.storage
    .from('avatars')
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
