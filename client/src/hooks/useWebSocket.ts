import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { resolveNotificationLink } from '@/lib/notification-links';
import { invalidateClassData } from '@/lib/query-invalidation';
import { pushNotificationsService } from '@/services/push-notifications.service';

// Socket event types (must match server)
export enum SocketEvent {
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  AUTHENTICATE = 'authenticate',
  AUTHENTICATED = 'authenticated',
  AUTH_ERROR = 'auth_error',
  
  NOTIFICATION = 'notification',
  NOTIFICATION_COUNT = 'notification_count',
  
  ANNOUNCEMENT_CREATED = 'announcement_created',
  ASSIGNMENT_CREATED = 'assignment_created',
  ASSIGNMENT_UPDATED = 'assignment_updated',
  MATERIAL_ADDED = 'material_added',
  
  GRADE_RELEASED = 'grade_released',
  SUBMISSION_RECEIVED = 'submission_received',
  STANDING_UPDATED = 'standing_updated',
  
  TEACHER_PENDING = 'teacher_pending',
  TEACHER_APPROVED = 'teacher_approved',
  STUDENT_CREATED = 'student_created',
  
  USER_ONLINE = 'user_online',
  USER_OFFLINE = 'user_offline',
}

export interface NotificationPayload {
  id?: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  createdAt?: string;
}

interface AssignmentEventPayload {
  id?: string;
  title?: string;
  courseId?: string;
  courseName?: string;
  assignmentType?: string;
}

interface AnnouncementEventPayload {
  id?: string;
  title?: string;
  courseId?: string;
  courseName?: string;
}

const NOTIFICATIONS_REFRESH_EVENT = 'mabini:notifications-refresh';
const REALTIME_NOTIFICATION_DEDUP_TTL_MS = 15_000;
const realtimeNotificationSeenAt = new Map<string, number>();

const buildRealtimeNotificationKey = (notification: NotificationPayload): string => {
  if (notification.id) {
    return `id:${notification.id}`;
  }

  const metadataCourseId =
    typeof notification.data?.course_id === 'string'
      ? notification.data.course_id
      : typeof notification.data?.courseId === 'string'
      ? notification.data.courseId
      : '';

  return [
    notification.type || 'unknown',
    notification.title || '',
    notification.message || '',
    metadataCourseId,
  ]
    .join('|')
    .toLowerCase();
};

const shouldSuppressDuplicateRealtimeNotification = (
  notification: NotificationPayload
): boolean => {
  const key = buildRealtimeNotificationKey(notification);
  const now = Date.now();

  realtimeNotificationSeenAt.forEach((seenAt, seenKey) => {
    if (now - seenAt > REALTIME_NOTIFICATION_DEDUP_TTL_MS) {
      realtimeNotificationSeenAt.delete(seenKey);
    }
  });

  const previousSeenAt = realtimeNotificationSeenAt.get(key);
  if (typeof previousSeenAt === 'number') {
    return true;
  }

  realtimeNotificationSeenAt.set(key, now);
  return false;
};

const getAssignmentLabel = (assignmentType?: string): string => {
  switch ((assignmentType || '').toLowerCase()) {
    case 'exam':
      return 'Exam';
    case 'quiz':
      return 'Quiz';
    case 'activity':
      return 'Activity';
    default:
      return 'Assignment';
  }
};

const resolveSocketUrl = (): string => {
  const normalizeForSecureContext = (url: string): string => {
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      if (url.startsWith('ws://')) {
        return url.replace(/^ws:\/\//, 'wss://');
      }
      if (url.startsWith('http://')) {
        return url.replace(/^http:\/\//, 'https://');
      }
    }
    return url;
  };

  const configuredWsUrl = import.meta.env.VITE_WS_URL;
  if (configuredWsUrl) {
    return normalizeForSecureContext(configuredWsUrl);
  }

  const configuredApiUrl = import.meta.env.VITE_API_URL;
  if (configuredApiUrl) {
    try {
      const parsed = new URL(configuredApiUrl);
      return normalizeForSecureContext(`${parsed.protocol}//${parsed.host}`);
    } catch {
      // Fall back below
    }
  }

  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return window.location.origin;
  }

  return 'http://localhost:3000';
};

const SOCKET_URL = resolveSocketUrl();

/**
 * Hook for WebSocket connection and real-time notifications
 */
export function useWebSocket() {
  const { session } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Initialize socket connection
  useEffect(() => {
    if (!session?.access_token) {
      // No session, don't connect
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setIsConnected(false);
      setIsAuthenticated(false);
      return;
    }

    // Create socket connection
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('🔌 WebSocket connected');
      setIsConnected(true);
      
      // Authenticate with token
      socket.emit(SocketEvent.AUTHENTICATE, session.access_token);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 WebSocket disconnected:', reason);
      setIsConnected(false);
      setIsAuthenticated(false);
    });

    socket.on(SocketEvent.AUTHENTICATED, (data) => {
      console.log('✅ WebSocket authenticated:', data);
      setIsAuthenticated(true);
    });

    socket.on(SocketEvent.AUTH_ERROR, (error) => {
      console.error('❌ WebSocket auth error:', error);
      setIsAuthenticated(false);
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error.message);
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session?.access_token]);

  // Subscribe to an event
  const subscribe = useCallback(<T>(event: SocketEvent, handler: (data: T) => void) => {
    const socket = socketRef.current;
    if (!socket) return () => {};

    socket.on(event, handler);
    
    return () => {
      socket.off(event, handler);
    };
  }, []);

  // Emit an event
  const emit = useCallback((event: string, data?: any) => {
    const socket = socketRef.current;
    if (!socket || !isConnected) {
      console.warn('Cannot emit: socket not connected');
      return;
    }
    socket.emit(event, data);
  }, [isConnected]);

  return {
    socket: socketRef.current,
    isConnected,
    isAuthenticated,
    subscribe,
    emit,
  };
}

/**
 * Hook for handling real-time notifications with toast
 */
export function useRealtimeNotifications() {
  const { subscribe, isAuthenticated } = useWebSocket();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [unreadCount, setUnreadCount] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  const dispatchNotificationsRefresh = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
  }, []);

  const refreshCourseRealtimeData = useCallback(
    (courseId?: string) => {
      void invalidateClassData(queryClient, { classId: courseId });
    },
    [queryClient]
  );

  const playNotificationSound = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      type WindowWithWebkitAudio = Window & typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      };

      const windowWithWebkit = window as WindowWithWebkitAudio;
      const AudioContextConstructor =
        windowWithWebkit.AudioContext || windowWithWebkit.webkitAudioContext;

      if (!AudioContextConstructor) {
        return;
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextConstructor();
      }

      const audioContext = audioContextRef.current;
      if (audioContext.state === 'suspended') {
        void audioContext.resume().catch(() => undefined);
      }

      const startAt = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(932, startAt);
      oscillator.frequency.exponentialRampToValueAtTime(659, startAt + 0.22);

      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.08, startAt + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.24);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.start(startAt);
      oscillator.stop(startAt + 0.24);
    } catch (error) {
      console.debug('Unable to play realtime notification sound', error);
    }
  }, []);

  const showDeviceNotification = useCallback(
    async (
      title: string,
      message: string,
      options?: {
        courseId?: string;
        assignmentId?: string;
        actionUrl?: string;
        metadata?: Record<string, unknown>;
        notificationId?: string;
      }
    ) => {
      try {
        const role = (user?.role || '').toLowerCase() === 'teacher' ? 'teacher' : 'student';
        const resolvedLink = resolveNotificationLink(
          options?.actionUrl || (options?.courseId ? `/class/${options.courseId}` : null),
          options?.metadata,
          role
        );

        await pushNotificationsService.showLocalNotification(title, message, {
          url: resolvedLink.href,
          tag: options?.assignmentId
            ? `assignment-${options.assignmentId}`
            : options?.notificationId
            ? `notification-${options.notificationId}`
            : 'mabini-notification',
          notificationId: options?.notificationId,
        });
      } catch (error) {
        console.debug('Unable to display browser notification', error);
      }
    },
    [user?.role]
  );

  useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        void audioContextRef.current.close().catch(() => undefined);
        audioContextRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void pushNotificationsService.syncExistingSubscription().catch((error) => {
      console.debug('Push subscription sync skipped', error);
    });

    if (!('serviceWorker' in navigator)) {
      return;
    }

    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'mabini:push-subscription-changed') {
        void pushNotificationsService.syncExistingSubscription().catch((error) => {
          console.debug('Push subscription re-sync skipped', error);
        });
      }
    };

    navigator.serviceWorker.addEventListener('message', onServiceWorkerMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', onServiceWorkerMessage);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const isStudent = (user?.role || '').toLowerCase() === 'student';

    // Subscribe to general notifications
    const unsubNotification = subscribe<NotificationPayload>(
      SocketEvent.NOTIFICATION,
      (notification) => {
        if (shouldSuppressDuplicateRealtimeNotification(notification)) {
          return;
        }

        toast({
          title: notification.title,
          description: notification.message,
        });
        setUnreadCount(prev => prev + 1);
        dispatchNotificationsRefresh();

        void showDeviceNotification(notification.title, notification.message, {
          actionUrl:
            typeof notification.data?.action_url === 'string'
              ? notification.data.action_url
              : typeof notification.data?.actionUrl === 'string'
              ? notification.data.actionUrl
              : undefined,
          metadata: notification.data,
          notificationId: notification.id,
        });
      }
    );

    // Subscribe to notification count updates
    const unsubCount = subscribe<{ count: number }>(
      SocketEvent.NOTIFICATION_COUNT,
      (data) => {
        setUnreadCount(data.count);
      }
    );

    // Subscribe to grade released
    const unsubGrade = subscribe<any>(
      SocketEvent.GRADE_RELEASED,
      (data) => {
        toast({
          title: '📊 Grade Released',
          description: `Your grade for "${data.assignmentTitle}" is now available.`,
        });
      }
    );

    // Subscribe to new assignments
    const unsubAssignment = subscribe<any>(
      SocketEvent.ASSIGNMENT_CREATED,
      (data: AssignmentEventPayload) => {
        refreshCourseRealtimeData(data.courseId);
        dispatchNotificationsRefresh();

        if (!isStudent) {
          return;
        }

        const assignmentLabel = getAssignmentLabel(data.assignmentType);
        const courseName = data.courseName || 'your class';

        toast({
          title: `📝 New ${assignmentLabel}`,
          description: `New ${assignmentLabel.toLowerCase()} "${data.title || 'Untitled'}" in ${courseName}`,
        });

        setUnreadCount((prev) => prev + 1);
        playNotificationSound();
        void showDeviceNotification(
          `New ${assignmentLabel} in ${courseName}`,
          data.title
            ? `"${data.title}" was just posted.`
            : `A new ${assignmentLabel.toLowerCase()} was just posted.`,
          {
            courseId: data.courseId,
            assignmentId: data.id,
            actionUrl: data.courseId ? `/class/${data.courseId}` : undefined,
            metadata: {
              course_id: data.courseId,
            },
          }
        );
      }
    );

    // Subscribe to announcements
    const unsubAnnouncement = subscribe<any>(
      SocketEvent.ANNOUNCEMENT_CREATED,
      (data: AnnouncementEventPayload) => {
        refreshCourseRealtimeData(data.courseId);
        dispatchNotificationsRefresh();

        toast({
          title: '📢 New Announcement',
          description: `${data.courseName}: ${data.title}`,
        });
      }
    );

    // Subscribe to teacher pending approval events (admin)
    const unsubTeacherPending = subscribe<any>(
      SocketEvent.TEACHER_PENDING,
      (data) => {
        toast({
          title: '👨‍🏫 New Teacher Registration',
          description: `${data.name} is awaiting approval.`,
        });
      }
    );

    // Subscribe to submission received events (teacher)
    const unsubSubmissionReceived = subscribe<any>(
      SocketEvent.SUBMISSION_RECEIVED,
      (data) => {
        toast({
          title: '📥 New Submission',
          description: `${data.studentName} submitted "${data.assignmentTitle}"`,
        });
      }
    );

    const unsubStandingUpdated = subscribe<any>(
      SocketEvent.STANDING_UPDATED,
      (data) => {
        const courseId = (data?.courseId || data?.course_id) as string | undefined;
        if (!courseId) {
          return;
        }

        void queryClient.invalidateQueries({
          queryKey: ['weighted-course-grade', courseId],
        });

        void queryClient.invalidateQueries({
          queryKey: ['my-grades', courseId],
        });
      }
    );

    return () => {
      unsubNotification();
      unsubCount();
      unsubGrade();
      unsubAssignment();
      unsubAnnouncement();
      unsubTeacherPending();
      unsubSubmissionReceived();
      unsubStandingUpdated();
    };
  }, [
    dispatchNotificationsRefresh,
    refreshCourseRealtimeData,
    isAuthenticated,
    playNotificationSound,
    queryClient,
    showDeviceNotification,
    subscribe,
    toast,
    user?.role,
  ]);

  return { unreadCount, setUnreadCount };
}

/**
 * Hook for admin-specific real-time notifications
 */
export function useAdminRealtimeNotifications() {
  const { subscribe, isAuthenticated } = useWebSocket();
  const { toast } = useToast();
  const [pendingTeachersCount, setPendingTeachersCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Subscribe to pending teacher notifications
    const unsubPending = subscribe<any>(
      SocketEvent.TEACHER_PENDING,
      (data) => {
        toast({
          title: '👨‍🏫 New Teacher Registration',
          description: `${data.name} is awaiting approval.`,
        });
        setPendingTeachersCount(data.pendingCount);
      }
    );

    return () => {
      unsubPending();
    };
  }, [isAuthenticated, subscribe, toast]);

  return { pendingTeachersCount, setPendingTeachersCount };
}

/**
 * Hook for teacher-specific real-time notifications
 */
export function useTeacherRealtimeNotifications() {
  const { subscribe, isAuthenticated } = useWebSocket();
  const { toast } = useToast();

  useEffect(() => {
    if (!isAuthenticated) return;

    // Subscribe to submission received
    const unsubSubmission = subscribe<any>(
      SocketEvent.SUBMISSION_RECEIVED,
      (data) => {
        toast({
          title: '📥 New Submission',
          description: `${data.studentName} submitted "${data.assignmentTitle}"`,
        });
      }
    );

    return () => {
      unsubSubmission();
    };
  }, [isAuthenticated, subscribe, toast]);
}

export default useWebSocket;
