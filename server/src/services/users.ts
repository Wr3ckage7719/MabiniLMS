import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError, ErrorCode, UserRole } from '../types/index.js';
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
const PROFILE_SELECT_FIELDS = 'id, email, first_name, last_name, role, avatar_url, created_at, updated_at';
const PROFILE_SELECT_FIELDS_LEGACY = 'id, email, first_name, last_name, role, avatar_url, created_at';

type ProfileMutationError = {
  code?: string;
  message?: string;
  details?: string;
} | null;

type ProfileUpdateContext = {
  email?: string;
  role?: UserRole;
};

const normalizeUserRole = (value: unknown): UserRole => {
  if (value === UserRole.ADMIN || value === UserRole.TEACHER || value === UserRole.STUDENT) {
    return value;
  }

  return UserRole.STUDENT;
};

const isMissingColumnError = (error: ProfileMutationError, columnName: string): boolean => {
  const normalizedMessage = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return normalizedMessage.includes('column') && normalizedMessage.includes(columnName.toLowerCase());
};

const isNoRowsResultError = (error: ProfileMutationError): boolean => {
  if (!error) {
    return false;
  }

  const normalizedMessage = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return error.code === 'PGRST116' || normalizedMessage.includes('multiple (or no) rows returned');
};

const mapProfileRecord = (
  row: Record<string, unknown>,
  includeUpdatedAtField: boolean
): UserProfile => {
  const createdAt = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString();
  const updatedAt = includeUpdatedAtField && typeof row.updated_at === 'string'
    ? row.updated_at
    : createdAt;

  return {
    ...(row as Omit<UserProfile, 'updated_at'>),
    updated_at: updatedAt,
  };
};

const fetchProfileForResponse = async (
  userId: string,
  includeUpdatedAtField: boolean
): Promise<{ profile: UserProfile | null; error: ProfileMutationError }> => {
  const selectFields = includeUpdatedAtField ? PROFILE_SELECT_FIELDS : PROFILE_SELECT_FIELDS_LEGACY;

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(selectFields)
    .eq('id', userId)
    .maybeSingle();

  return {
    profile: data ? mapProfileRecord(data as Record<string, unknown>, includeUpdatedAtField) : null,
    error,
  };
};

const getProfileBootstrapSeed = async (
  userId: string,
  input: UpdateProfileInput,
  context?: ProfileUpdateContext
): Promise<{ email: string; role: UserRole; firstName: string; lastName: string }> => {
  let email = context?.email?.trim().toLowerCase();
  let role = context?.role;
  let firstName = input.first_name?.trim();
  let lastName = input.last_name?.trim();

  if (!email || !role || !firstName || !lastName) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (!error && data.user) {
      const authUser = data.user;
      const metadata = authUser.user_metadata || {};
      const fullName = String(metadata.full_name || metadata.name || '').trim();
      const [firstToken = '', ...restTokens] = fullName.split(/\s+/).filter(Boolean);

      email = email || authUser.email?.trim().toLowerCase() || '';
      role = role || normalizeUserRole(metadata.role || authUser.app_metadata?.role);
      firstName = firstName || String(metadata.first_name || firstToken || '').trim();
      lastName = lastName || String(metadata.last_name || restTokens.join(' ') || '').trim();
    }
  }

  if (!email) {
    throw new ApiError(
      ErrorCode.NOT_FOUND,
      'User not found',
      404
    );
  }

  return {
    email,
    role: normalizeUserRole(role),
    firstName: firstName || 'User',
    lastName: lastName || 'Name',
  };
};

const bootstrapMissingProfile = async (
  userId: string,
  input: UpdateProfileInput,
  context?: ProfileUpdateContext
): Promise<void> => {
  const seed = await getProfileBootstrapSeed(userId, input, context);

  const { error } = await supabaseAdmin
    .from('profiles')
    .upsert(
      {
        id: userId,
        email: seed.email,
        role: seed.role,
        first_name: seed.firstName,
        last_name: seed.lastName,
        avatar_url: input.avatar_url ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (error) {
    logger.error('Failed to bootstrap missing profile during update', {
      userId,
      error: error.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to update profile',
      500
    );
  }
};

const updateProfileRow = async (
  userId: string,
  input: UpdateProfileInput,
  includeUpdatedAtField: boolean
): Promise<{ profile: UserProfile | null; error: ProfileMutationError }> => {
  const updateData: Record<string, unknown> = {
    ...input,
  };

  if (includeUpdatedAtField) {
    updateData.updated_at = new Date().toISOString();
  }

  Object.keys(updateData).forEach((key) => {
    if (updateData[key] === undefined) {
      delete updateData[key];
    }
  });

  if (Object.keys(updateData).length === 0) {
    return fetchProfileForResponse(userId, includeUpdatedAtField);
  }

  const selectFields = includeUpdatedAtField ? PROFILE_SELECT_FIELDS : PROFILE_SELECT_FIELDS_LEGACY;
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(updateData)
    .eq('id', userId)
    .select(selectFields)
    .maybeSingle();

  return {
    profile: data ? mapProfileRecord(data as Record<string, unknown>, includeUpdatedAtField) : null,
    error,
  };
};

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
  input: UpdateProfileInput,
  context?: ProfileUpdateContext
): Promise<UserProfile> => {
  let includeUpdatedAtField = true;
  let updateResult = await updateProfileRow(userId, input, includeUpdatedAtField);

  if (updateResult.error && isMissingColumnError(updateResult.error, 'updated_at')) {
    includeUpdatedAtField = false;
    logger.warn('profiles.updated_at column missing, falling back to legacy profile update', {
      userId,
      error: updateResult.error.message,
    });
    updateResult = await updateProfileRow(userId, input, includeUpdatedAtField);
  }

  if (!updateResult.error && !updateResult.profile) {
    updateResult.error = {
      code: 'PGRST116',
      message: 'No profile row returned from update operation',
    };
  }

  if (updateResult.error && isNoRowsResultError(updateResult.error)) {
    await bootstrapMissingProfile(userId, input, context);
    includeUpdatedAtField = true;
    updateResult = await updateProfileRow(userId, input, includeUpdatedAtField);

    if (updateResult.error && isMissingColumnError(updateResult.error, 'updated_at')) {
      includeUpdatedAtField = false;
      updateResult = await updateProfileRow(userId, input, includeUpdatedAtField);
    }
  }

  if (updateResult.error) {
    logger.error('Failed to update profile', { userId, error: updateResult.error.message });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to update profile',
      500
    );
  }

  if (!updateResult.profile) {
    throw new ApiError(
      ErrorCode.NOT_FOUND,
      'User not found',
      404
    );
  }

  return updateResult.profile;
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
