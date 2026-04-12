import { ClassItem, CLASS_COLORS } from '@/lib/data';
import { FileText } from 'lucide-react';
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

interface ClassCardProps {
  classItem: ClassItem;
  onArchive?: (classId: string) => void;
  onUnenroll?: (classId: string) => void;
  onRestore?: (classId: string) => void;
}

export function ClassCard({ classItem, onArchive, onUnenroll, onRestore }: ClassCardProps) {
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
        className={`group overflow-hidden ${!isArchived ? 'cursor-pointer' : ''} card-interactive border-0 shadow-sm hover:shadow-glow`}
        onClick={() => !isArchived && navigate(`/class/${classItem.id}`)}
      >
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
          <div className="relative z-10">
            <h3 className="text-lg font-bold text-white truncate">{classItem.name}</h3>
            <p className="text-sm text-white/80 mt-0.5 truncate">{classItem.section}</p>
            {isArchived && (
              <div className="mt-2 inline-block">
                <span className="text-xs bg-white/20 text-white px-2 py-1 rounded-md">Archived</span>
              </div>
            )}
          </div>
        </div>

        <div className={`p-5 ${isArchived ? 'opacity-70' : ''}`}>
          <p className="text-sm text-muted-foreground mb-2">{classItem.teacher}</p>
          <p className="text-xs text-muted-foreground mb-4">{classItem.room} • {classItem.schedule}</p>
          <div className="flex items-center justify-end">
            {classItem.pendingAssignments > 0 && !isArchived && (
              <div className="flex items-center gap-1.5 text-primary">
                <FileText className="h-4 w-4" />
                <span className="text-sm font-medium">{classItem.pendingAssignments} pending</span>
              </div>
            )}
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
