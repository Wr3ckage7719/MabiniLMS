import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { trackDownload, trackScrollProgress, trackViewEnd, trackViewStart } from '@/lib/material-actions';
import { convertDocxToHtml, convertPptxToSlides, type PptxSlidePreview } from '@/lib/material-preview';
import { useEngagementStats } from '@/hooks-api/useMaterials';
import type { LearningMaterial } from '@/lib/data';

interface MaterialPreviewDialogProps {
  open: boolean;
  material: LearningMaterial | null;
  onOpenChange: (open: boolean) => void;
  onDownload?: (material: LearningMaterial) => void;
  isTeacher?: boolean;
  courseId?: string;
}

export function MaterialPreviewDialog({
  open,
  material,
  onOpenChange,
  onDownload,
  isTeacher = false,
  courseId,
}: MaterialPreviewDialogProps) {
  const [scrollPercent, setScrollPercent] = useState(0);
  const [lastTrackedScroll, setLastTrackedScroll] = useState(0);
  const [activeTab, setActiveTab] = useState('preview');
  const [previewStartedAt, setPreviewStartedAt] = useState<number | null>(null);
  const [highestScrollPercent, setHighestScrollPercent] = useState(0);
  const [pagesViewed, setPagesViewed] = useState<number[]>([]);
  const [docxHtml, setDocxHtml] = useState('');
  const [docxLoading, setDocxLoading] = useState(false);
  const [docxError, setDocxError] = useState<string | null>(null);
  const [pptxSlides, setPptxSlides] = useState<PptxSlidePreview[]>([]);
  const [pptxLoading, setPptxLoading] = useState(false);
  const [pptxError, setPptxError] = useState<string | null>(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollTrackingTimeoutRef = useRef<number | null>(null);
  const lastTrackedSlideRef = useRef<number | null>(null);

  const canFetchEngagement = isTeacher && open && activeTab === 'engagement' && Boolean(material?.id);
  const { data: engagementStats = [], isLoading: engagementLoading } = useEngagementStats(
    material?.id,
    canFetchEngagement
  );

  const hasUrl = Boolean(material?.url);
  const isImage = material?.fileType === 'image';
  const isVideo = material?.fileType === 'video';
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
  const fileExtension = getUrlExtension(material?.url);
  const isPdf = material?.fileType === 'pdf' || fileExtension === 'pdf';
  const isDoc = material?.fileType === 'doc' || fileExtension === 'doc' || fileExtension === 'docx';
  const isPresentation = material?.fileType === 'presentation' || fileExtension === 'ppt' || fileExtension === 'pptx';
  const canInlinePreview = isImage || isVideo || isPdf || isDoc || isPresentation;

  const currentPptxSlide = pptxSlides[currentSlideIndex] || null;

  const teacherAverageProgress = useMemo(() => {
    if (!engagementStats.length) {
      return 0;
    }

    const total = engagementStats.reduce((sum, item) => sum + (item.progress_percent || 0), 0);
    return Math.round((total / engagementStats.length) * 100) / 100;
  }, [engagementStats]);

  useEffect(() => {
    if (!open || !material) {
      return;
    }

    setActiveTab('preview');
    setScrollPercent(0);
    setLastTrackedScroll(0);
    setHighestScrollPercent(0);
    setPagesViewed([]);
    setDocxHtml('');
    setDocxError(null);
    setDocxLoading(false);
    setPptxSlides([]);
    setPptxError(null);
    setPptxLoading(false);
    setCurrentSlideIndex(0);
    lastTrackedSlideRef.current = null;
    setPreviewStartedAt(Date.now());
    if (!isTeacher) {
      void trackViewStart(material.id);
    }
  }, [open, material, isTeacher]);

  useEffect(() => {
    if (!open || !material?.url || !isDoc) {
      return;
    }

    let active = true;
    setDocxLoading(true);
    setDocxError(null);

    void convertDocxToHtml(material.url)
      .then((html) => {
        if (!active) {
          return;
        }

        setDocxHtml(html);
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setDocxError(error instanceof Error ? error.message : 'Failed to render DOCX preview');
      })
      .finally(() => {
        if (!active) {
          return;
        }

        setDocxLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, isDoc, material?.id, material?.url]);

  useEffect(() => {
    if (!open || !material?.url || !isPresentation) {
      return;
    }

    let active = true;
    setPptxLoading(true);
    setPptxError(null);

    void convertPptxToSlides(material.url)
      .then((slides) => {
        if (!active) {
          return;
        }

        setPptxSlides(slides);
        setCurrentSlideIndex(0);
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setPptxError(error instanceof Error ? error.message : 'Failed to convert PPTX for preview');
      })
      .finally(() => {
        if (!active) {
          return;
        }

        setPptxLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, isPresentation, material?.id, material?.url]);

  useEffect(() => {
    if (!open || !material || !isPresentation || pptxSlides.length === 0) {
      return;
    }

    const slideNumber = Math.min(currentSlideIndex + 1, pptxSlides.length);
    const nextProgress = Math.round(((slideNumber / pptxSlides.length) * 100) * 100) / 100;
    const mergedPages = pagesViewed.includes(slideNumber)
      ? pagesViewed
      : [...pagesViewed, slideNumber].sort((a, b) => a - b);

    setScrollPercent(nextProgress);
    setHighestScrollPercent((previous) => Math.max(previous, nextProgress));

    if (!pagesViewed.includes(slideNumber)) {
      setPagesViewed(mergedPages);
    }

    if (isTeacher || lastTrackedSlideRef.current === slideNumber) {
      return;
    }

    lastTrackedSlideRef.current = slideNumber;
    void trackScrollProgress(material.id, {
      scrollPercent: nextProgress,
      pageNumber: slideNumber,
      pagesViewed: mergedPages,
    });
  }, [open, material, isPresentation, pptxSlides, currentSlideIndex, pagesViewed, isTeacher]);

  useEffect(() => {
    if (!open || !material || !previewStartedAt) {
      return;
    }

    return () => {
      const timeSpentSeconds = Math.max(0, Math.round((Date.now() - previewStartedAt) / 1000));
      const completed = highestScrollPercent >= 95;
      const finalPageNumber = isPresentation && pptxSlides.length > 0
        ? Math.min(currentSlideIndex + 1, pptxSlides.length)
        : pagesViewed[pagesViewed.length - 1];

      if (!isTeacher) {
        void trackViewEnd(material.id, {
          timeSpentSeconds,
          finalScrollPercent: highestScrollPercent,
          completed,
          pageNumber: finalPageNumber,
        });
      }
    };
  }, [
    open,
    material,
    previewStartedAt,
    highestScrollPercent,
    pagesViewed,
    isTeacher,
    isPresentation,
    currentSlideIndex,
    pptxSlides,
  ]);

  const handleScroll = useCallback(() => {
    const container = previewContainerRef.current;
    if (!container || !material || isTeacher || isPresentation) {
      return;
    }

    const scrollHeight = container.scrollHeight - container.clientHeight;
    if (scrollHeight <= 0) {
      return;
    }

    const nextPercent = Math.min(100, Math.max(0, (container.scrollTop / scrollHeight) * 100));
    const normalizedPercent = Math.round(nextPercent * 100) / 100;
    setScrollPercent(normalizedPercent);
    setHighestScrollPercent((current) => Math.max(current, normalizedPercent));

    if (Math.abs(normalizedPercent - lastTrackedScroll) < 5) {
      return;
    }

    setLastTrackedScroll(normalizedPercent);
    if (scrollTrackingTimeoutRef.current) {
      window.clearTimeout(scrollTrackingTimeoutRef.current);
    }

    scrollTrackingTimeoutRef.current = window.setTimeout(() => {
      void trackScrollProgress(material.id, {
        scrollPercent: normalizedPercent,
        pagesViewed,
      });
    }, 500);
  }, [material, lastTrackedScroll, pagesViewed, isTeacher, isPresentation]);

  useEffect(() => {
    return () => {
      if (scrollTrackingTimeoutRef.current) {
        window.clearTimeout(scrollTrackingTimeoutRef.current);
      }
    };
  }, []);

  const handleDownload = useCallback(() => {
    if (!material || !material.url) {
      return;
    }

    if (!isTeacher) {
      void trackDownload(material.id, { fileName: material.title });
    }
    if (onDownload) {
      onDownload(material);
      return;
    }

    const anchor = document.createElement('a');
    anchor.href = material.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.download = material.title;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }, [material, onDownload, isTeacher]);

  const goToPreviousSlide = useCallback(() => {
    setCurrentSlideIndex((index) => Math.max(index - 1, 0));
  }, []);

  const goToNextSlide = useCallback(() => {
    setCurrentSlideIndex((index) => Math.min(index + 1, Math.max(pptxSlides.length - 1, 0)));
  }, [pptxSlides.length]);

  if (!material) {
    return null;
  }

  const renderTeacherEngagement = () => {
    if (!isTeacher) {
      return null;
    }

    return (
      <TabsContent value="engagement" className="mt-3 space-y-4">
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Class Engagement Summary</p>
            <Badge variant="secondary">{engagementStats.length} students</Badge>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Average Progress</span>
              <span>{teacherAverageProgress.toFixed(2)}%</span>
            </div>
            <Progress value={teacherAverageProgress} />
          </div>
        </div>

        {engagementLoading ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Loading engagement analytics...
          </div>
        ) : engagementStats.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No engagement events yet for this material.
          </div>
        ) : (
          <div className="space-y-3 max-h-[42vh] overflow-auto pr-1">
            {engagementStats.map((item) => {
              const fullName = [item.student?.first_name, item.student?.last_name]
                .filter(Boolean)
                .join(' ')
                .trim() || item.student?.email || 'Student';

              return (
                <div key={item.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-sm text-foreground">{fullName}</p>
                    <Badge variant={item.completed ? 'default' : 'secondary'}>
                      {item.completed ? 'Completed' : 'In Progress'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <p>Views: {item.view_count}</p>
                    <p>Downloads: {item.download_count}</p>
                    <p>Events: {item.event_count}</p>
                    <p>Avg Session: {item.avg_session_duration_seconds ? `${Math.round(item.avg_session_duration_seconds)}s` : 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>{item.progress_percent.toFixed(2)}%</span>
                    </div>
                    <Progress value={item.progress_percent} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </TabsContent>
    );
  };

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
            src={`${material.url}#view=FitH`}
            title={material.title}
            className="h-[65vh] w-full"
          />
        </div>
      );
    }

    if (isDoc) {
      if (docxLoading) {
        return (
          <div className="rounded-lg border border-border p-6 bg-muted/20 text-sm text-muted-foreground">
            Rendering DOCX preview...
          </div>
        );
      }

      if (docxError) {
        return (
          <div className="rounded-lg border border-dashed border-border p-6 bg-muted/20 space-y-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">DOCX preview could not be rendered.</p>
            <p>{docxError}</p>
            <p>Use Download to open this document in your office app.</p>
          </div>
        );
      }

      if (!docxHtml) {
        return (
          <div className="rounded-lg border border-dashed border-border p-6 bg-muted/20 text-sm text-muted-foreground">
            No DOCX content was detected for inline preview.
          </div>
        );
      }

      return (
        <div className="rounded-lg border border-border bg-background p-6">
          <article
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: docxHtml }}
          />
        </div>
      );
    }

    if (isPresentation) {
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
          <div className="flex items-center justify-between gap-3">
            <Badge variant="outline">
              Slide {currentPptxSlide.slideNumber} of {pptxSlides.length}
            </Badge>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={goToPreviousSlide}
                disabled={currentSlideIndex === 0}
              >
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={goToNextSlide}
                disabled={currentSlideIndex >= pptxSlides.length - 1}
              >
                Next
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-muted/20 p-6 min-h-[50vh]">
            {currentPptxSlide.imageDataUrl ? (
              <img
                src={currentPptxSlide.imageDataUrl}
                alt={`Slide ${currentPptxSlide.slideNumber}`}
                className="mb-5 max-h-[38vh] w-full rounded object-contain border border-border/70 bg-white"
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
          <TabsList className={`grid w-full ${isTeacher ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            {isTeacher ? <TabsTrigger value="engagement">Engagement</TabsTrigger> : null}
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="mt-0 space-y-3">
            <div
              ref={previewContainerRef}
              onScroll={handleScroll}
              className="max-h-[65vh] overflow-auto pr-1"
            >
              {renderPreview()}
            </div>

            {hasUrl ? (
              <div className="flex justify-between items-center gap-3">
                <p className="text-xs text-muted-foreground">
                  Scroll progress: {scrollPercent.toFixed(2)}%
                </p>
                <Button type="button" variant="outline" onClick={handleDownload}>
                  Download
                </Button>
              </div>
            ) : null}

            {hasUrl && !canInlinePreview ? (
              <p className="text-xs text-muted-foreground">
                Open will no longer auto-download files. Download manually when needed.
              </p>
            ) : null}
          </TabsContent>

          {renderTeacherEngagement()}

          <TabsContent value="details" className="mt-0 space-y-2 rounded-lg border border-border p-4">
            <p className="text-sm"><span className="text-muted-foreground">Type:</span> {material.fileType.toUpperCase()}</p>
            <p className="text-sm"><span className="text-muted-foreground">Size:</span> {material.fileSize}</p>
            <p className="text-sm"><span className="text-muted-foreground">Uploaded By:</span> {material.uploadedBy}</p>
            <p className="text-sm"><span className="text-muted-foreground">Uploaded Date:</span> {new Date(material.uploadedDate).toLocaleString()}</p>
            <p className="text-sm"><span className="text-muted-foreground">Downloads:</span> {material.downloads}</p>
            {courseId ? (
              <p className="text-sm"><span className="text-muted-foreground">Course:</span> {courseId}</p>
            ) : null}
          </TabsContent>
        </Tabs>

      </DialogContent>
    </Dialog>
  );
}
