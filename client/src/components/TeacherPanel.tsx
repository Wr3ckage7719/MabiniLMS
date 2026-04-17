import { useEffect, useState } from 'react';
import { TeacherSidebar } from './TeacherSidebar';
import { TeacherHeader } from './TeacherHeader';
import { TeacherDashboard } from './TeacherDashboard';
import { TeacherCreateClassDialog } from './TeacherCreateClassDialog';
import { ClassItem } from '@/lib/data';
import { useClasses as useApiClasses } from '@/hooks-api/useClasses';
import { useRealtimeNotifications } from '@/hooks/useWebSocket';

export function TeacherPanel() {
  useRealtimeNotifications();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'dashboard' | 'calendar' | 'classes' | 'archived' | 'settings'>('dashboard');
  const [createClassOpen, setCreateClassOpen] = useState(false);
  const [headerSearchQuery, setHeaderSearchQuery] = useState('');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const { data: classesData = [], refetch: refetchClasses } = useApiClasses();

  useEffect(() => {
    setClasses(classesData);
  }, [classesData]);

  const handleViewChange = (view: 'dashboard' | 'calendar' | 'classes' | 'archived' | 'settings') => {
    setCurrentView(view);
    setSidebarOpen(false);
  };

  const handleHeaderSearchQueryChange = (value: string) => {
    setHeaderSearchQuery(value);

    if (value.trim() && currentView !== 'classes') {
      setCurrentView('classes');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 left-10 w-80 h-80 bg-accent/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }}></div>
      </div>

      {/* Main layout container */}
      <div className="relative flex h-screen flex-col">
        {/* Header */}
        <TeacherHeader 
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onCreateClass={() => setCreateClassOpen(true)}
          onSettings={() => handleViewChange('settings')}
          searchQuery={headerSearchQuery}
          onSearchQueryChange={handleHeaderSearchQueryChange}
        />

        {/* Content area with sidebar */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <TeacherSidebar 
            open={sidebarOpen} 
            onClose={() => setSidebarOpen(false)}
            currentView={currentView}
            onViewChange={handleViewChange}
          />

          {/* Main content */}
          <main className="flex-1 overflow-auto">
            <TeacherDashboard 
              currentView={currentView} 
              classes={classes}
              onClassesChange={setClasses}
              searchQuery={headerSearchQuery}
              onSearchQueryChange={handleHeaderSearchQueryChange}
            />
          </main>
        </div>
      </div>

      {/* Create Class Dialog */}
      <TeacherCreateClassDialog 
        open={createClassOpen}
        onOpenChange={setCreateClassOpen}
        onSuccess={() => {
          void refetchClasses();
        }}
      />
    </div>
  );
}
