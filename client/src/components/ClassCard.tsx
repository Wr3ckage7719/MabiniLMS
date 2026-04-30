import { ClassItem, CLASS_COLORS } from '@/lib/data';
import { FileText, ArchiveRestore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { CourseCompletion } from '@/lib/course-completion';

interface ClassCardProps {
  classItem: ClassItem;
  onArchive?: (classId: string) => void;
  onUnenroll?: (classId: string) => void;
  onRestore?: (classId: string) => void;
  /**
   * Per-course completion derived on the parent (which already holds the
   * full assignment list) so the dashboard doesn't refetch per-card.
   * Omit on teacher views — the ring only renders when this is provided.
   */
  completion?: CourseCompletion;
}

interface ProgressRingProps {
  percent: number;
  size?: number;
  stroke?: number;
}

// Small inline SVG ring so we don't pull a chart lib for one indicator.
function ProgressRing({ percent, size = 36, stroke = 4 }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className="text-white/25"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-white transition-all duration-500"
        />
      </svg>
      <span className="absolute text-[9px] font-semibold text-white">{clamped}%</span>
    </div>
  );
}

export function ClassCard({ classItem, onArchive, onUnenroll, onRestore, completion }: ClassCardProps) {
  const navigate = useNavigate();
  const [confirmAction, setConfirmAction] = useState<'archive' | 'unenroll' | 'restore' | null>(null);

  const handleArchive = () => {
    onArchive?.(classItem.id);
    setConfirmAction(null);
  };

  const handleUnenroll = () => {
    onUnenroll?.(classItem.id);
    setConfirmAction(null);
  };

  const handleRestore = () => {
    onRestore?.(classItem.id);
    setConfirmAction(null);
  };

  const isArchived = classItem.archived === true;

  return (
    <>
      <Card
        className={`group overflow-hidden border-0 cursor-pointer bg-transparent shadow-none md:bg-card md:shadow-sm md:card-interactive md:hover:shadow-glow`}
        onClick={() => navigate(`/class/${classItem.id}`)}
      >
        <div
          className={`md:hidden min-h-[146px] px-4 py-4 relative overflow-hidden rounded-[24px] ${isArchived ? 'opacity-70' : ''} ${!classItem.coverImage ? CLASS_COLORS[classItem.color] : ''}`}
          style={
            classItem.coverImage
              ? {
                  backgroundImage: `url(${classItem.coverImage})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : undefined
          }
        >
          {classItem.coverImage ? <div className="absolute inset-0 bg-black/45" /> : null}
          <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/20" />
          <div className="absolute -right-5 -bottom-7 w-32 h-32 rounded-full bg-white/12" />
          <div className="absolute -right-2 -top-4 w-16 h-16 rounded-full bg-white/10" />

          <div className="relative z-10 flex h-full flex-col justify-between gap-5">
            <div className="flex items-start justify-between gap-3 pr-1">
              <div className="min-w-0 pr-2">
                <h3 className="text-[18px] leading-tight font-bold text-white tracking-tight truncate">{classItem.name}</h3>
                <p className="text-[14px] text-white/90 mt-0.5 truncate">{classItem.section || 'Section'}</p>
              </div>
              {completion && completion.total > 0 && !isArchived && (
                <ProgressRing percent={completion.percent} size={40} stroke={4} />
              )}
            </div>

            <div>
              <p className="text-[14px] font-semibold text-white/95 truncate">{classItem.teacher}</p>
              <p className="text-[13px] text-white/80 truncate">{classItem.room} • {classItem.schedule}</p>
              {isArchived && (
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded-md">Archived</span>
                  {onRestore && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmAction('restore');
                      }}
                      className="inline-flex items-center gap-1 text-[10px] bg-white/25 hover:bg-white/35 text-white px-1.5 py-0.5 rounded-md transition-colors"
                    >
                      <ArchiveRestore className="h-3 w-3" /> Unarchive
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="hidden md:block">
        <div
          className={`h-28 p-5 relative overflow-hidden ${isArchived ? 'opacity-60' : ''} ${!classItem.coverImage ? CLASS_COLORS[classItem.color] : ''}`}
          style={
            classItem.coverImage
              ? {
                  backgroundImage: `url(${classItem.coverImage})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : undefined
          }
        >
          {classItem.coverImage ? <div className="absolute inset-0 bg-black/45" /> : null}
          <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/20" />
          <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-white/10 group-hover:scale-110 transition-transform duration-500" />
          <div className="absolute -right-8 -top-8 w-20 h-20 rounded-full bg-white/5" />
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white truncate">{classItem.name}</h3>
              <p className="text-sm text-white/80 mt-0.5 truncate">{classItem.section}</p>
              {isArchived && (
                <div className="mt-2 inline-block">
                  <span className="text-xs bg-white/20 text-white px-2 py-1 rounded-md">Archived</span>
                </div>
              )}
            </div>
            {completion && completion.total > 0 && !isArchived && (
              <ProgressRing percent={completion.percent} size={44} stroke={4} />
            )}
          </div>
        </div>

        <div className={`p-5 ${isArchived ? 'opacity-90' : ''}`}>
          <p className="text-sm text-muted-foreground mb-2">{classItem.teacher}</p>
          <p className="text-xs text-muted-foreground mb-4">{classItem.room} • {classItem.schedule}</p>
          <div className="flex items-center justify-between gap-2">
            {isArchived && onRestore ? (
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg text-xs gap-1.5"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmAction('restore');
                }}
              >
                <ArchiveRestore className="h-3.5 w-3.5" />
                Unarchive
              </Button>
            ) : <span />}
            {!isArchived && completion && completion.total > 0 ? (
              <div className="flex items-center gap-1.5 text-primary">
                <FileText className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {completion.completed}/{completion.total} done
                </span>
              </div>
            ) : (
              classItem.pendingAssignments > 0 && !isArchived && (
                <div className="flex items-center gap-1.5 text-primary">
                  <FileText className="h-4 w-4" />
                  <span className="text-sm font-medium">{classItem.pendingAssignments} pending</span>
                </div>
              )
            )}
          </div>
        </div>
        </div>
      </Card>

      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'archive' ? 'Archive Class?' : confirmAction === 'restore' ? 'Restore Class?' : 'Delete Permanently?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'archive'
                ? `Are you sure you want to archive "${classItem.name}"? You can restore it later.`
                : confirmAction === 'restore'
                ? `Are you sure you want to restore "${classItem.name}"? It will appear in your active classes.`
                : `Are you sure you want to permanently delete "${classItem.name}"? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (confirmAction === 'archive') handleArchive();
              else if (confirmAction === 'restore') handleRestore();
              else if (confirmAction === 'unenroll') handleUnenroll();
            }}
            className={`rounded-lg ${confirmAction === 'unenroll' ? 'bg-destructive hover:bg-destructive/90' : ''}`}
          >
            {confirmAction === 'archive' ? 'Archive' : confirmAction === 'restore' ? 'Restore' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
