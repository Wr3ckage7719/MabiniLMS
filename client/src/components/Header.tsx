import { useState } from 'react';
import { Check, Menu, Search, Settings, Plus, LogOut, User, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNavigate } from 'react-router-dom';
import { useRole } from '@/contexts/RoleContext';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationsPopover } from '@/components/NotificationsPopover';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { AppLogo } from '@/components/AppLogo';
import { useToast } from '@/hooks/use-toast';
import { notifyError, notifySuccess } from '@/lib/feedback';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { currentUserAvatar, currentUserName, currentUserAvatarUrl } = useRole();
  const { user, logout, loginWithGoogle, linkedStudentAccounts, switchStudentAccount } = useAuth();
  const { toast } = useToast();
  const { isInstallable, install } = usePWAInstall();

  const normalizedRole = (user?.role || '').trim().toLowerCase();
  const roleLabel =
    normalizedRole === 'teacher'
      ? 'Teacher'
      : normalizedRole === 'student'
      ? 'Student'
      : null;

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleSwitchToLinkedAccount = async (targetUserId: string) => {
    if (targetUserId === user?.id) {
      return;
    }

    const targetAccount = linkedStudentAccounts.find((account) => account.userId === targetUserId);

    setIsSwitchingAccount(true);
    try {
      await switchStudentAccount(targetUserId);
      notifySuccess(
        toast,
        targetAccount ? `Now using ${targetAccount.email}.` : 'Student account session updated.',
        'Account switched'
      );
      navigate('/dashboard', { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to switch account. Please try again.';
      notifyError(toast, message, 'Switch account failed');
    } finally {
      setIsSwitchingAccount(false);
    }
  };

  const handleAddInstitutionalAccount = async () => {
    try {
      await loginWithGoogle('student');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open account chooser.';
      notifyError(toast, message, 'Add account failed');
    }
  };

  const handleHomeClick = () => {
    // Scroll to top of the current page
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b bg-background md:glass">
        <div className="flex items-center justify-between h-14 md:h-16 px-3 md:px-6">
          <div className="flex items-center gap-1.5 md:gap-3">
            <Button variant="ghost" size="icon" onClick={onToggleSidebar} className="h-8 w-8 rounded-full md:hidden">
              <Menu className="h-5 w-5" />
            </Button>
            <button onClick={handleHomeClick} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
              <AppLogo className="h-7 w-7 md:h-9 md:w-9" />
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

          <div className="flex items-center gap-2 md:gap-2">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full md:hidden" onClick={() => setSearchOpen(!searchOpen)}>
              <Search className="h-5 w-5" />
            </Button>

            <Button
              variant="default"
              size="icon"
              className="h-9 w-9 rounded-full md:hidden"
              onClick={onJoinClass}
              aria-label="Join class"
            >
              <Plus className="h-4 w-4" />
            </Button>

            <Button
              variant="default"
              size="sm"
              className="hidden md:inline-flex rounded-xl gap-2"
              onClick={onJoinClass}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Join Class</span>
            </Button>

            <NotificationsPopover role="student" buttonClassName="h-9 w-9 rounded-full md:h-10 md:w-10 md:rounded-xl" />

            {/* Install App Button - only shown when installable */}
            {isInstallable && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="hidden md:inline-flex rounded-xl hover:bg-primary/10"
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
                <button className="flex items-center gap-2 p-1 md:p-2 rounded-full md:rounded-xl hover:bg-secondary/50 transition-colors">
                  <Avatar className="h-7 w-7 md:h-8 md:w-8">
                    {currentUserAvatarUrl && (
                      <AvatarImage src={currentUserAvatarUrl} alt={`${currentUserName} avatar`} />
                    )}
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                      {currentUserAvatar}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={isMobile ? 8 : 6}
                collisionPadding={isMobile ? 12 : 8}
                className={`${isMobile ? 'w-[min(94vw,20rem)]' : 'w-56'} rounded-xl`}
              >
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{currentUserName}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                  {roleLabel && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="inline-flex px-2 py-0.5 bg-primary/10 text-primary text-xs font-semibold rounded-full">
                        {roleLabel}
                      </span>
                    </div>
                  )}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="md:hidden rounded-lg cursor-pointer gap-2" onClick={() => navigate('/settings')}>
                  <Settings className="h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                {isMobile ? (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Switch Account</p>
                    </div>
                    {linkedStudentAccounts.length === 0 && (
                      <DropdownMenuItem className="rounded-lg text-muted-foreground" disabled>
                        No linked institutional student accounts yet.
                      </DropdownMenuItem>
                    )}

                    {linkedStudentAccounts.map((account) => (
                      <DropdownMenuItem
                        key={account.userId}
                        className="rounded-lg cursor-pointer"
                        disabled={isSwitchingAccount}
                        onSelect={() => {
                          void handleSwitchToLinkedAccount(account.userId);
                        }}
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{account.displayName}</p>
                            <p className="truncate text-xs text-muted-foreground">{account.email}</p>
                          </div>
                          {account.userId === user?.id && <Check className="h-4 w-4 text-primary" />}
                        </div>
                      </DropdownMenuItem>
                    ))}

                    <DropdownMenuItem
                      className="rounded-lg cursor-pointer gap-2"
                      onSelect={() => {
                        void handleAddInstitutionalAccount();
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Add institutional account
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="rounded-lg cursor-pointer gap-2"
                      onSelect={() => {
                        navigate('/settings#linked-accounts');
                      }}
                    >
                      <Settings className="h-4 w-4" />
                      Manage linked accounts
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="rounded-lg gap-2">
                      <User className="h-4 w-4" />
                      Switch Account
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-72 rounded-xl">
                      {linkedStudentAccounts.length === 0 && (
                        <DropdownMenuItem className="rounded-lg text-muted-foreground" disabled>
                          No linked institutional student accounts yet.
                        </DropdownMenuItem>
                      )}

                      {linkedStudentAccounts.map((account) => (
                        <DropdownMenuItem
                          key={account.userId}
                          className="rounded-lg cursor-pointer"
                          disabled={isSwitchingAccount}
                          onSelect={() => {
                            void handleSwitchToLinkedAccount(account.userId);
                          }}
                        >
                          <div className="flex w-full items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{account.displayName}</p>
                              <p className="truncate text-xs text-muted-foreground">{account.email}</p>
                            </div>
                            {account.userId === user?.id && <Check className="h-4 w-4 text-primary" />}
                          </div>
                        </DropdownMenuItem>
                      ))}

                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="rounded-lg cursor-pointer gap-2"
                        onSelect={() => {
                          void handleAddInstitutionalAccount();
                        }}
                      >
                        <Plus className="h-4 w-4" />
                        Add institutional account
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="rounded-lg cursor-pointer gap-2"
                        onSelect={() => {
                          navigate('/settings#linked-accounts');
                        }}
                      >
                        <Settings className="h-4 w-4" />
                        Manage linked accounts
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    void handleLogout();
                  }}
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
