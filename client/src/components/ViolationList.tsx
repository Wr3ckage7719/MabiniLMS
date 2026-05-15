import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/datetime';
import { violationLabel } from '@/lib/proctor-labels';
import type { ExamViolation } from '@/services/exams.service';

interface ViolationListProps {
  violations: ExamViolation[];
  emptyMessage?: string;
  ordering?: 'asc' | 'desc';
}

export function ViolationList({
  violations,
  emptyMessage = 'No violations recorded.',
  ordering = 'asc',
}: ViolationListProps) {
  if (!violations.length) {
    return <p className="text-xs text-muted-foreground italic">{emptyMessage}</p>;
  }

  const sorted = violations.slice().sort((a, b) => {
    const cmp = a.created_at.localeCompare(b.created_at);
    return ordering === 'asc' ? cmp : -cmp;
  });

  return (
    <ul className="space-y-1.5">
      {sorted.map((v, i) => {
        const metaEntries =
          v.metadata && typeof v.metadata === 'object'
            ? Object.entries(v.metadata).filter(([, value]) => value !== null && value !== undefined && value !== '')
            : [];
        return (
          <li
            key={v.id}
            className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50/70 px-2 py-1.5 text-[11px] dark:border-amber-900/40 dark:bg-amber-950/20"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono text-[10px] text-muted-foreground">#{i + 1}</span>
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-5 border-amber-300 bg-amber-100/70 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                  {violationLabel(v.violation_type)}
                </Badge>
                <span className="text-[10px] text-muted-foreground">{formatDateTime(v.created_at)}</span>
              </div>
              {metaEntries.length > 0 && (
                <p className="mt-0.5 text-[10px] text-muted-foreground font-mono break-all">
                  {metaEntries
                    .map(([k, val]) => `${k}=${typeof val === 'string' ? val : JSON.stringify(val)}`)
                    .join(' · ')}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
