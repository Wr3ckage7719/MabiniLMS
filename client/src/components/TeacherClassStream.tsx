import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bell,
  ClipboardCheck,
  Copy,
  FileText,
  Image as ImageIcon,
  Palette,
  Plus,
  Send,
  MoreVertical,
  Heart,
  MessageCircle,
  Repeat2,
  Clock,
  BookOpen,
  Upload,
  Download,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CreateAssignmentDialog, type TaskType } from '@/components/CreateAssignmentDialog';
import { TeacherAssignmentDetail } from '@/components/TeacherAssignmentDetail';
import { StudentDetailDialog } from '@/components/StudentDetailDialog';
import { AnnouncementCommentsPanel } from '@/components/AnnouncementCommentsPanel';
import { TeacherClassPeople } from '@/components/TeacherClassPeople';
import { useAnnouncements } from '@/hooks-api/useAnnouncements';
import { useAssignments } from '@/hooks-api/useAssignments';
import { useMaterials } from '@/hooks-api/useMaterials';
import {
  DiscussionPost,
  useDeleteDiscussionPost,
  useDiscussionPosts,
  useHideDiscussionPost,
  useToggleDiscussionPostLike,
} from '@/hooks-api/useDiscussions';
import { useStudents } from '@/hooks-api/useStudents';
import { useCourseSubmissions } from '@/hooks/useTeacherData';
import { announcementsService } from '@/services/announcements.service';
import { assignmentsService } from '@/services/assignments.service';
import { coursesService } from '@/services/courses.service';
import { materialsService } from '@/services/materials.service';
import {
  buildCourseMetadata,
  parseCourseMetadataFromDescription,
  parseCourseMetadataFromSyllabus,
  serializeCourseMetadata,
} from '@/services/course-metadata';
import { teacherService } from '@/services/teacher.service';
import { batchService } from '@/services/batch.service';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateClassData } from '@/lib/query-invalidation';
import { Announcement as ClassAnnouncement, type LearningMaterial } from '@/lib/data';
import { useSearchParams } from 'react-router-dom';
import {
  formatProviderFileSize,
  normalizeSubmissionStorageMetadata,
} from '@/lib/submission-storage';
import { MaterialPreviewDialog } from '@/components/MaterialPreviewDialog';

interface TeacherClassStreamProps {
  classId: string;
  className: string;
  classColor: string;
  classCoverImage?: string;
  block?: string;
  level?: string;
  room?: string;
  schedule?: string;
}

interface ClassworkAssignment {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  points: number;
  dueSoon: boolean;
  submitted: number;
  total: number;
  status: 'active' | 'completed';
  type: 'activity' | 'material';
  rawType?: string;
  topic?: string;
  acceptingSubmissions: boolean;
  submissionOpenAt?: string | null;
  submissionCloseAt?: string | null;
  createdAt: Date;
}

interface RecentSubmissionItem {
  id: string;
  student: string;
  avatar: string;
  assignment: string;
  submittedAt: string;
  submittedAtValue: string;
  dueDate: string;
  onTime: boolean;
  submissionContent?: string;
  submissionUrl?: string;
  providerLabel?: string;
  providerFileId?: string;
  providerFileName?: string;
  providerMimeType?: string;
  providerSizeBytes?: number;
  submissionSnapshotAt?: string;
  existingGrade?: number | null;
  existingFeedback?: string | null;
  points?: number;
  description?: string;
}

interface EditableAnnouncement {
  id: string;
}

interface TeacherDiscussionPost {
  id: string;
  authorName: string;
  authorAvatar: string;
  authorAvatarUrl?: string | null;
  content: string;
  timestamp: string;
  likes: number;
  liked: boolean;
  isHidden: boolean;
}

const CREATE_TASK_OPTIONS: Array<{
  id: TaskType;
  label: string;
  description: string;
  icon: typeof BookOpen;
}> = [
  {
    id: 'reading_material',
    label: 'Reading Material',
    description: 'Upload references and class resources',
    icon: BookOpen,
  },
  {
    id: 'activity',
    label: 'Activity',
    description: 'Create a graded submission task',
    icon: Activity,
  },
  {
    id: 'quiz',
    label: 'Quiz',
    description: 'Build a scored quiz flow',
    icon: FileText,
  },
  {
    id: 'exam',
    label: 'Exam',
    description: 'Set up a proctored assessment',
    icon: ClipboardCheck,
  },
];

type TeacherClassTab = 'stream' | 'classwork' | 'people' | 'submissions';

const VALID_TEACHER_CLASS_TABS: TeacherClassTab[] = ['stream', 'classwork', 'people', 'submissions'];

const parseTeacherClassTab = (value: string | null): TeacherClassTab => {
  if (value && VALID_TEACHER_CLASS_TABS.includes(value as TeacherClassTab)) {
    return value as TeacherClassTab;
  }

  return 'stream';
};

const parseTaskTypeParam = (value: string | null): TaskType | null => {
  if (value === 'reading_material' || value === 'activity' || value === 'quiz' || value === 'exam') {
    return value;
  }

  return null;
};

const parseGradeInput = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const numericPart = trimmed.includes('/') ? trimmed.split('/')[0] : trimmed;
  const parsed = Number.parseFloat(numericPart);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatRelativeTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatDateTime = (value?: string | null): string => {
  if (!value) return 'Unknown';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
};

const toTeacherDiscussionPost = (post: DiscussionPost): TeacherDiscussionPost => {
  const firstName = post.author?.first_name?.trim() || '';
  const lastName = post.author?.last_name?.trim() || '';
  const authorName =
    `${firstName} ${lastName}`.trim() || post.author?.email || 'Student';
  const authorAvatar =
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() ||
    authorName.slice(0, 2).toUpperCase();

  return {
    id: post.id,
    authorName,
    authorAvatar,
    authorAvatarUrl: post.author?.avatar_url || null,
    content: post.content,
    timestamp: post.created_at,
    likes: post.likes_count,
    liked: post.liked_by_me,
    isHidden: Boolean(post.is_hidden),
  };
};

export function TeacherClassStream({
  classId,
  className,
  classColor,
  classCoverImage,
  block,
  level,
  room,
  schedule,
}: TeacherClassStreamProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [announcementText, setAnnouncementText] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    data: apiAnnouncements = [],
    isLoading: announcementsLoading,
    refetch: refetchAnnouncements,
  } = useAnnouncements(classId);
  const {
    data: apiAssignments = [],
    refetch: refetchAssignments,
  } = useAssignments(classId);
  const {
    data: apiMaterials = [],
    refetch: refetchMaterials,
  } = useMaterials(classId);
  const {
    data: apiDiscussionPosts = [],
    isLoading: discussionPostsLoading,
  } = useDiscussionPosts(classId);
  const toggleDiscussionPostLikeMutation = useToggleDiscussionPostLike(classId);
  const hideDiscussionPostMutation = useHideDiscussionPost(classId);
  const deleteDiscussionPostMutation = useDeleteDiscussionPost(classId);
  const {
    submissions: apiSubmissions = [],
    refetch: refetchCourseSubmissions,
  } = useCourseSubmissions(classId);
  const { data: enrolledStudents = [] } = useStudents(classId);
  const [announcements, setAnnouncements] = useState(apiAnnouncements);
  const [classCode] = useState(() => classId.toUpperCase().slice(0, 8));
  const [showThemeSettings, setShowThemeSettings] = useState(false);
  const [persistedTheme, setPersistedTheme] = useState(classColor || 'blue');
  const [selectedTheme, setSelectedTheme] = useState(classColor || 'blue');
  const [copied, setCopied] = useState(false);
  const [persistedBackgroundImage, setPersistedBackgroundImage] = useState<string | null>(
    classCoverImage || null
  );
  const [customBackgroundImage, setCustomBackgroundImage] = useState<string | null>(classCoverImage || null);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [activeTab, setActiveTab] = useState<TeacherClassTab>('stream');
  const [builderTaskType, setBuilderTaskType] = useState<TaskType | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<ClassworkAssignment | null>(null);
  const [showAssignmentDetail, setShowAssignmentDetail] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<{
    name: string;
    avatar: string;
    submitted: number;
    total: number;
    percentage: number;
  } | null>(null);
  const [showStudentDetail, setShowStudentDetail] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<RecentSubmissionItem | null>(null);
  const [showSubmissionDetail, setShowSubmissionDetail] = useState(false);
  const [selectedAnnouncementForComments, setSelectedAnnouncementForComments] =
    useState<ClassAnnouncement | null>(null);
  const [submissionGrade, setSubmissionGrade] = useState('');
  const [submissionFeedback, setSubmissionFeedback] = useState('');
  const [savingSubmissionGrade, setSavingSubmissionGrade] = useState(false);
  const [assignments, setAssignments] = useState<ClassworkAssignment[]>([]);
  const [editingAnnouncement, setEditingAnnouncement] = useState<EditableAnnouncement | null>(null);
  const [editAnnouncementTitle, setEditAnnouncementTitle] = useState('');
  const [editAnnouncementContent, setEditAnnouncementContent] = useState('');
  const [editAnnouncementPinned, setEditAnnouncementPinned] = useState(false);
  const [postingAnnouncement, setPostingAnnouncement] = useState(false);
  const [savingAnnouncementEdit, setSavingAnnouncementEdit] = useState(false);
  const [deletingAssignmentIds, setDeletingAssignmentIds] = useState<string[]>([]);
  const [deletingMaterialIds, setDeletingMaterialIds] = useState<string[]>([]);
  const [deletingAnnouncementIds, setDeletingAnnouncementIds] = useState<string[]>([]);
  const [likingDiscussionPostIds, setLikingDiscussionPostIds] = useState<string[]>([]);
  const [hidingDiscussionPostIds, setHidingDiscussionPostIds] = useState<string[]>([]);
  const [deletingDiscussionPostIds, setDeletingDiscussionPostIds] = useState<string[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<LearningMaterial | null>(null);
  const [exportingRegistrar, setExportingRegistrar] = useState(false);
  const backgroundUploadInputRef = useRef<HTMLInputElement | null>(null);

  const updateClassRouteState = (
    nextTab: TeacherClassTab,
    nextBuilderTaskType: TaskType | null,
    options?: { replace?: boolean }
  ) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('view', 'classes');
    nextParams.set('classId', classId);
    nextParams.set('tab', nextTab);

    if (nextTab === 'classwork' && nextBuilderTaskType) {
      nextParams.set('builder', nextBuilderTaskType);
    } else {
      nextParams.delete('builder');
    }

    setSearchParams(nextParams, { replace: options?.replace ?? false });
  };

  const handleTabChange = (nextTab: TeacherClassTab) => {
    const nextBuilderTaskType = nextTab === 'classwork' ? builderTaskType : null;

    setActiveTab(nextTab);
    if (nextTab !== 'classwork' && builderTaskType) {
      setBuilderTaskType(null);
    }

    updateClassRouteState(nextTab, nextBuilderTaskType);
  };

  const openBuilder = (taskType: TaskType) => {
    setActiveTab('classwork');
    setBuilderTaskType(taskType);
    updateClassRouteState('classwork', taskType);
  };

  const closeBuilder = (replace = true) => {
    setActiveTab('classwork');
    setBuilderTaskType(null);
    updateClassRouteState('classwork', null, { replace });
  };

  useEffect(() => {
    setAnnouncements(apiAnnouncements);
  }, [apiAnnouncements]);

  useEffect(() => {
    const routeClassId = searchParams.get('classId');
    if (routeClassId && routeClassId !== classId) {
      return;
    }

    const routeBuilderTaskType = parseTaskTypeParam(searchParams.get('builder'));
    const routeTabParam = searchParams.get('tab');
    const nextTab = routeBuilderTaskType ? 'classwork' : parseTeacherClassTab(routeTabParam);

    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }

    if (routeBuilderTaskType !== builderTaskType) {
      setBuilderTaskType(routeBuilderTaskType);
    }
  }, [activeTab, builderTaskType, classId, searchParams]);

  useEffect(() => {
    const nextTheme = classColor || 'blue';
    setPersistedTheme(nextTheme);

    if (!showThemeSettings) {
      setSelectedTheme(nextTheme);
    }
  }, [classColor, showThemeSettings]);

  useEffect(() => {
    const nextCoverImage = classCoverImage || null;
    setPersistedBackgroundImage(nextCoverImage);

    if (!showThemeSettings) {
      setCustomBackgroundImage(nextCoverImage);
    }
  }, [classCoverImage, showThemeSettings]);

  useEffect(() => {
    const assignmentSubmissions = apiSubmissions.reduce<Record<string, number>>((acc, submission) => {
      acc[submission.assignment_id] = (acc[submission.assignment_id] || 0) + 1;
      return acc;
    }, {});

    const mappedAssignments: ClassworkAssignment[] = apiAssignments.map((assignment) => ({
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      dueDate: assignment.dueDate,
      points: assignment.points,
      dueSoon: new Date(assignment.dueDate).getTime() - Date.now() <= 48 * 60 * 60 * 1000,
      submitted: assignmentSubmissions[assignment.id] || 0,
      total: Math.max(assignmentSubmissions[assignment.id] || 0, 1),
      status: assignment.status === 'graded' ? 'completed' : 'active',
      type: assignment.type === 'discussion' ? 'material' : 'activity',
      rawType: assignment.rawType,
      acceptingSubmissions: assignment.submissionsOpen ?? true,
      submissionOpenAt: assignment.submissionOpenAt ?? null,
      submissionCloseAt: assignment.submissionCloseAt ?? null,
      createdAt: new Date(assignment.dueDate),
    }));

    setAssignments(mappedAssignments);
  }, [apiAssignments, apiSubmissions]);

  const recentSubmissions: RecentSubmissionItem[] = useMemo(() => {
    return apiSubmissions
      .map((submission) => {
        const normalizedStorage = normalizeSubmissionStorageMetadata(submission);
        const firstName = submission.student?.first_name?.trim() || '';
        const lastName = submission.student?.last_name?.trim() || '';
        const studentName = `${firstName} ${lastName}`.trim() || submission.student?.email || 'Student';
        const avatar = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || studentName.slice(0, 2).toUpperCase();
        const normalizedGrade = Array.isArray((submission as any).grade)
          ? (submission as any).grade[0]
          : (submission as any).grade;

        return {
          id: submission.id,
          student: studentName,
          avatar,
          assignment: submission.assignment?.title || 'Assignment',
          submittedAt: new Date(submission.submitted_at).toLocaleString(),
          submittedAtValue: submission.submitted_at,
          dueDate: submission.assignment?.due_date ? new Date(submission.assignment.due_date).toLocaleDateString() : 'No due date',
          onTime: submission.assignment?.due_date
            ? new Date(submission.submitted_at).getTime() <= new Date(submission.assignment.due_date).getTime()
            : true,
          points: submission.assignment?.max_points,
          submissionContent: normalizedStorage.submissionText || undefined,
          submissionUrl: normalizedStorage.submissionUrl || undefined,
          providerLabel: normalizedStorage.providerLabel,
          providerFileId: normalizedStorage.providerFileId || undefined,
          providerFileName: normalizedStorage.providerFileName || undefined,
          providerMimeType: normalizedStorage.providerMimeType || undefined,
          providerSizeBytes: normalizedStorage.providerSizeBytes ?? undefined,
          submissionSnapshotAt: normalizedStorage.snapshotAt || undefined,
          existingGrade:
            typeof normalizedGrade?.points_earned === 'number'
              ? normalizedGrade.points_earned
              : null,
          existingFeedback: normalizedGrade?.feedback || null,
          description: submission.assignment?.title,
        };
      })
      .sort((a, b) => new Date(b.submittedAtValue).getTime() - new Date(a.submittedAtValue).getTime())
      .slice(0, 10);
  }, [apiSubmissions]);

  const discussionPosts: TeacherDiscussionPost[] = useMemo(() => {
    return apiDiscussionPosts.map(toTeacherDiscussionPost);
  }, [apiDiscussionPosts]);

  const handleSaveSubmissionGrade = async () => {
    if (!selectedSubmission) return;

    const parsedGrade = parseGradeInput(submissionGrade);
    if (parsedGrade === null || parsedGrade < 0) {
      toast({
        title: 'Invalid grade',
        description: 'Enter a numeric grade value before saving.',
        variant: 'destructive',
      });
      return;
    }

    setSavingSubmissionGrade(true);
    try {
      await teacherService.gradeSubmission(selectedSubmission.id, {
        points_earned: parsedGrade,
        feedback: submissionFeedback.trim() || undefined,
      });
      await refetchCourseSubmissions();

      toast({
        title: 'Grade saved',
        description: 'The submission grade and feedback were saved.',
      });

      setShowSubmissionDetail(false);
      setSelectedSubmission(null);
      setSubmissionGrade('');
      setSubmissionFeedback('');
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to save grade and feedback';

      toast({
        title: 'Save failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSavingSubmissionGrade(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please select an image file.',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'Image too large',
        description: 'Please upload an image smaller than 2MB.',
        variant: 'destructive',
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setCustomBackgroundImage(reader.result as string);
    };
    reader.onerror = () => {
      toast({
        title: 'Upload failed',
        description: 'Could not read this image file. Please try another file.',
        variant: 'destructive',
      });
    };
    reader.readAsDataURL(file);
  };

  const openBackgroundImagePicker = () => {
    if (backgroundUploadInputRef.current) {
      backgroundUploadInputRef.current.value = '';
      backgroundUploadInputRef.current.click();
    }
  };

  const handleCancelAppearanceChanges = () => {
    setSelectedTheme(persistedTheme);
    setCustomBackgroundImage(persistedBackgroundImage);
    setShowThemeSettings(false);
  };

  const handleSaveAppearance = async () => {
    if (savingAppearance) return;

    setSavingAppearance(true);
    try {
      const courseResponse = await coursesService.getCourseById(classId);
      const course = courseResponse?.data || {};

      const descriptionMetadata = parseCourseMetadataFromDescription(course.description);
      const syllabusMetadata = parseCourseMetadataFromSyllabus(course.syllabus);
      const existingMetadata = {
        ...descriptionMetadata,
        ...syllabusMetadata,
      };

      const metadata = buildCourseMetadata({
        section: existingMetadata.section,
        block: existingMetadata.block || block,
        level: existingMetadata.level || level,
        room: existingMetadata.room || room,
        schedule: existingMetadata.schedule || schedule,
        theme: selectedTheme,
        coverImage: customBackgroundImage || undefined,
      });

      await coursesService.updateCourse(classId, {
        syllabus: serializeCourseMetadata(metadata) || null,
      });

      await invalidateClassData(queryClient, { classId });

      toast({
        title: 'Appearance updated',
        description: 'Your class theme and header image have been saved.',
      });

      setPersistedTheme(selectedTheme);
      setPersistedBackgroundImage(customBackgroundImage || null);
      setShowThemeSettings(false);
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to save class appearance';
      toast({
        title: 'Save failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSavingAppearance(false);
    }
  };

  const copyClassCode = () => {
    navigator.clipboard.writeText(classCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePostAnnouncement = () => {
    const content = announcementText.trim();
    if (!content || postingAnnouncement) return;

    void (async () => {
      setPostingAnnouncement(true);
      try {
        const firstLine = content.split(/\r?\n/)[0]?.trim() || '';
        const normalizedTitle =
          firstLine && firstLine.toLowerCase() !== content.toLowerCase()
            ? firstLine.slice(0, 80)
            : 'Announcement';

        await announcementsService.createAnnouncement(classId, {
          title: normalizedTitle,
          content,
        });
        setAnnouncementText('');
        await refetchAnnouncements();
        toast({
          title: 'Announcement posted',
          description: 'Your announcement is now visible to students.',
        });
      } catch (error: any) {
        const message =
          error?.response?.data?.error?.message ||
          error?.response?.data?.message ||
          error?.message ||
          'Failed to post announcement';
        toast({
          title: 'Unable to post announcement',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setPostingAnnouncement(false);
      }
    })();
  };

  const handleDeleteAssignment = (id: string) => {
    if (deletingAssignmentIds.includes(id)) {
      return;
    }

    void (async () => {
      setDeletingAssignmentIds((previous) => [...previous, id]);

      try {
        await assignmentsService.deleteAssignment(classId, id);
        setAssignments((previous) => previous.filter((assignment) => assignment.id !== id));
        await refetchAssignments();
        toast({
          title: 'Classwork removed',
          description: 'The selected classwork item has been deleted.',
        });
      } catch (error: any) {
        const message = error?.response?.data?.message || error?.message || 'Failed to delete classwork';
        toast({
          title: 'Delete failed',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setDeletingAssignmentIds((previous) => previous.filter((assignmentId) => assignmentId !== id));
      }
    })();
  };

  const handleDeleteMaterial = (material: LearningMaterial) => {
    if (deletingMaterialIds.includes(material.id)) {
      return;
    }

    void (async () => {
      setDeletingMaterialIds((previous) => [...previous, material.id]);

      try {
        await materialsService.delete(material.id);
        await refetchMaterials();

        toast({
          title: 'Material deleted',
          description: 'The reading material and hosted file were removed.',
        });
      } catch (error: any) {
        const message =
          error?.response?.data?.error?.message
          || error?.response?.data?.message
          || error?.message
          || 'Failed to delete material';

        toast({
          title: 'Delete failed',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setDeletingMaterialIds((previous) =>
          previous.filter((materialId) => materialId !== material.id)
        );
      }
    })();
  };

  const handleExportRegistrar = () => {
    if (exportingRegistrar) return;
    void (async () => {
      setExportingRegistrar(true);
      try {
        const csv = await batchService.exportRegistrarGrades(classId);
        const blob = new Blob([csv as string], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `registrar-grades-${classId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (error: any) {
        toast({
          title: 'Export failed',
          description:
            error?.response?.data?.error?.message ||
            error?.response?.data?.message ||
            error?.message ||
            'Failed to export registrar grades',
          variant: 'destructive',
        });
      } finally {
        setExportingRegistrar(false);
      }
    })();
  };

  const handleDownloadMaterial = (material: LearningMaterial) => {
    if (!material.url) {
      toast({
        title: 'Material link unavailable',
        description: 'This material does not have a valid file URL yet.',
        variant: 'destructive',
      });
      return;
    }

    window.open(material.url, '_blank', 'noopener,noreferrer');
  };

  const handleDeleteAnnouncement = (announcementId: string) => {
    if (deletingAnnouncementIds.includes(announcementId)) {
      return;
    }

    void (async () => {
      setDeletingAnnouncementIds((previous) => [...previous, announcementId]);

      try {
        await announcementsService.deleteAnnouncement(announcementId);
        setAnnouncements((previous) => previous.filter((announcement) => announcement.id !== announcementId));
        setSelectedAnnouncementForComments((previous) =>
          previous?.id === announcementId ? null : previous
        );
        await refetchAnnouncements();
        toast({
          title: 'Announcement deleted',
          description: 'The announcement was removed from the stream.',
        });
      } catch (error: any) {
        const message = error?.response?.data?.message || error?.message || 'Failed to delete announcement';
        toast({
          title: 'Delete failed',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setDeletingAnnouncementIds((previous) =>
          previous.filter((id) => id !== announcementId)
        );
      }
    })();
  };

  const handleToggleDiscussionPostLike = (postId: string) => {
    if (likingDiscussionPostIds.includes(postId)) {
      return;
    }

    void (async () => {
      setLikingDiscussionPostIds((previous) => [...previous, postId]);

      try {
        await toggleDiscussionPostLikeMutation.mutateAsync(postId);
      } catch (error: any) {
        const message =
          error?.response?.data?.error?.message ||
          error?.response?.data?.message ||
          error?.message ||
          'Failed to update post reaction';

        toast({
          title: 'Like failed',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setLikingDiscussionPostIds((previous) =>
          previous.filter((id) => id !== postId)
        );
      }
    })();
  };

  const handleHideDiscussionPost = (postId: string) => {
    if (hidingDiscussionPostIds.includes(postId)) {
      return;
    }

    void (async () => {
      setHidingDiscussionPostIds((previous) => [...previous, postId]);

      try {
        await hideDiscussionPostMutation.mutateAsync(postId);
        toast({
          title: 'Post hidden',
          description: 'The comment has been hidden from the class discussion feed.',
        });
      } catch (error: any) {
        const message =
          error?.response?.data?.error?.message ||
          error?.response?.data?.message ||
          error?.message ||
          'Failed to hide discussion post';

        toast({
          title: 'Hide failed',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setHidingDiscussionPostIds((previous) =>
          previous.filter((id) => id !== postId)
        );
      }
    })();
  };

  const handleDeleteDiscussionPost = (postId: string) => {
    if (deletingDiscussionPostIds.includes(postId)) {
      return;
    }

    void (async () => {
      setDeletingDiscussionPostIds((previous) => [...previous, postId]);

      try {
        await deleteDiscussionPostMutation.mutateAsync(postId);
        toast({
          title: 'Post removed',
          description: 'The comment was removed from class discussion.',
        });
      } catch (error: any) {
        const message =
          error?.response?.data?.error?.message ||
          error?.response?.data?.message ||
          error?.message ||
          'Failed to remove discussion post';

        toast({
          title: 'Remove failed',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setDeletingDiscussionPostIds((previous) =>
          previous.filter((id) => id !== postId)
        );
      }
    })();
  };

  const openEditAnnouncementDialog = (announcement: {
    id: string;
    title?: string;
    content: string;
    pinned?: boolean;
  }) => {
    setEditingAnnouncement({ id: announcement.id });
    setEditAnnouncementTitle(
      (announcement.title || '').trim() || announcement.content.slice(0, 80)
    );
    setEditAnnouncementContent(announcement.content);
    setEditAnnouncementPinned(Boolean(announcement.pinned));
  };

  const closeEditAnnouncementDialog = () => {
    if (savingAnnouncementEdit) {
      return;
    }

    setEditingAnnouncement(null);
    setEditAnnouncementTitle('');
    setEditAnnouncementContent('');
    setEditAnnouncementPinned(false);
  };

  const handleSaveAnnouncementEdit = async () => {
    if (!editingAnnouncement) return;

    const trimmedTitle = editAnnouncementTitle.trim();
    const trimmedContent = editAnnouncementContent.trim();

    if (!trimmedTitle) {
      toast({
        title: 'Title required',
        description: 'Announcement title cannot be empty.',
        variant: 'destructive',
      });
      return;
    }

    if (!trimmedContent) {
      toast({
        title: 'Content required',
        description: 'Announcement content cannot be empty.',
        variant: 'destructive',
      });
      return;
    }

    setSavingAnnouncementEdit(true);
    try {
      await announcementsService.updateAnnouncement(editingAnnouncement.id, {
        title: trimmedTitle,
        content: trimmedContent,
        pinned: editAnnouncementPinned,
      });
      await refetchAnnouncements();
      toast({
        title: 'Announcement updated',
        description: 'The announcement changes are now live.',
      });
      setEditingAnnouncement(null);
      setEditAnnouncementTitle('');
      setEditAnnouncementContent('');
      setEditAnnouncementPinned(false);
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Failed to update announcement';
      toast({
        title: 'Update failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSavingAnnouncementEdit(false);
    }
  };

  const handleTogglePinAnnouncement = (
    announcementId: string,
    pinned: boolean | undefined,
    title: string | undefined,
    content: string
  ) => {
    void (async () => {
      try {
        await announcementsService.updateAnnouncement(announcementId, {
          pinned: !pinned,
          title: title || content.slice(0, 80),
          content,
        });
        await refetchAnnouncements();
        toast({
          title: !pinned ? 'Announcement pinned' : 'Announcement unpinned',
          description: !pinned
            ? 'Pinned announcements stay on top for students.'
            : 'Announcement returned to standard ordering.',
        });
      } catch (error: any) {
        const message = error?.response?.data?.message || error?.message || 'Failed to update announcement';
        toast({
          title: 'Pin update failed',
          description: message,
          variant: 'destructive',
        });
      }
    })();
  };

  const gradients: Record<string, string> = {
    blue: 'from-blue-500 to-blue-600',
    teal: 'from-teal-500 to-teal-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
    pink: 'from-pink-500 to-pink-600',
    green: 'from-green-500 to-green-600',
    cyan: 'from-cyan-500 to-cyan-600',
    indigo: 'from-indigo-500 to-indigo-600',
    gray: 'from-gray-400 to-gray-500',
  };

  const currentGradient = gradients[selectedTheme] || gradients.blue;

  const isFullScreenBuilder = activeTab === 'classwork' && Boolean(builderTaskType);

  if (isFullScreenBuilder && builderTaskType) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background py-3 md:py-6">
        <div className="mx-auto w-full max-w-[1600px] px-3 md:px-6 lg:px-8">
          <CreateAssignmentDialog
            open={true}
            isPage
            classId={classId}
            initialTaskType={builderTaskType}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) {
                closeBuilder(true);
              }
            }}
            onCreated={() => {
              closeBuilder(true);
              void Promise.all([refetchAssignments(), refetchMaterials()]);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0 animate-fade-in">
      {/* Theme Banner */}
      <div 
        className={`relative rounded-xl overflow-hidden mb-6 shadow-lg transition-all duration-500 ease-out ${!customBackgroundImage ? `bg-gradient-to-br ${currentGradient}` : ''}`}
        style={{
          animation: 'slideInTop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
          backgroundImage: customBackgroundImage ? `url(${customBackgroundImage})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}>
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-white rounded-full blur-3xl translate-y-1/2 -translate-x-1/4 opacity-10"></div>
        </div>
        {/* Dark overlay for custom images to ensure text readability */}
        {customBackgroundImage && (
          <div className="absolute inset-0 bg-black/40"></div>
        )}
        
        <div className="relative p-6 md:p-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-1">{className}</h2>
              {block && level && (
                <p className="text-white/80 text-sm">Block {block} • {level}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowThemeSettings(!showThemeSettings)}
              className="text-white hover:bg-white/20 rounded-lg h-10 w-10"
            >
              <Palette className="h-5 w-5" />
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-white/90">
            {room && (
              <div>
                <p className="text-xs text-white/70 mb-1">Room</p>
                <p className="font-semibold text-sm">{room}</p>
              </div>
            )}
            {schedule && (
              <div>
                <p className="text-xs text-white/70 mb-1">Schedule</p>
                <p className="font-semibold text-sm">{schedule}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mb-6">
        <div className="flex gap-1 md:gap-6">
          <button
            onClick={() => handleTabChange('stream')}
            className={`px-1 md:px-2 py-3 font-medium text-sm transition-colors ${
              activeTab === 'stream'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Stream
          </button>
          <button
            onClick={() => handleTabChange('classwork')}
            className={`px-1 md:px-2 py-3 font-medium text-sm transition-colors ${
              activeTab === 'classwork'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Classwork
          </button>
          <button
            onClick={() => handleTabChange('people')}
            className={`px-1 md:px-2 py-3 font-medium text-sm transition-colors ${
              activeTab === 'people'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            People
          </button>
          <button
            onClick={() => handleTabChange('submissions')}
            className={`px-1 md:px-2 py-3 font-medium text-sm transition-colors ${
              activeTab === 'submissions'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Recent Submissions
          </button>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          {/* Class Code Card */}
          <Card className="border-0 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden group">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Class Code</span>
                <Copy className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  onClick={copyClassCode} />
              </div>
              <div className="bg-muted rounded-lg p-4 text-center group">
                <p className="font-mono text-xl font-bold tracking-wider group-hover:scale-105 transition-transform">{classCode}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full mt-3 rounded-lg text-xs"
                onClick={copyClassCode}
              >
                <Copy className="h-3 w-3 mr-1.5" />
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </CardContent>
          </Card>

          {/* Upcoming Card */}
          <Card className="border-0 shadow-sm hover:shadow-md transition-all duration-300">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Upcoming
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-center py-6">
                <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">No work due soon</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-primary hover:bg-blue-50 rounded-lg"
                onClick={() => handleTabChange('classwork')}
              >
                View all
              </Button>
            </CardContent>
          </Card>

          {/* Quick Statistics */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-2 rounded-lg bg-blue-50">
                  <p className="text-lg font-bold text-blue-600">
                    {enrolledStudents.length}
                  </p>
                  <p className="text-xs text-muted-foreground">Students</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-green-50">
                  <p className="text-lg font-bold text-green-600">
                    {assignments.filter((item) => item.status === 'active').length}
                  </p>
                  <p className="text-xs text-muted-foreground">Active Work</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3 space-y-4 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          {/* Theme Customization Dialog */}
          <Dialog
            open={showThemeSettings}
            onOpenChange={(open) => {
              if (!open) {
                handleCancelAppearanceChanges();
                return;
              }

              setShowThemeSettings(open);
            }}
          >
            <DialogContent className="w-full max-w-md rounded-xl">
              <DialogHeader>
                <DialogTitle className="text-left">Customize appearance</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-6">
                {/* Stream Header Image Preview */}
                <div className="space-y-2">
                  <div 
                    className={`relative rounded-lg overflow-hidden h-24 shadow-sm ${!customBackgroundImage ? `bg-gradient-to-br ${currentGradient}` : ''}`}
                    style={{
                      backgroundImage: customBackgroundImage ? `url(${customBackgroundImage})` : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}>
                    {customBackgroundImage && (
                      <div className="absolute inset-0 bg-black/20"></div>
                    )}
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">Select stream header image</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg text-xs"
                      onClick={openBackgroundImagePicker}
                    >
                      <ImageIcon className="h-3 w-3 mr-1.5" />
                      Select photo
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg text-xs"
                      onClick={openBackgroundImagePicker}
                    >
                      <Upload className="h-3 w-3 mr-1.5" />
                      Upload photo
                    </Button>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      ref={backgroundUploadInputRef}
                    />
                  </div>
                </div>

                {/* Theme Colors */}
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">Select theme color</p>
                  <div className="flex gap-4 justify-center flex-wrap">
                    {[
                      { name: 'blue', bg: 'bg-blue-500' },
                      { name: 'green', bg: 'bg-green-500' },
                      { name: 'pink', bg: 'bg-pink-500' },
                      { name: 'orange', bg: 'bg-orange-500' },
                      { name: 'cyan', bg: 'bg-cyan-500' },
                      { name: 'purple', bg: 'bg-purple-500' },
                      { name: 'indigo', bg: 'bg-indigo-500' },
                      { name: 'gray', bg: 'bg-gray-400' },
                    ].map((color) => (
                      <button
                        key={color.name}
                        onClick={() => {
                          setSelectedTheme(color.name);
                          setCustomBackgroundImage(null);
                        }}
                        className={`h-10 w-10 rounded-full transition-all duration-300 ${color.bg} ${
                          selectedTheme === color.name && !customBackgroundImage
                            ? 'ring-2 ring-offset-2 ring-primary scale-110'
                            : 'hover:scale-110 shadow-sm'
                        }`}
                      >
                        {selectedTheme === color.name && !customBackgroundImage && (
                          <div className="h-full w-full flex items-center justify-center">
                            <div className="h-5 w-5 rounded-full border-2 border-white flex items-center justify-center">
                              <div className="h-2 w-2 bg-white rounded-full"></div>
                            </div>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter className="flex gap-2 justify-end pt-4">
                <Button 
                  variant="ghost" 
                  onClick={handleCancelAppearanceChanges}
                  className="rounded-lg"
                  disabled={savingAppearance}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => {
                    void handleSaveAppearance();
                  }}
                  className="rounded-lg"
                  disabled={savingAppearance}
                >
                  {savingAppearance ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={Boolean(editingAnnouncement)}
            onOpenChange={(open) => {
              if (!open) {
                closeEditAnnouncementDialog();
              }
            }}
          >
            <DialogContent className="w-full max-w-xl rounded-xl">
              <DialogHeader>
                <DialogTitle>Edit announcement</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-announcement-title">Title</Label>
                  <Input
                    id="edit-announcement-title"
                    value={editAnnouncementTitle}
                    onChange={(event) => setEditAnnouncementTitle(event.target.value)}
                    placeholder="Announcement title"
                    className="rounded-lg"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-announcement-content">Content</Label>
                  <Textarea
                    id="edit-announcement-content"
                    value={editAnnouncementContent}
                    onChange={(event) => setEditAnnouncementContent(event.target.value)}
                    placeholder="Write your announcement..."
                    className="min-h-32 rounded-lg resize-none"
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Pin announcement</p>
                    <p className="text-xs text-muted-foreground">
                      Pinned announcements appear first for students.
                    </p>
                  </div>
                  <Switch
                    checked={editAnnouncementPinned}
                    onCheckedChange={setEditAnnouncementPinned}
                    aria-label="Pin announcement"
                  />
                </div>
              </div>

              <DialogFooter className="flex gap-2 justify-end pt-2">
                <Button
                  variant="ghost"
                  className="rounded-lg"
                  onClick={closeEditAnnouncementDialog}
                  disabled={savingAnnouncementEdit}
                >
                  Cancel
                </Button>
                <Button
                  className="rounded-lg"
                  onClick={() => {
                    void handleSaveAnnouncementEdit();
                  }}
                  disabled={savingAnnouncementEdit}
                >
                  {savingAnnouncementEdit ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Stream Tab Content */}
          {activeTab === 'stream' && (
            <>
              {/* Announcement Composer */}
              <Card className="border-0 shadow-md hover:shadow-lg transition-shadow duration-300">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Post an Announcement</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    placeholder="Share important updates, reminders, or information with your class..."
                    value={announcementText}
                    onChange={(e) => setAnnouncementText(e.target.value)}
                    className="min-h-20 resize-none rounded-lg border-border focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-lg h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted"
                        onClick={() => {
                          toast({
                            title: 'Attachments not available',
                            description: 'Announcement file attachments are not supported yet.',
                          });
                        }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      onClick={handlePostAnnouncement}
                      disabled={!announcementText.trim() || postingAnnouncement}
                      className="rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-300"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {postingAnnouncement ? 'Posting...' : 'Post'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Announcements List */}
              <div className="space-y-4">
                {announcementsLoading ? (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-12 text-center text-muted-foreground">
                      Loading announcements...
                    </CardContent>
                  </Card>
                ) : announcements.length > 0 ? (
                  <div className="space-y-3">
                    {announcements.map((announcement, idx) => (
                      <Card
                        key={announcement.id}
                        className="border-0 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden group"
                        style={{
                          animation: `slideInUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${idx * 50}ms both`,
                        }}
                      >
                        <CardContent className="p-4 md:p-5">
                          <div className="space-y-3">
                            {/* Header */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <Avatar className="h-10 w-10 flex-shrink-0 ring-2 ring-blue-100/50 group-hover:ring-blue-200 transition-all">
                                  {announcement.avatarUrl ? (
                                    <AvatarImage
                                      src={announcement.avatarUrl}
                                      alt={`${announcement.author} avatar`}
                                    />
                                  ) : null}
                                  <AvatarFallback className="bg-gradient-to-br from-blue-400 to-blue-600 text-white font-semibold text-sm">
                                    {announcement.avatar}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="font-semibold text-sm group-hover:text-primary transition-colors">{announcement.author}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {announcement.timestamp}
                                  </p>
                                </div>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-lg flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="rounded-lg">
                                  <DropdownMenuItem
                                    onClick={() => openEditAnnouncementDialog(announcement)}
                                  >
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleTogglePinAnnouncement(
                                        announcement.id,
                                        announcement.pinned,
                                        announcement.title,
                                        announcement.content
                                      )
                                    }
                                  >
                                    {announcement.pinned ? 'Unpin' : 'Pin to Top'}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    disabled={deletingAnnouncementIds.includes(announcement.id)}
                                    onClick={() => handleDeleteAnnouncement(announcement.id)}
                                  >
                                    {deletingAnnouncementIds.includes(announcement.id) ? 'Deleting...' : 'Delete'}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>

                            {/* Content */}
                            {announcement.title &&
                              announcement.title.trim().toLowerCase() !== announcement.content.trim().toLowerCase() &&
                              announcement.title.trim().toLowerCase() !== 'announcement' && (
                              <p className="text-sm font-semibold text-foreground">{announcement.title}</p>
                            )}
                            <p className="text-sm leading-relaxed text-foreground/90">{announcement.content}</p>
                            {announcement.pinned && (
                              <Badge className="w-fit bg-blue-100 text-blue-700 border-blue-200 text-xs">
                                Pinned
                              </Badge>
                            )}

                            {/* Actions */}
                            <div className="flex gap-4 pt-2 border-t border-muted opacity-70 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-all"
                                disabled
                                title="Reactions are not available yet"
                              >
                                <Heart className="h-4 w-4 mr-1.5" />
                                <span className="text-xs">Like</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 rounded-lg text-muted-foreground hover:text-blue-500 hover:bg-blue-50 transition-all"
                                onClick={() => setSelectedAnnouncementForComments(announcement)}
                                title="View announcement comments"
                              >
                                <MessageCircle className="h-4 w-4 mr-1.5" />
                                <span className="text-xs">{announcement.comments}</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 rounded-lg text-muted-foreground hover:text-green-500 hover:bg-green-50 transition-all"
                                disabled
                                title="Sharing is not available yet"
                              >
                                <Repeat2 className="h-4 w-4 mr-1.5" />
                                <span className="text-xs">Share</span>
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-12 text-center">
                      <div className="mb-4 flex justify-center">
                        <div className="rounded-full bg-blue-100 p-4">
                          <Bell className="h-8 w-8 text-blue-500" />
                        </div>
                      </div>
                      <p className="text-muted-foreground font-medium">
                        No announcements yet.
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Post one to get started!
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Class Discussion Feed */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Class Discussion
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {discussionPosts.length} {discussionPosts.length === 1 ? 'post' : 'posts'}
                  </span>
                </div>

                {discussionPostsLoading ? (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-12 text-center text-muted-foreground">
                      Loading class discussion...
                    </CardContent>
                  </Card>
                ) : discussionPosts.length > 0 ? (
                  <div className="space-y-3">
                    {discussionPosts.map((post, idx) => (
                      <Card
                        key={post.id}
                        className="border-0 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden group"
                        style={{
                          animation: `slideInUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${idx * 40}ms both`,
                        }}
                      >
                        <CardContent className="p-4 md:p-5">
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <Avatar className="h-10 w-10 flex-shrink-0">
                                  {post.authorAvatarUrl ? (
                                    <AvatarImage
                                      src={post.authorAvatarUrl}
                                      alt={`${post.authorName} avatar`}
                                    />
                                  ) : null}
                                  <AvatarFallback className="bg-gradient-to-br from-slate-400 to-slate-600 text-white font-semibold text-sm">
                                    {post.authorAvatar}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="font-semibold text-sm">{post.authorName}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatRelativeTime(post.timestamp)}
                                  </p>
                                </div>
                              </div>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-lg flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="rounded-lg">
                                  <DropdownMenuItem
                                    disabled={
                                      post.isHidden || hidingDiscussionPostIds.includes(post.id)
                                    }
                                    onClick={() => handleHideDiscussionPost(post.id)}
                                  >
                                    {hidingDiscussionPostIds.includes(post.id)
                                      ? 'Hiding...'
                                      : post.isHidden
                                      ? 'Already hidden'
                                      : 'Hide comment'}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    disabled={deletingDiscussionPostIds.includes(post.id)}
                                    onClick={() => handleDeleteDiscussionPost(post.id)}
                                  >
                                    {deletingDiscussionPostIds.includes(post.id)
                                      ? 'Removing...'
                                      : 'Remove comment'}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>

                            {post.isHidden ? (
                              <div className="rounded-lg border border-dashed border-muted px-3 py-2">
                                <p className="text-sm text-muted-foreground italic">
                                  This post was hidden by the teacher.
                                </p>
                              </div>
                            ) : (
                              <p className="text-sm leading-relaxed text-foreground/90">{post.content}</p>
                            )}

                            <div className="flex gap-4 pt-2 border-t border-muted opacity-80 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-all"
                                disabled={
                                  post.isHidden || likingDiscussionPostIds.includes(post.id)
                                }
                                onClick={() => handleToggleDiscussionPostLike(post.id)}
                              >
                                <Heart
                                  className={`h-4 w-4 mr-1.5 ${
                                    post.liked ? 'fill-destructive text-destructive' : ''
                                  }`}
                                />
                                <span className="text-xs">{post.likes}</span>
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-12 text-center">
                      <div className="mb-4 flex justify-center">
                        <div className="rounded-full bg-slate-100 p-4">
                          <Bell className="h-8 w-8 text-slate-500" />
                        </div>
                      </div>
                      <p className="text-muted-foreground font-medium">
                        No student discussion posts yet.
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        New student posts will appear here automatically.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}

          {/* Classwork Tab Content */}
          {activeTab === 'classwork' && (
            <div className="space-y-4">
              {/* Create Classwork Button */}
              <div className="flex justify-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-300"
                      data-testid="create-task-button"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create task
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72 rounded-xl">
                    {CREATE_TASK_OPTIONS.map((taskOption) => {
                      const Icon = taskOption.icon;

                      return (
                        <DropdownMenuItem
                          key={taskOption.id}
                          className="rounded-lg cursor-pointer py-3"
                          data-testid={`create-task-option-${taskOption.id}`}
                          onClick={() => openBuilder(taskOption.id)}
                        >
                          <div className="mr-3 rounded-lg bg-primary/10 p-2 text-primary">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{taskOption.label}</p>
                            <p className="text-xs text-muted-foreground">{taskOption.description}</p>
                          </div>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Classwork Items */}
              <div className="space-y-3">
                {assignments.length > 0 ? (
                  assignments.map((item, idx) => (
                    <Card
                      key={item.id}
                      className="border-0 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden group cursor-pointer"
                      onClick={() => {
                        setSelectedAssignment(item);
                        setShowAssignmentDetail(true);
                      }}
                      style={{
                        animation: `slideInUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${idx * 50}ms both`,
                      }}
                    >
                      <CardContent className="p-4 md:p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                                {item.title}
                              </h3>
                              {item.dueSoon && (
                                <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs font-medium rounded-full">
                                  Due Soon
                                </Badge>
                              )}
                              {item.status === 'completed' && (
                                <Badge className="bg-green-100 text-green-700 border-green-200 text-xs font-medium rounded-full">
                                  Done
                                </Badge>
                              )}
                            </div>

                            {/* Description */}
                            {item.description && (
                              <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                                {item.description}
                              </p>
                            )}
                            
                            <p className="text-xs text-muted-foreground mb-3 font-medium">Due: {item.dueDate}</p>
                            
                            {/* Progress Bar */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">
                                  {item.submitted} of {item.total} submitted
                                </p>
                                <p className="text-xs font-medium text-primary">
                                  {Math.round((item.submitted / item.total) * 100)}%
                                </p>
                              </div>
                              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-500"
                                  style={{ width: `${(item.submitted / item.total) * 100}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>

                          {/* Action Menu */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                className="text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-all rounded-lg flex-shrink-0"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-lg">
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAssignment(item);
                                  setShowAssignmentDetail(true);
                                }}
                              >
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                className="text-destructive"
                                disabled={deletingAssignmentIds.includes(item.id)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteAssignment(item.id);
                                }}
                              >
                                {deletingAssignmentIds.includes(item.id) ? 'Deleting...' : 'Delete'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-12 text-center">
                      <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
                      <p className="text-muted-foreground font-medium">No assignments yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Create one to get started</p>
                    </CardContent>
                  </Card>
                )}

                {apiMaterials.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">Reading Materials</h3>
                      <Badge variant="outline" className="rounded-full text-xs">
                        {apiMaterials.length}
                      </Badge>
                    </div>

                    {apiMaterials.map((material, idx) => (
                      <Card
                        key={material.id}
                        className="border-0 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
                        style={{
                          animation: `slideInUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${idx * 50}ms both`,
                        }}
                      >
                        <CardContent className="p-4 md:p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <BookOpen className="h-4 w-4 text-primary flex-shrink-0" />
                                <h3 className="font-semibold text-foreground truncate">
                                  {material.title}
                                </h3>
                              </div>

                              {material.description && (
                                <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                                  {material.description}
                                </p>
                              )}

                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <Badge variant="outline" className="rounded-full text-xs">
                                  {material.fileType.toUpperCase()}
                                </Badge>
                                <Badge variant="outline" className="rounded-full text-xs">
                                  {material.fileSize}
                                </Badge>
                                <Badge variant="outline" className="rounded-full text-xs">
                                  {material.downloads} downloads
                                </Badge>
                              </div>

                              <p className="text-xs text-muted-foreground">
                                Uploaded: {formatDateTime(material.uploadedDate)}
                              </p>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg"
                                disabled={!material.url}
                                onClick={() => {
                                  if (!material.url) {
                                    return;
                                  }
                                  setSelectedMaterial(material);
                                }}
                              >
                                Open
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                className="rounded-lg"
                                disabled={!material.url}
                                onClick={() => {
                                  handleDownloadMaterial(material);
                                }}
                              >
                                <Download className="h-4 w-4 mr-1.5" />
                                Download
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                className="rounded-lg text-destructive hover:text-destructive"
                                disabled={deletingMaterialIds.includes(material.id)}
                                onClick={() => {
                                  handleDeleteMaterial(material);
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-1.5" />
                                {deletingMaterialIds.includes(material.id) ? 'Deleting...' : 'Delete'}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* People Tab Content */}
          {activeTab === 'people' && (
            <TeacherClassPeople classId={classId} />
          )}

          {/* Recent Submissions Tab Content */}
          {activeTab === 'submissions' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-muted-foreground">Recent Submissions</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg text-xs gap-1.5"
                  onClick={handleExportRegistrar}
                  disabled={exportingRegistrar}
                >
                  <Download className="h-3.5 w-3.5" />
                  {exportingRegistrar ? 'Exporting…' : 'Registrar CSV'}
                </Button>
              </div>
              {recentSubmissions.length > 0 ? (
                <div className="space-y-3">
                  {recentSubmissions.map((submission) => (
                    <Card key={submission.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <Avatar className="h-10 w-10 flex-shrink-0">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {submission.avatar}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-semibold text-sm">{submission.student}</p>
                                <Badge className={submission.onTime ? 'bg-green-100 text-green-700 border-green-200 text-xs' : 'bg-red-100 text-red-700 border-red-200 text-xs'}>
                                  {submission.onTime ? 'On Time' : 'Late'}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mb-1">{submission.assignment}</p>
                              <p className="text-xs text-muted-foreground">Submitted: {submission.submittedAt}</p>
                              {submission.providerFileName && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {submission.providerLabel || 'Submitted file'}: {submission.providerFileName}
                                </p>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex-shrink-0 rounded-lg"
                            onClick={() => {
                              setSelectedSubmission(submission);
                              setShowSubmissionDetail(true);
                              setSubmissionGrade(
                                submission.existingGrade !== null && submission.existingGrade !== undefined
                                  ? String(submission.existingGrade)
                                  : ''
                              );
                              setSubmissionFeedback(submission.existingFeedback || '');
                            }}
                          >
                            View
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-12 text-center">
                    <Clock className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground font-medium">No recent submissions yet</p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInTop {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>

      {selectedAnnouncementForComments && (
        <div
          className="fixed inset-0 z-[95] bg-background/80 backdrop-blur-sm animate-in fade-in-0 duration-200"
          onClick={() => setSelectedAnnouncementForComments(null)}
        >
          <div
            className="h-full animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 md:mx-auto md:my-6 md:h-[calc(100%-3rem)] md:max-w-2xl lg:max-w-3xl md:overflow-hidden md:rounded-3xl md:border md:border-border md:bg-card md:shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <AnnouncementCommentsPanel
              courseId={classId}
              announcement={selectedAnnouncementForComments}
              onBack={() => setSelectedAnnouncementForComments(null)}
            />
          </div>
        </div>
      )}

      <MaterialPreviewDialog
        open={Boolean(selectedMaterial)}
        material={selectedMaterial}
        isTeacher
        courseId={classId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedMaterial(null);
          }
        }}
        onDownload={handleDownloadMaterial}
      />

      {/* Teacher Assignment Detail Dialog */}
      {selectedAssignment && (
        <TeacherAssignmentDetail
          classId={classId}
          assignment={selectedAssignment ? {
            id: String(selectedAssignment.id),
            title: selectedAssignment.title,
            description: selectedAssignment.description,
            dueDate: selectedAssignment.dueDate,
            points: selectedAssignment.points,
            type: selectedAssignment.type,
            rawType: selectedAssignment.rawType,
            topics: selectedAssignment.topic ? [{ id: '1', name: selectedAssignment.topic }] : [],
            acceptingSubmissions: selectedAssignment.acceptingSubmissions,
            submissionOpenAt: selectedAssignment.submissionOpenAt,
            submissionCloseAt: selectedAssignment.submissionCloseAt,
          } : null}
          open={showAssignmentDetail}
          onOpenChange={(open) => {
            setShowAssignmentDetail(open);
            if (!open) setSelectedAssignment(null);
          }}
          onAssignmentChanged={() => {
            void refetchAssignments();
          }}
        />
      )}

      {/* Student Detail Dialog */}
      <StudentDetailDialog
        student={selectedStudent}
        open={showStudentDetail}
        onOpenChange={(open) => {
          setShowStudentDetail(open);
          if (!open) setSelectedStudent(null);
        }}
      />

      {/* Submission Detail Dialog */}
      <Dialog open={showSubmissionDetail} onOpenChange={setShowSubmissionDetail}>
        <DialogContent className="w-full max-w-2xl rounded-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Student Submission</DialogTitle>
          </DialogHeader>

          {selectedSubmission && (
            <div className="space-y-6">
              {/* Student & Assignment Info */}
              <div className="border-b border-muted pb-4">
                <div className="flex items-start gap-4 mb-4">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {selectedSubmission.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{selectedSubmission.student}</h3>
                    <div className="flex items-center gap-3 mt-2">
                      <Badge className={selectedSubmission.onTime ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}>
                        {selectedSubmission.onTime ? 'On Time' : 'Late'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Submitted: {selectedSubmission.submittedAt}</span>
                    </div>
                  </div>
                </div>

                {/* Assignment Details */}
                <div className="space-y-3 bg-blue-50 rounded-lg p-3 mt-4">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">ASSIGNMENT</p>
                    <p className="font-semibold text-sm">{selectedSubmission.assignment}</p>
                  </div>
                  {selectedSubmission.description && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">INSTRUCTIONS</p>
                      <p className="text-xs text-foreground/80">{selectedSubmission.description}</p>
                    </div>
                  )}
                  {selectedSubmission.points && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">POINTS</p>
                      <p className="text-sm font-bold text-blue-600">{selectedSubmission.points} points</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Submission Content */}
              <div>
                <h4 className="font-semibold text-sm mb-3">Student's Submission</h4>
                <Card className="border-0 shadow-sm bg-muted/50">
                  <CardContent className="p-4">
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                      {selectedSubmission.submissionContent || 'No submission content available yet from backend.'}
                    </p>
                    {selectedSubmission.submissionUrl && (
                      <a
                        href={selectedSubmission.submissionUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-block text-sm text-primary underline"
                      >
                        {selectedSubmission.providerFileName || 'Open submitted file'}
                      </a>
                    )}
                    {(selectedSubmission.providerFileId || selectedSubmission.providerMimeType || selectedSubmission.providerSizeBytes || selectedSubmission.submissionSnapshotAt) && (
                      <div className="mt-3 rounded-lg border border-border bg-background p-3 space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {selectedSubmission.providerLabel || 'Submission file'}
                        </p>
                        {selectedSubmission.providerFileId && (
                          <p className="text-xs text-muted-foreground break-all">
                            File ID: {selectedSubmission.providerFileId}
                          </p>
                        )}
                        {(selectedSubmission.providerMimeType || selectedSubmission.providerSizeBytes || selectedSubmission.submissionSnapshotAt) && (
                          <p className="text-xs text-muted-foreground">
                            {[
                              selectedSubmission.providerMimeType || null,
                              formatProviderFileSize(selectedSubmission.providerSizeBytes),
                              selectedSubmission.submissionSnapshotAt
                                ? `Snapshot ${new Date(selectedSubmission.submissionSnapshotAt).toLocaleString()}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' • ')}
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Grade Input */}
              <div>
                <label className="text-sm font-semibold mb-2 block">Grade</label>
                <Input
                  placeholder="e.g., 95/100 or 95"
                  value={submissionGrade}
                  onChange={(e) => setSubmissionGrade(e.target.value)}
                  className="rounded-lg"
                />
              </div>

              {/* Feedback Input */}
              <div>
                <label className="text-sm font-semibold mb-2 block">Feedback</label>
                <Textarea
                  placeholder="Provide constructive feedback for the student..."
                  value={submissionFeedback}
                  onChange={(e) => setSubmissionFeedback(e.target.value)}
                  className="min-h-24 rounded-lg resize-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              </div>

              {/* Footer Actions */}
              <div className="flex gap-2 justify-end pt-4 border-t border-muted">
                <Button 
                  variant="outline" 
                  className="rounded-lg"
                  onClick={() => setShowSubmissionDetail(false)}
                >
                  Cancel
                </Button>
                <Button 
                  className="rounded-lg"
                  onClick={() => {
                    void handleSaveSubmissionGrade();
                  }}
                  disabled={savingSubmissionGrade || !submissionGrade.trim()}
                >
                  {savingSubmissionGrade ? 'Saving...' : 'Save Grade & Feedback'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
