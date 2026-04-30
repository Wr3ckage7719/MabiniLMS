import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ClassItem, CourseCategoryWeights, CourseCompletionPolicy } from '@/lib/data';
import { Pencil, Plus, X } from 'lucide-react';
import { coursesService } from '@/services/courses.service';
import { buildCourseMetadata, serializeCourseMetadata } from '@/services/course-metadata';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateClassData } from '@/lib/query-invalidation';

type CompletionPolicyKind = 'default' | 'all_items_viewed' | 'weighted_score_threshold';

const DEFAULT_WEIGHTS: CourseCategoryWeights = {
  exam: 0.45,
  quiz: 0.15,
  activity: 0,
  recitation: 0.15,
  attendance: 0.2,
  project: 0.05,
};

const POLICY_LABELS: Record<CompletionPolicyKind, string> = {
  default: 'Default — graded + submitted / total assignments',
  all_items_viewed: 'All assignments viewed/submitted',
  weighted_score_threshold: 'Weighted final score must reach a threshold',
};

const policyKindFromValue = (value: CourseCompletionPolicy | null | undefined): CompletionPolicyKind => {
  if (!value) return 'default';
  if (value.type === 'all_items_viewed') return 'all_items_viewed';
  if (value.type === 'weighted_score_threshold') return 'weighted_score_threshold';
  // passing_score_on requires picking a specific assignment — out of scope
  // for this dialog; treat as "default" so the teacher can pick it via API.
  return 'default';
};

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
  const [tags, setTags] = useState<string[]>(classItem.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [enrolmentKey, setEnrolmentKey] = useState(classItem.enrolmentKey ?? '');
  const [policyKind, setPolicyKind] = useState<CompletionPolicyKind>(
    policyKindFromValue(classItem.completionPolicy)
  );
  const [policyThreshold, setPolicyThreshold] = useState<string>(() => {
    const policy = classItem.completionPolicy;
    if (policy && policy.type === 'weighted_score_threshold') {
      return String(policy.threshold);
    }
    return '75';
  });
  const initialWeights = classItem.categoryWeights ?? DEFAULT_WEIGHTS;
  const [weights, setWeights] = useState<CourseCategoryWeights>(initialWeights);
  const weightsEnabled = Boolean(classItem.categoryWeights);
  const [overrideWeights, setOverrideWeights] = useState(weightsEnabled);
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const addTag = () => {
    const value = tagDraft.trim();
    if (!value) return;
    if (value.length > 40) return;
    setTags((prev) => {
      if (prev.length >= 20) return prev;
      const exists = prev.some((entry) => entry.toLowerCase() === value.toLowerCase());
      return exists ? prev : [...prev, value];
    });
    setTagDraft('');
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((entry) => entry !== tag));
  };

  const setWeight = (key: keyof CourseCategoryWeights, raw: string) => {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return;
    setWeights((prev) => ({ ...prev, [key]: Math.max(0, Math.min(1, numeric)) }));
  };

  const weightSum = Object.values(weights).reduce((acc, n) => acc + n, 0);

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const buildPolicyPayload = (): CourseCompletionPolicy | null => {
    if (policyKind === 'all_items_viewed') {
      return { type: 'all_items_viewed' };
    }
    if (policyKind === 'weighted_score_threshold') {
      const threshold = Number(policyThreshold);
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
        return null;
      }
      return { type: 'weighted_score_threshold', threshold };
    }
    return null;
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

      const trimmedKey = enrolmentKey.trim();

      await coursesService.updateCourse(classItem.id, {
        title: name.trim(),
        syllabus: serializeCourseMetadata(metadata),
        tags,
        completion_policy: buildPolicyPayload(),
        category_weights: overrideWeights ? weights : null,
        enrolment_key: trimmedKey ? trimmedKey : null,
      });

      await invalidateClassData(queryClient, { classId: classItem.id });

      onSave({
        name,
        section: sectionValue || classItem.section,
        block,
        level,
        room,
        schedule: newSchedule,
        tags,
        completionPolicy: buildPolicyPayload(),
        categoryWeights: overrideWeights ? weights : null,
        enrolmentKey: trimmedKey ? trimmedKey : null,
      });

      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const sameTags =
    tags.length === (classItem.tags?.length ?? 0) &&
    tags.every((entry, index) => entry === (classItem.tags ?? [])[index]);
  const initialPolicyKind = policyKindFromValue(classItem.completionPolicy);
  const samePolicy =
    policyKind === initialPolicyKind &&
    (policyKind !== 'weighted_score_threshold' ||
      Number(policyThreshold) ===
        ((classItem.completionPolicy as { threshold?: number } | null | undefined)?.threshold ??
          75));
  const sameWeights =
    overrideWeights === weightsEnabled &&
    (!overrideWeights ||
      Object.keys(weights).every(
        (key) => weights[key as keyof CourseCategoryWeights] === initialWeights[key as keyof CourseCategoryWeights]
      ));
  const sameKey = enrolmentKey.trim() === (classItem.enrolmentKey ?? '');

  const isChanged =
    name !== classItem.name ||
    block !== (classItem.block || '') ||
    level !== (classItem.level || '') ||
    room !== classItem.room ||
    formatSchedule(selectedDays, startTime, endTime) !== classItem.schedule ||
    !sameTags ||
    !samePolicy ||
    !sameWeights ||
    !sameKey;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Edit Class
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="general" className="mt-2">
          <TabsList className="grid w-full grid-cols-2 rounded-lg">
            <TabsTrigger value="general" className="rounded-md">General</TabsTrigger>
            <TabsTrigger value="settings" className="rounded-md">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 py-3">
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
          </TabsContent>

          <TabsContent value="settings" className="space-y-5 py-3">
            <div className="space-y-2">
              <Label>Course tags</Label>
              <p className="text-xs text-muted-foreground">
                Used by the dashboard search and the course catalog. Up to 20 tags, 40 characters each.
              </p>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="rounded-full text-xs gap-1 border-primary/40 bg-primary/5 text-primary"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="hover:text-destructive"
                        aria-label={`Remove tag ${tag}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. Onboarding, Safety, STEM"
                  className="rounded-xl"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  maxLength={40}
                  disabled={tags.length >= 20}
                />
                <Button
                  type="button"
                  size="icon"
                  className="rounded-xl shrink-0"
                  onClick={addTag}
                  disabled={!tagDraft.trim() || tags.length >= 20}
                  aria-label="Add tag"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Completion criteria</Label>
              <p className="text-xs text-muted-foreground">
                What counts as "done" for this course. Default = the graded/submitted ratio shown in
                the student progress card.
              </p>
              <select
                value={policyKind}
                onChange={(e) => setPolicyKind(e.target.value as CompletionPolicyKind)}
                className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm"
              >
                {(Object.keys(POLICY_LABELS) as CompletionPolicyKind[]).map((kind) => (
                  <option key={kind} value={kind}>
                    {POLICY_LABELS[kind]}
                  </option>
                ))}
              </select>
              {policyKind === 'weighted_score_threshold' && (
                <div className="flex items-center gap-2 mt-2">
                  <Label htmlFor="threshold" className="text-xs">Threshold (%)</Label>
                  <Input
                    id="threshold"
                    type="number"
                    min={0}
                    max={100}
                    value={policyThreshold}
                    onChange={(e) => setPolicyThreshold(e.target.value)}
                    className="rounded-xl w-24"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Gradebook weights</Label>
                <button
                  type="button"
                  onClick={() => setOverrideWeights((v) => !v)}
                  className="text-xs text-primary hover:underline"
                >
                  {overrideWeights ? 'Use Mabini default' : 'Override default'}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Per-category weights used by the weighted-grade breakdown. They should sum to 1.0.
              </p>
              {overrideWeights ? (
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(weights) as Array<keyof CourseCategoryWeights>).map((key) => (
                    <div key={key} className="space-y-1">
                      <Label htmlFor={`weight-${key}`} className="text-xs capitalize">{key}</Label>
                      <Input
                        id={`weight-${key}`}
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={weights[key]}
                        onChange={(e) => setWeight(key, e.target.value)}
                        className="rounded-xl"
                      />
                    </div>
                  ))}
                  <p
                    className={`col-span-2 text-[11px] ${
                      Math.abs(weightSum - 1) < 0.01 ? 'text-muted-foreground' : 'text-amber-600'
                    }`}
                  >
                    Sum: {weightSum.toFixed(2)} {Math.abs(weightSum - 1) >= 0.01 && '(ideally 1.00)'}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">
                  Using institutional default (Major Exam 45%, Quiz 15%, Recitation 15%, Attendance 20%, Project 5%).
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="enrolment-key">Enrolment key (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Shared password students must enter alongside the class code. Leave blank for code-only joining.
              </p>
              <Input
                id="enrolment-key"
                placeholder="e.g. mabini-2026"
                className="rounded-xl"
                value={enrolmentKey}
                onChange={(e) => setEnrolmentKey(e.target.value)}
                maxLength={64}
              />
            </div>
          </TabsContent>
        </Tabs>
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
