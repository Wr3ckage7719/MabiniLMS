import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import crypto from 'crypto';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../utils/logger.js';

/**
 * WebSocket service for real-time notifications
 */

// Socket.io server instance
let io: Server | null = null;

const normalizeOrigin = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    if (/^[a-z0-9.-]+$/i.test(trimmed)) {
      try {
        return new URL(`https://${trimmed}`).origin;
      } catch {
        return null;
      }
    }
    return null;
  }
};

const socketAllowedOrigins = Array.from(
  new Set(
    [
      process.env.CLIENT_URL,
      process.env.CORS_ORIGIN,
      process.env.FRONTEND_URL,
      'http://localhost:5173',
      'http://localhost:8080',
      'http://localhost:8081',
      'https://mabinilms.vercel.app',
      'https://www.mabinilms.vercel.app',
    ]
      .flatMap((value) => (value ? value.split(',') : []))
      .map((value) => normalizeOrigin(value))
      .filter((value): value is string => Boolean(value))
  )
);

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const paddedPayload = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(paddedPayload, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const getTokenSessionId = (accessToken: string): string | undefined => {
  const payload = decodeJwtPayload(accessToken);
  const maybeSessionId = payload?.session_id;
  return typeof maybeSessionId === 'string' ? maybeSessionId : undefined;
};

const hasServerSessionProof = async (userId: string, accessToken: string): Promise<boolean> => {
  const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
  const sessionId = getTokenSessionId(accessToken);

  let query = supabaseAdmin
    .from('session_logs')
    .select('id')
    .eq('user_id', userId)
    .in('event_type', ['login', 'token_refresh'])
    .order('created_at', { ascending: false })
    .limit(1);

  query = sessionId
    ? query.contains('device_info', { session_id: sessionId })
    : query.contains('device_info', { token_hash: tokenHash });

  const { data, error } = await query;

  if (error) {
    logger.error('WebSocket session proof validation failed', {
      userId,
      sessionId,
      error: error.message,
    });
    return false;
  }

  return Array.isArray(data) && data.length > 0;
};

const isTwoFactorEnabledForUser = async (
  userId: string,
  profileFlag: boolean | null
): Promise<boolean> => {
  if (profileFlag === true) {
    return true;
  }

  const { data, error } = await supabaseAdmin
    .from('two_factor_auth')
    .select('is_enabled')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.warn('WebSocket could not verify two-factor status', {
      userId,
      error: error.message,
    });
    return false;
  }

  return data?.is_enabled === true;
};

// Connected users map: userId -> Set of socket IDs
const connectedUsers = new Map<string, Set<string>>();

// Event types for real-time notifications
export enum SocketEvent {
  // Connection events
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  AUTHENTICATE = 'authenticate',
  AUTHENTICATED = 'authenticated',
  AUTH_ERROR = 'auth_error',
  
  // Notification events
  NOTIFICATION = 'notification',
  NOTIFICATION_COUNT = 'notification_count',
  
  // Course events
  ANNOUNCEMENT_CREATED = 'announcement_created',
  ASSIGNMENT_CREATED = 'assignment_created',
  ASSIGNMENT_UPDATED = 'assignment_updated',
  MATERIAL_ADDED = 'material_added',
  
  // Grade events
  GRADE_RELEASED = 'grade_released',
  SUBMISSION_RECEIVED = 'submission_received',
  STANDING_UPDATED = 'standing_updated',
  
  // Admin events
  TEACHER_PENDING = 'teacher_pending',
  TEACHER_APPROVED = 'teacher_approved',
  STUDENT_CREATED = 'student_created',
  
  // User events
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

/**
 * Initialize WebSocket server
 */
export const initializeWebSocket = (httpServer: HttpServer): Server => {
  io = new Server(httpServer, {
    cors: {
      origin: socketAllowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket: Socket) => {
    logger.info('WebSocket client connected', { socketId: socket.id });

    // Handle authentication
    socket.on(SocketEvent.AUTHENTICATE, async (token: string) => {
      try {
        // Verify JWT token with Supabase
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        
        if (error || !user) {
          socket.emit(SocketEvent.AUTH_ERROR, { message: 'Invalid token' });
          return;
        }

        // Get user profile for role info
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('id, role, first_name, last_name, two_factor_enabled')
          .eq('id', user.id)
          .single();

        if (!profile) {
          socket.emit(SocketEvent.AUTH_ERROR, { message: 'Profile not found' });
          return;
        }

        const isTwoFactorEnabled = await isTwoFactorEnabledForUser(
          user.id,
          (profile as { two_factor_enabled?: boolean | null }).two_factor_enabled ?? null
        );

        if (isTwoFactorEnabled) {
          const hasSessionProof = await hasServerSessionProof(user.id, token);
          if (!hasSessionProof) {
            socket.emit(SocketEvent.AUTH_ERROR, {
              message: 'Session is not authorized for two-factor protected account. Sign in with email and your authenticator code.',
            });
            return;
          }
        }

        // Store user ID in socket data
        socket.data.userId = user.id;
        socket.data.role = profile.role;
        socket.data.userName = `${profile.first_name} ${profile.last_name}`;

        // Add to connected users map
        if (!connectedUsers.has(user.id)) {
          connectedUsers.set(user.id, new Set());
        }
        connectedUsers.get(user.id)!.add(socket.id);

        // Join user-specific room
        socket.join(`user:${user.id}`);

        // Join role-specific room
        socket.join(`role:${profile.role}`);

        // If admin, join admin room for pending teacher alerts
        if (profile.role === 'admin') {
          socket.join('admin');
        }

        socket.emit(SocketEvent.AUTHENTICATED, { 
          userId: user.id,
          role: profile.role,
        });

        logger.info('WebSocket client authenticated', { 
          socketId: socket.id, 
          userId: user.id,
          role: profile.role,
        });

        // Notify others that user is online (optional)
        socket.broadcast.emit(SocketEvent.USER_ONLINE, { userId: user.id });

      } catch (error) {
        logger.error('WebSocket authentication error', { error: (error as Error).message });
        socket.emit(SocketEvent.AUTH_ERROR, { message: 'Authentication failed' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      const userId = socket.data.userId;
      
      if (userId && connectedUsers.has(userId)) {
        connectedUsers.get(userId)!.delete(socket.id);
        
        // If no more connections for this user, remove from map
        if (connectedUsers.get(userId)!.size === 0) {
          connectedUsers.delete(userId);
          // Notify others that user is offline
          socket.broadcast.emit(SocketEvent.USER_OFFLINE, { userId });
        }
      }

      logger.info('WebSocket client disconnected', { 
        socketId: socket.id, 
        userId,
        reason,
      });
    });
  });

  logger.info('WebSocket server initialized');
  return io;
};

/**
 * Get the Socket.io server instance
 */
export const getIO = (): Server | null => io;

/**
 * Check if a user is currently connected
 */
export const isUserOnline = (userId: string): boolean => {
  return connectedUsers.has(userId) && connectedUsers.get(userId)!.size > 0;
};

/**
 * Get count of connected users
 */
export const getConnectedUsersCount = (): number => {
  return connectedUsers.size;
};

/**
 * Send notification to a specific user
 */
export const sendToUser = (userId: string, event: SocketEvent, payload: any): void => {
  if (!io) {
    logger.warn('WebSocket not initialized, cannot send to user');
    return;
  }
  
  io.to(`user:${userId}`).emit(event, payload);
  logger.debug('Sent WebSocket event to user', { userId, event });
};

/**
 * Send notification to all users with a specific role
 */
export const sendToRole = (role: string, event: SocketEvent, payload: any): void => {
  if (!io) {
    logger.warn('WebSocket not initialized, cannot send to role');
    return;
  }
  
  io.to(`role:${role}`).emit(event, payload);
  logger.debug('Sent WebSocket event to role', { role, event });
};

/**
 * Send notification to all admins
 */
export const sendToAdmins = (event: SocketEvent, payload: any): void => {
  if (!io) {
    logger.warn('WebSocket not initialized, cannot send to admins');
    return;
  }
  
  io.to('admin').emit(event, payload);
  logger.debug('Sent WebSocket event to admins', { event });
};

/**
 * Send notification to all users in a course
 */
export const sendToCourse = async (courseId: string, event: SocketEvent, payload: any): Promise<void> => {
  if (!io) {
    logger.warn('WebSocket not initialized, cannot send to course');
    return;
  }

  try {
    // Get all enrolled students and the teacher
    const { data: enrollments } = await supabaseAdmin
      .from('enrollments')
      .select('student_id')
      .eq('course_id', courseId)
      .eq('status', 'active');

    const { data: course } = await supabaseAdmin
      .from('courses')
      .select('teacher_id')
      .eq('id', courseId)
      .single();

    const userIds = new Set<string>();
    
    if (enrollments) {
      enrollments.forEach(e => userIds.add(e.student_id));
    }
    
    if (course?.teacher_id) {
      userIds.add(course.teacher_id);
    }

    // Send to each user in the course
    userIds.forEach(userId => {
      io!.to(`user:${userId}`).emit(event, payload);
    });

    logger.debug('Sent WebSocket event to course', { courseId, event, userCount: userIds.size });
  } catch (error) {
    logger.error('Error sending to course', { courseId, error: (error as Error).message });
  }
};

/**
 * Broadcast to all connected clients
 */
export const broadcast = (event: SocketEvent, payload: any): void => {
  if (!io) {
    logger.warn('WebSocket not initialized, cannot broadcast');
    return;
  }
  
  io.emit(event, payload);
  logger.debug('Broadcast WebSocket event', { event });
};

// =============================================================================
// Convenience functions for common notification scenarios
// =============================================================================

/**
 * Notify user of a new notification
 */
export const notifyUser = (userId: string, notification: NotificationPayload): void => {
  sendToUser(userId, SocketEvent.NOTIFICATION, notification);
};

/**
 * Notify admins of pending teacher
 */
export const notifyAdminsPendingTeacher = (teacherData: { 
  id: string; 
  name: string; 
  email: string;
  pendingCount: number;
}): void => {
  sendToAdmins(SocketEvent.TEACHER_PENDING, teacherData);
};

/**
 * Notify course participants of new announcement
 */
export const notifyAnnouncementCreated = async (
  courseId: string,
  announcement: { id: string; title: string; courseId?: string; courseName: string }
): Promise<void> => {
  await sendToCourse(courseId, SocketEvent.ANNOUNCEMENT_CREATED, announcement);
};

/**
 * Notify course participants of new assignment
 */
export const notifyAssignmentCreated = async (
  courseId: string,
  assignment: {
    id: string;
    title: string;
    courseId?: string;
    courseName: string;
    assignmentType?: 'activity' | 'quiz' | 'exam';
    dueDate: string;
  }
): Promise<void> => {
  await sendToCourse(courseId, SocketEvent.ASSIGNMENT_CREATED, assignment);
};

/**
 * Notify student that grade was released
 */
export const notifyGradeReleased = (
  studentId: string,
  gradeData: { assignmentId: string; assignmentTitle: string; courseName: string; score: number; maxScore: number }
): void => {
  sendToUser(studentId, SocketEvent.GRADE_RELEASED, gradeData);
};

/**
 * Notify teacher of submission received
 */
export const notifySubmissionReceived = (
  teacherId: string,
  submissionData: { assignmentId: string; assignmentTitle: string; studentName: string; submittedAt: string }
): void => {
  sendToUser(teacherId, SocketEvent.SUBMISSION_RECEIVED, submissionData);
};

/**
 * Notify student + course teacher that standing data should be refreshed.
 */
export const notifyStandingUpdated = async (
  courseId: string,
  studentId: string,
  standingData?: {
    source?: string;
    assignmentId?: string;
    submissionId?: string;
    gradeId?: string;
    status?: string;
  }
): Promise<void> => {
  if (!io) {
    logger.warn('WebSocket not initialized, cannot send standing updates');
    return;
  }

  const recipientIds = new Set<string>([studentId]);

  try {
    const { data: course, error } = await supabaseAdmin
      .from('courses')
      .select('teacher_id')
      .eq('id', courseId)
      .single();

    if (error) {
      logger.warn('Failed to resolve course teacher for standing update', {
        courseId,
        studentId,
        error: error.message,
      });
    }

    if (course?.teacher_id) {
      recipientIds.add(course.teacher_id);
    }
  } catch (error) {
    logger.warn('Unexpected error while resolving standing update recipients', {
      courseId,
      studentId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const payload = {
    courseId,
    studentId,
    updatedAt: new Date().toISOString(),
    ...standingData,
  };

  recipientIds.forEach((recipientId) => {
    sendToUser(recipientId, SocketEvent.STANDING_UPDATED, payload);
  });
};

export default {
  initializeWebSocket,
  getIO,
  isUserOnline,
  getConnectedUsersCount,
  sendToUser,
  sendToRole,
  sendToAdmins,
  sendToCourse,
  broadcast,
  notifyUser,
  notifyAdminsPendingTeacher,
  notifyAnnouncementCreated,
  notifyAssignmentCreated,
  notifyGradeReleased,
  notifySubmissionReceived,
  notifyStandingUpdated,
  SocketEvent,
};
