import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { enrollmentsService } from '@/services/enrollments.service';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateClassData } from '@/lib/query-invalidation';

interface JoinClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function JoinClassDialog({ open, onOpenChange, onSuccess }: JoinClassDialogProps) {
  const [courseId, setCourseId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleJoin = async () => {
    if (!courseId.trim()) {
      setError('Please enter a class code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await enrollmentsService.enrollInCourse(courseId.trim());
      toast({
        title: 'Success!',
        description: 'You have successfully joined the class.',
      });
      await invalidateClassData(queryClient);
      setCourseId('');
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to join class';
      setError(message);
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setCourseId('');
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Join a class</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Class code</Label>
            <Input 
              placeholder="Enter 8-character class code" 
              className="rounded-xl text-center text-lg tracking-widest font-mono"
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isLoading) {
                  handleJoin();
                }
              }}
              disabled={isLoading}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Ask your teacher for the class code, then enter it here. Full course IDs are also accepted.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} className="rounded-xl" disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleJoin} className="rounded-xl" disabled={isLoading || !courseId.trim()}>
            {isLoading ? 'Joining...' : 'Join'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
