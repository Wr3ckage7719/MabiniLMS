import { BookOpen, FileText, CheckCircle2, Clock } from 'lucide-react';
import { useClasses } from '@/hooks-api/useClasses';
import { useAssignments } from '@/hooks-api/useAssignments';

export function StatsBar() {
  const { data: classes = [] } = useClasses();
  const { data: assignments = [] } = useAssignments();

  const totalClasses = classes.length;
  const pending = assignments.filter(a => a.status === 'assigned').length;
  const submitted = assignments.filter(a => a.status === 'submitted' || a.status === 'graded').length;
  const late = assignments.filter(a => a.status === 'late').length;

  const stats = [
    { label: 'Classes', value: totalClasses, icon: BookOpen, color: 'text-primary bg-primary/10' },
    { label: 'Pending', value: pending, icon: FileText, color: 'text-warning bg-warning/10' },
    { label: 'Submitted', value: submitted, icon: CheckCircle2, color: 'text-success bg-success/10' },
    { label: 'Overdue', value: late, icon: Clock, color: 'text-destructive bg-destructive/10' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-3 p-4 rounded-2xl bg-card shadow-sm border-0">
          <div className={`p-2.5 rounded-xl ${s.color}`}>
            <s.icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
