-- ============================================
-- Migration: 022_avatar_storage_bucket
-- Description: Provision avatars storage bucket and RLS policies for authenticated user uploads.
-- Dependencies: 021_secure_signup_workflow
-- Author: MabiniLMS Team
-- Created: 2026-04-17
-- ============================================

-- UP

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- NOTE: Supabase manages storage.objects ownership and RLS configuration.
-- Keep this migration focused on bucket/policy provisioning to avoid owner-only errors.
DROP POLICY IF EXISTS "Avatar images are publicly readable" ON storage.objects;
CREATE POLICY "Avatar images are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload their own avatar files" ON storage.objects;
CREATE POLICY "Users can upload their own avatar files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can update their own avatar files" ON storage.objects;
CREATE POLICY "Users can update their own avatar files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can delete their own avatar files" ON storage.objects;
CREATE POLICY "Users can delete their own avatar files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- DOWN
-- Storage rollback intentionally omitted for safety.
