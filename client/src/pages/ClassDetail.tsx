import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CLASS_COLORS, type Assignment } from '@/lib/data';
import { useRole } from '@/contexts/RoleContext';
import { useClasses as useClassActions } from '@/contexts/ClassesContext';
import { useClass } from '@/hooks-api/useClasses';
import { useAssignments } from '@/hooks-api/useAssignments';
import { useAnnouncements } from '@/hooks-api/useAnnouncements';
import { useMaterials } from '@/hooks-api/useMaterials';
import { useStudents } from '@/hooks-api/useStudents';
import { useGrades, useWeightedCourseGrade } from '@/hooks-api/useGrades';
import { ArrowLeft, FileText, Zap, Calendar, MessageSquare, Users, Paperclip, LogOut, Trash2, Download, Book, Music, Image as ImageIcon, Archive, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { AssignmentDetailDialog } from '@/components/AssignmentDetailDialog';
import { AnnouncementCard } from '@/components/AnnouncementCard';
import { StudentClassStream } from '@/components/StudentClassStream';
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

const TYPE_ICONS: Record<string, typeof FileText> = {
  assignment: FileText,
  quiz: Zap,
  project: Calendar,
  discussion: MessageSquare,
};

const FILE_TYPE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  doc: FileText,
  image: ImageIcon,
  video: Music,
  presentation: Book,
  spreadsheet: FileText,
  archive: Archive,
};

export default function ClassDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUserAvatar } = useRole();
  const { handleArchive: contextArchive, handleUnenroll: contextUnenroll } = useClassActions();
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [confirmAction, setConfirmAction] = useState<'archive' | 'unenroll' | null>(null);
  const classId = id || '';

  const classQuery = useClass(classId);
  const assignmentsQuery = useAssignments(classId);
  const announcementsQuery = useAnnouncements(classId);
  const materialsQuery = useMaterials(classId);
  const studentsQuery = useStudents(classId);
  const gradesQuery = useGrades(classId);
  const weightedGradeQuery = useWeightedCourseGrade(classId);

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
  const assignments = assignmentsQuery.data || [];
  const announcements = announcementsQuery.data || [];
  const materials = materialsQuery.data || [];
  const classStudents = studentsQuery.data || [];
  const classGrades = gradesQuery.data || [];

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

  const toLetterGrade = (score: number) => {
    if (score >= 93) return 'A';
    if (score >= 90) return 'A-';
    if (score >= 87) return 'B+';
    if (score >= 83) return 'B';
    if (score >= 80) return 'B-';
    if (score >= 77) return 'C+';
    if (score >= 73) return 'C';
    if (score >= 70) return 'C-';
    if (score >= 67) return 'D+';
    if (score >= 63) return 'D';
    return 'F';
  };

  const currentStudentGrade = {
    id: 'current-user',
    name: 'Student',
    email: 'student@example.com',
    avatar: currentUserAvatar,
    grade: finalGradePercentage !== null ? toLetterGrade(finalGradePercentage) : 'N/A',
    percentage: finalGradePercentage,
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

  return (
    <div className="animate-fade-in">
      {/* Banner */}
      <div className={`${CLASS_COLORS[cls.color]} relative overflow-hidden`}>
        <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/30" />
        <div className="absolute -right-12 -bottom-12 w-48 h-48 rounded-full bg-white/10" />
        <div className="absolute -left-8 -top-8 w-32 h-32 rounded-full bg-white/5" />
        <div className="relative z-10 p-3 md:p-6 lg:p-8 pb-6 md:pb-10">
          <div className="flex items-center justify-between mb-2 md:mb-4 gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-white/80 hover:text-white hover:bg-white/20 -ml-2 rounded-xl h-8 md:h-9 text-sm md:text-base"
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
                    className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg h-8 w-8 md:h-9 md:w-9"
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
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-white">{cls.name}</h1>
          <p className="text-xs md:text-sm text-white/80 mt-0.5 md:mt-1">
            {cls.block ? `Block ${cls.block}${cls.level ? ` • ${cls.level}` : ''}` : cls.section}
          </p>
          <p className="text-xs md:text-sm text-white/70 mt-0.5 md:mt-1">{cls.room} • {cls.schedule}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-3">
            <Badge className="bg-white/20 text-white border-0 hover:bg-white/30 text-xs md:text-sm px-2 md:px-3 py-1 md:py-1.5">
              <Users className="h-3 w-3 md:h-4 md:w-4 mr-1" /> {cls.students} students
            </Badge>
            <Badge className="bg-white/20 text-white border-0 hover:bg-white/30 text-xs md:text-sm">
              Code: {cls.id.toUpperCase()}XK3
            </Badge>
          </div>
        </div>
      </div>

      <div className="p-3 md:p-6 lg:p-8 max-w-5xl mx-auto">
        {hasSupplementaryError && (
          <div className="mb-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
            Some class sections could not be loaded. You can still access available data and retry.
          </div>
        )}

        <Tabs defaultValue="stream" className="space-y-3 md:space-y-4 lg:space-y-6">
          <TabsList className="bg-secondary/50 p-0.5 md:p-1 rounded-lg md:rounded-xl w-full justify-start md:justify-center overflow-x-auto flex-nowrap scrollbar-hide">
            <TabsTrigger value="stream" className="rounded-md md:rounded-lg data-[state=active]:shadow-sm text-xs md:text-sm px-2 py-1 md:px-3 md:py-1.5">Stream</TabsTrigger>
            <TabsTrigger value="materials" className="rounded-md md:rounded-lg data-[state=active]:shadow-sm text-xs md:text-sm px-2 py-1 md:px-3 md:py-1.5">Materials</TabsTrigger>
            <TabsTrigger value="assignments" className="rounded-md md:rounded-lg data-[state=active]:shadow-sm text-xs md:text-sm px-2 py-1 md:px-3 md:py-1.5">Assignments</TabsTrigger>
            <TabsTrigger value="people" className="rounded-md md:rounded-lg data-[state=active]:shadow-sm text-xs md:text-sm px-2 py-1 md:px-3 md:py-1.5">People</TabsTrigger>
            <TabsTrigger value="grades" className="rounded-md md:rounded-lg data-[state=active]:shadow-sm text-xs md:text-sm px-2 py-1 md:px-3 md:py-1.5">Grades</TabsTrigger>
          </TabsList>

          {/* Stream */}
          <TabsContent value="stream" className="space-y-3 md:space-y-4 lg:space-y-6">
            {/* Announcements Section */}
            {announcements.length > 0 && (
              <div className="space-y-2 md:space-y-3 lg:space-y-4">
                <h3 className="font-semibold text-sm md:text-base">Announcements</h3>
                {announcements.map((a) => (
                  <AnnouncementCard key={a.id} announcement={a} />
                ))}
              </div>
            )}

            {/* Student Discussion Section */}
            <div>
              <h3 className="font-semibold text-sm md:text-base mb-4">Class Discussion</h3>
              <StudentClassStream />
            </div>
          </TabsContent>

          {/* Materials */}
          <TabsContent value="materials" className="space-y-2 md:space-y-3 lg:space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3 mb-3 md:mb-4 lg:mb-6">
              <h3 className="font-semibold text-base md:text-lg">Learning Materials</h3>
              <Button variant="outline" size="sm" className="rounded-lg gap-2 w-full md:w-fit text-xs md:text-sm">
                <Download className="h-3.5 w-3.5 md:h-4 md:w-4" />
                Download All
              </Button>
            </div>
            <div className="space-y-1 md:space-y-2 lg:space-y-3 animate-stagger">
              {materials.map((material, idx) => {
                const Icon = FILE_TYPE_ICONS[material.fileType] || FileText;
                return (
                  <Card
                    key={material.id}
                    className="border-0 shadow-sm card-interactive cursor-pointer hover:shadow-md transition-all"
                    style={{
                      animation: `fade-in 0.4s ease-out ${idx * 50}ms both`,
                    }}
                  >
                    <CardContent className="p-2 md:p-4 lg:p-5">
                      <div className="flex flex-col gap-2 md:gap-3">
                        <div className="flex items-start gap-3">
                          <div className="p-2 md:p-3 rounded-lg md:rounded-xl bg-primary/10 flex-shrink-0">
                            <Icon className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm md:text-base truncate">{material.title}</p>
                            <p className="text-xs md:text-sm text-muted-foreground mt-0.5 line-clamp-2">{material.description}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-lg flex-shrink-0 h-8 w-8 md:h-9 md:w-9 hover:bg-primary/10"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-1.5 md:gap-3 flex-wrap text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1 px-1.5 md:px-2 py-0.5 md:py-1 rounded-md bg-secondary/50 text-xs">
                            {material.fileSize}
                          </span>
                          <span className="inline-flex items-center gap-1 px-1.5 md:px-2 py-0.5 md:py-1 rounded-md bg-secondary/50 capitalize text-xs">
                            {material.fileType}
                          </span>
                          <span className="inline-flex items-center gap-1 px-1.5 md:px-2 py-0.5 md:py-1 rounded-md bg-secondary/50 text-xs">
                            <Download className="h-3 w-3" /> {material.downloads}
                          </span>
                          <span className="text-muted-foreground ml-auto text-xs hidden md:inline">
                            {material.uploadedBy}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {materials.length === 0 && (
                <div className="text-center py-8 md:py-12 text-muted-foreground">
                  <Book className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-2 md:mb-3 opacity-30" />
                  <p className="text-sm md:text-base">No materials uploaded yet</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Assignments */}
          <TabsContent value="assignments" className="space-y-2 md:space-y-3 lg:space-y-4">
            <h3 className="font-semibold text-sm md:text-base">All Assignments</h3>
            <div className="space-y-1 md:space-y-2 lg:space-y-3 animate-stagger">
              {assignments.map((a) => {
                const Icon = TYPE_ICONS[a.type] || FileText;
                return (
                  <Card
                    key={a.id}
                    className="border-0 shadow-sm card-interactive cursor-pointer"
                    onClick={() => setSelectedAssignment(a)}
                  >
                    <CardContent className="p-2 md:p-4 flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                      <div className={`p-2 md:p-3 rounded-lg md:rounded-xl flex-shrink-0 ${a.status === 'late' ? 'bg-destructive/10' : 'bg-primary/10'}`}>
                        <Icon className={`h-4 w-4 md:h-5 md:w-5 ${a.status === 'late' ? 'text-destructive' : 'text-primary'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm md:text-base truncate">{a.title}</p>
                        <p className="text-xs md:text-sm text-muted-foreground mt-0.5 truncate">{a.description}</p>
                      </div>
                      <div className="flex items-center gap-2 md:gap-3 flex-wrap md:flex-nowrap md:shrink-0">
                        <div className="text-right">
                          <p className="text-xs md:text-sm font-medium">{a.points} pts</p>
                          <p className={`text-xs mt-0.5 ${a.status === 'late' ? 'text-destructive' : 'text-muted-foreground'}`}>
                            Due {new Date(a.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                        {a.attachments && (
                          <Badge variant="secondary" className="text-xs">
                            <Paperclip className="h-3 w-3 mr-1" /> {a.attachments}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {assignments.length === 0 && (
                <div className="text-center py-8 md:py-12 text-muted-foreground">
                  <FileText className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-2 md:mb-3 opacity-30" />
                  <p className="text-sm md:text-base">No assignments yet</p>
                </div>
              )}
            </div>
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
          <TabsContent value="grades" className="space-y-3 md:space-y-4 lg:space-y-6">
            <h3 className="font-semibold text-sm md:text-base">My Grades</h3>
            
            {/* Overall Grade Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 lg:gap-6">
              <Card className="border-0 shadow-sm md:col-span-2">
                <CardContent className="p-3 md:p-6">
                  <div className="flex items-start gap-3 md:gap-4">
                    <Avatar className="h-12 w-12 md:h-14 md:w-14 flex-shrink-0">
                      <AvatarFallback className="bg-primary text-primary-foreground text-base md:text-lg">{currentStudentGrade.avatar}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm md:text-base">{currentStudentGrade.name}</p>
                      <p className="text-xs md:text-sm text-muted-foreground truncate">{currentStudentGrade.email}</p>
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
                </CardContent>
              </Card>
            </div>

            {weightedBreakdown && (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-3 md:p-6">
                  <h4 className="font-semibold text-sm md:text-base mb-3 md:mb-4">Weighted Breakdown (40/30/30)</h4>
                  <div className="space-y-3">
                    {(['exam', 'quiz', 'activity'] as const).map((categoryKey) => {
                      const category = weightedBreakdown.categories[categoryKey];
                      const label =
                        categoryKey === 'exam'
                          ? 'Exam'
                          : categoryKey === 'quiz'
                            ? 'Quiz'
                            : 'Activity';

                      return (
                        <div key={categoryKey} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium text-sm md:text-base">
                              {label} ({Math.round(category.weight * 100)}%)
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
                  <p className="text-xs text-muted-foreground mt-3">
                    Policy: missing categories currently contribute 0 until they receive graded work.
                  </p>
                </CardContent>
              </Card>
            )}

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

      <AssignmentDetailDialog
        assignment={selectedAssignment}
        open={!!selectedAssignment}
        onOpenChange={(open) => !open && setSelectedAssignment(null)}
        teacherName={cls.teacher}
        classId={cls.id}
      />

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
