import { supabase } from '@/lib/supabase';

type TemporaryPasswordRecord = {
  must_change_password: boolean | null;
  expires_at: string | null;
  created_at: string | null;
};

type PasswordStatusProfile = {
  password_changed_at: string | null;
};

const isMissingColumnError = (message: string | undefined, columnName: string): boolean => {
  const normalizedMessage = (message || '').toLowerCase();
  return normalizedMessage.includes(columnName.toLowerCase()) && normalizedMessage.includes('column');
};

const toEpochMs = (value: string | null | undefined): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const passwordStatusService = {
  async requiresPasswordChange(userId: string): Promise<boolean> {
    const { data: tempRecord, error: tempError } = await supabase
      .from('temporary_passwords')
      .select('must_change_password, expires_at, created_at')
      .eq('user_id', userId)
      .eq('must_change_password', true)
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tempError || !tempRecord?.must_change_password) {
      return false;
    }

    const activeRecord = tempRecord as TemporaryPasswordRecord;
    const expiresAtMs = toEpochMs(activeRecord.expires_at);
    if (expiresAtMs !== null && expiresAtMs <= Date.now()) {
      return false;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('password_changed_at')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      if (isMissingColumnError(profileError.message, 'password_changed_at')) {
        return true;
      }
      return true;
    }

    const passwordStatusProfile = profile as PasswordStatusProfile | null;
    const passwordChangedAtMs = toEpochMs(passwordStatusProfile?.password_changed_at);
    if (passwordChangedAtMs === null) {
      return true;
    }

    const tempIssuedAtMs = toEpochMs(activeRecord.created_at);
    if (tempIssuedAtMs === null) {
      // If we cannot determine issuance timestamp, prefer not showing a stale requirement.
      return false;
    }

    return passwordChangedAtMs < tempIssuedAtMs;
  },
};
