import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

interface ReadingMaterialFormProps {
  readingProgressTracking: boolean;
  setReadingProgressTracking: (v: boolean) => void;
  readingSingleResourceMode: boolean;
  setReadingSingleResourceMode: (v: boolean) => void;
  readingMaterialFileError?: string;
}

export function ReadingMaterialForm({
  readingProgressTracking,
  setReadingProgressTracking,
  readingSingleResourceMode,
  setReadingSingleResourceMode,
  readingMaterialFileError,
}: ReadingMaterialFormProps) {
  return (
    <Card className="border border-emerald-200 bg-emerald-50/60">
      <CardContent className="p-4 space-y-4">
        <div className="rounded-lg border border-emerald-200/80 bg-background px-3 py-2">
          <p className="text-sm font-medium">File type is auto-detected from your upload</p>
          <p className="text-xs text-muted-foreground">Unsupported files are rejected automatically.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-center justify-between rounded-lg border border-emerald-200/80 bg-background px-3 py-2">
            <div>
              <p className="text-sm font-medium">Track per-student reading progress</p>
              <p className="text-xs text-muted-foreground">Monitor who opened the material and completion progress.</p>
            </div>
            <Switch checked={readingProgressTracking} onCheckedChange={setReadingProgressTracking} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-emerald-200/80 bg-background px-3 py-2">
            <div>
              <p className="text-sm font-medium">Single resource type per material</p>
              <p className="text-xs text-muted-foreground">Keep content format consistent and straightforward for students.</p>
            </div>
            <Switch checked={readingSingleResourceMode} onCheckedChange={setReadingSingleResourceMode} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-background">
            Source storage: In-app secured storage
          </span>
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-background">
            Progress tracking: {readingProgressTracking ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        {readingMaterialFileError && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {readingMaterialFileError}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
