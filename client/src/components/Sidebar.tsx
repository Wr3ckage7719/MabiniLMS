import { Home, Calendar, BarChart3, Archive, ChevronLeft, GraduationCap, Clock3, ShieldCheck } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { CLASS_COLORS } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useClasses } from '@/hooks-api/useClasses';
import { useClasses as useClassActions } from '@/contexts/ClassesContext';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navItems = [
  { label: 'Home', icon: Home, path: '/dashboard' },
  { label: 'Upcoming Deadline', icon: Clock3, path: '/upcoming', mobileOnly: true },
  { label: 'Calendar', icon: Calendar, path: '/calendar' },
  { label: 'Grades', icon: BarChart3, path: '/grades' },
  { label: 'Competency', icon: ShieldCheck, path: '/competency' },
  { label: 'Archived', icon: Archive, path: '/archived' },
];

export function AppSidebar({ open, onClose }: SidebarProps) {
  const { data: classes = [], isLoading, error } = useClasses();
  const { archivedClasses, unenrolledClasses } = useClassActions();

  const activeClasses = classes.filter(
    (cls) =>
      !cls.archived &&
      !archivedClasses.includes(cls.id) &&
      !unenrolledClasses.includes(cls.id)
  );

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/28 backdrop-blur-[1px] z-40 md:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          'fixed md:sticky top-0 left-0 z-50 md:z-0 h-screen w-[78vw] max-w-[320px] bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          'md:w-60'
        )}
      >
        <div className="flex items-center justify-between p-4 md:hidden">
          <span className="font-semibold text-sm">Menu</span>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 px-2 md:px-3 py-4 space-y-1 overflow-y-auto">
          <div className="mb-6">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 px-3 py-3 rounded-xl text-[13px] md:text-sm font-medium transition-all',
                    item.mobileOnly ? 'md:hidden' : '',
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

          <div className="hidden md:block pt-4 border-t">
            <p className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Your Classes
            </p>
            {isLoading ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">Loading courses...</div>
            ) : error ? (
              <div className="px-3 py-2 text-xs text-destructive">Unable to load courses</div>
            ) : activeClasses.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <div className="inline-flex p-2 rounded-full bg-secondary/50 mb-2">
                  <GraduationCap className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">No enrolled courses</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Enroll in a course to get started</p>
              </div>
            ) : (
              activeClasses.map((cls) => (
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
