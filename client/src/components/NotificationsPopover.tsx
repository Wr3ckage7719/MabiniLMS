import { Bell, Clock, MessageSquare, Send, Heart, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useNotifications } from '@/hooks/useTeacherData';

interface NotificationsPopoverProps {
  role?: 'student' | 'teacher';
}

// Helper to get initials from notification
function getInitialsFromNotification(notif: any): string {
  // Try to extract initials from notification data or title
  const match = notif.title?.match(/([A-Z])[a-z]+ ([A-Z])[a-z]+/);
  if (match) return match[1] + match[2];
  return '?';
}

export function NotificationsPopover({ role = 'student' }: NotificationsPopoverProps) {
  const [open, setOpen] = useState(false);
  
  // Fetch real notifications from API
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications({
    limit: 20,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-xl hover:bg-primary/10"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-0.5 -right-0.5 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-destructive border-2 border-background">
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-screen max-w-md md:w-96 rounded-xl p-0 shadow-lg border overflow-hidden md:overflow-visible max-h-screen md:max-h-[500px]">
        <ScrollArea className="h-screen md:h-[500px] w-full">
          <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b">
              <h2 className="font-semibold text-sm">Notifications</h2>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {notifications.length}
                </Badge>
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => markAllAsRead()}
                  >
                    Mark all read
                  </Button>
                )}
              </div>
            </div>

            {/* Loading state */}
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Notifications List */}
            {!loading && notifications.length > 0 && (
              <div className="space-y-2">
                {notifications.map((notification) => {
                  const iconColor = notification.read ? 'text-muted-foreground' : 'text-primary';
                  const bgColor = notification.read ? 'bg-secondary/20' : 'bg-secondary/40';
                  
                  return (
                    <div
                      key={notification.id}
                      className={`p-3 rounded-lg ${bgColor} hover:bg-secondary/60 transition-colors cursor-pointer border border-transparent hover:border-primary/20`}
                      onClick={() => !notification.read && markAsRead([notification.id])}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className={`h-8 w-8 flex-shrink-0`}>
                          <AvatarFallback className={`${iconColor} bg-primary/10 text-xs font-medium`}>
                            {getInitialsFromNotification(notification)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium ${notification.read ? 'text-muted-foreground' : 'text-primary'}`}>
                            {notification.title}
                          </p>
                          <p className="text-sm text-foreground line-clamp-2 mt-1">
                            {notification.message}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(notification.created_at).toLocaleString()}
                          </p>
                        </div>
                        {!notification.read && (
                          <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty State */}
            {!loading && notifications.length === 0 && (
              <div className="py-8 text-center text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No notifications</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
