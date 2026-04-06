import { mockAssignments, mockClasses } from '@/lib/data';
import { Calendar, Clock, FileText, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

export function UpcomingWidget() {
  const upcoming = mockAssignments
    .filter((a) => a.status === 'assigned' || a.status === 'late')
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Upcoming Deadlines
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {upcoming.map((item) => {
          const cls = mockClasses.find((c) => c.id === item.classId);
          const Icon = TYPE_ICONS[item.type];
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
                <p className="text-xs text-muted-foreground mt-0.5">{cls?.name}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge variant="secondary" className={TYPE_BADGE_STYLES[item.type] + ' text-xs px-2 py-0'}>
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
        })}
      </CardContent>
    </Card>
  );
}
