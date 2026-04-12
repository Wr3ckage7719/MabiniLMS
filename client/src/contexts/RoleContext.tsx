import { createContext, useContext, ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface RoleContextType {
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar: string;
  currentUserAvatarUrl: string | null;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

const toInitials = (fullName?: string): string => {
  const name = (fullName || '').trim();
  if (!name) {
    return 'U';
  }

  const words = name
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return 'U';
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] || ''}${words[words.length - 1][0] || ''}`.toUpperCase();
};

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const currentUserName = user?.name || 'Kaide Olfindo';

  const value: RoleContextType = {
    currentUserId: user?.id || 'student-1',
    currentUserName,
    currentUserAvatar: toInitials(currentUserName),
    currentUserAvatarUrl: user?.avatarUrl || null,
  };

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) throw new Error('useRole must be used within RoleProvider');
  return context;
}
