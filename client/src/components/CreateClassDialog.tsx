import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { coursesService } from '@/services/courses.service';
import { useToast } from '@/hooks/use-toast';

interface CreateClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const colorOptions = [
  { value: 'blue', bg: 'bg-class-blue' },
  { value: 'teal', bg: 'bg-class-teal' },
  { value: 'purple', bg: 'bg-class-purple' },
  { value: 'orange', bg: 'bg-class-orange' },
  { value: 'pink', bg: 'bg-class-pink' },
  { value: 'green', bg: 'bg-class-green' },
];

export function CreateClassDialog({ open, onOpenChange, onSuccess }: CreateClassDialogProps) {
  const [selectedColor, setSelectedColor] = useState('teal');
  const [className, setClassName] = useState('');
  const [section, setSection] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const resetForm = () => {
    setClassName('');
    setSection('');
    setDescription('');
    setSelectedColor('teal');
    setError(null);
  };

  const handleCreate = async () => {
    if (!className.trim()) {
      setError('Please enter a class name');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await coursesService.createCourse({
        title: className.trim(),
        section: section.trim() || undefined,
        description: description.trim() || undefined,
        cover_image: selectedColor,
      });

      toast({
        title: 'Success!',
        description: 'Class created successfully.',
      });
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to create class';
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
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Create a new class</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Class name <span className="text-destructive">*</span></Label>
            <Input 
              placeholder="e.g. Advanced Mathematics" 
              className="rounded-xl"
              value={className}
              onChange={(e) => {
                setClassName(e.target.value);
                setError(null);
              }}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label>Section</Label>
            <Input 
              placeholder="e.g. Section A - Period 1" 
              className="rounded-xl"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea 
              placeholder="What will students learn?" 
              className="rounded-xl resize-none" 
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label>Theme color</Label>
            <div className="flex gap-2">
              {colorOptions.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setSelectedColor(c.value)}
                  disabled={isLoading}
                  className={`w-8 h-8 rounded-full ${c.bg} transition-all ${
                    selectedColor === c.value ? 'ring-2 ring-offset-2 ring-foreground scale-110' : 'hover:scale-110'
                  }`}
                />
              ))}
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} className="rounded-xl" disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleCreate} className="rounded-xl" disabled={isLoading || !className.trim()}>
            {isLoading ? 'Creating...' : 'Create class'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
