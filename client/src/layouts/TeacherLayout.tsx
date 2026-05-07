import { useState } from 'react';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { RoleProvider } from '@/contexts/RoleContext';
import { ClassesProvider } from '@/contexts/ClassesContext';
import { TeacherHeader } from '@/components/TeacherHeader';
import { TeacherSidebar } from '@/components/TeacherSidebar';
import { TeacherCreateClassDialog } from '@/components/TeacherCreateClassDialog';
import { useRealtimeNotifications } from '@/hooks/useWebSocket';
import { useClasses } from '@/hooks-api/useClasses';
import { Loader2 } from 'lucide-react';

export default function TeacherLayout() {
  const { isLoggedIn, isLoading, user } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createClassOpen, setCreateClassOpen] = useState(false);
  useRealtimeNotifications();
  const { refetch: refetchClasses } = useClasses();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  if ((user?.role || '').toLowerCase() !== 'teacher') {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <RoleProvider>
      <ClassesProvider>
        <div className="min-h-screen bg-background text-foreground">
          <div className="fixed inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" />
            <div
              className="absolute bottom-20 left-10 w-80 h-80 bg-accent/5 rounded-full blur-3xl animate-pulse"
              style={{ animationDelay: '1.5s' }}
            />
          </div>
          <div className="relative flex h-screen flex-col">
            <TeacherHeader
              onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
              onCreateClass={() => setCreateClassOpen(true)}
              onSettings={() => navigate('/teacher/settings')}
            />
            <div className="flex flex-1 overflow-hidden">
              <TeacherSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
              <main className="flex-1 overflow-auto">
                <Outlet />
              </main>
            </div>
          </div>
          <TeacherCreateClassDialog
            open={createClassOpen}
            onOpenChange={setCreateClassOpen}
            onSuccess={() => void refetchClasses()}
          />
        </div>
      </ClassesProvider>
    </RoleProvider>
  );
}
