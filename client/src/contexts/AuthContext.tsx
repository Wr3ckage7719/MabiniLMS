import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  supabase,
  setRememberSessionPersistence,
  isRememberSessionEnabled,
} from '@/lib/supabase';
import { authService } from '@/services/auth.service';
import { cacheAuthRole } from '@/lib/pwa-zoom-policy';
import type { Session as SupabaseSession, User as SupabaseUser } from '@supabase/supabase-js';

const AUTH_SESSION_EXPIRED_EVENT = 'auth:session-expired';
const STUDENT_INSTITUTIONAL_DOMAIN = 'mabinicolleges.edu.ph';
const AUTH_ERROR_STORAGE_KEY = 'auth_error';
const AUTH_ROLE_INTENT_STORAGE_KEY = 'auth_role_intent';
const AUTH_OPERATION_TIMEOUT_MS = 15000;
const STUDENT_ACCOUNT_SESSIONS_STORAGE_KEY = 'mabini:student-account-sessions';
const MAX_STUDENT_ACCOUNT_SESSIONS = 5;
const TEACHER_PENDING_APPROVAL_MESSAGE = 'Your teacher account is pending admin approval. Please wait for approval from the admin.';
const TEACHER_GOOGLE_APPROVAL_REQUIRED_MESSAGE = 'No approved teacher account was found for this Google login. Please request a teacher account and wait for admin approval.';

const toTwoFactorChallengeKey = (portal: 'app' | 'admin', normalizedEmail: string): string => {
  return `${portal}:${normalizedEmail}`;
};

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

const isInstitutionalStudentEmail = (email: string): boolean => {
  return email.trim().toLowerCase().endsWith(`@${STUDENT_INSTITUTIONAL_DOMAIN}`);
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const isMissingLinkedAuthUserError = (message: string): boolean => {
  const normalizedMessage = message.toLowerCase();
  return (
    (normalizedMessage.includes('sub claim') && normalizedMessage.includes('does not exist')) ||
    (normalizedMessage.includes('user') && normalizedMessage.includes('does not exist')) ||
    normalizedMessage.includes('invalid refresh token')
  );
};

const readStoredStudentAccountSessions = (): StoredStudentAccountSession[] => {
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

    // Keep only the latest session for each unique user and email to prevent duplicate same-email entries.
    const seenUserIds = new Set<string>();
    const seenEmails = new Set<string>();

    return sanitizedSessions.filter((sessionRecord) => {
      const normalizedEmail = normalizeEmail(sessionRecord.email);

      if (seenUserIds.has(sessionRecord.userId)) {
        return false;
      }

      if (normalizedEmail && seenEmails.has(normalizedEmail)) {
        return false;
      }

      seenUserIds.add(sessionRecord.userId);
      if (normalizedEmail) {
        seenEmails.add(normalizedEmail);
      }

      return true;
    });
  } catch {
    return [];
  }
};

const writeStoredStudentAccountSessions = (sessions: StoredStudentAccountSession[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(STUDENT_ACCOUNT_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
};

const toLinkedStudentAccounts = (sessions: StoredStudentAccountSession[]): LinkedStudentAccount[] => {
  return sessions.map(({ accessToken: _accessToken, refreshToken: _refreshToken, customName, ...rest }) => {
    const normalizedCustomName = (customName || '').trim();
    return {
      ...rest,
      customName: normalizedCustomName || null,
      displayName: normalizedCustomName || rest.name || rest.email,
    };
  });
};

const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null) {
    const maybeError = error as {
      response?: { data?: { error?: { message?: string }; message?: string } };
      message?: string;
    };

    const responseMessage = maybeError.response?.data?.error?.message || maybeError.response?.data?.message;
    if (responseMessage) {
      return responseMessage;
    }

    if (maybeError.message) {
      return maybeError.message;
    }
  }

  return fallback;
};

const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    }),
  ]);
};

interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  avatarUrl?: string | null;
  role?: string;
  pending_approval?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: { access_token?: string } | null;
  linkedStudentAccounts: LinkedStudentAccount[];
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (
    email: string,
    password: string,
    twoFactorCode?: string,
    portal?: 'app' | 'admin',
    rememberMe?: boolean,
  ) => Promise<LoginResult>;
  register: (email: string, password: string, fullName: string, role?: 'student' | 'teacher') => Promise<void>;
  requestStudentSignup: (email: string) => Promise<string>;
  loginWithGoogle: (roleIntent?: 'student' | 'teacher') => Promise<void>;
  logout: () => void;
  switchStudentAccount: (userId: string) => Promise<void>;
  renameLinkedStudentAccount: (userId: string, customName: string) => void;
  removeLinkedStudentAccount: (userId: string) => void;
  updateAvatar: (avatarUrl: string) => void;
}

interface LoginResult {
  requiresTwoFactor: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<{ access_token?: string } | null>(null);
  const [linkedStudentAccounts, setLinkedStudentAccounts] = useState<LinkedStudentAccount[]>([]);
  const [twoFactorChallenges, setTwoFactorChallenges] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const refreshLinkedStudentAccounts = useCallback(() => {
    setLinkedStudentAccounts(toLinkedStudentAccounts(readStoredStudentAccountSessions()));
  }, []);

  const clearStoredStudentAccountSessions = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STUDENT_ACCOUNT_SESSIONS_STORAGE_KEY);
    }

    setLinkedStudentAccounts([]);
  }, []);

  const persistStudentAccountSession = useCallback((nextSession: StoredStudentAccountSession) => {
    const currentSessions = readStoredStudentAccountSessions();
    const normalizedNextEmail = normalizeEmail(nextSession.email);
    const existingSession = currentSessions.find(
      (sessionRecord) =>
        sessionRecord.userId === nextSession.userId || normalizeEmail(sessionRecord.email) === normalizedNextEmail
    );
    const preservedCustomName = (existingSession?.customName || '').trim();

    const existing = currentSessions.filter(
      (sessionRecord) =>
        sessionRecord.userId !== nextSession.userId &&
        normalizeEmail(sessionRecord.email) !== normalizedNextEmail
    );
    const updatedSessions = [{
      ...nextSession,
      email: normalizedNextEmail,
      customName: preservedCustomName || undefined,
    }, ...existing]
      .sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime())
      .slice(0, MAX_STUDENT_ACCOUNT_SESSIONS);

    writeStoredStudentAccountSessions(updatedSessions);
    setLinkedStudentAccounts(toLinkedStudentAccounts(updatedSessions));
  }, []);

  const rememberStudentAccountSession = useCallback((authSession: SupabaseSession | null, currentUser: User | null) => {
    if (!authSession?.user || !authSession.access_token || !authSession.refresh_token || !currentUser) {
      return;
    }

    if (!isRememberSessionEnabled()) {
      return;
    }

    const normalizedEmail = (currentUser.email || authSession.user.email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return;
    }

    const resolvedRole = (currentUser.role || 'student').toLowerCase();
    if (resolvedRole !== 'student' || !isInstitutionalStudentEmail(normalizedEmail)) {
      return;
    }

    persistStudentAccountSession({
      userId: currentUser.id,
      email: normalizedEmail,
      name: currentUser.name,
      avatarUrl: currentUser.avatarUrl || null,
      accessToken: authSession.access_token,
      refreshToken: authSession.refresh_token,
      lastUsedAt: new Date().toISOString(),
    });
  }, [persistStudentAccountSession]);

  const setStoredAuthError = useCallback((message: string) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(AUTH_ERROR_STORAGE_KEY, message);
    }
  }, []);

  const clearRoleIntent = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(AUTH_ROLE_INTENT_STORAGE_KEY);
    }
  }, []);

  const getRoleIntent = useCallback((): 'student' | 'teacher' | null => {
    if (typeof window === 'undefined') {
      return null;
    }

    const value = sessionStorage.getItem(AUTH_ROLE_INTENT_STORAGE_KEY);
    return value === 'teacher' || value === 'student' ? value : null;
  }, []);

  const blockSignInWithMessage = useCallback(async (message: string) => {
    setStoredAuthError(message);
    clearRoleIntent();

    await supabase.auth.signOut();
    setUser(null);
    setSession(null);

    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.replace('/login');
    }
  }, [clearRoleIntent, setStoredAuthError]);

  const enforceInstitutionalStudentPolicy = useCallback(async (candidateUser: User, email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const resolvedRole = (candidateUser.role || 'student').toLowerCase();

    if (
      resolvedRole === 'student' &&
      !normalizedEmail.endsWith(`@${STUDENT_INSTITUTIONAL_DOMAIN}`)
    ) {
      const message = `Student login requires @${STUDENT_INSTITUTIONAL_DOMAIN} email.`;
      await blockSignInWithMessage(message);
      throw new Error(message);
    }
  }, [blockSignInWithMessage]);

  const enforceTeacherApprovalPolicy = useCallback(
    async (candidateUser: User, roleIntent: 'student' | 'teacher' | null = null) => {
      const resolvedRole = (candidateUser.role || 'student').toLowerCase();
      const isPendingTeacher = resolvedRole === 'teacher' && candidateUser.pending_approval === true;

      if (isPendingTeacher) {
        await blockSignInWithMessage(TEACHER_PENDING_APPROVAL_MESSAGE);
        throw new Error(TEACHER_PENDING_APPROVAL_MESSAGE);
      }

      if (roleIntent === 'teacher' && resolvedRole !== 'teacher') {
        await blockSignInWithMessage(TEACHER_GOOGLE_APPROVAL_REQUIRED_MESSAGE);
        throw new Error(TEACHER_GOOGLE_APPROVAL_REQUIRED_MESSAGE);
      }
    },
    [blockSignInWithMessage]
  );

  const loadUserData = useCallback(async (id: string, email: string, authUser?: SupabaseUser | null): Promise<User> => {
    try {
      const profile = authUser || (await supabase.auth.getUser()).data.user;

      let apiProfileData: {
        first_name?: string | null;
        last_name?: string | null;
        role?: string;
        pending_approval?: boolean | null;
        avatar_url?: string | null;
      } | null = null;

      try {
        const response = await authService.getCurrentUser() as {
          data?: {
            first_name?: string | null;
            last_name?: string | null;
            role?: string;
            pending_approval?: boolean | null;
            avatar_url?: string | null;
          };
        };
        apiProfileData = response?.data || null;
      } catch (profileApiError) {
        console.warn('Auth profile API lookup warning:', profileApiError);
      }

      const firstName = profile?.user_metadata?.first_name;
      const lastName = profile?.user_metadata?.last_name;
      const apiFirstName = apiProfileData?.first_name;
      const apiLastName = apiProfileData?.last_name;
      const metadataName = [firstName, lastName].filter(Boolean).join(' ').trim();
      const apiName = [apiFirstName, apiLastName].filter(Boolean).join(' ').trim();

      const fullName = profile?.user_metadata?.full_name ||
                       apiName ||
                       metadataName ||
                       profile?.user_metadata?.name ||
                       email.split('@')[0];

      const metadataAvatarUrl =
        profile?.user_metadata?.avatar_url ||
        profile?.user_metadata?.picture ||
        null;

      const avatar = metadataAvatarUrl || fullName.charAt(0).toUpperCase();

      // Fetch user profile data including role, pending_approval, and avatar_url
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('role, pending_approval, avatar_url')
        .eq('id', id)
        .maybeSingle();

      if (profileError) {
        console.warn('Profile lookup warning:', profileError.message);
      }

      return {
        id,
        name: fullName,
        email,
        avatar,
        avatarUrl:
          apiProfileData?.avatar_url ||
          profileData?.avatar_url ||
          metadataAvatarUrl ||
          null,
        role:
          apiProfileData?.role ||
          profileData?.role ||
          profile?.user_metadata?.role ||
          'student',
        pending_approval:
          typeof apiProfileData?.pending_approval === 'boolean'
            ? apiProfileData.pending_approval
            : (profileData?.pending_approval || false),
      };
    } catch (error) {
      console.error('Failed to load user data:', error);
      return {
        id,
        name: email.split('@')[0],
        email,
        avatar: email.charAt(0).toUpperCase(),
        avatarUrl: null,
        role: 'student',
        pending_approval: false,
      };
    }
  }, []);

  useEffect(() => {
    if (!isRememberSessionEnabled()) {
      clearStoredStudentAccountSessions();
      return;
    }

    refreshLinkedStudentAccounts();
  }, [clearStoredStudentAccountSessions, refreshLinkedStudentAccounts]);

  useEffect(() => {
    cacheAuthRole(user?.role || null);
  }, [user?.role]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session || null);
        
        if (session?.user) {
          const normalizedEmail = (session.user.email || '').trim().toLowerCase();
          const userData = await loadUserData(session.user.id, normalizedEmail, session.user);
          const roleIntent = getRoleIntent();
          await enforceInstitutionalStudentPolicy(userData, normalizedEmail);
          await enforceTeacherApprovalPolicy(userData, roleIntent);
          setUser(userData);
          rememberStudentAccountSession(session, userData);
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error);
      } finally {
        clearRoleIntent();
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session || null);

      if (event === 'SIGNED_IN' && session?.user) {
        const signedInUser = session.user;

        // Avoid async auth calls directly in onAuthStateChange callback to prevent auth deadlocks.
        setTimeout(() => {
          void (async () => {
            try {
              const normalizedEmail = (signedInUser.email || '').trim().toLowerCase();
              const userData = await loadUserData(signedInUser.id, normalizedEmail, signedInUser);
              const roleIntent = getRoleIntent();
              await enforceInstitutionalStudentPolicy(userData, normalizedEmail);
              await enforceTeacherApprovalPolicy(userData, roleIntent);
              setUser(userData);
              rememberStudentAccountSession(session, userData);
            } catch (error) {
              console.error('Sign-in blocked by policy:', error);
            } finally {
              clearRoleIntent();
            }
          })();
        }, 0);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    const handleSessionExpired = async () => {
      setUser(null);
    };
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, [
    clearRoleIntent,
    enforceInstitutionalStudentPolicy,
    enforceTeacherApprovalPolicy,
    getRoleIntent,
    loadUserData,
    rememberStudentAccountSession,
  ]);

  const register = async (
    email: string,
    password: string,
    fullName: string,
    role: 'student' | 'teacher' = 'teacher'
  ) => {
    if (!email || !fullName) {
      throw new Error('Email and full name are required');
    }

    if (role === 'student') {
      throw new Error('Student sign-up is handled through institutional email credential request.');
    }

    try {
      const trimmedEmail = email.trim().toLowerCase();
      const [firstToken, ...restTokens] = fullName.trim().split(' ').filter(Boolean);

      const response = await authService.signup({
        email: trimmedEmail,
        full_name: fullName,
        first_name: firstToken || 'User',
        last_name: restTokens.join(' ') || 'Name',
        role,
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Registration failed');
      }
    } catch (err) {
      throw new Error(getApiErrorMessage(err, 'Registration failed'));
    }
  };

  const requestStudentSignup = async (email: string): Promise<string> => {
    if (!email) {
      throw new Error('Institutional email is required');
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.endsWith(`@${STUDENT_INSTITUTIONAL_DOMAIN}`)) {
      throw new Error(`Student signup requires @${STUDENT_INSTITUTIONAL_DOMAIN} email.`);
    }

    try {
      const response = await authService.requestStudentCredentials(normalizedEmail);
      if (!response?.success) {
        throw new Error(response?.error || 'Failed to request student credentials');
      }

      return response?.data?.message || 'Student signup request processed successfully.';
    } catch (err) {
      const message = getApiErrorMessage(err, 'Failed to request student credentials');

      if (message.toLowerCase().includes('request timed out')) {
        throw new Error(
          'Student signup is taking longer than expected. The server may be waking up. Please wait a few seconds and try again.'
        );
      }

      throw new Error(message);
    }
  };

  const login = async (
    email: string,
    password: string,
    twoFactorCode?: string,
    portal: 'app' | 'admin' = 'app',
    rememberMe: boolean = true,
  ): Promise<LoginResult> => {
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const challengeKey = toTwoFactorChallengeKey(portal, normalizedEmail);
    const challengeId = twoFactorCode ? twoFactorChallenges[challengeKey] : undefined;

    try {
      clearRoleIntent();
      setRememberSessionPersistence(rememberMe);
      if (!rememberMe) {
        clearStoredStudentAccountSessions();
      }

      const response = await withTimeout(
        authService.login({
          email: normalizedEmail,
          password,
          twoFactorCode,
          twoFactorChallengeId: challengeId,
          portal,
          rememberMe,
        }),
        AUTH_OPERATION_TIMEOUT_MS,
        'Login timed out. Please try again.'
      );

      if (!response?.success || !response.data) {
        throw new Error(response?.error || 'Login failed');
      }

      if (response.data.requires2FA) {
        const nextChallengeId = response.data.twoFactorChallengeId;
        if (!nextChallengeId) {
          throw new Error('Two-factor challenge was not issued. Please try signing in again.');
        }

        setTwoFactorChallenges((currentMap) => ({
          ...currentMap,
          [challengeKey]: nextChallengeId,
        }));
        return { requiresTwoFactor: true };
      }

      setTwoFactorChallenges((currentMap) => {
        if (!(challengeKey in currentMap)) {
          return currentMap;
        }

        const { [challengeKey]: _removedChallenge, ...remainingChallenges } = currentMap;
        return remainingChallenges;
      });

      const authSession = response.data.session;
      if (!authSession?.access_token || !authSession?.refresh_token) {
        throw new Error('Login succeeded but session token is missing. Please try again.');
      }

      const { data: setSessionData, error: setSessionError } = await withTimeout(
        supabase.auth.setSession({
          access_token: authSession.access_token,
          refresh_token: authSession.refresh_token,
        }),
        AUTH_OPERATION_TIMEOUT_MS,
        'Session initialization timed out. Please try again.'
      );

      if (setSessionError) {
        throw setSessionError;
      }

      const authenticatedUser = setSessionData.session?.user || response.data.user;

      if (!authenticatedUser?.id) {
        throw new Error('Failed to resolve authenticated user data. Please sign in again.');
      }

      const authenticatedEmail = (authenticatedUser.email || normalizedEmail).trim().toLowerCase();
      const userData = await loadUserData(authenticatedUser.id, authenticatedEmail, authenticatedUser);
      await enforceInstitutionalStudentPolicy(userData, authenticatedEmail);
      await enforceTeacherApprovalPolicy(userData, null);

      setUser(userData);
      setSession({ access_token: authSession.access_token });
      rememberStudentAccountSession(setSessionData.session || null, userData);

      return { requiresTwoFactor: false };
    } catch (err) {
      const message = getApiErrorMessage(err, 'Login failed');
      if (message.toLowerCase().includes('two-factor verification session')) {
        setTwoFactorChallenges((currentMap) => {
          if (!(challengeKey in currentMap)) {
            return currentMap;
          }

          const { [challengeKey]: _removedChallenge, ...remainingChallenges } = currentMap;
          return remainingChallenges;
        });
      }

      throw new Error(message);
    }
  };

  const loginWithGoogle = async (roleIntent: 'student' | 'teacher' = 'student') => {
    try {
      if (roleIntent === 'teacher') {
        clearRoleIntent();
        throw new Error(
          'Teacher Google sign-in is not available. Please complete teacher signup and use your approved email and password.'
        );
      }

      if (typeof window !== 'undefined') {
        sessionStorage.setItem(AUTH_ROLE_INTENT_STORAGE_KEY, roleIntent);
      }
      setRememberSessionPersistence(true);

      const queryParams: Record<string, string> = {
        prompt: 'select_account',
      };

      queryParams.hd = STUDENT_INSTITUTIONAL_DOMAIN;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
          queryParams,
        },
      });

      if (error) throw error;
    } catch (err) {
      clearRoleIntent();
      throw new Error(getApiErrorMessage(err, 'Google login failed'));
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setTwoFactorChallenges({});
    } catch (error) {
      console.error('Logout error:', error);
      setUser(null);
      setSession(null);
      setTwoFactorChallenges({});
    }
  };

  const renameLinkedStudentAccount = useCallback((userId: string, customName: string) => {
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
  }, []);

  const removeLinkedStudentAccount = useCallback((userId: string) => {
    const currentSessions = readStoredStudentAccountSessions();
    const updatedSessions = currentSessions.filter((sessionRecord) => sessionRecord.userId !== userId);

    if (updatedSessions.length === currentSessions.length) {
      throw new Error('Linked account not found.');
    }

    writeStoredStudentAccountSessions(updatedSessions);
    setLinkedStudentAccounts(toLinkedStudentAccounts(updatedSessions));
  }, []);

  const switchStudentAccount = async (userId: string) => {
    const storedSession = readStoredStudentAccountSessions().find((sessionRecord) => sessionRecord.userId === userId);

    if (!storedSession) {
      throw new Error('This linked account is no longer available. Please add it again.');
    }

    const { data: setSessionData, error: setSessionError } = await withTimeout(
      supabase.auth.setSession({
        access_token: storedSession.accessToken,
        refresh_token: storedSession.refreshToken,
      }),
      AUTH_OPERATION_TIMEOUT_MS,
      'Switch account timed out. Please try again.'
    );

    if (setSessionError) {
      const message = getApiErrorMessage(setSessionError, 'Unable to switch account. Please sign in again.');

      if (isMissingLinkedAuthUserError(message)) {
        const updatedSessions = readStoredStudentAccountSessions().filter(
          (sessionRecord) => sessionRecord.userId !== userId
        );
        writeStoredStudentAccountSessions(updatedSessions);
        setLinkedStudentAccounts(toLinkedStudentAccounts(updatedSessions));

        throw new Error('This linked account no longer exists and was removed from this device. Add it again to continue.');
      }

      throw new Error(message);
    }

    const activeSession = setSessionData.session;
    if (!activeSession?.user) {
      throw new Error('Unable to start the selected account session.');
    }

    const normalizedEmail = (activeSession.user.email || storedSession.email).trim().toLowerCase();
    const userData = await loadUserData(activeSession.user.id, normalizedEmail, activeSession.user);

    await enforceInstitutionalStudentPolicy(userData, normalizedEmail);
    await enforceTeacherApprovalPolicy(userData, null);

    setUser(userData);
    setSession({ access_token: activeSession.access_token });
    rememberStudentAccountSession(activeSession, userData);
  };

  const updateAvatar = (avatarUrl: string) => {
    setUser((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        avatarUrl,
      };
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        linkedStudentAccounts,
        isLoggedIn: user !== null,
        isLoading: loading,
        login,
        register,
        requestStudentSignup,
        loginWithGoogle,
        logout,
        switchStudentAccount,
        renameLinkedStudentAccount,
        removeLinkedStudentAccount,
        updateAvatar,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
