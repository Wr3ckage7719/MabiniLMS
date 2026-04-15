import { AlertCircle, BookOpen, CalendarClock, CheckCircle2, Clock3, FileText, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAssignments } from '@/hooks-api/useAssignments';
import { useClasses } from '@/hooks-api/useClasses';

const TYPE_BADGE_STYLES: Record<string, string> = {
  assignment: 'bg-primary/10 text-primary',
  quiz: 'bg-warning/10 text-warning',
  project: 'bg-accent/10 text-accent',
  discussion: 'bg-secondary text-secondary-foreground',
};

export default function UpcomingPage() {
  const navigate = useNavigate();
  const classesQuery = useClasses();
  const assignmentsQuery = useAssignments();

  const classes = classesQuery.data || [];
  const assignments = assignmentsQuery.data || [];

  const now = new Date();

  const pendingAssignments = assignments.filter((assignment) => {
    const dueDate = new Date(assignment.dueDate);
    return assignment.status === 'assigned' && dueDate >= now;
  });

  const overdueAssignments = assignments.filter((assignment) => {
    const dueDate = new Date(assignment.dueDate);
    return assignment.status === 'late' || (assignment.status === 'assigned' && dueDate < now);
  });

  const submittedAssignments = assignments.filter(
    (assignment) => assignment.status === 'submitted' || assignment.status === 'graded'
  );

  const upcomingAssignments = assignments
    .filter((assignment) => {
      if (assignment.status === 'submitted' || assignment.status === 'graded') {
        return false;
      }

      const dueDate = new Date(assignment.dueDate);
      return Number.isFinite(dueDate.getTime());
    })
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const getDueText = (dueDateIso: string, isLate: boolean) => {
    if (isLate) {
      return 'Overdue';
    }

    const dueDate = new Date(dueDateIso);
    const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    return `${diffDays} days left`;
  };

  const isLoading = classesQuery.isLoading || assignmentsQuery.isLoading;
  const hasError = classesQuery.error || assignmentsQuery.error;

  const openAssignment = (classId: string, assignmentId: string) => {
    navigate(`/class/${classId}?assignmentId=${assignmentId}`);
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="p-4 md:p-8 text-center space-y-2">
        <p className="text-sm text-destructive">Failed to load upcoming deadlines.</p>
        <p className="text-xs text-muted-foreground">Please refresh this page and try again.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-2.5 md:p-6 space-y-2.5 md:space-y-6 animate-fade-in">
      <section className="rounded-[14px] border border-border/70 bg-card p-3 md:p-5 shadow-none">
        <div className="flex items-start gap-2">
          <Clock3 className="h-3.5 w-3.5 text-primary mt-1" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Upcoming Deadline</h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Track pending work and due dates in one place.
            </p>
          </div>
        </div>

        <div className="mt-3 md:mt-5 grid grid-cols-2 gap-2 md:gap-3">
          <Card className="rounded-[14px] border border-border/70 shadow-none">
            <CardContent className="p-2.5 md:p-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <BookOpen className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xl font-semibold leading-none">{classes.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">Classes</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[14px] border border-border/70 shadow-none">
            <CardContent className="p-2.5 md:p-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-warning/10 text-warning">
                  <CalendarClock className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xl font-semibold leading-none">{pendingAssignments.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[14px] border border-border/70 shadow-none">
            <CardContent className="p-2.5 md:p-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-success">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xl font-semibold leading-none">{submittedAssignments.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">Submitted</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[14px] border border-border/70 shadow-none">
            <CardContent className="p-2.5 md:p-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xl font-semibold leading-none">{overdueAssignments.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">Overdue</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="rounded-[14px] border border-border/70 bg-card p-3 md:p-5 shadow-none">
        <h2 className="text-sm md:text-base font-semibold mb-2 md:mb-3">Upcoming Deadlines</h2>
        {upcomingAssignments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock3 className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No upcoming deadlines.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingAssignments.slice(0, 6).map((assignment) => {
              const cls = classes.find((course) => course.id === assignment.classId);
              const isLate = assignment.status === 'late';

              return (
                <button
                  key={assignment.id}
                  type="button"
                  className="w-full text-left flex items-start gap-3 rounded-[12px] border border-border/70 px-3 py-2.5 hover:bg-secondary/40 transition-colors"
                  onClick={() => openAssignment(assignment.classId, assignment.id)}
                >
                  <span
                    className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full ${
                      isLate ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{assignment.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{cls?.name || 'Class'}</p>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-nowrap">{assignment.points} pts</p>
                    </div>

                    <div className="mt-1.5 flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={`h-5 rounded-md border-0 px-2 text-[10px] font-medium ${
                          TYPE_BADGE_STYLES[assignment.type] || TYPE_BADGE_STYLES.assignment
                        }`}
                      >
                        {assignment.type}
                      </Badge>
                      <span className={`text-xs ${isLate ? 'text-destructive' : 'text-warning'}`}>
                        {getDueText(assignment.dueDate, isLate)}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
