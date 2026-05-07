import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Button } from '@/components/ui/button';
import { AlertCircle, Calendar as CalendarIcon } from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';

export type ActivityMode = 'essay_writing' | 'group_activity' | 'assignment';

const ACTIVITY_FILE_TYPE_OPTIONS = [
  { value: 'pdf', label: 'PDF' },
  { value: 'docx', label: 'DOCX' },
  { value: 'pptx', label: 'PPTX' },
  { value: 'xlsx', label: 'XLSX' },
  { value: 'png', label: 'PNG/JPG' },
  { value: 'zip', label: 'ZIP' },
];

interface ActivityFormProps {
  activityMode: ActivityMode;
  setActivityMode: (v: ActivityMode) => void;
  activityAllowedFileTypes: string[];
  toggleActivityFileType: (fileType: string, checked: boolean) => void;
  submissionsOpen: boolean;
  setSubmissionsOpen: (v: boolean) => void;
  autoCloseSubmissionsOnDueDate: boolean;
  setAutoCloseSubmissionsOnDueDate: (v: boolean) => void;
  customSubmissionCloseDate: Date | undefined;
  setCustomSubmissionCloseDate: (v: Date | undefined) => void;
  activityFileTypesError?: string;
  customSubmissionCloseDateError?: string;
  clearFieldError: (field: string) => void;
}

export function ActivityForm({
  activityMode,
  setActivityMode,
  activityAllowedFileTypes,
  toggleActivityFileType,
  submissionsOpen,
  setSubmissionsOpen,
  autoCloseSubmissionsOnDueDate,
  setAutoCloseSubmissionsOnDueDate,
  customSubmissionCloseDate,
  setCustomSubmissionCloseDate,
  activityFileTypesError,
  customSubmissionCloseDateError,
  clearFieldError,
}: ActivityFormProps) {
  return (
    <Card className="border border-sky-200 bg-sky-50/60">
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold">Activity Format</label>
            <Select value={activityMode} onValueChange={(value) => setActivityMode(value as ActivityMode)}>
              <SelectTrigger className="mt-2 rounded-lg bg-background">
                <SelectValue placeholder="Choose format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="essay_writing">Essay Writing</SelectItem>
                <SelectItem value="group_activity">Group Activity</SelectItem>
                <SelectItem value="assignment">Assignment</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-semibold">Allowed Submission File Types</label>
            <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-sky-200/70 bg-background p-3">
              {ACTIVITY_FILE_TYPE_OPTIONS.map((option) => {
                const checked = activityAllowedFileTypes.includes(option.value);
                return (
                  <label key={option.value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => toggleActivityFileType(option.value, Boolean(value))}
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
            {activityFileTypesError && (
              <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {activityFileTypesError}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-sky-200/70 bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Allow student submissions</p>
              <p className="text-xs text-muted-foreground">Teachers can manually stop submissions anytime.</p>
            </div>
            <Switch checked={submissionsOpen} onCheckedChange={setSubmissionsOpen} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Automatically stop on due date</p>
              <p className="text-xs text-muted-foreground">When enabled, submission close time follows the due date.</p>
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
            Storage: Institutional Google Drive
          </Badge>
          <Badge variant="outline" className="rounded-full text-xs bg-background">
            Graded manually by teacher
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
