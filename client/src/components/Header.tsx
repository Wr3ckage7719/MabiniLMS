import { useState } from 'react';
import { Menu, Search, Settings, GraduationCap, Plus, LogOut, User, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNavigate } from 'react-router-dom';
import { useRole } from '@/contexts/RoleContext';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationsPopover } from '@/components/NotificationsPopover';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface HeaderProps {
  onCreateClass: () => void;
  onJoinClass: () => void;
  onToggleSidebar: () => void;
}

export function Header({ onCreateClass, onJoinClass, onToggleSidebar }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const { currentUserAvatar, currentUserName, currentUserAvatarUrl } = useRole();
  const { user, logout } = useAuth();
  const { isInstallable, install } = usePWAInstall();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleHomeClick = () => {
    // Scroll to top of the current page
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <header className="sticky top-0 z-50 glass border-b">
        <div className="flex items-center justify-between h-16 px-4 md:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onToggleSidebar} className="md:hidden">
              <Menu className="h-5 w-5" />
            </Button>
            <button onClick={handleHomeClick} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
              <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center shadow-glow">
                <GraduationCap className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold hidden sm:block">Mabini Classroom</span>
            </button>
          </div>

          <div className="hidden md:flex flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search classes, assignments..."
                className="pl-10 bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 rounded-xl text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSearchOpen(!searchOpen)}>
              <Search className="h-5 w-5" />
            </Button>

            <Button 
              variant="default"
              size="sm"
              className="rounded-xl gap-2"
              onClick={onJoinClass}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Join Class</span>
            </Button>

            <NotificationsPopover role="student" />

            {/* Install App Button - only shown when installable */}
            {isInstallable && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-xl hover:bg-primary/10"
                onClick={install}
                title="Install App"
              >
                <Download className="h-5 w-5" />
              </Button>
            )}

            <Button variant="ghost" size="icon" className="rounded-xl hover:bg-primary/10 hidden md:flex" onClick={() => navigate('/settings')}>
              <Settings className="h-5 w-5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 p-2 rounded-xl hover:bg-secondary/50 transition-colors">
                  <Avatar className="h-8 w-8">
                    {currentUserAvatarUrl && (
                      <AvatarImage src={currentUserAvatarUrl} alt={`${currentUserName} avatar`} />
                    )}
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                      {currentUserAvatar}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{currentUserName}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="md:hidden rounded-lg cursor-pointer gap-2" onClick={() => navigate('/settings')}>
                  <Settings className="h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-lg cursor-pointer gap-2">
                  <User className="h-4 w-4" />
                  Switch Account
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="rounded-lg cursor-pointer gap-2 text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Mobile Search Bar with Slide Down Animation */}
      {searchOpen && (
        <div className="md:hidden sticky top-16 z-40 bg-card/95 backdrop-blur-sm border-b p-4 animate-slide-down">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search classes, assignments..."
              autoFocus
              className="pl-10 bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 rounded-xl text-sm h-10"
              onBlur={() => setSearchOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
