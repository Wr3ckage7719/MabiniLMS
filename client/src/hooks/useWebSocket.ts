import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

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

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

/**
 * Hook for WebSocket connection and real-time notifications
 */
export function useWebSocket() {
  const { session, user } = useAuth();
  const { toast } = useToast();
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
  const { toast } = useToast();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Subscribe to general notifications
    const unsubNotification = subscribe<NotificationPayload>(
      SocketEvent.NOTIFICATION,
      (notification) => {
        toast({
          title: notification.title,
          description: notification.message,
        });
        setUnreadCount(prev => prev + 1);
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
      (data) => {
        toast({
          title: '📝 New Assignment',
          description: `New assignment "${data.title}" in ${data.courseName}`,
        });
      }
    );

    // Subscribe to announcements
    const unsubAnnouncement = subscribe<any>(
      SocketEvent.ANNOUNCEMENT_CREATED,
      (data) => {
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

    return () => {
      unsubNotification();
      unsubCount();
      unsubGrade();
      unsubAssignment();
      unsubAnnouncement();
      unsubTeacherPending();
      unsubSubmissionReceived();
    };
  }, [isAuthenticated, subscribe, toast]);

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
