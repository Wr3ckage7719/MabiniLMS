import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type RecitationMode = 'in_class_oral' | 'recorded_video';

interface RecitationFormProps {
  recitationMode: RecitationMode;
  setRecitationMode: (v: RecitationMode) => void;
  recitationCriteria: string;
  setRecitationCriteria: (v: string) => void;
  submissionsOpen: boolean;
  setSubmissionsOpen: (v: boolean) => void;
}

export function RecitationForm({
  recitationMode,
  setRecitationMode,
  recitationCriteria,
  setRecitationCriteria,
  submissionsOpen,
  setSubmissionsOpen,
}: RecitationFormProps) {
  return (
    <Card className="border border-cyan-200 bg-cyan-50/60">
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold">Recitation Format</label>
            <Select value={recitationMode} onValueChange={(v) => setRecitationMode(v as RecitationMode)}>
              <SelectTrigger className="mt-2 rounded-lg bg-background">
                <SelectValue placeholder="Choose format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_class_oral">In-Class Oral</SelectItem>
                <SelectItem value="recorded_video">Recorded Video</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {recitationMode === 'in_class_oral'
                ? 'Teacher grades students live during class — no file submission required.'
                : 'Students record and upload a video response for asynchronous grading.'}
            </p>
          </div>

          <div>
            <label className="text-sm font-semibold">
              {recitationMode === 'in_class_oral' ? 'Accept Submissions' : 'Allow Video Uploads'}
            </label>
            <div className="mt-2 flex items-center gap-3 rounded-lg border border-cyan-200/70 bg-background p-3">
              <Switch checked={submissionsOpen} onCheckedChange={setSubmissionsOpen} />
              <span className="text-sm">{submissionsOpen ? 'Open' : 'Closed'}</span>
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold">Grading Criteria / Rubric</label>
          <Textarea
            placeholder="e.g., Clarity (30%), Content accuracy (40%), Delivery (30%)..."
            value={recitationCriteria}
            onChange={(e) => setRecitationCriteria(e.target.value)}
            className="mt-2 rounded-lg resize-none min-h-20"
          />
          <p className="text-xs text-muted-foreground mt-1">Optional. Helps students understand grading expectations.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-full text-xs bg-background">
            {recitationMode === 'in_class_oral' ? 'Live oral assessment' : 'Video submission'}
          </Badge>
          <Badge variant="outline" className="rounded-full text-xs bg-background">
            Graded manually by teacher
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
