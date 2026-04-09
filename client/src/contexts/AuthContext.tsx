import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const AUTH_SESSION_EXPIRED_EVENT = 'auth:session-expired';

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
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => void;
  updateAvatar: (avatarUrl: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          const userData = await loadUserData(session.user.id, session.user.email || '');
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
      if (event === 'SIGNED_IN' && session?.user) {
        const userData = await loadUserData(session.user.id, session.user.email || '');
        setUser(userData);
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
  }, []);

  const loadUserData = async (id: string, email: string): Promise<User> => {
    try {
      const { data: { user: profile } } = await supabase.auth.getUser();
      
      const fullName = profile?.user_metadata?.full_name || 
                       profile?.user_metadata?.name || 
                       email.split('@')[0];
      
      const avatar = profile?.user_metadata?.avatar_url || 
                     fullName.charAt(0).toUpperCase();

      // Fetch user profile data including role, pending_approval, and avatar_url
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role, pending_approval, avatar_url')
        .eq('id', id)
        .single();

      return {
        id,
        name: fullName,
        email,
        avatar,
        avatarUrl: profileData?.avatar_url || profile?.user_metadata?.avatar_url || null,
        role: profileData?.role,
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
      };
    }
  };

  const register = async (email: string, password: string, fullName: string) => {
    if (!email || !password || !fullName) {
      throw new Error('All fields are required');
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        const userData: User = {
          id: data.user.id,
          name: fullName,
          email,
          avatar: fullName.charAt(0).toUpperCase(),
          avatarUrl: null,
        };
        setUser(userData);
      }
    } catch (err: any) {
      throw new Error(err.message || 'Registration failed');
    }
  };

  const login = async (email: string, password: string) => {
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        const userData = await loadUserData(data.user.id, email);
        setUser(userData);
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
    } catch (error) {
      console.error('Logout error:', error);
      setUser(null);
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
        isLoggedIn: user !== null,
        isLoading: loading,
        login,
        register,
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
