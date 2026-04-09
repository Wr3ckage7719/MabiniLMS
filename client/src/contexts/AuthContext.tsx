import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth.service';

const AUTH_SESSION_EXPIRED_EVENT = 'auth:session-expired';
const STUDENT_INSTITUTIONAL_DOMAIN = 'mabinicolleges.edu.ph';
const AUTH_ERROR_STORAGE_KEY = 'auth_error';

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
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, role?: 'student' | 'teacher') => Promise<void>;
  requestStudentSignup: (email: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => void;
  updateAvatar: (avatarUrl: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<{ access_token?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const enforceInstitutionalStudentPolicy = useCallback(async (candidateUser: User, email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const resolvedRole = (candidateUser.role || 'student').toLowerCase();

    if (
      resolvedRole === 'student' &&
      !normalizedEmail.endsWith(`@${STUDENT_INSTITUTIONAL_DOMAIN}`)
    ) {
      const message = `Student login requires @${STUDENT_INSTITUTIONAL_DOMAIN} email.`;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(AUTH_ERROR_STORAGE_KEY, message);
      }
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      throw new Error(message);
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session || null);
        
        if (session?.user) {
          const normalizedEmail = (session.user.email || '').trim().toLowerCase();
          const userData = await loadUserData(session.user.id, normalizedEmail);
          await enforceInstitutionalStudentPolicy(userData, normalizedEmail);
          setUser(userData);
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session || null);

      if (event === 'SIGNED_IN' && session?.user) {
        try {
          const normalizedEmail = (session.user.email || '').trim().toLowerCase();
          const userData = await loadUserData(session.user.id, normalizedEmail);
          await enforceInstitutionalStudentPolicy(userData, normalizedEmail);
          setUser(userData);
        } catch (error) {
          console.error('Sign-in blocked by policy:', error);
        }
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
  }, [enforceInstitutionalStudentPolicy]);

  const loadUserData = async (id: string, email: string): Promise<User> => {
    try {
      const { data: { user: profile } } = await supabase.auth.getUser();
      
      const firstName = profile?.user_metadata?.first_name;
      const lastName = profile?.user_metadata?.last_name;
      const metadataName = [firstName, lastName].filter(Boolean).join(' ').trim();

      const fullName = profile?.user_metadata?.full_name || 
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
        avatarUrl: profileData?.avatar_url || profile?.user_metadata?.avatar_url || null,
        role: profileData?.role || 'student',
        pending_approval: profileData?.pending_approval || false,
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
  };

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

      await login(trimmedEmail, password);
    } catch (err: any) {
      throw new Error(err.message || 'Registration failed');
    }
  };

  const requestStudentSignup = async (email: string) => {
    if (!email) {
      throw new Error('Institutional email is required');
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.endsWith(`@${STUDENT_INSTITUTIONAL_DOMAIN}`)) {
      throw new Error(`Student signup requires @${STUDENT_INSTITUTIONAL_DOMAIN} email.`);
    }

    const response = await authService.requestStudentCredentials(normalizedEmail);
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to request student credentials');
    }
  };

  const login = async (email: string, password: string) => {
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) throw error;

      if (data.user) {
        const userData = await loadUserData(data.user.id, normalizedEmail);
        await enforceInstitutionalStudentPolicy(userData, normalizedEmail);

        setUser(userData);
        setSession(data.session || null);
      }
    } catch (err: any) {
      throw new Error(err.message || 'Login failed');
    }
  };

  const loginWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
          queryParams: {
            hd: STUDENT_INSTITUTIONAL_DOMAIN,
            prompt: 'select_account',
          },
        },
      });

      if (error) throw error;
    } catch (err: any) {
      throw new Error(err.message || 'Google login failed');
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
