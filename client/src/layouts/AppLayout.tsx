import { useState, useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { AppSidebar } from '@/components/Sidebar';
import { CreateClassDialog } from '@/components/CreateClassDialog';
import { JoinClassDialog } from '@/components/JoinClassDialog';
import FirstLoginPasswordChange from '@/components/FirstLoginPasswordChange';
import PendingApprovalOverlay from '@/components/PendingApprovalOverlay';
import { RoleProvider } from '@/contexts/RoleContext';
import { ClassesProvider } from '@/contexts/ClassesContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeNotifications } from '@/hooks/useWebSocket';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

export default function AppLayout() {
  const { isLoggedIn, isLoading, user } = useAuth();
  useRealtimeNotifications();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [checkingPassword, setCheckingPassword] = useState(true);

  // Check if user must change password (for student first login)
  useEffect(() => {
    const checkTempPassword = async () => {
      if (!user?.id) {
        setCheckingPassword(false);
        return;
      }
      
      try {
        const { data } = await supabase
          .from('temporary_passwords')
          .select('must_change_password, expires_at')
          .eq('user_id', user.id)
          .eq('must_change_password', true)
          .is('used_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        setMustChangePassword(data?.must_change_password || false);
      } catch {
        // No temp password record or error - that's fine
        setMustChangePassword(false);
      } finally {
        setCheckingPassword(false);
      }
    };

    if (isLoggedIn && user) {
      checkTempPassword();
    } else {
      setCheckingPassword(false);
    }
  }, [isLoggedIn, user]);

  const handlePasswordChanged = () => {
    setMustChangePassword(false);
  };

  // Show loading while checking auth
  if (isLoading || checkingPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  if ((user?.role || '').toLowerCase() === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  // Teacher users should use the dedicated teacher panel experience.
  if ((user?.role || '').toLowerCase() === 'teacher') {
    return <Navigate to="/teacher" replace />;
  }

  return (
    <RoleProvider>
      <ClassesProvider>
        <div className="min-h-screen flex flex-col">
          <Header
            onCreateClass={() => setCreateOpen(true)}
            onJoinClass={() => setJoinOpen(true)}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />
          <div className="flex flex-1">
            <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <main className="flex-1 min-w-0">
              <Outlet />
            </main>
          </div>
          <CreateClassDialog open={createOpen} onOpenChange={setCreateOpen} />
          <JoinClassDialog open={joinOpen} onOpenChange={setJoinOpen} />
          
          {/* Force password change for students with temporary passwords */}
          {user && (
            <FirstLoginPasswordChange
              open={mustChangePassword}
              userId={user.id}
              onComplete={handlePasswordChanged}
            />
          )}

          {/* Pending approval overlay for teachers */}
          <PendingApprovalOverlay />
        </div>
      </ClassesProvider>
    </RoleProvider>
  );
}
