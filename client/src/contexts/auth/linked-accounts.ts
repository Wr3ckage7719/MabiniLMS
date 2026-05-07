import { isRememberSessionEnabled } from '@/lib/supabase';
import type { Session as SupabaseSession } from '@supabase/supabase-js';
import { isInstitutionalStudentEmail } from './policy';

const STUDENT_ACCOUNT_SESSIONS_STORAGE_KEY = 'mabini:student-account-sessions';
const MAX_STUDENT_ACCOUNT_SESSIONS = 5;

interface StoredStudentAccountSession {
  userId: string;
  email: string;
  name: string;
  customName?: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
  lastUsedAt: string;
}

export interface LinkedStudentAccount {
  userId: string;
  email: string;
  name: string;
  displayName: string;
  customName: string | null;
  avatarUrl: string | null;
  lastUsedAt: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function readStoredStudentAccountSessions(): StoredStudentAccountSession[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const rawValue = localStorage.getItem(STUDENT_ACCOUNT_SESSIONS_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const sanitizedSessions = parsed
      .filter((item): item is StoredStudentAccountSession => {
        if (!item || typeof item !== 'object') {
          return false;
        }

        const candidate = item as Partial<StoredStudentAccountSession>;
        return (
          typeof candidate.userId === 'string' &&
          typeof candidate.email === 'string' &&
          typeof candidate.name === 'string' &&
          (typeof candidate.customName === 'string' || candidate.customName === undefined) &&
          (typeof candidate.avatarUrl === 'string' || candidate.avatarUrl === null || candidate.avatarUrl === undefined) &&
          typeof candidate.accessToken === 'string' &&
          typeof candidate.refreshToken === 'string' &&
          typeof candidate.lastUsedAt === 'string'
        );
      })
      .map((item) => ({
        ...item,
        email: normalizeEmail(item.email),
        customName: typeof item.customName === 'string' ? item.customName.trim() : undefined,
        avatarUrl: item.avatarUrl || null,
      }))
      .sort((a, b) => {
        return new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime();
      });

    const seenUserIds = new Set<string>();
    const seenEmails = new Set<string>();

    return sanitizedSessions.filter((sessionRecord) => {
      const normalizedEmailValue = normalizeEmail(sessionRecord.email);

      if (seenUserIds.has(sessionRecord.userId)) {
        return false;
      }

      if (normalizedEmailValue && seenEmails.has(normalizedEmailValue)) {
        return false;
      }

      seenUserIds.add(sessionRecord.userId);
      if (normalizedEmailValue) {
        seenEmails.add(normalizedEmailValue);
      }

      return true;
    });
  } catch {
    return [];
  }
}

export function writeStoredStudentAccountSessions(sessions: StoredStudentAccountSession[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(STUDENT_ACCOUNT_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
}

export function toLinkedStudentAccounts(sessions: StoredStudentAccountSession[]): LinkedStudentAccount[] {
  return sessions.map(({ accessToken: _accessToken, refreshToken: _refreshToken, customName, ...rest }) => {
    const normalizedCustomName = (customName || '').trim();
    return {
      ...rest,
      customName: normalizedCustomName || null,
      displayName: normalizedCustomName || rest.name || rest.email,
    };
  });
}

export function persistStudentAccountSession(
  nextSession: StoredStudentAccountSession,
  setLinkedStudentAccounts: (accounts: LinkedStudentAccount[]) => void,
): void {
  const currentSessions = readStoredStudentAccountSessions();
  const normalizedNextEmail = normalizeEmail(nextSession.email);
  const existingSession = currentSessions.find(
    (sessionRecord) =>
      sessionRecord.userId === nextSession.userId || normalizeEmail(sessionRecord.email) === normalizedNextEmail,
  );
  const preservedCustomName = (existingSession?.customName || '').trim();

  const existing = currentSessions.filter(
    (sessionRecord) =>
      sessionRecord.userId !== nextSession.userId &&
      normalizeEmail(sessionRecord.email) !== normalizedNextEmail,
  );
  const updatedSessions = [
    {
      ...nextSession,
      email: normalizedNextEmail,
      customName: preservedCustomName || undefined,
    },
    ...existing,
  ]
    .sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime())
    .slice(0, MAX_STUDENT_ACCOUNT_SESSIONS);

  writeStoredStudentAccountSessions(updatedSessions);
  setLinkedStudentAccounts(toLinkedStudentAccounts(updatedSessions));
}

export function rememberStudentAccountSession(
  authSession: SupabaseSession | null,
  currentUser: { id: string; name: string; email: string; avatarUrl?: string | null; role?: string } | null,
  setLinkedStudentAccounts: (accounts: LinkedStudentAccount[]) => void,
): void {
  if (!authSession?.user || !authSession.access_token || !authSession.refresh_token || !currentUser) {
    return;
  }

  if (!isRememberSessionEnabled()) {
    return;
  }

  const resolvedEmail = (currentUser.email || authSession.user.email || '').trim().toLowerCase();
  if (!resolvedEmail) {
    return;
  }

  const resolvedRole = (currentUser.role || 'student').toLowerCase();
  if (resolvedRole !== 'student' || !isInstitutionalStudentEmail(resolvedEmail)) {
    return;
  }

  persistStudentAccountSession(
    {
      userId: currentUser.id,
      email: resolvedEmail,
      name: currentUser.name,
      avatarUrl: currentUser.avatarUrl || null,
      accessToken: authSession.access_token,
      refreshToken: authSession.refresh_token,
      lastUsedAt: new Date().toISOString(),
    },
    setLinkedStudentAccounts,
  );
}

export function renameLinkedStudentAccount(
  userId: string,
  customName: string,
  setLinkedStudentAccounts: (accounts: LinkedStudentAccount[]) => void,
): void {
  const normalizedCustomName = customName.trim();

  if (normalizedCustomName.length > 40) {
    throw new Error('Account name must be 40 characters or less.');
  }

  const currentSessions = readStoredStudentAccountSessions();
  let targetFound = false;

  const updatedSessions = currentSessions.map((sessionRecord) => {
    if (sessionRecord.userId !== userId) {
      return sessionRecord;
    }

    targetFound = true;
    return {
      ...sessionRecord,
      customName: normalizedCustomName || undefined,
    };
  });

  if (!targetFound) {
    throw new Error('Linked account not found.');
  }

  writeStoredStudentAccountSessions(updatedSessions);
  setLinkedStudentAccounts(toLinkedStudentAccounts(updatedSessions));
}

export function removeLinkedStudentAccount(
  userId: string,
  setLinkedStudentAccounts: (accounts: LinkedStudentAccount[]) => void,
): void {
  const currentSessions = readStoredStudentAccountSessions();
  const updatedSessions = currentSessions.filter((sessionRecord) => sessionRecord.userId !== userId);

  if (updatedSessions.length === currentSessions.length) {
    throw new Error('Linked account not found.');
  }

  writeStoredStudentAccountSessions(updatedSessions);
  setLinkedStudentAccounts(toLinkedStudentAccounts(updatedSessions));
}
