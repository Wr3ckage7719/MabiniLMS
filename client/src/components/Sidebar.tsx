import { Home, BookOpen, Calendar, BarChart3, Archive, Settings, ChevronLeft, GraduationCap } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { CLASS_COLORS } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useClasses } from '@/hooks-api/useClasses';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navItems = [
  { label: 'Home', icon: Home, path: '/dashboard' },
  { label: 'Calendar', icon: Calendar, path: '/calendar' },
  { label: 'Grades', icon: BarChart3, path: '/grades' },
  { label: 'Archived', icon: Archive, path: '/archived' },
];

export function AppSidebar({ open, onClose }: SidebarProps) {
  const { data: classes = [], isLoading } = useClasses();

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          'fixed md:sticky top-0 left-0 z-50 md:z-0 h-screen w-64 bg-card border-r flex flex-col transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          'md:w-60'
        )}
      >
        <div className="flex items-center justify-between p-4 md:hidden">
          <span className="font-semibold">Menu</span>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="mb-6">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )
                }
                onClick={onClose}
              >
                <item.icon className="h-4.5 w-4.5" />
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="pt-4 border-t">
            <p className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Your Classes
            </p>
            {isLoading ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">Loading courses...</div>
            ) : classes.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <div className="inline-flex p-2 rounded-full bg-secondary/50 mb-2">
                  <GraduationCap className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">No enrolled courses</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Enroll in a course to get started</p>
              </div>
            ) : (
              classes.map((cls) => (
                <NavLink
                  key={cls.id}
                  to={`/class/${cls.id}`}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all',
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    )
                  }
                  onClick={onClose}
                >
                  <div className={`w-3 h-3 rounded-full ${CLASS_COLORS[cls.color]}`} />
                  <span className="truncate">{cls.name}</span>
                </NavLink>
              ))
            )}
          </div>
        </nav>
      </aside>
    </>
  );
}
