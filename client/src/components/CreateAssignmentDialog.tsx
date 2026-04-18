import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText,
  Activity,
  BookOpen,
  ClipboardCheck,
  Calendar as CalendarIcon,
  Paperclip,
  X,
  Plus,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { assignmentsService } from '@/services/assignments.service';
import { materialsService, type MaterialType } from '@/services/materials.service';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface CreateAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId?: string;
  onCreated?: () => void;
}

interface AttachedFile {
  id: string;
  name: string;
  size: string;
  type: string;
}

interface Topic {
  id: string;
  name: string;
}

type TaskType = 'reading_material' | 'activity' | 'quiz' | 'exam';

const TASK_LABELS: Record<TaskType, string> = {
  reading_material: 'Reading Material',
  activity: 'Activity',
  quiz: 'Quiz',
  exam: 'Exam',
};

const TASK_HELP_TEXT: Record<TaskType, string> = {
  reading_material: 'Reference resource with reading progress tracking planned in the next phase.',
  activity: 'Drive-based submissions with teacher review controls.',
  quiz: 'Question builder, sequencing, and randomization are scaffolded in this phase.',
  exam: 'Strict integrity controls are scaffolded while preserving current proctored flow.',
};

export function CreateAssignmentDialog({
  open,
  onOpenChange,
  classId,
  onCreated,
}: CreateAssignmentDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('activity');
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [points, setPoints] = useState('100');
  const [materialType, setMaterialType] = useState<MaterialType>('document');
  const [materialFileUrl, setMaterialFileUrl] = useState('');
  const [quizQuestionOrder, setQuizQuestionOrder] = useState<'sequence' | 'random'>('sequence');
  const [examQuestionSelection, setExamQuestionSelection] = useState<'sequence' | 'random'>('random');
  const [examIntegrityProfile, setExamIntegrityProfile] = useState<'standard' | 'strict'>('strict');
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [newTopic, setNewTopic] = useState('');
  const [showTopicInput, setShowTopicInput] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const clearFieldError = (field: string) => {
    setErrors((prev) => {
      if (!prev[field]) {
        return prev;
      }

      const nextErrors = { ...prev };
      delete nextErrors[field];
      return nextErrors;
    });
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (taskType !== 'reading_material' && !dueDate) {
      newErrors.dueDate = 'Due date is required for activity, quiz, and exam tasks';
    }

    if (taskType !== 'reading_material') {
      const parsedPoints = Number(points);
      if (!Number.isFinite(parsedPoints) || parsedPoints < 0) {
        newErrors.points = 'Points must be a non-negative number';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    Array.from(selectedFiles).forEach((file) => {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      const newFile: AttachedFile = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: `${fileSizeMB} MB`,
        type: file.type,
      };
      setFiles((prev) => [...prev, newFile]);
    });

    // Reset input
    e.target.value = '';
  };

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const addTopic = () => {
    if (!newTopic.trim()) return;

    const topic: Topic = {
      id: Math.random().toString(36).substr(2, 9),
      name: newTopic.trim(),
    };

    setTopics((prev) => [...prev, topic]);
    setNewTopic('');
    setShowTopicInput(false);
  };

  const removeTopic = (topicId: string) => {
    setTopics((prev) => prev.filter((t) => t.id !== topicId));
  };

  const handleTaskTypeChange = (nextType: TaskType) => {
    setTaskType(nextType);
    clearFieldError('dueDate');
    clearFieldError('points');
  };

  const handleCreate = async () => {
    if (!validateForm()) return;

    if (!classId) {
      toast({
        title: 'Missing class context',
        description: 'Open this dialog from a class page to create tasks.',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (taskType === 'reading_material') {
        await materialsService.create(classId, {
          title: title.trim(),
          type: materialType,
          file_url: materialFileUrl.trim() || undefined,
        });
      } else {
        const assignmentType =
          taskType === 'quiz'
            ? 'quiz'
            : taskType === 'exam'
              ? 'exam'
              : 'activity';

        await assignmentsService.createAssignment(classId, {
          title: title.trim(),
          description: description.trim() || undefined,
          assignment_type: assignmentType,
          due_date: dueDate ? dueDate.toISOString() : new Date().toISOString(),
          max_points: Number(points) || 100,
        });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['assignments', classId] }),
        queryClient.invalidateQueries({ queryKey: ['materials', classId] }),
      ]);

      toast({
        title: 'Created successfully',
        description:
          taskType === 'reading_material'
            ? 'Reading material created.'
            : `${TASK_LABELS[taskType]} task created.`,
      });

      resetForm();
      onOpenChange(false);
      onCreated?.();
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to create task';
      toast({
        title: 'Creation failed',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setTaskType('activity');
    setDueDate(undefined);
    setPoints('100');
    setMaterialType('document');
    setMaterialFileUrl('');
    setQuizQuestionOrder('sequence');
    setExamQuestionSelection('random');
    setExamIntegrityProfile('strict');
    setFiles([]);
    setTopics([]);
    setNewTopic('');
    setShowTopicInput(false);
    setErrors({});
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const taskOptions = [
    {
      id: 'reading_material' as const,
      label: 'Reading Material',
      description: 'Reference content and links',
      icon: BookOpen,
    },
    {
      id: 'activity' as const,
      label: 'Activity',
      description: 'Drive submission task',
      icon: Activity,
    },
    {
      id: 'quiz' as const,
      label: 'Quiz',
      description: 'Assessment with item builder',
      icon: FileText,
    },
    {
      id: 'exam' as const,
      label: 'Exam',
      description: 'Proctored assessment flow',
      icon: ClipboardCheck,
    },
  ];

  const createTaskButtonLabel =
    taskType === 'reading_material'
      ? 'Create Reading Material'
      : taskType === 'activity'
        ? 'Create Activity Task'
        : taskType === 'quiz'
          ? 'Create Quiz Task'
          : 'Create Exam Task';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-dvw sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Create Task</DialogTitle>
          <DialogDescription>
            Create a reading material, activity, quiz, or exam for your class.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-3 rounded-lg">
            <TabsTrigger value="details" className="rounded-md">
              Details
            </TabsTrigger>
            <TabsTrigger value="topics" className="rounded-md">
              Topics
            </TabsTrigger>
            <TabsTrigger value="files" className="rounded-md">
              Attachments
            </TabsTrigger>
          </TabsList>

          {/* Details Tab */}
          <TabsContent value="details" className="space-y-5 mt-6">
            {/* Task Type Selector */}
            <div>
              <label className="text-sm font-semibold mb-3 block">
                Task Type
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {taskOptions.map((option) => {
                  const Icon = option.icon;
                  const selected = taskType === option.id;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleTaskTypeChange(option.id)}
                      className={cn(
                        'flex items-center gap-3 p-4 rounded-lg border-2 transition-all cursor-pointer text-left',
                        selected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50 bg-card'
                      )}
                    >
                      <div
                        className={cn(
                          'p-2 rounded-lg',
                          selected ? 'bg-primary/20' : 'bg-muted'
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-5 w-5',
                            selected ? 'text-primary' : 'text-muted-foreground'
                          )}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{option.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {option.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <Card className="border-0 bg-muted/30">
              <CardContent className="p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-medium">Selected: {TASK_LABELS[taskType]}</div>
                <Badge variant="secondary" className="rounded-full w-fit">
                  Phase 1 skeleton
                </Badge>
                <p className="text-xs text-muted-foreground sm:ml-2">{TASK_HELP_TEXT[taskType]}</p>
              </CardContent>
            </Card>

            {/* Title */}
            <div>
              <label className="text-sm font-semibold">
                Title <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder={
                  taskType === 'reading_material'
                    ? 'e.g., Chapter 4 Reading Pack'
                    : taskType === 'activity'
                      ? 'e.g., Lab Activity 2'
                      : taskType === 'quiz'
                        ? 'e.g., Chapter 3 Quiz'
                        : 'e.g., Midterm Proctored Exam'
                }
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  clearFieldError('title');
                }}
                className={cn(
                  'mt-2 rounded-lg',
                  errors.title && 'border-destructive'
                )}
              />
              {errors.title && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.title}
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-semibold">Description</label>
              <Textarea
                placeholder={
                  taskType === 'reading_material'
                    ? 'Optional summary, chapter notes, or reading guidance...'
                    : 'Provide instructions, context, or details about the task...'
                }
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-2 rounded-lg resize-none min-h-24"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {description.length}/500 characters
              </p>
            </div>

            {taskType === 'reading_material' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-primary/5 rounded-lg border border-primary/10">
                <div>
                  <label className="text-sm font-semibold">Material Type</label>
                  <Select
                    value={materialType}
                    onValueChange={(value) => setMaterialType(value as MaterialType)}
                  >
                    <SelectTrigger className="mt-2 rounded-lg">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="document">Document</SelectItem>
                      <SelectItem value="link">Link</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-semibold">Resource URL (optional)</label>
                  <Input
                    type="url"
                    placeholder="https://..."
                    value={materialFileUrl}
                    onChange={(e) => setMaterialFileUrl(e.target.value)}
                    className="mt-2 rounded-lg"
                  />
                </div>

                <div className="md:col-span-2">
                  <p className="text-xs text-muted-foreground">
                    Reading open/progress tracking and file-type enforcement are scaffolded for the next phase.
                  </p>
                </div>
              </div>
            )}

            {taskType !== 'reading_material' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-primary/5 rounded-lg border border-primary/10">
                {/* Due Date */}
                <div>
                  <label className="text-sm font-semibold">
                    Due Date <span className="text-destructive">*</span>
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full mt-2 rounded-lg justify-start text-left font-normal',
                          !dueDate && 'text-muted-foreground',
                          errors.dueDate && 'border-destructive'
                        )}
                      >
                        <CalendarIcon className="h-4 w-4 mr-2" />
                        {dueDate ? formatDate(dueDate) : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dueDate}
                        onSelect={(date) => {
                          setDueDate(date);
                          clearFieldError('dueDate');
                        }}
                        disabled={(date) =>
                          date < new Date(new Date().setHours(0, 0, 0, 0))
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  {errors.dueDate && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.dueDate}
                    </p>
                  )}
                </div>

                {/* Points */}
                <div>
                  <label className="text-sm font-semibold">Points</label>
                  <Input
                    type="number"
                    min="0"
                    value={points}
                    onChange={(e) => {
                      setPoints(e.target.value);
                      clearFieldError('points');
                    }}
                    className={cn(
                      'mt-2 rounded-lg',
                      errors.points && 'border-destructive'
                    )}
                  />
                  {errors.points && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.points}
                    </p>
                  )}
                </div>
              </div>
            )}

            {taskType === 'activity' && (
              <Card className="border-0 bg-muted/30">
                <CardContent className="p-4 space-y-2">
                  <p className="text-sm font-semibold">Activity Setup</p>
                  <p className="text-xs text-muted-foreground">
                    This task will use the current Drive-based submission flow and teacher review process.
                  </p>
                  <Badge variant="outline" className="rounded-full text-xs">
                    Current API mapping: assignment_type = activity
                  </Badge>
                </CardContent>
              </Card>
            )}

            {taskType === 'quiz' && (
              <Card className="border-0 bg-muted/30">
                <CardContent className="p-4 space-y-4">
                  <div>
                    <label className="text-sm font-semibold">Question Order Mode</label>
                    <Select
                      value={quizQuestionOrder}
                      onValueChange={(value) => setQuizQuestionOrder(value as 'sequence' | 'random')}
                    >
                      <SelectTrigger className="mt-2 rounded-lg">
                        <SelectValue placeholder="Select order mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sequence">Sequential</SelectItem>
                        <SelectItem value="random">Randomized</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Multi-item question builder is scaffolded in this phase and will be connected to backend support next.
                  </p>
                  <Badge variant="outline" className="rounded-full text-xs">
                    Current API mapping: assignment_type = quiz
                  </Badge>
                </CardContent>
              </Card>
            )}

            {taskType === 'exam' && (
              <Card className="border-0 bg-muted/30">
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold">Question Selection</label>
                      <Select
                        value={examQuestionSelection}
                        onValueChange={(value) => setExamQuestionSelection(value as 'sequence' | 'random')}
                      >
                        <SelectTrigger className="mt-2 rounded-lg">
                          <SelectValue placeholder="Select strategy" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="random">Randomized</SelectItem>
                          <SelectItem value="sequence">Sequential</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm font-semibold">Integrity Profile</label>
                      <Select
                        value={examIntegrityProfile}
                        onValueChange={(value) => setExamIntegrityProfile(value as 'standard' | 'strict')}
                      >
                        <SelectTrigger className="mt-2 rounded-lg">
                          <SelectValue placeholder="Select integrity profile" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="strict">Strict</SelectItem>
                          <SelectItem value="standard">Standard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Agreement gate, chapter pools, and auto-submit policy controls are scaffolded in this phase while
                    preserving the current proctored exam backend behavior.
                  </p>
                  <Badge variant="outline" className="rounded-full text-xs">
                    Current API mapping: assignment_type = exam
                  </Badge>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Topics Tab */}
          <TabsContent value="topics" className="space-y-4 mt-6">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Organize your task by adding topics. Students can filter
                by topics to find relevant content.
              </p>

              {/* Topics List */}
              {topics.length > 0 && (
                <div className="space-y-2 mb-4">
                  {topics.map((topic) => (
                    <div
                      key={topic.id}
                      className="flex items-center justify-between p-3 bg-card border border-border rounded-lg"
                    >
                      <span className="text-sm font-medium">{topic.name}</span>
                      <button
                        onClick={() => removeTopic(topic.id)}
                        className="p-1 hover:bg-destructive/10 rounded transition-colors"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Topic */}
              {!showTopicInput ? (
                <Button
                  variant="outline"
                  className="w-full rounded-lg gap-2"
                  onClick={() => setShowTopicInput(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add Topic
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g., Vectors, Functions, Data structures..."
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTopic();
                      }
                    }}
                    className="rounded-lg"
                    autoFocus
                  />
                  <Button
                    size="icon"
                    className="rounded-lg shrink-0"
                    onClick={addTopic}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="rounded-lg shrink-0"
                    onClick={() => {
                      setShowTopicInput(false);
                      setNewTopic('');
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* No topics message */}
              {topics.length === 0 && !showTopicInput && (
                <Card className="border-0 bg-muted/30">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">
                      No topics added yet. Topics help organize content and
                      improve discoverability.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Files Tab */}
          <TabsContent value="files" className="space-y-4 mt-6">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Attach supporting files such as PDFs, documents, images, or presentations.
              </p>

              {/* File Upload Area */}
              <div className="relative">
                <input
                  type="file"
                  multiple
                  onChange={handleFileAttach}
                  className="hidden"
                  id="file-input"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.mp4,.zip"
                />
                <label
                  htmlFor="file-input"
                  className="block p-6 border-2 border-dashed border-border rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors text-center"
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="p-2 bg-primary/10 rounded-lg w-fit">
                      <Paperclip className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-sm font-medium">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PDF, Word, Excel, PowerPoint, Images, or ZIP files
                    </p>
                  </div>
                </label>
              </div>

              {/* Files List */}
              {files.length > 0 && (
                <div className="space-y-2 mt-4">
                  <p className="text-sm font-semibold">Attached Files</p>
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-3 bg-card border border-border rounded-lg group hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="p-2 bg-primary/10 rounded flex-shrink-0">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {file.size}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFile(file.id)}
                        className="p-1 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 rounded transition-all"
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* No files message */}
              {files.length === 0 && (
                <Card className="border-0 bg-muted/30 mt-4">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">
                      No files attached yet. Add files to provide students with
                      resources.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-6">
          <Button
            variant="outline"
            className="rounded-lg"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button className="rounded-lg gap-2" onClick={handleCreate}>
            <FileText className="h-4 w-4" />
            {createTaskButtonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
