import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { coursesService } from '@/services/courses.service';
import { enrollmentsService } from '@/services/enrollments.service';
import {
  invitationsService,
  BulkDirectEnrollmentResult,
  ClassInvitation,
} from '@/services/invitations.service';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateClassData } from '@/lib/query-invalidation';

export interface StudentInvitation {
  id: string;
  classId: string;
  className: string;
  studentEmail: string;
  status: 'pending' | 'accepted' | 'declined';
  sentAt: string;
}

interface ClassesContextType {
  archivedClasses: string[];
  unenrolledClasses: string[];
  handleArchive: (classId: string) => Promise<void>;
  handleUnenroll: (classId: string) => Promise<void>;
  handleRestore: (classId: string) => Promise<void>;
  invitationsLoading: boolean;
  directEnrollStudentsByEmail: (
    classId: string,
    studentEmails: string[]
  ) => Promise<BulkDirectEnrollmentResult>;
  acceptInvitation: (invitationId: string) => Promise<void>;
  declineInvitation: (invitationId: string) => Promise<void>;
  refreshInvitations: (classId?: string) => Promise<void>;
  getStudentInvitations: (studentEmail: string) => StudentInvitation[];
  getClassInvitations: (classId: string) => StudentInvitation[];
  getPendingInvitations: (classId: string) => StudentInvitation[];
}

const ClassesContext = createContext<ClassesContextType | undefined>(undefined);

export function ClassesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [archivedClasses, setArchivedClasses] = useState<string[]>([]);
  const [unenrolledClasses, setUnenrolledClasses] = useState<string[]>([]);
  const [invitations, setInvitations] = useState<StudentInvitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);

  const refreshClassQueries = useCallback(async (classId?: string) => {
    await invalidateClassData(queryClient, { classId });
  }, [queryClient]);

  const mapInvitation = useCallback((invitation: ClassInvitation): StudentInvitation => {
    const fallbackClassName = invitation.course_id
      ? `Class ${invitation.course_id.slice(0, 8).toUpperCase()}`
      : 'Class';

    return {
      id: invitation.id,
      classId: invitation.course_id,
      className: invitation.course?.title || fallbackClassName,
      studentEmail: invitation.student_email,
      status: invitation.status,
      sentAt: invitation.sent_at,
    };
  }, []);

  const loadMyInvitations = useCallback(async () => {
    if (!user) return;

    setInvitationsLoading(true);
    try {
      const response = await invitationsService.listMyInvitations();
      const apiInvitations = Array.isArray((response as any)?.data)
        ? ((response as any).data as ClassInvitation[])
        : [];

      setInvitations(apiInvitations.map(mapInvitation));
    } finally {
      setInvitationsLoading(false);
    }
  }, [mapInvitation, user]);

  const loadCourseInvitations = useCallback(async (classId: string) => {
    setInvitationsLoading(true);
    try {
      const response = await invitationsService.listCourseInvitations(classId);
      const apiInvitations = Array.isArray((response as any)?.data)
        ? ((response as any).data as ClassInvitation[])
        : [];

      const mappedInvitations = apiInvitations.map(mapInvitation);
      setInvitations((prev) => [
        ...prev.filter((invitation) => invitation.classId !== classId),
        ...mappedInvitations,
      ]);
    } finally {
      setInvitationsLoading(false);
    }
  }, [mapInvitation]);

  const refreshInvitations = useCallback(async (classId?: string) => {
    if (!user) return;

    if (classId) {
      await loadCourseInvitations(classId);
      return;
    }

    if ((user.role || '').toLowerCase() === 'student') {
      await loadMyInvitations();
    }
  }, [loadCourseInvitations, loadMyInvitations, user]);

  useEffect(() => {
    if (!user) {
      setInvitations([]);
      return;
    }

    if ((user.role || '').toLowerCase() === 'student') {
      void loadMyInvitations();
      return;
    }

    setInvitations([]);
  }, [loadMyInvitations, user]);

  const handleArchive = useCallback(async (classId: string) => {
    const isStudent = (user?.role || '').toLowerCase() === 'student';
    if (isStudent) {
      setArchivedClasses((prev) => (prev.includes(classId) ? prev : [...prev, classId]));
      return;
    }
    try {
      await coursesService.archiveCourse(classId);
      setArchivedClasses((prev) => (prev.includes(classId) ? prev : [...prev, classId]));
      await refreshClassQueries(classId);
    } catch (error) {
      console.error('Failed to archive class', error);
      throw error;
    }
  }, [refreshClassQueries, user]);

  const handleUnenroll = useCallback(async (classId: string) => {
    try {
      const statusResponse = await enrollmentsService.getEnrollmentStatus(classId);
      const enrollmentId = statusResponse?.data?.enrollment_id;

      if (enrollmentId) {
        await enrollmentsService.unenrollFromCourse(enrollmentId);
      }

      setUnenrolledClasses((prev) => (prev.includes(classId) ? prev : [...prev, classId]));
      await refreshClassQueries(classId);
    } catch (error) {
      console.error('Failed to unenroll from class', error);
      throw error;
    }
  }, [refreshClassQueries]);

  const handleRestore = useCallback(async (classId: string) => {
    try {
      await coursesService.unarchiveCourse(classId);
      setArchivedClasses((prev) => prev.filter((id) => id !== classId));
      await refreshClassQueries(classId);
    } catch (error) {
      console.error('Failed to restore class', error);
      throw error;
    }
  }, [refreshClassQueries]);

  const directEnrollStudentsByEmail = useCallback(
    async (classId: string, studentEmails: string[]): Promise<BulkDirectEnrollmentResult> => {
      const normalizedEmails = studentEmails
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 0);

      const uniqueEmails = Array.from(new Set(normalizedEmails));

      if (uniqueEmails.length === 0) {
        return {
          course_id: classId,
          total: 0,
          enrolled: 0,
          already_enrolled: 0,
          failed: 0,
          results: [],
        };
      }

      const response = await invitationsService.bulkDirectEnrollByEmail(classId, uniqueEmails);
      await loadCourseInvitations(classId);
      await refreshClassQueries(classId);
      return (response as any).data as BulkDirectEnrollmentResult;
    },
    [loadCourseInvitations, refreshClassQueries]
  );

  const acceptInvitation = useCallback(async (invitationId: string) => {
    const invitation = invitations.find((item) => item.id === invitationId);
    await invitationsService.acceptInvitation(invitationId);
    await loadMyInvitations();
    await refreshClassQueries(invitation?.classId);
  }, [invitations, loadMyInvitations, refreshClassQueries]);

  const declineInvitation = useCallback(async (invitationId: string) => {
    const invitation = invitations.find((item) => item.id === invitationId);
    await invitationsService.declineInvitation(invitationId);
    await loadMyInvitations();
    await refreshClassQueries(invitation?.classId);
  }, [invitations, loadMyInvitations, refreshClassQueries]);

  const getStudentInvitations = useCallback((studentEmail: string) => {
    const normalizedEmail = studentEmail.trim().toLowerCase();
    return invitations.filter((invitation) => invitation.studentEmail.toLowerCase() === normalizedEmail);
  }, [invitations]);

  const getClassInvitations = useCallback((classId: string) => {
    return invitations.filter((invitation) => invitation.classId === classId);
  }, [invitations]);

  const getPendingInvitations = useCallback((classId: string) => {
    return invitations.filter(
      (invitation) => invitation.classId === classId && invitation.status === 'pending'
    );
  }, [invitations]);

  return (
    <ClassesContext.Provider
      value={{
        archivedClasses,
        unenrolledClasses,
        handleArchive,
        handleUnenroll,
        handleRestore,
        invitationsLoading,
        directEnrollStudentsByEmail,
        acceptInvitation,
        declineInvitation,
        refreshInvitations,
        getStudentInvitations,
        getClassInvitations,
        getPendingInvitations,
      }}
    >
      {children}
    </ClassesContext.Provider>
  );
}

export function useClasses() {
  const context = useContext(ClassesContext);
  if (!context) {
    throw new Error('useClasses must be used within a ClassesProvider');
  }
  return context;
}
