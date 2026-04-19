import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClassItem } from '@/lib/data';
import { Pencil } from 'lucide-react';
import { coursesService } from '@/services/courses.service';
import { buildCourseMetadata, serializeCourseMetadata } from '@/services/course-metadata';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateClassData } from '@/lib/query-invalidation';

interface EditClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classItem: ClassItem;
  onSave: (updatedClass: Partial<ClassItem>) => void;
}

const parseSchedule = (schedule: string) => {
  // Parse format: "Mon-Wed-Fri 09:00 - 10:30"
  const match = schedule.match(/^([A-Za-z-]+)\s+(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
  if (match) {
    const [, daysStr, start, end] = match;
    const days = daysStr.split('-').map((d) => d.trim());
    return { days, startTime: start, endTime: end };
  }
  return { days: [], startTime: '09:00', endTime: '10:30' };
};

const formatSchedule = (days: string[], startTime: string, endTime: string) => {
  if (days.length === 0) return '';
  return `${days.join('-')} ${startTime} - ${endTime}`;
};

export function EditClassDialog({ open, onOpenChange, classItem, onSave }: EditClassDialogProps) {
  const parsed = parseSchedule(classItem.schedule);
  
  const [name, setName] = useState(classItem.name);
  const [block, setBlock] = useState(classItem.block || '');
  const [level, setLevel] = useState(classItem.level || '');
  const [room, setRoom] = useState(classItem.room);
  const [selectedDays, setSelectedDays] = useState<string[]>(parsed.days);
  const [startTime, setStartTime] = useState(parsed.startTime);
  const [endTime, setEndTime] = useState(parsed.endTime);
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const newSchedule = formatSchedule(selectedDays, startTime, endTime);
      const sectionValue = [block.trim(), level.trim()].filter(Boolean).join(' • ');
      const metadata = buildCourseMetadata({
        section: sectionValue || undefined,
        block: block.trim() || undefined,
        level: level.trim() || undefined,
        room: room.trim() || undefined,
        schedule: newSchedule || undefined,
        theme: classItem.color,
        coverImage: classItem.coverImage,
      });

      await coursesService.updateCourse(classItem.id, {
        title: name.trim(),
        syllabus: serializeCourseMetadata(metadata),
      });

      await invalidateClassData(queryClient, { classId: classItem.id });

      onSave({
        name,
        section: sectionValue || classItem.section,
        block,
        level,
        room,
        schedule: newSchedule,
      });

      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const isChanged = 
    name !== classItem.name ||
    block !== (classItem.block || '') ||
    level !== (classItem.level || '') ||
    room !== classItem.room ||
    formatSchedule(selectedDays, startTime, endTime) !== classItem.schedule;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Edit Class
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Class name</Label>
            <Input 
              placeholder="e.g. Advanced Mathematics" 
              className="rounded-xl"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Block</Label>
              <Input 
                placeholder="e.g. A" 
                className="rounded-xl"
                value={block}
                onChange={(e) => setBlock(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Level</Label>
              <Input 
                placeholder="e.g. Period 1" 
                className="rounded-xl"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Room</Label>
            <Input 
              placeholder="e.g. Room 101" 
              className="rounded-xl"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Schedule</Label>
            {/* Days Selection */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Select days</p>
              <div className="flex flex-wrap gap-1.5">
                {days.map((day) => (
                  <button
                    key={day}
                    onClick={() => toggleDay(day)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedDays.includes(day)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary/50 text-foreground hover:bg-secondary'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>            {/* Time Selection */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Time (optional)</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="startTime" className="text-xs text-muted-foreground">
                    Start
                  </Label>
                  <input
                    id="startTime"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-max h-9 rounded-lg text-sm font-medium text-foreground bg-secondary/30 focus:bg-secondary/50 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all px-2"
                    placeholder="09:00"
                    style={{
                      colorScheme: 'light',
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="endTime" className="text-xs text-muted-foreground">
                    End
                  </Label>
                  <input
                    id="endTime"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-max h-9 rounded-lg text-sm font-medium text-foreground bg-secondary/30 focus:bg-secondary/50 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all px-2"
                    placeholder="10:30"
                    style={{
                      colorScheme: 'light',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button 
            variant="ghost" 
            onClick={() => onOpenChange(false)} 
            className="rounded-xl"
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            className="rounded-xl"
            disabled={!isChanged || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
