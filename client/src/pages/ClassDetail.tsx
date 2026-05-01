import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { CLASS_COLORS, type Announcement as ClassAnnouncement, type Assignment, type LearningMaterial } from '@/lib/data';
import { useRole } from '@/contexts/RoleContext';
import { useAuth } from '@/contexts/AuthContext';
import { useClasses as useClassActions } from '@/contexts/ClassesContext';
import { useClass } from '@/hooks-api/useClasses';
import { useAssignments } from '@/hooks-api/useAssignments';
import { useAnnouncements } from '@/hooks-api/useAnnouncements';
import { useMaterials } from '@/hooks-api/useMaterials';
import { useStudents } from '@/hooks-api/useStudents';
import { useGrades, useWeightedCourseGrade } from '@/hooks-api/useGrades';
import { useDiscussionPosts } from '@/hooks-api/useDiscussions';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, FileText, Calendar, MessageSquare, Users, Paperclip, LogOut, Trash2, Download, ExternalLink, Book, Music, Image as ImageIcon, Archive, Loader2, RefreshCw, Monitor, ClipboardList, UserRound, Tag } from 'lucide-react';
import { getTaskTypeMeta, GRADING_PERIOD_LABELS } from '@/lib/task-types';
import { formatMabiniGradePoint } from '@/lib/grade-points';
import type { MabiniGradingPeriodKey, WeightedGradeCategory } from '@/services/grades.service';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { computeCourseCompletion } from '@/lib/course-completion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { AssignmentDetailDialog } from '@/components/AssignmentDetailDialog';
import { ProctoredExamDialog } from '@/components/ProctoredExamDialog';
import { AnnouncementCard } from '@/components/AnnouncementCard';
import { AnnouncementCommentsPanel } from '@/components/AnnouncementCommentsPanel';
import { MaterialPreviewDialog } from '@/components/MaterialPreviewDialog';
import { StudentClassStream } from '@/components/StudentClassStream';
import { LessonsTab } from '@/components/lessons/LessonsTab';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const FILE_TYPE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  doc: FileText,
  image: ImageIcon,
  video: Music,
  presentation: Book,
  spreadsheet: FileText,
  archive: Archive,
};

const getAssignmentTypeLabel = (assignment: Assignment): string =>
  getTaskTypeMeta(assignment.rawType || assignment.type).label;

const formatShortDate = (dateValue?: string): string => {
  if (!dateValue) {
    return 'No due date';
  }

  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return 'No due date';
  }

  return parsedDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

export default function ClassDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const { currentUserAvatar, currentUserName, currentUserAvatarUrl } = useRole();
  const { user } = useAuth();
  const { toast } = useToast();
  const { handleArchive: contextArchive, handleUnenroll: contextUnenroll } = useClassActions();
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [examAssignment, setExamAssignment] = useState<Assignment | null>(null);
  const [selectedAnnouncementForComments, setSelectedAnnouncementForComments] = useState<ClassAnnouncement | null>(null);
  const [confirmAction, setConfirmAction] = useState<'archive' | 'unenroll' | null>(null);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [previewMaterial, setPreviewMaterial] = useState<LearningMaterial | null>(null);
  const [classworkTopicFilter, setClassworkTopicFilter] = useState<string>('all');
  const classId = id || '';

  const classQuery = useClass(classId);
  const assignmentsQuery = useAssignments(classId);
  const announcementsQuery = useAnnouncements(classId);
  const materialsQuery = useMaterials(classId);
  const studentsQuery = useStudents(classId);
  const gradesQuery = useGrades(classId);
  const weightedGradeQuery = useWeightedCourseGrade(classId);
  const discussionPostsQuery = useDiscussionPosts(classId);

  const isLoading =
    classQuery.isLoading ||
    assignmentsQuery.isLoading ||
    announcementsQuery.isLoading ||
    materialsQuery.isLoading ||
    studentsQuery.isLoading ||
    gradesQuery.isLoading ||
    weightedGradeQuery.isLoading;

  const dataError =
    classQuery.error;

  const hasSupplementaryError =
    Boolean(assignmentsQuery.error) ||
    Boolean(announcementsQuery.error) ||
    Boolean(materialsQuery.error) ||
    Boolean(studentsQuery.error) ||
    Boolean(gradesQuery.error) ||
    Boolean(weightedGradeQuery.error);

  const cls = classQuery.data;
  const assignments = useMemo(() => assignmentsQuery.data || [], [assignmentsQuery.data]);
  const announcements = announcementsQuery.data || [];
  const materials = materialsQuery.data || [];
  const classStudents = studentsQuery.data || [];
  const classGrades = gradesQuery.data || [];
  const discussionCommentCount = (discussionPostsQuery.data || []).filter((post) => !post.is_hidden).length;

  // Sorted unique topic labels across this class's assignments — populates the
  // Classwork tab's filter dropdown (mobile + desktop share state).
  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    for (const assignment of assignments) {
      for (const topic of assignment.topics ?? []) {
        set.add(topic);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [assignments]);

  useEffect(() => {
    if (classworkTopicFilter !== 'all' && !availableTopics.includes(classworkTopicFilter)) {
      setClassworkTopicFilter('all');
    }
  }, [availableTopics, classworkTopicFilter]);

  const filteredAssignments = useMemo(() => {
    if (classworkTopicFilter === 'all') return assignments;
    return assignments.filter((a) => (a.topics ?? []).includes(classworkTopicFilter));
  }, [assignments, classworkTopicFilter]);

  useEffect(() => {
    const assignmentId = searchParams.get('assignmentId');
    if (!assignmentId || assignments.length === 0) {
      return;
    }

    if (selectedAssignment?.id === assignmentId) {
      return;
    }

    const assignmentFromQuery = assignments.find((assignment) => assignment.id === assignmentId);
    if (assignmentFromQuery) {
      setSelectedAssignment(assignmentFromQuery);
    }
  }, [assignments, searchParams, selectedAssignment]);

  const assignmentGrades = new Map<string, string>();
  classGrades.forEach((grade: any) => {
    const assignmentId = grade?.submission?.assignment_id || grade?.assignment?.id;
    const pointsEarned = grade?.points_earned;
    const maxPoints = grade?.submission?.assignment?.max_points || grade?.assignment?.max_points;

    if (!assignmentId || typeof pointsEarned !== 'number') {
      return;
    }

    assignmentGrades.set(
      assignmentId,
      typeof maxPoints === 'number' ? `${pointsEarned}/${maxPoints}` : `${pointsEarned}`
    );
  });

  const averageGradeScore = (() => {
    const numericScores = classGrades
      .map((grade: any) => Number(grade?.points_earned))
      .filter((score: number) => Number.isFinite(score));

    if (numericScores.length === 0) {
      return null;
    }

    return numericScores.reduce((sum: number, score: number) => sum + score, 0) / numericScores.length;
  })();

  const weightedBreakdown = weightedGradeQuery.data || null;
  const finalGradePercentage = (() => {
    if (typeof weightedBreakdown?.final_percentage === 'number') {
      return weightedBreakdown.final_percentage;
    }

    if (averageGradeScore === null) {
      return null;
    }

    return Math.round(averageGradeScore * 100) / 100;
  })();

  // Mabini Colleges grade point summary takes priority — falls back to overall percentage
  // only if the course has no grading_period pinning at all (legacy data).
  const mabiniSummary = weightedBreakdown?.mabini ?? null;
  const overallGradePoint = mabiniSummary?.overall_grade_point ?? null;
  const overallRemarks = mabiniSummary?.remarks ?? 'INC';

  const gradeDisplay = (() => {
    if (overallGradePoint !== null) return formatMabiniGradePoint(overallGradePoint);
    if (mabiniSummary) {
      // Show the latest available period GP when overall is incomplete
      const periodOrder: MabiniGradingPeriodKey[] = ['final', 'pre_final', 'midterm', 'pre_mid'];
      for (const period of periodOrder) {
        const gp = mabiniSummary.period_grade_points[period];
        if (gp !== null) return formatMabiniGradePoint(gp);
      }
      return 'INC';
    }
    return 'N/A';
  })();

  const currentStudentGrade = {
    id: user?.id || 'current-user',
    name: currentUserName,
    email: user?.email || '',
    avatar: currentUserAvatar,
    avatarUrl: currentUserAvatarUrl,
    grade: gradeDisplay,
    percentage: mabiniSummary?.overall_weighted_grade ?? finalGradePercentage,
    remarks: overallRemarks,
  };

  const handleArchive = async () => {
    if (!cls) return;
    await contextArchive(cls.id);
    setConfirmAction(null);
    navigate(-1);
  };

  const handleUnenroll = async () => {
    if (!cls) return;
    await contextUnenroll(cls.id);
    setConfirmAction(null);
    navigate(-1);
  };

  const refetchAll = () => {
    void classQuery.refetch();
    void assignmentsQuery.refetch();
    void announcementsQuery.refetch();
    void materialsQuery.refetch();
    void studentsQuery.refetch();
    void gradesQuery.refetch();
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-destructive">Failed to load class details</p>
        <p className="text-sm text-muted-foreground">
          {dataError instanceof Error ? dataError.message : 'Please try again later'}
        </p>
        <Button variant="outline" className="rounded-xl gap-2" onClick={refetchAll}>
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (!cls) return <div className="p-8">Class not found.</div>;

  const classCode = cls.id.slice(0, 8).toUpperCase();
  const displayedStudentCount = classStudents.length || cls.students || 0;

  const showMaterialUnavailableToast = () => {
    toast({
      title: 'Material link unavailable',
      description: 'This material does not have a valid file URL yet.',
      variant: 'destructive',
    });
  };

  const handleOpenMaterial = (material: LearningMaterial) => {
    if (!material.url) {
      showMaterialUnavailableToast();
      return;
    }

    setPreviewMaterial(material);
  };

  const handleMaterialCardKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    material: LearningMaterial
  ) => {
    if (!material.url) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpenMaterial(material);
    }
  };

  const classSubtitle = (() => {
    const section = (cls.section || '').trim();
    const block = (cls.block || '').trim();
    const level = (cls.level || '').trim();

    if (block && level) {
      return `Block ${block} • ${level}`;
    }

    if (section) {
      return section;
    }

    if (block) {
      return `Block ${block}`;
    }

    if (level) {
      return level;
    }

    return 'Section TBA';
  })();

  return (
    <div className="animate-fade-in">
      {/* Banner */}
      <div
        className={`relative overflow-hidden mx-2 mt-2 rounded-2xl md:mx-0 md:mt-0 md:rounded-none ${!cls.coverImage ? CLASS_COLORS[cls.color] : ''}`}
        style={
          cls.coverImage
            ? {
                backgroundImage: `url(${cls.coverImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : undefined
        }
      >
        {cls.coverImage ? <div className="absolute inset-0 bg-black/45" /> : null}
        <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/30" />
        <div className="absolute -right-12 -bottom-12 w-44 h-44 md:w-48 md:h-48 rounded-full bg-white/10" />
        <div className="absolute -left-8 -top-8 w-24 h-24 md:w-32 md:h-32 rounded-full bg-white/5" />
        <div className="relative z-10 p-3 md:p-6 lg:p-8 pb-4 md:pb-10">
          <div className="flex items-center justify-between mb-2.5 md:mb-4 gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-white/80 hover:text-white hover:bg-white/20 -ml-2 rounded-xl h-8 md:h-9 text-xs md:text-base"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div className="flex gap-2">
  
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg h-7 w-7 md:h-9 md:w-9"
                  >
                    <MessageSquare className="h-4 w-4 md:h-5 md:w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-xl">
                  <DropdownMenuItem
                    onClick={() => setConfirmAction('archive')}
                    className="rounded-lg cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Archive Class
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setConfirmAction('unenroll')}
                    className="rounded-lg cursor-pointer text-destructive focus:text-destructive"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Unenroll
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <h1 className="text-[34px] leading-none md:text-2xl lg:text-3xl font-bold text-white tracking-tight mt-0.5">{cls.name}</h1>
          <p className="text-[11px] md:text-sm text-white/80 mt-1 md:mt-1.5">
            {classSubtitle}
          </p>
          <p className="text-[11px] md:text-sm text-white/70 mt-1 md:mt-1.5">{cls.room} • {cls.schedule}</p>
          <div className="flex flex-wrap items-center gap-1.5 md:gap-2 mt-2 md:mt-3">
            <Badge className="bg-white/20 text-white border-0 hover:bg-white/30 text-[10px] md:text-sm px-2 md:px-3 py-0.5 md:py-1.5">
              <Users className="h-3 w-3 md:h-4 md:w-4 mr-1" /> {displayedStudentCount} students
            </Badge>
            <Badge className="bg-white/20 text-white border-0 hover:bg-white/30 text-[10px] md:text-sm px-2 md:px-3 py-0.5 md:py-1.5">
              Code: {classCode}
            </Badge>
          </div>
        </div>
      </div>

      <div className="p-2 md:p-6 lg:p-8 max-w-5xl mx-auto">
        {hasSupplementaryError && (
          <div className="mb-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
            Some class sections could not be loaded. You can still access available data and retry.
          </div>
        )}

        {(() => {
          const completion = computeCourseCompletion(assignments);
          if (completion.total === 0) return null;
          const next = completion.nextItem;
          return (
            <Card className="mb-3 md:mb-5 border-0 shadow-sm bg-gradient-to-br from-primary/5 to-primary/0">
              <CardContent className="p-3 md:p-5">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-xs md:text-sm font-semibold">Course progress</p>
                  <p className="text-xs md:text-sm font-medium text-primary">
                    {completion.completed}/{completion.total} done · {completion.percent}%
                  </p>
                </div>
                <Progress value={completion.percent} className="h-2" />
                {next ? (
                  <button
                    type="button"
                    onClick={() => setSelectedAssignment(next)}
                    className="mt-3 w-full text-left flex items-start gap-3 rounded-xl border border-border/70 bg-card/60 px-3 py-2.5 hover:bg-secondary/40 transition-colors"
                  >
                    <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <ClipboardList className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">Next up</span>
                      <span className="block text-sm font-medium truncate">{next.title}</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap self-center">
                      {next.points} pts
                    </span>
                  </button>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    All caught up — nothing left to submit.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })()}

        <Tabs defaultValue="lessons" className="space-y-3 md:space-y-4 lg:space-y-6">
          <TabsList className="bg-secondary/60 border border-border/70 p-1 rounded-2xl w-full grid grid-cols-3 md:flex md:justify-center md:gap-1 md:p-1 overflow-x-auto flex-nowrap scrollbar-hide h-auto md:h-10">
            <TabsTrigger value="lessons" className="flex-col md:flex-row rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none text-[11px] md:text-sm px-2 py-1.5 md:px-3 md:py-1.5 gap-1">
              <Book className="h-3.5 w-3.5 md:hidden" />
              Lessons
            </TabsTrigger>
            <TabsTrigger value="stream" className="flex-col md:flex-row rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none text-[11px] md:text-sm px-2 py-1.5 md:px-3 md:py-1.5 gap-1">
              <Monitor className="h-3.5 w-3.5 md:hidden" />
              Stream
            </TabsTrigger>
            <TabsTrigger value="people" className="flex-col md:flex-row rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none text-[11px] md:text-sm px-2 py-1.5 md:px-3 md:py-1.5 gap-1">
              <UserRound className="h-3.5 w-3.5 md:hidden" />
              People
            </TabsTrigger>
            <TabsTrigger value="grades" className="hidden md:inline-flex rounded-md md:rounded-lg data-[state=active]:shadow-sm text-xs md:text-sm px-2 py-1 md:px-3 md:py-1.5">Grades</TabsTrigger>
          </TabsList>

          {/* Lessons — primary entry into all course content. */}
          <TabsContent value="lessons" className="space-y-3 md:space-y-4">
            <LessonsTab classId={classId} />
          </TabsContent>

          {/* Stream */}
          <TabsContent value="stream" className="space-y-3 md:space-y-4 lg:space-y-6">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-[13px] md:text-base">Announcements</h3>
              <Button
                type="button"
                className="rounded-xl h-8 px-3 text-[11px] md:h-9 md:px-4 md:text-sm shrink-0"
                onClick={() => setDiscussionOpen(true)}
              >
                View class discussion ({discussionCommentCount})
              </Button>
            </div>

            {announcements.length > 0 ? (
              <div className="space-y-2 md:space-y-3 lg:space-y-4">
                {announcements.map((a) => (
                  <AnnouncementCard
                    key={a.id}
                    announcement={a}
                    commentsCount={a.comments}
                    onOpenComments={() => {
                      setDiscussionOpen(false);
                      setSelectedAnnouncementForComments(a);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-border/70 bg-card px-3 py-5 text-center">
                <p className="text-xs md:text-sm text-muted-foreground">No teacher announcements yet.</p>
              </div>
            )}
          </TabsContent>


          {/* People */}
          <TabsContent value="people" className="space-y-3 md:space-y-4 lg:space-y-6">
            <div>
              <h3 className="font-semibold text-sm md:text-base mb-1 md:mb-2 lg:mb-3">Teacher</h3>
              <div className="flex items-center gap-2 md:gap-3 p-2 md:p-3 rounded-lg md:rounded-xl hover:bg-secondary/50 transition-colors">
                <Avatar className="h-8 w-8 md:h-10 md:w-10 flex-shrink-0">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs md:text-sm">
                    {cls.teacher.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-sm md:text-base truncate">{cls.teacher}</span>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-sm md:text-base mb-1 md:mb-2 lg:mb-3">Students ({classStudents.length})</h3>
              <div className="space-y-0.5 md:space-y-1 animate-stagger">
                {classStudents.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 md:gap-3 p-2 md:p-3 rounded-lg md:rounded-xl hover:bg-secondary/50 transition-colors">
                    <Avatar className="h-8 w-8 md:h-10 md:w-10 flex-shrink-0">
                      {s.avatarUrl ? (
                        <AvatarImage src={s.avatarUrl} alt={`${s.name} avatar`} />
                      ) : null}
                      <AvatarFallback className="bg-secondary text-secondary-foreground text-xs md:text-sm">{s.avatar}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs md:text-sm truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Grades */}
          <TabsContent value="grades" className="hidden md:block space-y-3 md:space-y-4 lg:space-y-6">
            <h3 className="font-semibold text-sm md:text-base">My Grades</h3>
            
            {/* Overall Grade Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 lg:gap-6">
              <Card className="border-0 shadow-sm md:col-span-2">
                <CardContent className="p-3 md:p-6">
                  <div className="flex items-start gap-3 md:gap-4">
                    <Avatar className="h-12 w-12 md:h-14 md:w-14 flex-shrink-0">
                      {currentStudentGrade.avatarUrl ? (
                        <AvatarImage src={currentStudentGrade.avatarUrl} alt={`${currentStudentGrade.name} avatar`} />
                      ) : null}
                      <AvatarFallback className="bg-primary text-primary-foreground text-base md:text-lg">{currentStudentGrade.avatar}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm md:text-base truncate">{currentStudentGrade.name}</p>
                      {currentStudentGrade.email && (
                        <p className="text-xs md:text-sm text-muted-foreground truncate">{currentStudentGrade.email}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-0 shadow-sm flex items-center justify-center">
                <CardContent className="p-3 md:p-6 text-center w-full">
                  <p className="text-xs md:text-sm text-muted-foreground mb-1 md:mb-2">Overall Grade</p>
                  <p className="text-3xl md:text-5xl font-bold text-primary">{currentStudentGrade.grade}</p>
                  {currentStudentGrade.percentage !== null && (
                    <p className="text-xs md:text-sm text-muted-foreground mt-2">
                      {currentStudentGrade.percentage.toFixed(2)}%
                    </p>
                  )}
                  {mabiniSummary && (
                    <p
                      className={`mt-1 text-xs font-medium ${
                        currentStudentGrade.remarks === 'Passed'
                          ? 'text-emerald-600'
                          : currentStudentGrade.remarks === 'Failed'
                            ? 'text-rose-600'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {currentStudentGrade.remarks}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {mabiniSummary && (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-3 md:p-6">
                  <h4 className="font-semibold text-sm md:text-base mb-3 md:mb-4">
                    4-Period Standing (Mabini Colleges)
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                    {(['pre_mid', 'midterm', 'pre_final', 'final'] as MabiniGradingPeriodKey[]).map((period) => {
                      const grade = mabiniSummary.period_grades[period];
                      const gp = mabiniSummary.period_grade_points[period];
                      return (
                        <div key={period} className="rounded-lg border bg-muted/30 px-3 py-2 text-center">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {GRADING_PERIOD_LABELS[period]} (25%)
                          </p>
                          <p className="text-lg md:text-xl font-bold text-primary">
                            {gp !== null ? formatMabiniGradePoint(gp) : 'INC'}
                          </p>
                          {grade !== null && (
                            <p className="text-[10px] text-muted-foreground">{grade.toFixed(2)}%</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Each grading period contributes 25% to the overall grade. The final overall
                    grade is only released once all four periods have grades.
                  </p>
                </CardContent>
              </Card>
            )}

            {weightedBreakdown && (() => {
              // Mabini 5-component breakdown (matches TTH 1-2_30PM.xlsx weights):
              //   Major Exam 45%, Quiz 15%, Recitation 15%, Attendance 20%, Project 5%.
              // Falls back to the legacy 40/30/30 view when the course has no Mabini
              // periods configured AND none of the new categories have any work yet.
              const mabiniCategoryKeys: readonly { key: WeightedGradeCategory; label: string; weight: number }[] = [
                { key: 'exam', label: 'Major Exam', weight: 0.45 },
                { key: 'quiz', label: 'Quiz', weight: 0.15 },
                { key: 'recitation', label: 'Recitation', weight: 0.15 },
                { key: 'attendance', label: 'Attendance', weight: 0.20 },
                { key: 'project', label: 'Project', weight: 0.05 },
              ];
              const showMabiniLayout =
                Boolean(mabiniSummary) ||
                mabiniCategoryKeys.some(
                  ({ key }) => (weightedBreakdown.categories[key]?.assignment_total ?? 0) > 0
                );

              const categoryRows = showMabiniLayout
                ? mabiniCategoryKeys.map(({ key, label, weight }) => ({
                    key,
                    label,
                    weight,
                    category: weightedBreakdown.categories[key],
                  }))
                : (['exam', 'quiz', 'activity'] as const).map((key) => ({
                    key,
                    label: key === 'exam' ? 'Exam' : key === 'quiz' ? 'Quiz' : 'Activity',
                    weight: weightedBreakdown.categories[key]?.weight ?? 0,
                    category: weightedBreakdown.categories[key],
                  }));

              const heading = showMabiniLayout
                ? 'Per-Period Component Weights (Mabini Colleges)'
                : 'Weighted Breakdown (40/30/30)';

              const policyNote = showMabiniLayout
                ? 'Each period uses these weights: Major Exam 45%, Quiz 15%, Recitation 15%, Attendance 20%, Project 5%. Components without graded work contribute 0 to the period grade.'
                : 'Policy: missing categories currently contribute 0 until they receive graded work.';

              return (
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-3 md:p-6">
                    <h4 className="font-semibold text-sm md:text-base mb-3 md:mb-4">{heading}</h4>
                    <div className="space-y-3">
                      {categoryRows.map(({ key, label, weight, category }) => {
                        if (!category) return null;
                        return (
                          <div key={key} className="rounded-lg border p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-medium text-sm md:text-base">
                                {label} ({Math.round(weight * 100)}%)
                              </p>
                              <p className="font-semibold text-sm md:text-base">
                                +{category.weighted_contribution.toFixed(2)}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {category.points_earned.toFixed(2)}/{category.points_possible.toFixed(2)} points
                              {typeof category.raw_percentage === 'number'
                                ? ` (${category.raw_percentage.toFixed(2)}%)`
                                : ' (No graded items yet)'}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {category.graded_count}/{category.assignment_total} assignments graded
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">{policyNote}</p>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Assignment Grades */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 md:p-6">
                <h4 className="font-semibold text-sm md:text-base mb-3 md:mb-4">Assignment Grades</h4>
                <div className="space-y-2 md:space-y-0 md:divide-y md:divide-border">
                  {assignments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 p-0 md:py-3 md:first:pt-0 md:last:pb-0">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm md:text-base truncate">{a.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Due {new Date(a.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <p className="font-semibold text-sm md:text-base flex-shrink-0">
                        {assignmentGrades.get(a.id) || '—'}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {discussionOpen && (
        <div
          className="fixed inset-0 z-[90] bg-background/80 backdrop-blur-sm animate-in fade-in-0 duration-200"
          onClick={() => setDiscussionOpen(false)}
        >
          <div
            className="h-full animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 md:mx-auto md:my-6 md:h-[calc(100%-3rem)] md:max-w-2xl lg:max-w-3xl md:overflow-hidden md:rounded-3xl md:border md:border-border md:bg-card md:shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <StudentClassStream
              classId={classId}
              variant="class-comments"
              onBack={() => setDiscussionOpen(false)}
            />
          </div>
        </div>
      )}

      <MaterialPreviewDialog
        open={Boolean(previewMaterial)}
        material={previewMaterial}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewMaterial(null);
          }
        }}
      />

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

      <AssignmentDetailDialog
        assignment={selectedAssignment}
        open={!!selectedAssignment}
        onOpenChange={(open) => {
          if (open) {
            return;
          }

          setSelectedAssignment(null);

          if (searchParams.has('assignmentId')) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete('assignmentId');
            setSearchParams(nextParams, { replace: true });
          }
        }}
        teacherName={cls.teacher}
        classId={cls.id}
        onStartExam={(assignment) => {
          setExamAssignment(assignment);
          setSelectedAssignment(null);
          if (searchParams.has('assignmentId')) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete('assignmentId');
            setSearchParams(nextParams, { replace: true });
          }
        }}
      />

      {examAssignment && (examAssignment.rawType === 'quiz' || examAssignment.rawType === 'exam') && (
        <ProctoredExamDialog
          assignmentId={examAssignment.id}
          assignmentTitle={examAssignment.title}
          open={!!examAssignment}
          onOpenChange={(open) => {
            if (!open) setExamAssignment(null);
          }}
          mode={examAssignment.rawType === 'quiz' ? 'quiz' : 'exam'}
        />
      )}

      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'archive' ? 'Archive Class?' : 'Unenroll from Class?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'archive'
                ? `Are you sure you want to archive "${cls.name}"? You can view archived classes later.`
                : `Are you sure you want to unenroll from "${cls.name}"? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => (confirmAction === 'archive' ? handleArchive() : handleUnenroll())}
            className={`rounded-lg ${confirmAction === 'unenroll' ? 'bg-destructive hover:bg-destructive/90' : ''}`}
          >
            {confirmAction === 'archive' ? 'Archive' : 'Unenroll'}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>


    </div>
  );
}
