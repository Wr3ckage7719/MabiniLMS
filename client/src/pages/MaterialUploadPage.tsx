import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  FileText,
  Loader2,
  Paperclip,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useTeacherLesson } from '@/hooks-api/useLessons';
import { materialsService, type MaterialType } from '@/services/materials.service';

const ACCEPTED_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'mp4', 'webm'];

const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/gif',
  'video/mp4',
  'video/webm',
]);

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

const getExtension = (name: string): string => {
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex === -1) return '';
  return name.slice(dotIndex + 1).toLowerCase();
};

const inferMaterialType = (file: File): MaterialType | null => {
  const mime = (file.type || '').toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'video/mp4' || mime === 'video/webm') return 'video';
  if (ACCEPTED_MIME_TYPES.has(mime)) return 'document';

  const ext = getExtension(file.name);
  if (ext === 'pdf') return 'pdf';
  if (ext === 'mp4' || ext === 'webm') return 'video';
  if (ACCEPTED_EXTENSIONS.includes(ext)) return 'document';
  return null;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const stripExtension = (name: string): string => {
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex === -1) return name;
  return name.slice(0, dotIndex);
};

export default function MaterialUploadPage() {
  const { id, lessonId } = useParams();
  const classId = id ?? '';
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const lessonQuery = useTeacherLesson(classId, lessonId);
  const lesson = lessonQuery.data ?? null;

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [titleEdited, setTitleEdited] = useState(false);

  useEffect(() => {
    if (file && !titleEdited) {
      setTitle(stripExtension(file.name));
    }
  }, [file, titleEdited]);

  const inferredType = useMemo(() => (file ? inferMaterialType(file) : null), [file]);
  const inferredTypeLabel = useMemo(() => {
    if (!file) return null;
    const ext = getExtension(file.name).toUpperCase();
    return ext || (file.type || '').toUpperCase();
  }, [file]);

  const goBack = () => {
    if (lessonId) {
      navigate(`/class/${classId}/lessons/${lessonId}/edit`);
    } else {
      navigate(`/class/${classId}`);
    }
  };

  const handleFilePick = (next: File | null) => {
    setError(null);
    if (!next) {
      setFile(null);
      return;
    }

    if (next.size > MAX_FILE_SIZE_BYTES) {
      setError(`File is too large. Maximum is ${formatBytes(MAX_FILE_SIZE_BYTES)}.`);
      return;
    }

    const inferred = inferMaterialType(next);
    if (!inferred) {
      setError('Unsupported file type. Allowed: PDF, DOCX, PPTX, images, MP4, WEBM.');
      return;
    }

    setFile(next);
  };

  const handleDrop: React.DragEventHandler<HTMLLabelElement> = (event) => {
    event.preventDefault();
    if (uploading) return;
    const dropped = event.dataTransfer.files?.[0] || null;
    handleFilePick(dropped);
  };

  const handleSubmit = async () => {
    if (uploading) return;
    if (!file) {
      setError('Choose a file to upload.');
      return;
    }
    if (!title.trim()) {
      setError('Enter a title for this material.');
      return;
    }
    if (!classId || !lessonId) {
      setError('Missing class or lesson context.');
      return;
    }

    const resolvedType = inferMaterialType(file);
    if (!resolvedType) {
      setError('Unsupported file type.');
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      await materialsService.create(
        classId,
        {
          title: title.trim(),
          type: resolvedType,
          file,
          lesson_id: lessonId,
        },
        {
          onUploadProgress: (event) => {
            const total = event.total || file.size;
            if (!total) return;
            const percent = Math.round((event.loaded / total) * 100);
            setProgress(Math.min(100, Math.max(0, percent)));
          },
        }
      );

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['materials', classId] }),
        queryClient.invalidateQueries({ queryKey: ['lessons', 'teacher', classId] }),
        queryClient.invalidateQueries({ queryKey: ['lessons', 'student', classId] }),
      ]);

      toast({
        title: 'Reading material added',
        description: 'The file is now attached to this lesson.',
      });
      goBack();
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        || (err as Error)?.message
        || 'Upload failed. Please try again.';
      setError(message);
      toast({ title: 'Upload failed', description: message, variant: 'destructive' });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-xl gap-1.5"
            onClick={goBack}
            disabled={uploading}
          >
            <ArrowLeft className="h-4 w-4" /> Back to lesson
          </Button>
          <div className="ml-auto text-xs text-muted-foreground truncate">
            {lesson ? `Lesson · ${lesson.title}` : null}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 md:px-6 py-6 space-y-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Add reading material</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Upload a PDF, DOCX, PPT, image, or video. Students view it in-app, page by page,
              and progress is tracked automatically.
            </p>
          </div>
        </div>

        <Card className="border shadow-sm">
          <CardContent className="p-5 md:p-6 space-y-5">
            <div>
              <Label className="text-sm font-semibold">File</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.mp4,.webm"
                className="hidden"
                onChange={(event) => handleFilePick(event.target.files?.[0] || null)}
              />

              {!file ? (
                <label
                  htmlFor=""
                  onClick={(event) => {
                    event.preventDefault();
                    if (!uploading) fileInputRef.current?.click();
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDrop}
                  className={cn(
                    'mt-2 block rounded-xl border-2 border-dashed bg-muted/30 p-8 text-center transition-colors',
                    uploading
                      ? 'cursor-not-allowed opacity-60'
                      : 'cursor-pointer hover:bg-muted/50'
                  )}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="rounded-lg bg-primary/10 p-3">
                      <Paperclip className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-sm font-medium">Click to upload or drag and drop</p>
                    <p className="text-xs text-muted-foreground">
                      PDF, DOCX, PPT, images, MP4/WEBM · max {formatBytes(MAX_FILE_SIZE_BYTES)}
                    </p>
                  </div>
                </label>
              ) : (
                <div className="mt-2 rounded-xl border bg-card p-4 flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2 flex-shrink-0">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {inferredTypeLabel} · {formatBytes(file.size)}
                    </p>
                  </div>
                  <Badge variant="secondary" className="rounded-full text-[10px]">
                    Compatible
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => {
                      setFile(null);
                      setProgress(0);
                      setTitleEdited(false);
                      setTitle('');
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    disabled={uploading}
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="material-title" className="text-sm font-semibold">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="material-title"
                placeholder="e.g., Chapter 4 Reading Pack"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setTitleEdited(true);
                }}
                className="mt-2 rounded-lg"
                disabled={uploading}
              />
            </div>

            <div>
              <Label htmlFor="material-description" className="text-sm font-semibold">
                Description <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="material-description"
                placeholder="Reading guidance, chapter notes, or context..."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className="mt-2 rounded-lg"
                disabled={uploading}
              />
            </div>

            {error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {uploading ? (
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Uploading {file?.name || 'file'}...
                  </span>
                  <span className="text-xs text-muted-foreground">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Please keep this page open until upload completes.
                </p>
              </div>
            ) : null}

            {file && !uploading ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Detected file type: <strong>{inferredType?.toUpperCase()}</strong> · ready to publish.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </main>

      <footer className="sticky bottom-0 z-30 border-t bg-background/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-3 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={goBack}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button
            className="rounded-xl gap-1.5"
            onClick={() => void handleSubmit()}
            disabled={uploading || !file || !title.trim()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {uploading ? `Uploading ${progress}%` : 'Publish reading material'}
          </Button>
        </div>
      </footer>
    </div>
  );
}
