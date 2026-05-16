import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { AlertCircle, Calendar as CalendarIcon } from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';

export type ProjectGroupMode = 'individual' | 'group';

const PROJECT_FILE_TYPE_OPTIONS = [
  { value: 'pdf', label: 'PDF' },
  { value: 'docx', label: 'DOCX' },
  { value: 'pptx', label: 'PPTX' },
  { value: 'xlsx', label: 'XLSX' },
  { value: 'png', label: 'PNG/JPG' },
  { value: 'zip', label: 'ZIP' },
  { value: 'mp4', label: 'MP4' },
];

interface ProjectFormProps {
  projectGroupMode: ProjectGroupMode;
  setProjectGroupMode: (v: ProjectGroupMode) => void;
  projectGroupSize: string;
  setProjectGroupSize: (v: string) => void;
  projectAllowedFileTypes: string[];
  toggleProjectFileType: (fileType: string, checked: boolean) => void;
  submissionsOpen: boolean;
  setSubmissionsOpen: (v: boolean) => void;
  autoCloseSubmissionsOnDueDate: boolean;
  setAutoCloseSubmissionsOnDueDate: (v: boolean) => void;
  customSubmissionCloseDate: Date | undefined;
  setCustomSubmissionCloseDate: (v: Date | undefined) => void;
  projectFileTypesError?: string;
  customSubmissionCloseDateError?: string;
  clearFieldError: (field: string) => void;
}

export function ProjectForm({
  projectGroupMode,
  setProjectGroupMode,
  projectGroupSize,
  setProjectGroupSize,
  projectAllowedFileTypes,
  toggleProjectFileType,
  submissionsOpen,
  setSubmissionsOpen,
  autoCloseSubmissionsOnDueDate,
  setAutoCloseSubmissionsOnDueDate,
  customSubmissionCloseDate,
  setCustomSubmissionCloseDate,
  projectFileTypesError,
  customSubmissionCloseDateError,
  clearFieldError,
}: ProjectFormProps) {
  return (
    <Card className="border border-orange-200 bg-orange-50/60">
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold">Project Type</label>
            <div className="mt-2 flex gap-2">
              {(['individual', 'group'] as ProjectGroupMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setProjectGroupMode(mode)}
                  className={cn(
                    'flex-1 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all',
                    projectGroupMode === mode
                      ? 'border-orange-400 bg-orange-100 text-orange-800'
                      : 'border-border bg-background text-muted-foreground hover:border-orange-200'
                  )}
                >
                  {mode === 'individual' ? 'Individual' : 'Group'}
                </button>
              ))}
            </div>
          </div>

          {projectGroupMode === 'group' && (
            <div>
              <label className="text-sm font-semibold">Max Group Size</label>
              <Input
                type="number"
                min="2"
                max="20"
                value={projectGroupSize}
                onChange={(e) => setProjectGroupSize(e.target.value)}
                className="mt-2 rounded-lg"
                placeholder="e.g. 4"
              />
              <p className="text-xs text-muted-foreground mt-1">Minimum 2 members per group.</p>
            </div>
          )}
        </div>

        <div>
          <label className="text-sm font-semibold">Allowed Deliverable File Types</label>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-lg border border-orange-200/70 bg-background p-3">
            {PROJECT_FILE_TYPE_OPTIONS.map((option) => {
              const checked = projectAllowedFileTypes.includes(option.value);
              return (
                <label key={option.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => toggleProjectFileType(option.value, Boolean(value))}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
          {projectFileTypesError && (
            <p className="text-xs text-destructive mt-2 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {projectFileTypesError}
            </p>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-orange-200/70 bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Allow submissions</p>
              <p className="text-xs text-muted-foreground">Teachers can manually stop submissions anytime.</p>
            </div>
            <Switch checked={submissionsOpen} onCheckedChange={setSubmissionsOpen} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Automatically stop on due date</p>
              <p className="text-xs text-muted-foreground">When enabled, submissions close at the due date.</p>
            </div>
            <Switch
              checked={autoCloseSubmissionsOnDueDate}
              onCheckedChange={setAutoCloseSubmissionsOnDueDate}
              disabled={!submissionsOpen}
            />
          </div>

          {submissionsOpen && !autoCloseSubmissionsOnDueDate && (
            <div>
              <label className="text-sm font-semibold">Custom Submission Close Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full mt-2 rounded-lg justify-start text-left font-normal',
                      !customSubmissionCloseDate && 'text-muted-foreground',
                      customSubmissionCloseDateError && 'border-destructive'
                    )}
                  >
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {customSubmissionCloseDate ? formatDate(customSubmissionCloseDate) : 'Pick custom close date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customSubmissionCloseDate}
                    onSelect={(date) => {
                      setCustomSubmissionCloseDate(date);
                      clearFieldError('customSubmissionCloseDate');
                    }}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {customSubmissionCloseDateError && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {customSubmissionCloseDateError}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-full text-xs bg-background">
            {projectGroupMode === 'group' ? `Group project (max ${projectGroupSize || '?'})` : 'Individual project'}
          </Badge>
          <Badge variant="outline" className="rounded-full text-xs bg-background">
            Graded manually by teacher
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
