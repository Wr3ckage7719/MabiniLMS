import { useMemo } from 'react';
import {
  BookOpen,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  ClipboardList,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ClassItem } from '@/lib/data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { TeacherClassesView } from './TeacherClassesView';
import { useTeacherDashboard } from '@/hooks/useTeacherData';
import InteractiveCalendar from './InteractiveCalendar';
import TeacherSettingsPage from '@/pages/TeacherSettingsPage';

interface TeacherDashboardProps {
  currentView: 'dashboard' | 'calendar' | 'classes' | 'archived' | 'settings';
  classes: ClassItem[];
  onClassesChange: (classes: ClassItem[]) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
}

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return 'No due date';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'No due date';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatRelativeDeadline = (value: string | null | undefined): { label: string; tone: 'urgent' | 'soon' | 'later' } => {
  if (!value) return { label: 'No due date', tone: 'later' };
  const target = new Date(value).getTime();
  if (!Number.isFinite(target)) return { label: 'No due date', tone: 'later' };
  const diffMs = target - Date.now();
  if (diffMs <= 0) return { label: 'Past due', tone: 'urgent' };
  const hours = Math.round(diffMs / (1000 * 60 * 60));
  if (hours < 24) return { label: `In ${hours} hr${hours === 1 ? '' : 's'}`, tone: 'urgent' };
  const days = Math.round(hours / 24);
  if (days <= 3) return { label: `In ${days} day${days === 1 ? '' : 's'}`, tone: 'soon' };
  return { label: `In ${days} days`, tone: 'later' };
};

export function TeacherDashboard({
  currentView,
  classes,
  onClassesChange,
  searchQuery,
  onSearchQueryChange,
}: TeacherDashboardProps) {
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useTeacherDashboard();

  // Pull derived stats out of the existing payload — no new endpoints required.
  // "Needs grading" = submissions that landed but don't yet have a grade.
  // "Due this week" = the upcomingDeadlines list the hook already produces.
  const needsGrading = useMemo(
    () =>
      data.recentSubmissions.filter(
        (submission) => !submission.grade && submission.status !== 'draft'
      ),
    [data.recentSubmissions]
  );

  const dueThisWeekCount = data.upcomingDeadlines.length;

  const renderDashboard = () => {
    if (loading) {
      return (
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="p-8 text-center space-y-4">
          <p className="text-destructive">Failed to load teacher dashboard</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" className="rounded-xl gap-2" onClick={() => void refetch()}>
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      );
    }

    return (
      <div className="w-full h-full overflow-auto animate-fade-in">
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <h1 className="text-2xl md:text-3xl font-bold">Teacher Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                What needs your attention today.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl gap-2"
              onClick={() => void refetch()}
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>

          {/* Stat tiles — Classes / Students / Needs grading / Due this week */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <StatTile
              label="Total Classes"
              value={data.courses.length}
              icon={<BookOpen className="h-4 w-4" />}
              tone="primary"
            />
            <StatTile
              label="Total Students"
              value={data.totalStudents}
              icon={<Users className="h-4 w-4" />}
              tone="accent"
            />
            <StatTile
              label="Needs grading"
              value={needsGrading.length}
              icon={<ClipboardList className="h-4 w-4" />}
              tone={needsGrading.length > 0 ? 'urgent' : 'muted'}
              hint={needsGrading.length === 0 ? 'You\'re caught up' : 'Submissions waiting'}
            />
            <StatTile
              label="Due this week"
              value={dueThisWeekCount}
              icon={<Clock className="h-4 w-4" />}
              tone={dueThisWeekCount > 0 ? 'soon' : 'muted'}
              hint={dueThisWeekCount === 0 ? 'No deadlines coming up' : 'Across your classes'}
            />
          </div>

          {/* Submissions queue + Upcoming deadlines */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-accent" />
                    Recent Submissions
                  </CardTitle>
                  {needsGrading.length > 0 && (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">
                      {needsGrading.length} to grade
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.recentSubmissions.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No submissions yet. Once students turn work in, they'll show up here.
                  </div>
                ) : (
                  data.recentSubmissions.slice(0, 5).map((submission) => {
                    const firstName = submission.student?.first_name?.trim() || '';
                    const lastName = submission.student?.last_name?.trim() || '';
                    const studentName =
                      `${firstName} ${lastName}`.trim() ||
                      submission.student?.email ||
                      'Student';
                    const initials =
                      `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() ||
                      studentName.slice(0, 2).toUpperCase();
                    const graded = Boolean(submission.grade);
                    const courseId = submission.assignment?.course_id;
                    const assignmentId = submission.assignment_id;

                    return (
                      <button
                        key={submission.id}
                        type="button"
                        onClick={() => {
                          if (courseId) {
                            navigate(`/class/${courseId}?assignmentId=${assignmentId}`);
                          }
                        }}
                        className="w-full flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3 text-left transition-all hover:bg-muted/40 hover:border-border"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{studentName}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {submission.assignment?.title || 'Assignment'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {graded ? (
                            <Badge className="bg-green-100 text-green-700 border-green-200">
                              Graded
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                              Grade now
                            </Badge>
                          )}
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </button>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  Upcoming Deadlines
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.upcomingDeadlines.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No deadlines in the next 7 days.
                  </div>
                ) : (
                  data.upcomingDeadlines.map((assignment) => {
                    const relative = formatRelativeDeadline(assignment.due_date);
                    const toneClass =
                      relative.tone === 'urgent'
                        ? 'bg-rose-100 text-rose-700 border-rose-200'
                        : relative.tone === 'soon'
                        ? 'bg-amber-100 text-amber-700 border-amber-200'
                        : 'bg-blue-100 text-blue-700 border-blue-200';
                    return (
                      <button
                        key={assignment.id}
                        type="button"
                        onClick={() => {
                          if (assignment.course_id) {
                            navigate(`/class/${assignment.course_id}?assignmentId=${assignment.id}`);
                          }
                        }}
                        className="w-full flex items-start justify-between gap-3 rounded-lg border border-border/50 p-3 text-left transition-all hover:bg-muted/40 hover:border-border"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{assignment.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(assignment.due_date)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge className={`${toneClass} text-[10px]`}>{relative.label}</Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {assignment.max_points} pts
                          </Badge>
                        </div>
                      </button>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          {/* My classes — quick jump-in cards */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  My Classes
                </CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-xl gap-1.5 text-xs"
                  onClick={() => navigate('/teacher')}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create class
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {data.courses.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  You don't have any classes yet. Click <em>Create class</em> to start.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {data.courses.slice(0, 6).map((course) => (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => navigate(`/class/${course.id}`)}
                      className="text-left rounded-xl border border-border/60 bg-card p-4 transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-primary/40 animate-in fade-in"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold truncate flex-1 min-w-0">{course.title}</h3>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {course.status}
                        </Badge>
                      </div>
                      {course.section ? (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {course.section}
                        </p>
                      ) : null}
                      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {course.enrollment_count ?? 0}{' '}
                          {course.enrollment_count === 1 ? 'student' : 'students'}
                        </span>
                      </div>
                      <div className="mt-3 inline-flex items-center gap-1 text-xs text-primary">
                        Open class <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderCalendar = () => {
    return (
      <div className="w-full h-full overflow-auto animate-fade-in">
        <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto">
          <InteractiveCalendar />
        </div>
      </div>
    );
  };

  const renderArchived = () => {
    const archivedClasses = classes.filter((course) => course.archived);

    return (
      <div className="w-full h-full overflow-auto animate-fade-in">
        <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Archived Classes</h1>
            <p className="text-muted-foreground">Classes you have archived.</p>
          </div>

          {archivedClasses.length === 0 ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-12 text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-3 opacity-50" />
                No archived classes found.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {archivedClasses.map((course) => (
                <Card key={course.id} className="border-0 shadow-sm">
                  <CardContent className="p-5 space-y-2">
                    <h3 className="font-semibold">{course.name}</h3>
                    <p className="text-sm text-muted-foreground">{course.section}</p>
                    <p className="text-xs text-muted-foreground">{course.room} • {course.schedule}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (currentView === 'classes') {
    return (
      <TeacherClassesView
        classes={classes}
        onClassesChange={onClassesChange}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
      />
    );
  }

  if (currentView === 'calendar') {
    return renderCalendar();
  }

  if (currentView === 'archived') {
    return renderArchived();
  }

  if (currentView === 'settings') {
    return <TeacherSettingsPage />;
  }

  return renderDashboard();
}

interface StatTileProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'primary' | 'accent' | 'urgent' | 'soon' | 'muted';
  hint?: string;
}

function StatTile({ label, value, icon, tone, hint }: StatTileProps) {
  const toneClasses: Record<StatTileProps['tone'], string> = {
    primary: 'from-primary/5 to-primary/10 text-primary',
    accent: 'from-accent/5 to-accent/10 text-accent',
    urgent: 'from-rose-500/5 to-rose-500/15 text-rose-600',
    soon: 'from-amber-500/5 to-amber-500/15 text-amber-600',
    muted: 'from-muted/30 to-muted/10 text-muted-foreground',
  };

  return (
    <Card
      className={`border-0 shadow-sm bg-gradient-to-br ${toneClasses[tone]} transition-all duration-200 hover:shadow-md`}
    >
      <CardContent className="p-4 md:p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</p>
          <span className="opacity-70">{icon}</span>
        </div>
        <p className="text-3xl font-bold mt-2 text-foreground">{value}</p>
        {hint ? (
          <p className="text-[11px] mt-1 text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
