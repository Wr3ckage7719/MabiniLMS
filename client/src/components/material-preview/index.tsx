import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Z } from '@/lib/z-index';
import { CheckCircle2, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trackDownload, trackScrollProgress, trackViewEnd, trackViewStart } from '@/lib/material-actions';
import { convertDocxToHtml, convertPptxToSlides, renderDocxToPages, type PptxSlidePreview } from '@/lib/material-preview';
import { useEngagementStats } from '@/hooks-api/useMaterials';
import { useToast } from '@/hooks/use-toast';
import type { LearningMaterial } from '@/lib/data';
import { materialsService, type MaterialProgressRecord } from '@/services/materials.service';
import { ImagePreview } from './ImagePreview';
import { VideoPreview } from './VideoPreview';
import { PdfPreview } from './PdfPreview';
import { DocxPreview } from './DocxPreview';
import { PptxPreview } from './PptxPreview';
import { UnsupportedFallback } from './UnsupportedFallback';
import { EngagementPanel, type EngagementStat } from './EngagementPanel';

interface MaterialPreviewDialogProps {
  open: boolean;
  material: LearningMaterial | null;
  onOpenChange: (open: boolean) => void;
  onDownload?: (material: LearningMaterial) => void;
  isTeacher?: boolean;
  courseId?: string;
}

const SCAN_HEARTBEAT_MS = 5_000;
const ACTIVE_INTERACTION_WINDOW_MS = 15_000;

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
};

const toUniqueSortedPages = (pages: number[]): number[] => {
  return Array.from(
    new Set(pages.filter((value) => Number.isInteger(value) && value > 0)),
  ).sort((a, b) => a - b);
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
};

const formatMaterialTypeLabel = (fileType: LearningMaterial['fileType']): string => {
  switch (fileType) {
    case 'pdf': return 'PDF';
    case 'doc': return 'Document';
    case 'image': return 'Image';
    case 'video': return 'Video';
    case 'presentation': return 'Presentation';
    case 'spreadsheet': return 'Spreadsheet';
    case 'archive': return 'Archive';
    default: return fileType;
  }
};

const formatUploadedByLabel = (uploadedBy?: string): string => {
  if (!uploadedBy || uploadedBy.trim().length === 0 || uploadedBy.trim().toLowerCase() === 'unknown') {
    return 'Not available';
  }
  return uploadedBy.trim();
};

const formatUploadedDate = (value?: string): string => {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

const resolveApiErrorMessage = (error: unknown, fallback: string): string => {
  const maybeError = error as {
    message?: string;
    response?: {
      status?: number;
      data?: {
        error?: {
          message?: string;
          metadata?: { reason?: string };
        };
      };
    };
  };

  const apiMessage = maybeError?.response?.data?.error?.message;
  const reason = maybeError?.response?.data?.error?.metadata?.reason;
  const status = maybeError?.response?.status;

  if (reason === 'MATERIAL_PROGRESS_SCHEMA_OUTDATED') {
    return 'Material progress schema is outdated on the server. Apply the latest database migrations, then retry.';
  }
  if (status === 503) {
    return 'Material progress service is temporarily unavailable. Please retry in a moment.';
  }
  if (typeof apiMessage === 'string' && apiMessage.trim().length > 0) return apiMessage;
  if (typeof maybeError?.message === 'string' && maybeError.message.trim().length > 0) return maybeError.message;
  return fallback;
};

const getUrlExtension = (url?: string): string => {
  if (!url) return '';
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

const getScrollPercentFromElement = (element: HTMLElement): number => {
  const scrollHeight = element.scrollHeight - element.clientHeight;
  if (scrollHeight <= 0) return 0;
  let nextPercent = (element.scrollTop / scrollHeight) * 100;
  if (element.scrollTop + element.clientHeight >= element.scrollHeight - 2) nextPercent = 100;
  return clampPercent(nextPercent);
};

export function MaterialPreviewDialog({
  open,
  material,
  onOpenChange,
  onDownload,
  isTeacher = false,
  courseId,
}: MaterialPreviewDialogProps) {
  const { toast } = useToast();
  const [scrollPercent, setScrollPercent] = useState(0);
  const [lastTrackedScroll, setLastTrackedScroll] = useState(0);
  const [activeTab, setActiveTab] = useState('preview');
  const [highestScrollPercent, setHighestScrollPercent] = useState(0);
  const [pagesViewed, setPagesViewed] = useState<number[]>([]);
  const [docxHtml, setDocxHtml] = useState('');
  const [docxLoading, setDocxLoading] = useState(false);
  const [docxError, setDocxError] = useState<string | null>(null);
  const [docxPages, setDocxPages] = useState<string[]>([]);
  const [docxPagesLoading, setDocxPagesLoading] = useState(false);
  const [docxPagesError, setDocxPagesError] = useState<string | null>(null);
  const [pptxSlides, setPptxSlides] = useState<PptxSlidePreview[]>([]);
  const [pptxLoading, setPptxLoading] = useState(false);
  const [pptxError, setPptxError] = useState<string | null>(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [pptPreviewMode, setPptPreviewMode] = useState<'true-content' | 'extracted'>('true-content');
  const [docPreviewMode, setDocPreviewMode] = useState<'office' | 'extracted' | 'print'>('print');
  const [markingDone, setMarkingDone] = useState(false);
  const [studentProgress, setStudentProgress] = useState<MaterialProgressRecord | null>(null);
  const [studentProgressLoading, setStudentProgressLoading] = useState(false);
  const [studentProgressError, setStudentProgressError] = useState<string | null>(null);
  const [resolvedFileSize, setResolvedFileSize] = useState('Unknown');
  const [engagementLoadingTimedOut, setEngagementLoadingTimedOut] = useState(false);
  const [selectedEngagementStudent, setSelectedEngagementStudent] = useState<EngagementStat | null>(null);
  const [downloading, setDownloading] = useState(false);

  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const pdfIframeRef = useRef<HTMLIFrameElement | null>(null);
  const scrollTrackingTimeoutRef = useRef<number | null>(null);
  const lastTrackedSlideRef = useRef<number | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  const lastInteractionAtRef = useRef<number>(Date.now());
  const lastHeartbeatSentAtRef = useRef<number>(Date.now());
  const highestScrollRef = useRef<number>(0);
  const pagesViewedRef = useRef<number[]>([]);
  const currentSlideRef = useRef<number>(0);
  const pptxSlidesCountRef = useRef<number>(0);
  const lastTrackedScrollRef = useRef<number>(0);
  const pdfObserverReadyRef = useRef(false);

  const canFetchEngagement = isTeacher && open && activeTab === 'engagement' && Boolean(material?.id);

  const {
    data: engagementStats = [],
    isLoading: engagementLoading,
    isError: engagementError,
    error: engagementErrorDetails,
    refetch: refetchEngagement,
  } = useEngagementStats(material?.id, canFetchEngagement);

  const hasUrl = Boolean(material?.url);
  const isImage = material?.fileType === 'image';
  const isVideo = material?.fileType === 'video';
  const fileExtension = getUrlExtension(material?.url);
  const isPdf = material?.fileType === 'pdf' || fileExtension === 'pdf';
  const isDoc = material?.fileType === 'doc' || fileExtension === 'doc' || fileExtension === 'docx';
  const isPresentation = material?.fileType === 'presentation' || fileExtension === 'ppt' || fileExtension === 'pptx';
  const canInlinePreview = isImage || isVideo || isPdf || isDoc || isPresentation;

  const pptxOfficeEmbedUrl = useMemo(() => {
    if (!isPresentation || !material?.url) return null;
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(material.url)}`;
  }, [isPresentation, material?.url]);

  const currentPptxSlide = pptxSlides[currentSlideIndex] || null;
  const studentDownloadCount = typeof studentProgress?.download_count === 'number'
    ? Math.max(0, Math.floor(studentProgress.download_count))
    : material?.downloads || 0;
  const studentProgressPercent = typeof studentProgress?.progress_percent === 'number'
    ? clampPercent(studentProgress.progress_percent)
    : scrollPercent;
  const studentCompletionLabel = studentProgress?.completed || studentProgressPercent >= 95
    ? 'Completed'
    : 'In Progress';
  const displayedFileSize = resolvedFileSize !== 'Unknown'
    ? resolvedFileSize
    : material?.fileSize || 'Unknown';

  const teacherAverageProgress = useMemo(() => {
    if (!engagementStats.length) return 0;
    const total = engagementStats.reduce((sum, item) => sum + (item.progress_percent || 0), 0);
    return Math.round((total / engagementStats.length) * 100) / 100;
  }, [engagementStats]);

  const engagementErrorMessage = useMemo(() => {
    if (!engagementError) return '';
    return resolveApiErrorMessage(engagementErrorDetails, 'Unable to load engagement analytics right now. Please try again.');
  }, [engagementError, engagementErrorDetails]);

  const markInteraction = useCallback(() => {
    lastInteractionAtRef.current = Date.now();
  }, []);

  const pushProgressEvent = useCallback((input: {
    scrollPercent: number;
    pageNumber?: number;
    pages?: number[];
    activeSeconds?: number;
    force?: boolean;
  }) => {
    if (!material || isTeacher) return;

    const normalizedPercent = clampPercent(input.scrollPercent);
    const mergedPages = toUniqueSortedPages(input.pages || pagesViewedRef.current);

    setScrollPercent(normalizedPercent);
    setHighestScrollPercent((current) => Math.max(current, normalizedPercent));

    if (mergedPages.length !== pagesViewedRef.current.length
      || mergedPages.some((value, index) => value !== pagesViewedRef.current[index])) {
      setPagesViewed(mergedPages);
    }

    const hasMeaningfulDelta = Math.abs(normalizedPercent - lastTrackedScrollRef.current) >= 2;
    const hasActiveSeconds = typeof input.activeSeconds === 'number' && input.activeSeconds > 0;
    const hasNewPage = typeof input.pageNumber === 'number' && !pagesViewedRef.current.includes(input.pageNumber);

    if (!input.force && !hasMeaningfulDelta && !hasActiveSeconds && !hasNewPage) return;

    setLastTrackedScroll(normalizedPercent);

    void trackScrollProgress(material.id, {
      scrollPercent: normalizedPercent,
      pageNumber: input.pageNumber,
      pagesViewed: mergedPages,
      activeSeconds: input.activeSeconds,
    });
  }, [isTeacher, material]);

  const finalizeViewSession = useCallback((options?: {
    forceComplete?: boolean;
    forceScrollPercent?: number;
  }) => {
    if (!material || isTeacher) return;

    const startedAt = sessionStartRef.current;
    if (!startedAt && !options?.forceComplete) return;

    sessionStartRef.current = null;
    const elapsedSeconds = startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0;
    const finalScrollPercent = clampPercent(
      typeof options?.forceScrollPercent === 'number'
        ? options.forceScrollPercent
        : highestScrollRef.current,
    );
    const finalPageNumber = isPresentation && pptPreviewMode === 'extracted' && pptxSlidesCountRef.current > 0
      ? Math.min(currentSlideRef.current + 1, pptxSlidesCountRef.current)
      : pagesViewedRef.current[pagesViewedRef.current.length - 1];

    void trackViewEnd(material.id, {
      timeSpentSeconds: elapsedSeconds,
      finalScrollPercent,
      completed: options?.forceComplete ? true : finalScrollPercent >= 95,
      pageNumber: finalPageNumber,
    });
  }, [isPresentation, isTeacher, material, pptPreviewMode]);

  const closePreview = useCallback(() => {
    finalizeViewSession();
    onOpenChange(false);
  }, [finalizeViewSession, onOpenChange]);

  useEffect(() => { highestScrollRef.current = highestScrollPercent; }, [highestScrollPercent]);
  useEffect(() => { pagesViewedRef.current = pagesViewed; }, [pagesViewed]);
  useEffect(() => { currentSlideRef.current = currentSlideIndex; }, [currentSlideIndex]);
  useEffect(() => { pptxSlidesCountRef.current = pptxSlides.length; }, [pptxSlides.length]);
  useEffect(() => { lastTrackedScrollRef.current = lastTrackedScroll; }, [lastTrackedScroll]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) closePreview();
    };
    window.addEventListener('keydown', handleEscape);
    return () => { window.removeEventListener('keydown', handleEscape); };
  }, [closePreview, open]);

  useEffect(() => {
    if (!open || !material) return;

    setActiveTab('preview');
    setScrollPercent(0);
    setLastTrackedScroll(0);
    setHighestScrollPercent(0);
    setPagesViewed([]);
    setDocxHtml('');
    setDocxError(null);
    setDocxLoading(false);
    setDocxPages([]);
    setDocxPagesError(null);
    setDocxPagesLoading(false);
    setPptxSlides([]);
    setPptxError(null);
    setPptxLoading(false);
    setCurrentSlideIndex(0);
    setPptPreviewMode('true-content');
    setDocPreviewMode('print');
    setMarkingDone(false);
    setStudentProgress(null);
    setStudentProgressLoading(false);
    setStudentProgressError(null);
    setResolvedFileSize(material.fileSize || 'Unknown');
    setEngagementLoadingTimedOut(false);
    setDownloading(false);

    lastTrackedSlideRef.current = null;
    sessionStartRef.current = Date.now();
    lastInteractionAtRef.current = Date.now();
    lastHeartbeatSentAtRef.current = Date.now();
    pdfObserverReadyRef.current = false;

    if (!isTeacher) void trackViewStart(material.id);
  }, [open, material, isTeacher]);

  useEffect(() => {
    if (!open || !material || isTeacher) {
      setStudentProgress(null);
      setStudentProgressLoading(false);
      setStudentProgressError(null);
      return;
    }

    let active = true;
    setStudentProgressLoading(true);
    setStudentProgressError(null);

    void materialsService.getMyProgress(material.id)
      .then((response) => {
        if (!active) return;
        const nextProgress = (response as { data?: MaterialProgressRecord | null })?.data;
        setStudentProgress(nextProgress || null);
      })
      .catch((error) => {
        if (!active) return;
        setStudentProgressError(resolveApiErrorMessage(error, 'Unable to load your progress details.'));
      })
      .finally(() => {
        if (!active) return;
        setStudentProgressLoading(false);
      });

    return () => { active = false; };
  }, [isTeacher, material, open]);

  useEffect(() => {
    if (!open || !material) return;

    setResolvedFileSize(material.fileSize || 'Unknown');
    if (material.fileSize && material.fileSize !== 'Unknown') return;
    if (!material.url) return;

    let active = true;

    void fetch(material.url, { method: 'HEAD' })
      .then((response) => {
        if (!active || !response.ok) return;
        const contentLengthHeader = response.headers.get('content-length');
        const contentLength = Number.parseInt(contentLengthHeader || '', 10);
        if (!Number.isFinite(contentLength) || contentLength <= 0) return;
        setResolvedFileSize(formatBytes(contentLength));
      })
      .catch(() => { /* Best-effort metadata fetch only. */ });

    return () => { active = false; };
  }, [material, open]);

  useEffect(() => {
    if (!open || !material?.url || !isDoc || docPreviewMode !== 'extracted') return;

    let active = true;
    setDocxLoading(true);
    setDocxError(null);

    void convertDocxToHtml(material.url)
      .then((html) => { if (active) setDocxHtml(html); })
      .catch((error) => { if (active) setDocxError(error instanceof Error ? error.message : 'Failed to render DOCX preview'); })
      .finally(() => { if (active) setDocxLoading(false); });

    return () => { active = false; };
  }, [docPreviewMode, open, isDoc, material?.id, material?.url]);

  useEffect(() => {
    if (!open || !material?.url || !isDoc || docPreviewMode !== 'print' || docxPages.length > 0 || docxPagesLoading) return;

    let active = true;
    setDocxPagesLoading(true);
    setDocxPagesError(null);

    void renderDocxToPages(material.url)
      .then((pages) => { if (active) setDocxPages(pages); })
      .catch((error) => { if (active) setDocxPagesError(error instanceof Error ? error.message : 'Failed to render print layout'); })
      .finally(() => { if (active) setDocxPagesLoading(false); });

    return () => { active = false; };
  }, [docPreviewMode, open, isDoc, material?.id, material?.url, docxPages.length, docxPagesLoading]);

  useEffect(() => {
    if (!open || !material?.url || !isPresentation || pptxSlides.length > 0 || pptxLoading || Boolean(pptxError)) return;

    let active = true;
    setPptxLoading(true);
    setPptxError(null);

    void convertPptxToSlides(material.url)
      .then((slides) => {
        if (!active) return;
        setPptxSlides(slides);
        setCurrentSlideIndex((current) => slides.length === 0 ? 0 : Math.min(current, slides.length - 1));
      })
      .catch((error) => { if (active) setPptxError(error instanceof Error ? error.message : 'Failed to convert PPTX for preview'); })
      .finally(() => { if (active) setPptxLoading(false); });

    return () => { active = false; };
  }, [isPresentation, material?.id, material?.url, open, pptxError, pptxLoading, pptxSlides.length]);

  useEffect(() => {
    if (!open || !material || !isPresentation || pptxSlides.length === 0) return;

    const slideNumber = Math.min(currentSlideIndex + 1, pptxSlides.length);
    const nextProgress = clampPercent((slideNumber / pptxSlides.length) * 100);
    const mergedPages = toUniqueSortedPages([...pagesViewedRef.current, slideNumber]);

    pushProgressEvent({ scrollPercent: nextProgress, pageNumber: slideNumber, pages: mergedPages, force: lastTrackedSlideRef.current !== slideNumber });
    lastTrackedSlideRef.current = slideNumber;
  }, [currentSlideIndex, isPresentation, material, open, pptxSlides.length, pushProgressEvent]);

  useEffect(() => {
    if (!open || !material || isTeacher) return;

    lastHeartbeatSentAtRef.current = Date.now();

    const heartbeatId = window.setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - lastHeartbeatSentAtRef.current;
      lastHeartbeatSentAtRef.current = now;

      if (document.hidden) return;
      if (now - lastInteractionAtRef.current > ACTIVE_INTERACTION_WINDOW_MS) return;

      const activeSeconds = Math.max(1, Math.round(elapsedMs / 1000));
      const fallbackPageNumber = isPresentation && pptPreviewMode === 'extracted' && pptxSlidesCountRef.current > 0
        ? Math.min(currentSlideRef.current + 1, pptxSlidesCountRef.current)
        : pagesViewedRef.current[pagesViewedRef.current.length - 1];

      pushProgressEvent({ scrollPercent: highestScrollRef.current, pageNumber: fallbackPageNumber, pages: pagesViewedRef.current, activeSeconds, force: true });
    }, SCAN_HEARTBEAT_MS);

    return () => { window.clearInterval(heartbeatId); };
  }, [isPresentation, isTeacher, material, open, pptPreviewMode, pushProgressEvent]);

  useEffect(() => {
    if (!open || !isPdf) return;

    const iframe = pdfIframeRef.current;
    if (!iframe) return;

    let cleanupPdfListeners = () => {};

    const syncPdfProgress = () => {
      if (!material || isTeacher || !iframe) return;
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;
        const scrollRoot = (doc.scrollingElement || doc.documentElement || doc.body) as HTMLElement;
        const percentFromScroll = getScrollPercentFromElement(scrollRoot);
        const pageInput = doc.getElementById('pageNumber') as HTMLInputElement | null;
        const pageNumberCandidate = pageInput ? Number.parseInt(pageInput.value, 10) : undefined;
        const pageNumber = Number.isInteger(pageNumberCandidate) && (pageNumberCandidate || 0) > 0 ? pageNumberCandidate : undefined;
        const mergedPages = pageNumber ? toUniqueSortedPages([...pagesViewedRef.current, pageNumber]) : pagesViewedRef.current;
        pushProgressEvent({ scrollPercent: percentFromScroll, pageNumber, pages: mergedPages, force: true });
      } catch {
        pdfObserverReadyRef.current = false;
      }
    };

    const attachPdfListeners = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;
        const scrollRoot = (doc.scrollingElement || doc.documentElement || doc.body) as HTMLElement;
        const onScroll = () => { markInteraction(); syncPdfProgress(); };
        scrollRoot.addEventListener('scroll', onScroll, { passive: true });
        doc.addEventListener('keydown', markInteraction);
        doc.addEventListener('mousemove', markInteraction);
        doc.addEventListener('touchstart', markInteraction, { passive: true });
        pdfObserverReadyRef.current = true;
        syncPdfProgress();
        cleanupPdfListeners = () => {
          scrollRoot.removeEventListener('scroll', onScroll);
          doc.removeEventListener('keydown', markInteraction);
          doc.removeEventListener('mousemove', markInteraction);
          doc.removeEventListener('touchstart', markInteraction);
          pdfObserverReadyRef.current = false;
        };
      } catch {
        pdfObserverReadyRef.current = false;
      }
    };

    const onLoad = () => { cleanupPdfListeners(); attachPdfListeners(); };
    iframe.addEventListener('load', onLoad);
    attachPdfListeners();

    const pollId = window.setInterval(() => {
      if (pdfObserverReadyRef.current) syncPdfProgress();
    }, 1_500);

    return () => {
      window.clearInterval(pollId);
      iframe.removeEventListener('load', onLoad);
      cleanupPdfListeners();
    };
  }, [isPdf, isTeacher, markInteraction, material, open, pushProgressEvent]);

  useEffect(() => {
    if (!canFetchEngagement || !engagementLoading) {
      setEngagementLoadingTimedOut(false);
      return;
    }
    const timeoutId = window.setTimeout(() => { setEngagementLoadingTimedOut(true); }, 12_000);
    return () => { window.clearTimeout(timeoutId); };
  }, [canFetchEngagement, engagementLoading]);

  useEffect(() => {
    if (!open || !material?.id) return;
    return () => { finalizeViewSession(); };
  }, [finalizeViewSession, material?.id, open]);

  useEffect(() => {
    return () => {
      if (scrollTrackingTimeoutRef.current) {
        window.clearTimeout(scrollTrackingTimeoutRef.current);
      }
    };
  }, []);

  const handleScroll = useCallback(() => {
    markInteraction();

    const container = previewContainerRef.current;
    if (!container || !material || isTeacher || isPresentation) return;

    const normalizedPercent = getScrollPercentFromElement(container);

    if (Math.abs(normalizedPercent - lastTrackedScrollRef.current) < 2) {
      setScrollPercent(normalizedPercent);
      setHighestScrollPercent((current) => Math.max(current, normalizedPercent));
      return;
    }

    if (scrollTrackingTimeoutRef.current) {
      window.clearTimeout(scrollTrackingTimeoutRef.current);
    }

    scrollTrackingTimeoutRef.current = window.setTimeout(() => {
      pushProgressEvent({ scrollPercent: normalizedPercent, pages: pagesViewedRef.current });
    }, 250);
  }, [isPresentation, isTeacher, markInteraction, material, pushProgressEvent]);

  const handleDownload = useCallback(() => {
    markInteraction();
    if (!material || !material.url) return;
    if (!isTeacher) void trackDownload(material.id, { fileName: material.title });
    if (onDownload) { onDownload(material); return; }

    // `anchor.download` is ignored for cross-origin URLs (e.g. Supabase storage).
    // Fetch as a blob so the browser treats it as a local download.
    setDownloading(true);
    void fetch(material.url)
      .then((response) => {
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = blobUrl;
        anchor.download = material.title;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => { window.open(material.url, '_blank', 'noopener,noreferrer'); })
      .finally(() => { setDownloading(false); });
  }, [isTeacher, markInteraction, material, onDownload]);

  const goToPreviousSlide = useCallback(() => {
    markInteraction();
    setCurrentSlideIndex((index) => Math.max(index - 1, 0));
  }, [markInteraction]);

  const goToNextSlide = useCallback(() => {
    markInteraction();
    setCurrentSlideIndex((index) => Math.min(index + 1, Math.max(pptxSlides.length - 1, 0)));
  }, [markInteraction, pptxSlides.length]);

  const handleMarkAsDone = useCallback(() => {
    markInteraction();
    if (!material || isTeacher || markingDone) return;
    setMarkingDone(true);

    const saveDoneStatus = async () => {
      const fallbackPageNumber = isPresentation && pptxSlidesCountRef.current > 0
        ? Math.min(currentSlideRef.current + 1, pptxSlidesCountRef.current)
        : pagesViewedRef.current[pagesViewedRef.current.length - 1];

      pushProgressEvent({ scrollPercent: 100, pageNumber: fallbackPageNumber, pages: pagesViewedRef.current, force: true });

      const nowIso = new Date().toISOString();

      const applyOptimisticProgress = (queued: boolean) => {
        finalizeViewSession({ forceComplete: true, forceScrollPercent: 100 });

        setStudentProgress((current) => {
          if (!current) return current;
          return { ...current, completed: true, progress_percent: Math.max(current.progress_percent, 100), last_viewed_at: nowIso, completed_at: current.completed_at || nowIso };
        });

        toast({
          title: queued ? 'Marked as done (offline)' : 'Marked as done',
          description: queued ? 'Your progress will sync automatically when you reconnect.' : 'Your reading progress was saved successfully.',
        });

        onOpenChange(false);
      };

      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

      if (isOffline) {
        const { enqueueProgressEvent } = await import('@/services/material-progress-queue.service');
        enqueueProgressEvent('updateMyProgress', material.id, { progress_percent: 100, completed: true, last_viewed_at: nowIso });
        applyOptimisticProgress(true);
        setMarkingDone(false);
        return;
      }

      try {
        await materialsService.updateMyProgress(material.id, { progress_percent: 100, completed: true, last_viewed_at: nowIso });
        applyOptimisticProgress(false);
      } catch (error: any) {
        if (!error?.response) {
          const { enqueueProgressEvent } = await import('@/services/material-progress-queue.service');
          enqueueProgressEvent('updateMyProgress', material.id, { progress_percent: 100, completed: true, last_viewed_at: nowIso });
          applyOptimisticProgress(true);
        } else {
          toast({ title: 'Unable to mark as done', description: resolveApiErrorMessage(error, 'Please try again.'), variant: 'destructive' });
        }
      } finally {
        setMarkingDone(false);
      }
    };

    void saveDoneStatus();
  }, [finalizeViewSession, isPresentation, isTeacher, markingDone, markInteraction, material, onOpenChange, pushProgressEvent, toast]);

  const renderPreview = () => {
    if (!material?.url) {
      return (
        <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          This material does not have a file URL yet.
        </div>
      );
    }
    if (isImage) return <ImagePreview url={material.url} title={material.title} />;
    if (isVideo) return <VideoPreview url={material.url} />;
    if (isPdf) return <PdfPreview url={material.url} title={material.title} iframeRef={pdfIframeRef} />;
    if (isDoc) {
      return (
        <DocxPreview
          url={material.url}
          title={material.title}
          docxHtml={docxHtml}
          docxLoading={docxLoading}
          docxError={docxError}
          docxPages={docxPages}
          docxPagesLoading={docxPagesLoading}
          docxPagesError={docxPagesError}
          docPreviewMode={docPreviewMode}
          setDocPreviewMode={setDocPreviewMode}
          markInteraction={markInteraction}
        />
      );
    }
    if (isPresentation) {
      return (
        <PptxPreview
          title={material.title}
          pptxSlides={pptxSlides}
          pptxLoading={pptxLoading}
          pptxError={pptxError}
          pptPreviewMode={pptPreviewMode}
          setPptPreviewMode={setPptPreviewMode}
          currentSlideIndex={currentSlideIndex}
          currentPptxSlide={currentPptxSlide}
          pptxOfficeEmbedUrl={pptxOfficeEmbedUrl}
          goToNextSlide={goToNextSlide}
          goToPreviousSlide={goToPreviousSlide}
          markInteraction={markInteraction}
        />
      );
    }
    return <UnsupportedFallback />;
  };

  if (!open || !material) return null;

  return (
    <div style={{ zIndex: Z.fullscreenReader }} className="fixed inset-0 bg-background" onMouseMove={markInteraction} onTouchStart={markInteraction}>
      <div className={`h-full w-full ${isTeacher ? 'px-3 py-3 md:px-6 md:py-5' : ''}`}>
        <div className={`${isTeacher ? 'mx-auto max-w-[1500px] rounded-xl border border-border bg-card/90 shadow-xl' : 'h-full w-full'} flex h-full flex-col overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 border-b border-border p-3 md:p-4">
            <h2 className="line-clamp-1 text-base md:text-2xl font-semibold text-foreground">{material.title}</h2>
            <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={closePreview}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); markInteraction(); }} className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border px-3 py-2 md:p-4">
              <TabsList className={`hidden sm:grid w-full ${isTeacher ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                {isTeacher ? <TabsTrigger value="engagement">Engagement</TabsTrigger> : null}
                <TabsTrigger value="details">Details</TabsTrigger>
              </TabsList>
              <div className="flex sm:hidden gap-1">
                {(['preview', 'details'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => { setActiveTab(tab); markInteraction(); }}
                    className={`flex-1 rounded-md py-1 text-xs font-medium capitalize transition-colors ${activeTab === tab ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                  >
                    {tab}
                  </button>
                ))}
                {isTeacher ? (
                  <button
                    type="button"
                    onClick={() => { setActiveTab('engagement'); markInteraction(); }}
                    className={`flex-1 rounded-md py-1 text-xs font-medium capitalize transition-colors ${activeTab === 'engagement' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                  >
                    Engage
                  </button>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 p-3 md:p-4">
              <TabsContent value="preview" className="mt-0 flex min-h-0 flex-1 flex-col gap-3">
                {hasUrl ? (
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground shrink-0">{scrollPercent.toFixed(0)}% read</p>
                      <div className="flex items-center gap-2">
                        {!isTeacher ? (
                          <Button type="button" variant="secondary" size="sm" className="gap-1.5 text-xs" onClick={handleMarkAsDone} disabled={markingDone}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {markingDone ? 'Saving...' : 'Mark as Done'}
                          </Button>
                        ) : null}
                        <Button type="button" variant={isTeacher ? 'default' : 'outline'} size="sm" onClick={handleDownload} className="gap-1.5 text-xs" disabled={downloading}>
                          <Download className="h-3.5 w-3.5" />
                          {downloading ? 'Downloading...' : isTeacher ? 'Download File' : 'Download'}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div ref={previewContainerRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-auto pr-1 pb-1">
                  {renderPreview()}
                </div>

                {hasUrl && !canInlinePreview ? (
                  <p className="text-xs text-muted-foreground">
                    Inline preview is not available for this type. Download to open with the device app.
                  </p>
                ) : null}
              </TabsContent>

              {isTeacher ? (
                <EngagementPanel
                  engagementStats={engagementStats as EngagementStat[]}
                  engagementLoading={engagementLoading}
                  engagementLoadingTimedOut={engagementLoadingTimedOut}
                  engagementError={engagementError}
                  engagementErrorMessage={engagementErrorMessage}
                  teacherAverageProgress={teacherAverageProgress}
                  selectedEngagementStudent={selectedEngagementStudent}
                  setSelectedEngagementStudent={setSelectedEngagementStudent}
                  refetchEngagement={refetchEngagement}
                  setEngagementLoadingTimedOut={setEngagementLoadingTimedOut}
                />
              ) : null}

              <TabsContent value="details" className="mt-0 flex min-h-0 flex-1">
                <div className="w-full overflow-auto rounded-lg border border-border p-4 space-y-2">
                  <p className="text-sm"><span className="text-muted-foreground">Type:</span> {formatMaterialTypeLabel(material.fileType)}</p>
                  <p className="text-sm"><span className="text-muted-foreground">Size:</span> {displayedFileSize === 'Unknown' ? 'Not available' : displayedFileSize}</p>
                  <p className="text-sm"><span className="text-muted-foreground">Uploaded By:</span> {formatUploadedByLabel(material.uploadedBy)}</p>
                  <p className="text-sm"><span className="text-muted-foreground">Uploaded Date:</span> {formatUploadedDate(material.uploadedDate)}</p>
                  <p className="text-sm"><span className="text-muted-foreground">{isTeacher ? 'Downloads:' : 'Your Downloads:'}</span> {studentDownloadCount}</p>
                  {!isTeacher ? (
                    <>
                      <p className="text-sm"><span className="text-muted-foreground">Your Progress:</span> {studentProgressPercent.toFixed(2)}%</p>
                      <p className="text-sm"><span className="text-muted-foreground">Status:</span> {studentCompletionLabel}</p>
                      {studentCompletionLabel !== 'Completed' ? (
                        <Button type="button" variant="secondary" className="mt-2 gap-2" onClick={handleMarkAsDone} disabled={markingDone}>
                          <CheckCircle2 className="h-4 w-4" />
                          {markingDone ? 'Saving...' : 'Done Reading'}
                        </Button>
                      ) : null}
                      {studentProgressLoading ? <p className="text-xs text-muted-foreground">Syncing your latest reading status...</p> : null}
                      {studentProgressError ? <p className="text-xs text-muted-foreground">{studentProgressError}</p> : null}
                    </>
                  ) : null}
                  {courseId ? <p className="text-sm"><span className="text-muted-foreground">Course:</span> {courseId}</p> : null}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
