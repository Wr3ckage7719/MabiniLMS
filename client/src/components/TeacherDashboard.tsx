import { lazy, Suspense } from 'react';
import {
  BookOpen,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { ClassItem } from '@/lib/data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useTeacherDashboard } from '@/hooks/useTeacherData';

const TeacherClassesView = lazy(() => import('./TeacherClassesView').then((module) => ({ default: module.TeacherClassesView })));
const InteractiveCalendar = lazy(() => import('./InteractiveCalendar'));
const TeacherSettingsPage = lazy(() => import('@/pages/TeacherSettingsPage'));

interface TeacherDashboardProps {
  currentView: 'dashboard' | 'calendar' | 'classes' | 'archived' | 'settings';
  classes: ClassItem[];
  onClassesChange: (classes: ClassItem[]) => void;
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'No due date';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'No due date';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

function TeacherSectionFallback() {
  return (
    <div className="w-full h-full overflow-auto animate-fade-in">
      <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-[420px] w-full rounded-2xl" />
      </div>
    </div>
  );
}

function TeacherDashboardLoadingSkeleton() {
  return (
    <div className="w-full h-full overflow-auto animate-fade-in">
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <Card key={index} className="border-0 shadow-sm min-h-[116px]">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-14" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, index) => (
            <Card key={index} className="border-0 shadow-sm min-h-[330px]">
              <CardHeader>
                <Skeleton className="h-5 w-40" />
              </CardHeader>
              <CardContent className="space-y-3">
                {Array.from({ length: 5 }).map((__, rowIndex) => (
                  <div key={rowIndex} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-4/5" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TeacherDashboard({ currentView, classes, onClassesChange }: TeacherDashboardProps) {
  const { data, loading, error, refetch } = useTeacherDashboard();

  const renderDashboard = () => {
    if (loading) {
      return <TeacherDashboardLoadingSkeleton />;
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
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Teacher Dashboard</h1>
            <p className="text-muted-foreground">Live data from your courses, submissions, and deadlines.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-0 shadow-sm bg-gradient-to-br from-primary/5 to-primary/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  Total Classes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{data.courses.length}</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-gradient-to-br from-accent/5 to-accent/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="h-4 w-4 text-accent" />
                  Total Students
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{data.totalStudents}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  Upcoming Deadlines
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.upcomingDeadlines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No upcoming deadlines.</p>
                ) : (
                  data.upcomingDeadlines.map((assignment) => (
                    <div key={assignment.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/50 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{assignment.title}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(assignment.due_date)}</p>
                      </div>
                      <Badge variant="secondary" className="text-xs">{assignment.max_points} pts</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-accent" />
                  Recent Submissions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.recentSubmissions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recent submissions.</p>
                ) : (
                  data.recentSubmissions.map((submission) => {
                    const firstName = submission.student?.first_name?.trim() || '';
                    const lastName = submission.student?.last_name?.trim() || '';
                    const studentName = `${firstName} ${lastName}`.trim() || submission.student?.email || 'Student';
                    const avatar = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || studentName.slice(0, 2).toUpperCase();
                    const graded = Boolean(submission.grade);

                    return (
                      <div key={submission.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">{avatar}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{studentName}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {submission.assignment?.title || 'Assignment'}
                            </p>
                          </div>
                        </div>
                        {graded ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200">Graded</Badge>
                        ) : (
                          <Badge className="bg-blue-100 text-blue-700 border-blue-200">Submitted</Badge>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  };

  const renderCalendar = () => {
    return (
      <div className="w-full h-full overflow-auto animate-fade-in">
        <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto">
          <Suspense fallback={<TeacherSectionFallback />}>
            <InteractiveCalendar />
          </Suspense>
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
      <Suspense fallback={<TeacherSectionFallback />}>
        <TeacherClassesView classes={classes} onClassesChange={onClassesChange} />
      </Suspense>
    );
  }

  if (currentView === 'calendar') {
    return renderCalendar();
  }

  if (currentView === 'archived') {
    return renderArchived();
  }

  if (currentView === 'settings') {
    return (
      <Suspense fallback={<TeacherSectionFallback />}>
        <TeacherSettingsPage />
      </Suspense>
    );
  }

  return renderDashboard();
}