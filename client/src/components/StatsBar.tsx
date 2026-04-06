import { BookOpen, FileText, CheckCircle2, Clock } from 'lucide-react';
import { mockClasses, mockAssignments } from '@/lib/data';

export function StatsBar() {
  const totalClasses = mockClasses.length;
  const pending = mockAssignments.filter(a => a.status === 'assigned').length;
  const submitted = mockAssignments.filter(a => a.status === 'submitted').length;
  const late = mockAssignments.filter(a => a.status === 'late').length;

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
