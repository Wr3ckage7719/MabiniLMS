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

    return (
      <div className="rounded-lg border border-border overflow-hidden bg-muted/20">
        <iframe
          src={material.url}
          title={material.title}
          className="h-[65vh] w-full"
        />
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
