import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth.service';
import type { User as SupabaseUser } from '@supabase/supabase-js';

const AUTH_SESSION_EXPIRED_EVENT = 'auth:session-expired';
const STUDENT_INSTITUTIONAL_DOMAIN = 'mabinicolleges.edu.ph';
const AUTH_ERROR_STORAGE_KEY = 'auth_error';
const AUTH_ROLE_INTENT_STORAGE_KEY = 'auth_role_intent';
const AUTH_OPERATION_TIMEOUT_MS = 15000;
const TEACHER_PENDING_APPROVAL_MESSAGE = 'Your teacher account is pending admin approval. Please wait for approval from the admin.';
const TEACHER_GOOGLE_APPROVAL_REQUIRED_MESSAGE = 'No approved teacher account was found for this Google login. Please request a teacher account and wait for admin approval.';

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
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (
    email: string,
    password: string,
    twoFactorCode?: string,
    portal?: 'app' | 'admin'
  ) => Promise<LoginResult>;
  register: (email: string, password: string, fullName: string, role?: 'student' | 'teacher') => Promise<void>;
  requestStudentSignup: (email: string) => Promise<string>;
  loginWithGoogle: (roleIntent?: 'student' | 'teacher') => Promise<void>;
  logout: () => void;
  updateAvatar: (avatarUrl: string) => void;
}

interface LoginResult {
  requiresTwoFactor: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<{ access_token?: string } | null>(null);
  const [loading, setLoading] = useState(true);

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

      const avatar = profile?.user_metadata?.avatar_url ||
                     fullName.charAt(0).toUpperCase();

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
          profile?.user_metadata?.avatar_url ||
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
  }, [clearRoleIntent, enforceInstitutionalStudentPolicy, enforceTeacherApprovalPolicy, getRoleIntent, loadUserData]);

  const register = async (
    email: string,
    password: string,
    fullName: string,
    role: 'student' | 'teacher' = 'teacher'
  ) => {
    if (!email || !password || !fullName) {
      throw new Error('All fields are required');
    }

    if (role === 'student') {
      throw new Error('Student sign-up is handled through institutional email credential request.');
    }

    try {
      const trimmedEmail = email.trim().toLowerCase();
      const [firstToken, ...restTokens] = fullName.trim().split(' ').filter(Boolean);

      const response = await authService.signup({
        email: trimmedEmail,
        password,
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
    portal: 'app' | 'admin' = 'app'
  ): Promise<LoginResult> => {
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    try {
      const normalizedEmail = email.trim().toLowerCase();
      clearRoleIntent();

      const response = await withTimeout(
        authService.login({
          email: normalizedEmail,
          password,
          twoFactorCode,
          portal,
        }),
        AUTH_OPERATION_TIMEOUT_MS,
        'Login timed out. Please try again.'
      );

      if (!response?.success || !response.data) {
        throw new Error(response?.error || 'Login failed');
      }

      if (response.data.requires2FA) {
        return { requiresTwoFactor: true };
      }

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

      return { requiresTwoFactor: false };
    } catch (err) {
      throw new Error(getApiErrorMessage(err, 'Login failed'));
    }
  };

  const loginWithGoogle = async (roleIntent: 'student' | 'teacher' = 'student') => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(AUTH_ROLE_INTENT_STORAGE_KEY, roleIntent);
      }

      const queryParams: Record<string, string> = {
        prompt: 'select_account',
      };

      if (roleIntent === 'student') {
        queryParams.hd = STUDENT_INSTITUTIONAL_DOMAIN;
      }

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
    } catch (error) {
      console.error('Logout error:', error);
      setUser(null);
      setSession(null);
    }
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
        isLoggedIn: user !== null,
        isLoading: loading,
        login,
        register,
        requestStudentSignup,
        loginWithGoogle,
        logout,
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
