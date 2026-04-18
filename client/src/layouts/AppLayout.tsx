import { useState, useEffect } from 'react';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { AppSidebar } from '@/components/Sidebar';
import { CreateClassDialog } from '@/components/CreateClassDialog';
import { JoinClassDialog } from '@/components/JoinClassDialog';
import PendingApprovalOverlay from '@/components/PendingApprovalOverlay';
import { RoleProvider } from '@/contexts/RoleContext';
import { ClassesProvider } from '@/contexts/ClassesContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeNotifications } from '@/hooks/useWebSocket';
import { passwordStatusService } from '@/services/password-status.service';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';

export default function AppLayout() {
  const { isLoggedIn, isLoading, user } = useAuth();
  const navigate = useNavigate();
  useRealtimeNotifications();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [passwordNoticeDismissed, setPasswordNoticeDismissed] = useState(false);

  // Check if user still has an active temporary password requirement.
  useEffect(() => {
    let isActive = true;

    const checkTempPassword = async () => {
      if (!isLoggedIn || !user?.id) {
        if (!isActive) {
          return;
        }

        setMustChangePassword(false);
        setPasswordNoticeDismissed(false);
        return;
      }

      try {
        const requiresPasswordChange = await passwordStatusService.requiresPasswordChange(user.id);

        if (!isActive) {
          return;
        }

        setMustChangePassword(requiresPasswordChange);
        if (!requiresPasswordChange) {
          setPasswordNoticeDismissed(false);
        }
      } catch {
        if (!isActive) {
          return;
        }

        // No temp password record or transient query error.
        setMustChangePassword(false);
        setPasswordNoticeDismissed(false);
      }
    };

    void checkTempPassword();

    return () => {
      isActive = false;
    };
  }, [isLoggedIn, user]);

  // Show loading while checking auth
  if (isLoading) {
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

  if (user?.requiresGoogleStudentSetup) {
    return <Navigate to="/auth/google-student-setup" replace />;
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
              {mustChangePassword && !passwordNoticeDismissed && (
                <div className="p-4 md:p-6 lg:p-8 pb-0">
                  <Alert className="border-amber-300 bg-amber-50 text-amber-900 [&>svg]:text-amber-700">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Temporary password still active</AlertTitle>
                    <AlertDescription>
                      <p className="mb-3">
                        Please update your password in Settings. You can continue using the app, but this should be changed as soon as possible.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="h-8"
                          onClick={() => navigate('/settings')}
                        >
                          Go to Settings
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 border-amber-300 bg-transparent text-amber-900 hover:bg-amber-100"
                          onClick={() => setPasswordNoticeDismissed(true)}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                </div>
              )}
              <Outlet />
            </main>
          </div>
          <CreateClassDialog open={createOpen} onOpenChange={setCreateOpen} />
          <JoinClassDialog open={joinOpen} onOpenChange={setJoinOpen} />

          {/* Pending approval overlay for teachers */}
          <PendingApprovalOverlay />
        </div>
      </ClassesProvider>
    </RoleProvider>
  );
}
