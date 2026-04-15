import { useMemo } from 'react';
import { Calendar, Clock, FileText, Zap, CalendarOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Assignment, ClassItem } from '@/lib/data';

const TYPE_ICONS = {
  assignment: FileText,
  quiz: Zap,
  project: Calendar,
  discussion: FileText,
};

const TYPE_BADGE_STYLES: Record<string, string> = {
  assignment: 'bg-primary/10 text-primary border-0',
  quiz: 'bg-warning/10 text-warning border-0',
  project: 'bg-accent/10 text-accent border-0',
  discussion: 'bg-success/10 text-success border-0',
};

interface UpcomingWidgetProps {
  classes?: ClassItem[];
  assignments?: Assignment[];
  isLoading?: boolean;
}

function UpcomingWidgetSkeleton() {
  return (
    <Card className="border-0 shadow-sm min-h-[360px]">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-5 w-36" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-start gap-3 p-3 rounded-xl border border-border/50">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function UpcomingWidget({ classes = [], assignments = [], isLoading = false }: UpcomingWidgetProps) {
  if (isLoading) {
    return <UpcomingWidgetSkeleton />;
  }

  // Filter for upcoming and late assignments
  const upcoming = useMemo(
    () => assignments
      .filter((a) => {
        const dueDate = new Date(a.dueDate);
        const now = new Date();
        // Include if not submitted and due date hasn't passed, or if late
        return (a.status === 'assigned' || a.status === 'late') && dueDate >= now;
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 5),
    [assignments]
  );

  return (
    <Card className="border-0 shadow-sm min-h-[360px]">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Upcoming Deadlines
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {upcoming.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="p-3 rounded-full bg-secondary/50 mb-3">
              <CalendarOff className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No upcoming deadlines</p>
            <p className="text-xs text-muted-foreground mt-1">All caught up! Check back later.</p>
          </div>
        ) : (
          upcoming.map((item) => {
            const cls = classes.find((c) => c.id === item.classId);
            const Icon = TYPE_ICONS[item.type] || FileText;
            const isLate = item.status === 'late';
            const dueDate = new Date(item.dueDate);
            const today = new Date();
            const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            return (
              <div
                key={item.id}
                className="flex items-start gap-3 p-3 rounded-xl hover:bg-secondary/50 transition-colors cursor-pointer group"
              >
                <div className={`mt-0.5 p-2 rounded-lg ${isLate ? 'bg-destructive/10' : 'bg-primary/10'}`}>
                  <Icon className={`h-4 w-4 ${isLate ? 'text-destructive' : 'text-primary'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{cls?.name || 'Unknown Course'}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="secondary" className={(TYPE_BADGE_STYLES[item.type] || TYPE_BADGE_STYLES.assignment) + ' text-xs px-2 py-0'}>
                      {item.type}
                    </Badge>
                    <span className={`text-xs ${isLate ? 'text-destructive font-medium' : diffDays <= 2 ? 'text-warning font-medium' : 'text-muted-foreground'}`}>
                      {isLate ? 'Overdue' : diffDays === 0 ? 'Due today' : diffDays === 1 ? 'Due tomorrow' : `${diffDays} days left`}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{item.points} pts</span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
