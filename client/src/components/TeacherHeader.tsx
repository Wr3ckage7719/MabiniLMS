import { Menu, Search, Settings, GraduationCap, LogOut, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useRole } from '@/contexts/RoleContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { NotificationsPopover } from './NotificationsPopover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface TeacherHeaderProps {
  onToggleSidebar: () => void;
  onCreateClass: () => void;
  onSettings: () => void;
}

export function TeacherHeader({ onToggleSidebar, onCreateClass, onSettings }: TeacherHeaderProps) {
  const { currentUserName, currentUserAvatar } = useRole();
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSettings = () => {
    onSettings();
  };

  return (
    <header className="sticky top-0 z-40 glass border-b">
      <div className="flex items-center justify-between h-16 px-4 md:px-6 gap-4">
        {/* Left section - Logo, branding, and Teacher label */}
        <div className="flex items-center gap-3 min-w-0">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onToggleSidebar} 
            className="md:hidden hover:bg-primary/10"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2.5 hover:opacity-80 transition-opacity cursor-pointer">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-glow">
              <GraduationCap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-base font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent hidden sm:block">
              Mabini Classroom
            </span>
          </div>
        </div>

        {/* Center section - Search */}
        <div className="hidden md:flex flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search classes, assignments..."
              className="pl-10 bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 rounded-xl text-sm"
            />
          </div>
        </div>

        {/* Right section - Actions */}
        <div className="flex items-center gap-2">
          {/* Mobile search */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Search className="h-5 w-5" />
          </Button>

          {/* Create Class Button */}
          <Button
            className="hidden sm:flex bg-gradient-to-r from-primary to-accent hover:opacity-90 gap-2 rounded-xl h-9 border-0"
            size="sm"
            onClick={onCreateClass}
          >
            <Plus className="h-4 w-4" />
            <span>Create Class</span>
          </Button>

          {/* Notifications */}
          <NotificationsPopover role="teacher" />

          {/* Settings */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-xl hover:bg-primary/10 hidden sm:flex transition-colors"
            title="Settings"
            onClick={handleSettings}
          >
            <Settings className="h-5 w-5" />
          </Button>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 p-2 rounded-xl hover:bg-secondary/50 transition-colors ml-2">
                <Avatar className="h-8 w-8">
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
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="inline-flex px-2 py-0.5 bg-primary/10 text-primary text-xs font-semibold rounded-full">Teacher</span>
                </div>
              </div>
              <DropdownMenuSeparator className="my-2 sm:hidden" />
              <DropdownMenuItem 
                className="rounded-lg cursor-pointer gap-2 focus:bg-secondary sm:hidden"
                onClick={handleSettings}
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-2" />
              <DropdownMenuItem 
                className="rounded-lg cursor-pointer gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mobile search bar */}
      {searchOpen && (
        <div className="md:hidden px-4 pb-4 animate-slide-down">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search classes, assignments..."
              className="pl-10 bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 rounded-xl text-sm"
              autoFocus
            />
          </div>
        </div>
      )}
    </header>
  );
}
