import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { AppSidebar } from '@/components/Sidebar';
import { CreateClassDialog } from '@/components/CreateClassDialog';
import { JoinClassDialog } from '@/components/JoinClassDialog';
import { RoleProvider } from '@/contexts/RoleContext';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function AppLayout() {
  const { isLoggedIn, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

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

  return (
    <RoleProvider>
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
      </div>
    </RoleProvider>
  );
}
