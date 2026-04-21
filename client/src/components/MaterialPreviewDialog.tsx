import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { LearningMaterial } from '@/lib/data';

interface MaterialPreviewDialogProps {
  open: boolean;
  material: LearningMaterial | null;
  onOpenChange: (open: boolean) => void;
  onDownload?: (material: LearningMaterial) => void;
}

export function MaterialPreviewDialog({
  open,
  material,
  onOpenChange,
  onDownload,
}: MaterialPreviewDialogProps) {
  if (!material) {
    return null;
  }

  const hasUrl = Boolean(material.url);
  const isImage = material.fileType === 'image';
  const isVideo = material.fileType === 'video';
  const getUrlExtension = (url?: string): string => {
    if (!url) {
      return '';
    }

    try {
      const parsed = new URL(url);
      const segment = parsed.pathname.split('/').pop() || '';
      const extension = segment.includes('.') ? segment.split('.').pop() : '';
      return (extension || '').toLowerCase();
    } catch {
      const sanitized = url.split('?')[0].split('#')[0];
      const segment = sanitized.split('/').pop() || '';
      const extension = segment.includes('.') ? segment.split('.').pop() : '';
      return (extension || '').toLowerCase();
    }
  };
  const fileExtension = getUrlExtension(material.url);
  const isPdf = material.fileType === 'pdf' || fileExtension === 'pdf';
  const canInlinePreview = isImage || isVideo || isPdf;

  const renderPreview = () => {
    if (!material.url) {
      return (
        <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          This material does not have a file URL yet.
        </div>
      );
    }

    if (isImage) {
      return (
        <div className="rounded-lg border border-border bg-muted/20 p-2">
          <img
            src={material.url}
            alt={material.title}
            className="max-h-[65vh] w-full rounded object-contain"
          />
        </div>
      );
    }

    if (isVideo) {
      return (
        <div className="rounded-lg border border-border bg-muted/20 p-2">
          <video
            controls
            className="max-h-[65vh] w-full rounded"
            src={material.url}
          >
            Your browser does not support this video format.
          </video>
        </div>
      );
    }

    if (isPdf) {
      return (
        <div className="rounded-lg border border-border overflow-hidden bg-muted/20">
          <iframe
            src={material.url}
            title={material.title}
            className="h-[65vh] w-full"
          />
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">Inline preview is not available for this file type.</p>
        <p>Use the Download button to view the file in your device app.</p>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-dvw sm:max-w-4xl rounded-xl">
        <DialogHeader>
          <DialogTitle className="line-clamp-1">{material.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {renderPreview()}

          {hasUrl && onDownload ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onDownload(material)}
              >
                Download
              </Button>
            </div>
          ) : null}

          {hasUrl && !canInlinePreview ? (
            <p className="text-xs text-muted-foreground">
              Open will no longer auto-download files. Download manually when needed.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
