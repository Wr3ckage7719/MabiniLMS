import { createContext, useContext, ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface RoleContextType {
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar: string;
  currentUserAvatarUrl: string | null;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const value: RoleContextType = {
    currentUserId: user?.id || 'student-1',
    currentUserName: user?.name || 'Kaide Olfindo',
    currentUserAvatar: user?.avatar || 'KO',
    currentUserAvatarUrl: user?.avatarUrl || null,
  };

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) throw new Error('useRole must be used within RoleProvider');
  return context;
}
