import { Bell, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useNotifications } from '@/hooks/useTeacherData';
import { resolveNotificationLink } from '@/lib/notification-links';
import { useToast } from '@/hooks/use-toast';
import {
  getPushEnableErrorMessage,
  pushNotificationsService,
} from '@/services/push-notifications.service';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface NotificationsPopoverProps {
  role?: 'student' | 'teacher';
  buttonClassName?: string;
}

// Helper to get initials from notification
function getNotificationMetadata(notif: any): Record<string, any> {
  if (notif?.metadata && typeof notif.metadata === 'object') {
    return notif.metadata;
  }

  if (notif?.data && typeof notif.data === 'object') {
    return notif.data;
  }

  return {};
}

function getInitialsFromNotification(notif: any): string {
  const metadata = getNotificationMetadata(notif);
  const actorName = typeof metadata.actor_name === 'string' ? metadata.actor_name : '';
  const sourceText = actorName || notif.title || notif.message || '';
  const words = sourceText
    .split(/\s+/)
    .map((word: string) => word.replace(/[^a-zA-Z]/g, ''))
    .filter(Boolean);

  if (words.length === 0) {
    return 'NA';
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function getAvatarUrlFromNotification(notif: any): string | null {
  const metadata = getNotificationMetadata(notif);
  const avatarUrl = metadata.actor_avatar_url || metadata.author_avatar_url;

  return typeof avatarUrl === 'string' && avatarUrl.trim().length > 0
    ? avatarUrl
    : null;
}

export function NotificationsPopover({ role = 'student', buttonClassName }: NotificationsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
  const [pushSupported, setPushSupported] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Fetch real notifications from API
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications({
    limit: 20,
  });

  useEffect(() => {
    const supported = pushNotificationsService.isSupported();
    setPushSupported(supported);
    setPushPermission(pushNotificationsService.getPermission());

    if (supported && pushNotificationsService.getPermission() === 'granted') {
      void pushNotificationsService.syncExistingSubscription().catch((error) => {
        console.debug('Push sync skipped from notifications popover', error);
      });
    }
  }, [open]);

  const handleEnablePushNotifications = async () => {
    setPushBusy(true);
    try {
      const enabled = await pushNotificationsService.enablePushNotifications();
      setPushPermission(pushNotificationsService.getPermission());

      toast({
        title: enabled ? 'Push notifications enabled' : 'Push permission not granted',
        description: enabled
          ? 'You will now receive class notifications on this device, even in the background.'
          : 'Push notifications stay disabled until browser permission is granted.',
      });
    } catch (error: any) {
      toast({
        title: 'Unable to enable push notifications',
        description: getPushEnableErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setPushBusy(false);
    }
  };

  const handleNotificationClick = async (notification: any) => {
    const metadata = getNotificationMetadata(notification);
    const destination = resolveNotificationLink(notification.action_url, metadata, role);

    if (!notification.read) {
      await markAsRead([notification.id]);
    }

    setOpen(false);

    if (destination.external) {
      window.location.href = destination.href;
      return;
    }

    navigate(destination.href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative rounded-xl hover:bg-primary/10', buttonClassName)}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 flex items-center justify-center text-[9px] leading-none bg-destructive border border-background text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={isMobile ? 10 : 8}
        collisionPadding={isMobile ? 10 : 8}
        className={cn(
          'rounded-xl p-0 shadow-lg border overflow-hidden',
          isMobile ? 'w-[min(96vw,25rem)] max-h-[75vh]' : 'w-96 max-h-[500px]'
        )}
      >
        <div className="flex items-center justify-between border-b px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-sm">Notifications</h2>
            <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
              {notifications.length}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => markAllAsRead()}
              >
                Mark all read
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full"
              onClick={() => setOpen(false)}
              aria-label="Close notifications"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ScrollArea className={cn('w-full', isMobile ? 'h-[calc(75vh-3.1rem)]' : 'h-[450px]')}>
          <div className="p-3.5 space-y-3">
            {/* Loading state */}
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {pushSupported && pushPermission !== 'granted' && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Enable push notifications to receive Android, iOS, and desktop alerts even when this tab is closed.
                </p>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    void handleEnablePushNotifications();
                  }}
                  disabled={pushBusy}
                >
                  {pushBusy ? 'Enabling...' : 'Enable Push Notifications'}
                </Button>
              </div>
            )}

            {/* Notifications List */}
            {!loading && notifications.length > 0 && (
              <div className="space-y-2">
                {notifications.map((notification) => {
                  const iconColor = notification.read ? 'text-muted-foreground' : 'text-primary';
                  const bgColor = notification.read ? 'bg-secondary/20' : 'bg-secondary/40';
                  const notificationAvatarUrl = getAvatarUrlFromNotification(notification);
                  
                  return (
                    <div
                      key={notification.id}
                      className={`p-3 rounded-lg ${bgColor} hover:bg-secondary/60 transition-colors cursor-pointer border border-transparent hover:border-primary/20`}
                      onClick={() => {
                        void handleNotificationClick(notification);
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className={`h-8 w-8 flex-shrink-0`}>
                          {notificationAvatarUrl ? (
                            <AvatarImage src={notificationAvatarUrl} alt={`${notification.title} avatar`} />
                          ) : null}
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
              <div className="py-12 text-center text-muted-foreground">
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
