import { Home, Calendar, BookOpen, Archive, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TeacherSidebarProps {
  open: boolean;
  onClose: () => void;
  currentView: 'dashboard' | 'calendar' | 'classes' | 'archived' | 'settings';
  onViewChange: (view: 'dashboard' | 'calendar' | 'classes' | 'archived' | 'settings') => void;
}

const mainNavItems = [
  { label: 'Home', icon: Home, view: 'dashboard' as const },
  { label: 'Calendar', icon: Calendar, view: 'calendar' as const },
  { label: 'Classes', icon: BookOpen, view: 'classes' as const },
  { label: 'Archived', icon: Archive, view: 'archived' as const },
];

export function TeacherSidebar({ open, onClose, currentView, onViewChange }: TeacherSidebarProps) {
  const handleNavClick = (view: typeof currentView) => {
    onViewChange(view);
    onClose();
  };

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden" 
          onClick={onClose} 
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed md:sticky top-0 md:top-16 left-0 z-50 md:z-0 h-screen md:h-[calc(100vh-4rem)] w-64 bg-card border-r transition-transform duration-300 flex flex-col',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          'md:w-64'
        )}
      >
        {/* Sidebar header - Mobile only */}
        <div className="flex items-center justify-between p-4 md:hidden border-b">
          <span className="font-semibold flex items-center gap-2">
            Menu
          </span>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </div>

        {/* Main navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {/* Main menu items */}
          <div className="space-y-1.5 mb-6">
            {mainNavItems.map((item) => (
              <button
                key={item.view}
                onClick={() => handleNavClick(item.view)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group',
                  currentView === item.view
                    ? 'bg-primary/10 text-primary shadow-sm'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                )}
              >
                <item.icon className={cn(
                  'h-4.5 w-4.5 transition-transform duration-200',
                  currentView === item.view ? 'scale-110' : 'group-hover:scale-105'
                )} />
                <span>{item.label}</span>
                {currentView === item.view && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                )}
              </button>
            ))}
          </div>


        </nav>
      </aside>
    </>
  );
}
