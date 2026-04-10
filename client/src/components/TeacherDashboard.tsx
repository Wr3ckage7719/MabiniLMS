import { useMemo } from 'react';
import {
  BookOpen,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  CalendarDays,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { ClassItem } from '@/lib/data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { TeacherClassesView } from './TeacherClassesView';
import { useTeacherDashboard } from '@/hooks/useTeacherData';
import { useAssignments } from '@/hooks-api/useAssignments';
import TeacherSettingsPage from '@/pages/TeacherSettingsPage';

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

export function TeacherDashboard({ currentView, classes, onClassesChange }: TeacherDashboardProps) {
  const { data, loading, error, refetch } = useTeacherDashboard();
  const { data: assignments = [], isLoading: assignmentsLoading } = useAssignments();

  const groupedAssignments = useMemo(() => {
    const groups = assignments.reduce<Record<string, typeof assignments>>((acc, assignment) => {
      const key = assignment.dueDate || 'No due date';
      if (!acc[key]) acc[key] = [];
      acc[key].push(assignment);
      return acc;
    }, {});

    return Object.entries(groups).sort((a, b) => {
      const left = new Date(a[0]).getTime();
      const right = new Date(b[0]).getTime();
      if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
      return left - right;
    });
  }, [assignments]);

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
    if (assignmentsLoading) {
      return (
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    return (
      <div className="w-full h-full overflow-auto animate-fade-in">
        <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Calendar</h1>
            <p className="text-muted-foreground">Upcoming assignment schedule across your classes.</p>
          </div>

          {groupedAssignments.length === 0 ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-12 text-center text-muted-foreground">
                <CalendarDays className="h-8 w-8 mx-auto mb-3 opacity-50" />
                No scheduled assignments.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {groupedAssignments.map(([date, items]) => (
                <Card key={date} className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">{formatDate(date)}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-lg border border-border/50 p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                        </div>
                        <Badge variant="secondary" className="text-xs">{item.points} pts</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
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
    return <TeacherClassesView classes={classes} onClassesChange={onClassesChange} />;
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