import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, Plus } from 'lucide-react';
import { coursesService } from '@/services/courses.service';
import { useToast } from '@/hooks/use-toast';

interface TeacherCreateClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const colorOptions = [
  { value: 'blue', bg: 'bg-class-blue', label: 'Blue' },
  { value: 'teal', bg: 'bg-class-teal', label: 'Teal' },
  { value: 'purple', bg: 'bg-class-purple', label: 'Purple' },
  { value: 'orange', bg: 'bg-class-orange', label: 'Orange' },
  { value: 'pink', bg: 'bg-class-pink', label: 'Pink' },
  { value: 'green', bg: 'bg-class-green', label: 'Green' },
];

const subjects = [
  'Mathematics',
  'Science',
  'English',
  'History',
  'Geography',
  'Physical Education',
  'Art',
  'Music',
  'Computer Science',
  'Business Studies',
  'Biology',
  'Chemistry',
  'Physics',
  'Literature',
];

const schedules = [
  'Monday - Wednesday - Friday',
  'Tuesday - Thursday',
  'Daily',
  'Monday - Friday',
  'Twice a week',
  'Once a week',
];

const levels = [
  'Elementary',
  'Middle School',
  'High School',
  'Advanced',
  'Beginner',
  'Intermediate',
  'Expert',
];

export function TeacherCreateClassDialog({ open, onOpenChange, onSuccess }: TeacherCreateClassDialogProps) {
  const [className, setClassName] = useState('');
  const [section, setSection] = useState('');
  const [schedule, setSchedule] = useState('');
  const [level, setLevel] = useState('');
  const [subject, setSubject] = useState('');
  const [room, setRoom] = useState('');
  const [selectedColor, setSelectedColor] = useState('blue');
  const [isCreating, setIsCreating] = useState(false);
  const [showCustomColor, setShowCustomColor] = useState(false);
  const [customColor, setCustomColor] = useState('#3b82f6');
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleCreateClass = async () => {
    if (!className.trim()) {
      setError('Please enter a class name');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const color = showCustomColor && selectedColor === 'custom' ? customColor : selectedColor;
      
      // Build description from subject and level
      const description = [subject, level].filter(Boolean).join(' - ');
      
      await coursesService.createCourse({
        title: className.trim(),
        section: section.trim() || undefined,
        description: description || undefined,
        room: room.trim() || undefined,
        schedule: schedule.trim() || undefined,
        cover_image: color,
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
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setClassName('');
    setSection('');
    setSchedule('');
    setLevel('');
    setSubject('');
    setRoom('');
    setSelectedColor('blue');
    setShowCustomColor(false);
    setCustomColor('#3b82f6');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const isComplete = className && section && schedule && level && subject && room;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-2xl border-0 gap-0 p-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-primary/10 to-accent/10 border-b px-6 pt-6 pb-4">
          <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Create a New Class
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">Set up your classroom in just a few steps</p>
        </div>
        
        <div className="space-y-5 py-6 px-6 max-h-[calc(100vh-250px)] overflow-y-auto">
          {/* Class Name */}
          <div className="space-y-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
            <Label htmlFor="className" className="text-sm font-semibold text-foreground">
              Class Name
            </Label>
            <Input
              id="className"
              placeholder="e.g. Mathematics 101"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              className="rounded-lg h-10 border-1 border-input bg-secondary/30 focus:bg-secondary/50 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/60"
            />
          </div>

          {/* Section/Block and Room - Two columns on desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Section/Block */}
            <div className="space-y-2 animate-in fade-in slide-in-from-bottom-1 duration-300 delay-75">
              <Label htmlFor="section" className="text-sm font-semibold text-foreground">
                Section / Block
              </Label>
              <Input
                id="section"
                placeholder="e.g. Section A"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="rounded-lg h-10 border-1 border-input bg-secondary/30 focus:bg-secondary/50 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/60"
              />
            </div>

            {/* Room */}
            <div className="space-y-2 animate-in fade-in slide-in-from-bottom-1 duration-300 delay-100">
              <Label htmlFor="room" className="text-sm font-semibold text-foreground">
                Room
              </Label>
              <Input
                id="room"
                placeholder="e.g. Room 101"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                className="rounded-lg h-10 border-1 border-input bg-secondary/30 focus:bg-secondary/50 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          {/* Schedule and Level - Two columns on desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Schedule */}
            <div className="space-y-2 animate-in fade-in slide-in-from-bottom-1 duration-300 delay-150">
              <Label htmlFor="schedule" className="text-sm font-semibold text-foreground">
                Schedule
              </Label>
              <Input
                id="schedule"
                placeholder="e.g. Mon-Wed-Fri, 9:00 AM"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                className="rounded-lg h-10 border-1 border-input bg-secondary/30 focus:bg-secondary/50 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/60"
              />
            </div>

            {/* Level */}
            <div className="space-y-2 animate-in fade-in slide-in-from-bottom-1 duration-300 delay-175">
              <Label htmlFor="level" className="text-sm font-semibold text-foreground">
                Level
              </Label>
              <Input
                id="level"
                placeholder="e.g. High School, Beginner"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="rounded-lg h-10 border-1 border-input bg-secondary/30 focus:bg-secondary/50 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-2 animate-in fade-in slide-in-from-bottom-1 duration-300 delay-200">
            <Label htmlFor="subject" className="text-sm font-semibold text-foreground">
              Subject
            </Label>
            <Input
              id="subject"
              placeholder="e.g. Mathematics, Computer Science"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="rounded-lg h-10 border-1 border-input bg-secondary/30 focus:bg-secondary/50 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/60"
            />
          </div>

          {/* Theme Color */}
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-1 duration-300 delay-225">
            <Label className="text-sm font-semibold text-foreground">Choose Theme Color</Label>
            <div className="flex flex-wrap gap-3">
              {colorOptions.map((c) => (
                <button
                  key={c.value}
                  onClick={() => {
                    setSelectedColor(c.value);
                    setShowCustomColor(false);
                  }}
                  className={`group w-11 h-11 rounded-full ${c.bg} transition-all duration-200 hover:scale-110 active:scale-95 ${
                    selectedColor === c.value && !showCustomColor
                      ? 'ring-2 ring-offset-2 ring-primary shadow-lg scale-110'
                      : 'shadow-md hover:shadow-lg'
                  }`}
                  title={c.label}
                  style={{
                    animation: selectedColor === c.value && !showCustomColor ? `pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite` : 'none',
                  }}
                />
              ))}
              
              {/* Custom Color Button */}
              <button
                onClick={() => {
                  setShowCustomColor(!showCustomColor);
                  setSelectedColor('custom');
                }}
                className={`w-11 h-11 rounded-full border-2 border-dashed transition-all duration-200 hover:scale-110 active:scale-95 flex items-center justify-center ${
                  showCustomColor
                    ? 'border-primary bg-primary/10 shadow-lg scale-110'
                    : 'border-secondary-foreground/30 hover:border-primary/50 shadow-md hover:shadow-lg'
                }`}
                title="Custom Color"
              >
                <Plus className="h-5 w-5 text-foreground/70" />
              </button>
            </div>
            
            {/* Custom Color Input */}
            {showCustomColor && (
              <div className="mt-3 p-3 bg-secondary/30 rounded-lg border border-primary/20 animate-in fade-in slide-in-from-bottom-1 duration-200">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={customColor}
                    onChange={(e) => setCustomColor(e.target.value)}
                    className="w-12 h-10 rounded-lg cursor-pointer border border-input"
                  />
                  <div className="flex-1">
                    <Input
                      type="text"
                      value={customColor}
                      onChange={(e) => setCustomColor(e.target.value)}
                      placeholder="#3b82f6"
                      className="h-10 border-1 border-input bg-secondary/50 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t bg-secondary/20 px-6 py-4 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
          {error && (
            <p className="text-sm text-destructive self-center mr-auto">{error}</p>
          )}
          <Button 
            variant="outline" 
            onClick={handleClose}
            disabled={isCreating}
            className="rounded-lg h-10 font-medium hover:bg-secondary transition-all"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateClass}
            disabled={!isComplete || isCreating}
            className={`bg-gradient-to-r from-primary to-accent hover:opacity-90 rounded-lg h-10 font-semibold shadow-md hover:shadow-lg transition-all duration-200 ${
              isCreating ? 'opacity-80' : ''
            }`}
          >
            {isCreating ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Creating...
              </div>
            ) : (
              'Create Class'
            )}
          </Button>
        </div>
      </DialogContent>

      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }
      `}</style>
    </Dialog>
  );
}
