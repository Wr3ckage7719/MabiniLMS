import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { PptxSlidePreview } from '@/lib/material-preview';

interface PptxPreviewProps {
  title: string;
  pptxSlides: PptxSlidePreview[];
  pptxLoading: boolean;
  pptxError: string | null;
  pptPreviewMode: 'true-content' | 'extracted';
  setPptPreviewMode: (mode: 'true-content' | 'extracted') => void;
  currentSlideIndex: number;
  currentPptxSlide: PptxSlidePreview | null;
  pptxOfficeEmbedUrl: string | null;
  goToNextSlide: () => void;
  goToPreviousSlide: () => void;
  markInteraction: () => void;
}

export function PptxPreview({
  title,
  pptxSlides,
  pptxLoading,
  pptxError,
  pptPreviewMode,
  setPptPreviewMode,
  currentSlideIndex,
  currentPptxSlide,
  pptxOfficeEmbedUrl,
  goToNextSlide,
  goToPreviousSlide,
  markInteraction,
}: PptxPreviewProps) {
  if (pptPreviewMode === 'true-content') {
    return (
      <div className="rounded-lg border border-border bg-background p-2 sm:p-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Badge variant="outline">True Slide View</Badge>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="default" onClick={() => { markInteraction(); setPptPreviewMode('true-content'); }}>
              True PPT
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { markInteraction(); setPptPreviewMode('extracted'); }}>
              Extracted
            </Button>
          </div>
        </div>

        {pptxOfficeEmbedUrl ? (
          <div className="rounded-lg border border-border overflow-hidden bg-muted/20 h-[calc(100dvh-16rem)] min-h-[22rem] sm:h-[calc(100dvh-22rem)] sm:min-h-[24rem]">
            <iframe src={pptxOfficeEmbedUrl} title={`${title} (True PPT preview)`} className="h-full w-full" />
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            True PPT preview is unavailable for this file URL. Switch to Extracted view or use Download.
          </div>
        )}

        {pptxSlides.length > 0 ? (
          <div className="rounded-md border border-border/70 bg-muted/20 p-3 space-y-2">
            <p className="text-xs font-medium text-foreground">
              Slide activity: {Math.min(currentSlideIndex + 1, pptxSlides.length)} / {pptxSlides.length}
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={goToPreviousSlide} disabled={currentSlideIndex === 0}>
                Previous Slide
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={goToNextSlide} disabled={currentSlideIndex >= pptxSlides.length - 1}>
                Next Slide
              </Button>
            </div>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          This mode preserves the real slide layout when the PPT URL is publicly reachable. Use slide activity buttons above to track reading progress.
        </p>
      </div>
    );
  }

  if (pptxLoading) {
    return (
      <div className="rounded-lg border border-border p-6 bg-muted/20 text-sm text-muted-foreground">
        Converting PPTX slides for preview...
      </div>
    );
  }

  if (pptxError) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">Presentation conversion failed.</p>
        <p>{pptxError}</p>
        <p>Use Download to open this slide deck in your presentation app.</p>
      </div>
    );
  }

  if (!currentPptxSlide) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">No slides were found in this presentation.</p>
        <p>Use Download to review the full file in your presentation app.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-background p-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Badge variant="outline">
          Slide {currentPptxSlide.slideNumber} of {pptxSlides.length}
        </Badge>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => { markInteraction(); setPptPreviewMode('true-content'); }}>
            True PPT
          </Button>
          <Button type="button" size="sm" variant="default" onClick={() => { markInteraction(); setPptPreviewMode('extracted'); }}>
            Extracted
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={goToPreviousSlide} disabled={currentSlideIndex === 0}>
            Previous
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={goToNextSlide} disabled={currentSlideIndex >= pptxSlides.length - 1}>
            Next
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-muted/20 p-6 min-h-[50vh]">
        {currentPptxSlide.imageDataUrl ? (
          <img
            src={currentPptxSlide.imageDataUrl}
            alt={`Slide ${currentPptxSlide.slideNumber}`}
            className="mb-5 max-h-[56vh] w-full rounded object-contain border border-border/70 bg-white"
          />
        ) : null}

        <h3 className="text-lg font-semibold text-foreground mb-3">
          {currentPptxSlide.title}
        </h3>

        {currentPptxSlide.lines.length > 1 ? (
          <ul className="list-disc pl-5 space-y-2 text-sm text-foreground">
            {currentPptxSlide.lines.slice(1).map((line, index) => (
              <li key={`${currentPptxSlide.slideNumber}-${index}`}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            This slide does not contain additional text bullets.
          </p>
        )}
      </div>
    </div>
  );
}
