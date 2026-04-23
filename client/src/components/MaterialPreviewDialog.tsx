import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, RefreshCw, X, ArrowLeft, ChevronRight, Eye, Clock, FileDown, Activity, BarChart2, BookOpen } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { trackDownload, trackScrollProgress, trackViewEnd, trackViewStart } from '@/lib/material-actions';
import { convertDocxToHtml, convertPptxToSlides, type PptxSlidePreview } from '@/lib/material-preview';
import { useEngagementStats } from '@/hooks-api/useMaterials';
import { useToast } from '@/hooks/use-toast';
import type { LearningMaterial } from '@/lib/data';
import { materialsService, type MaterialEngagementEvent, type MaterialProgressRecord } from '@/services/materials.service';

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
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
};

const toUniqueSortedPages = (pages: number[]): number[] => {
  return Array.from(
    new Set(pages.filter((value) => Number.isInteger(value) && value > 0))
  ).sort((a, b) => a - b);
};

const formatDuration = (seconds?: number | null): string => {
  if (!seconds || seconds <= 0) {
    return '0s';
  }

  const safe = Math.round(seconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;

  if (mins === 0) {
    return `${secs}s`;
  }

  return `${mins}m ${secs}s`;
};

const formatEventTime = (timestamp: string): string => {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }

  return parsed.toLocaleString();
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 'Unknown';
  }

  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }

  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
};

const formatMaterialTypeLabel = (fileType: LearningMaterial['fileType']): string => {
  switch (fileType) {
    case 'pdf':
      return 'PDF';
    case 'doc':
      return 'Document';
    case 'image':
      return 'Image';
    case 'video':
      return 'Video';
    case 'presentation':
      return 'Presentation';
    case 'spreadsheet':
      return 'Spreadsheet';
    case 'archive':
      return 'Archive';
    default:
      return fileType;
  }
};

const formatUploadedByLabel = (uploadedBy?: string): string => {
  if (!uploadedBy || uploadedBy.trim().length === 0 || uploadedBy.trim().toLowerCase() === 'unknown') {
    return 'Not available';
  }

  return uploadedBy.trim();
};

const formatUploadedDate = (value?: string): string => {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
};

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

const getScrollPercentFromElement = (element: HTMLElement): number => {
  const scrollHeight = element.scrollHeight - element.clientHeight;
  if (scrollHeight <= 0) {
    return 0;
  }

  let nextPercent = (element.scrollTop / scrollHeight) * 100;
  if (element.scrollTop + element.clientHeight >= element.scrollHeight - 2) {
    nextPercent = 100;
  }

  return clampPercent(nextPercent);
};

const getEventLabel = (event: MaterialEngagementEvent): string => {
  switch (event.type) {
    case 'view_start':
      return 'Opened material';
    case 'view_end':
      return 'Ended session';
    case 'download':
      return 'Downloaded file';
    case 'scroll':
      return 'Scrolled/scan heartbeat';
    default:
      return 'Tracked action';
  }
};

const getEventDetails = (event: MaterialEngagementEvent): string | null => {
  if (event.type === 'view_start') {
    const openCount = typeof event.data.open_count === 'number'
      ? Math.max(1, Math.floor(event.data.open_count))
      : 1;
    return openCount > 1 ? `Opened ${openCount} times` : 'Opened once';
  }

  if (event.type === 'view_end') {
    const seconds = typeof event.data.time_spent_seconds === 'number'
      ? Math.max(0, Math.round(event.data.time_spent_seconds))
      : 0;
    const sessionCount = typeof event.data.session_count === 'number'
      ? Math.max(1, Math.floor(event.data.session_count))
      : 1;
    const totalSeconds = typeof event.data.total_time_spent_seconds === 'number'
      ? Math.max(0, Math.round(event.data.total_time_spent_seconds))
      : seconds;
    const percent = typeof event.data.final_scroll_percent === 'number'
      ? clampPercent(event.data.final_scroll_percent)
      : 0;

    if (sessionCount > 1) {
      return `${sessionCount} sessions · ${formatDuration(totalSeconds)} total · ${percent.toFixed(2)}%`;
    }

    return `${formatDuration(seconds)} · ${percent.toFixed(2)}%`;
  }

  if (event.type === 'download') {
    const fileName = typeof event.data.file_name === 'string' ? event.data.file_name : null;
    return fileName || 'Tracked download event';
  }

  if (event.type === 'scroll') {
    const percent = typeof event.data.scroll_percent === 'number'
      ? clampPercent(event.data.scroll_percent)
      : 0;
    const activeSeconds = typeof event.data.active_seconds === 'number'
      ? Math.max(0, Math.round(event.data.active_seconds))
      : 0;
    const heartbeatCount = typeof event.data.heartbeat_count === 'number'
      ? Math.max(1, Math.floor(event.data.heartbeat_count))
      : 1;

    if (activeSeconds > 0) {
      return `${percent.toFixed(2)}% · ${formatDuration(activeSeconds)} active · ${heartbeatCount} scans`;
    }

    return `${percent.toFixed(2)}%`;
  }

  return null;
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
  const [pptxSlides, setPptxSlides] = useState<PptxSlidePreview[]>([]);
  const [pptxLoading, setPptxLoading] = useState(false);
  const [pptxError, setPptxError] = useState<string | null>(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [pptPreviewMode, setPptPreviewMode] = useState<'true-content' | 'extracted'>('true-content');
  const [docPreviewMode, setDocPreviewMode] = useState<'office' | 'extracted'>('office');
  const [markingDone, setMarkingDone] = useState(false);
  const [studentProgress, setStudentProgress] = useState<MaterialProgressRecord | null>(null);
  const [studentProgressLoading, setStudentProgressLoading] = useState(false);
  const [studentProgressError, setStudentProgressError] = useState<string | null>(null);
  const [resolvedFileSize, setResolvedFileSize] = useState('Unknown');
  const [engagementLoadingTimedOut, setEngagementLoadingTimedOut] = useState(false);
  const [selectedEngagementStudent, setSelectedEngagementStudent] = useState<(typeof engagementStats)[number] | null>(null);

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
    if (!isPresentation || !material?.url) {
      return null;
    }

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
    if (!engagementStats.length) {
      return 0;
    }

    const total = engagementStats.reduce((sum, item) => sum + (item.progress_percent || 0), 0);
    return Math.round((total / engagementStats.length) * 100) / 100;
  }, [engagementStats]);

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
    if (!material || isTeacher) {
      return;
    }

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

    if (!input.force && !hasMeaningfulDelta && !hasActiveSeconds && !hasNewPage) {
      return;
    }

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
    if (!material || isTeacher) {
      return;
    }

    const startedAt = sessionStartRef.current;
    if (!startedAt && !options?.forceComplete) {
      return;
    }

    sessionStartRef.current = null;
    const elapsedSeconds = startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0;
    const finalScrollPercent = clampPercent(
      typeof options?.forceScrollPercent === 'number'
        ? options.forceScrollPercent
        : highestScrollRef.current
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

  useEffect(() => {
    highestScrollRef.current = highestScrollPercent;
  }, [highestScrollPercent]);

  useEffect(() => {
    pagesViewedRef.current = pagesViewed;
  }, [pagesViewed]);

  useEffect(() => {
    currentSlideRef.current = currentSlideIndex;
  }, [currentSlideIndex]);

  useEffect(() => {
    pptxSlidesCountRef.current = pptxSlides.length;
  }, [pptxSlides.length]);

  useEffect(() => {
    lastTrackedScrollRef.current = lastTrackedScroll;
  }, [lastTrackedScroll]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        closePreview();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [closePreview, open]);

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
    setPptPreviewMode('true-content');
    setDocPreviewMode('office');
    setMarkingDone(false);
    setStudentProgress(null);
    setStudentProgressLoading(false);
    setStudentProgressError(null);
    setResolvedFileSize(material.fileSize || 'Unknown');
    setEngagementLoadingTimedOut(false);

    lastTrackedSlideRef.current = null;
    sessionStartRef.current = Date.now();
    lastInteractionAtRef.current = Date.now();
    lastHeartbeatSentAtRef.current = Date.now();
    pdfObserverReadyRef.current = false;

    if (!isTeacher) {
      void trackViewStart(material.id);
    }
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
        if (!active) {
          return;
        }

        const nextProgress = (response as { data?: MaterialProgressRecord | null })?.data;
        setStudentProgress(nextProgress || null);
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setStudentProgressError(error instanceof Error ? error.message : 'Unable to load your progress details.');
      })
      .finally(() => {
        if (!active) {
          return;
        }

        setStudentProgressLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isTeacher, material, open]);

  useEffect(() => {
    if (!open || !material) {
      return;
    }

    setResolvedFileSize(material.fileSize || 'Unknown');

    if (material.fileSize && material.fileSize !== 'Unknown') {
      return;
    }

    if (!material.url) {
      return;
    }

    let active = true;

    void fetch(material.url, { method: 'HEAD' })
      .then((response) => {
        if (!active || !response.ok) {
          return;
        }

        const contentLengthHeader = response.headers.get('content-length');
        const contentLength = Number.parseInt(contentLengthHeader || '', 10);

        if (!Number.isFinite(contentLength) || contentLength <= 0) {
          return;
        }

        setResolvedFileSize(formatBytes(contentLength));
      })
      .catch(() => {
        // Best-effort metadata fetch only.
      });

    return () => {
      active = false;
    };
  }, [material, open]);

  useEffect(() => {
    if (!open || !material?.url || !isDoc || docPreviewMode !== 'extracted') {
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
    if (!open || !material?.url || !isPresentation || pptPreviewMode !== 'extracted') {
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
  }, [open, isPresentation, material?.id, material?.url, pptPreviewMode]);

  useEffect(() => {
    if (!open || !material || !isPresentation || pptPreviewMode !== 'extracted' || pptxSlides.length === 0) {
      return;
    }

    const slideNumber = Math.min(currentSlideIndex + 1, pptxSlides.length);
    const nextProgress = clampPercent((slideNumber / pptxSlides.length) * 100);
    const mergedPages = toUniqueSortedPages([...pagesViewedRef.current, slideNumber]);

    pushProgressEvent({
      scrollPercent: nextProgress,
      pageNumber: slideNumber,
      pages: mergedPages,
      force: lastTrackedSlideRef.current !== slideNumber,
    });

    lastTrackedSlideRef.current = slideNumber;
  }, [currentSlideIndex, isPresentation, material, open, pptPreviewMode, pptxSlides.length, pushProgressEvent]);

  useEffect(() => {
    if (!open || !material || isTeacher) {
      return;
    }

    lastHeartbeatSentAtRef.current = Date.now();

    const heartbeatId = window.setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - lastHeartbeatSentAtRef.current;
      lastHeartbeatSentAtRef.current = now;

      if (document.hidden) {
        return;
      }

      if (now - lastInteractionAtRef.current > ACTIVE_INTERACTION_WINDOW_MS) {
        return;
      }

      const activeSeconds = Math.max(1, Math.round(elapsedMs / 1000));
      const fallbackPageNumber = isPresentation && pptPreviewMode === 'extracted' && pptxSlidesCountRef.current > 0
        ? Math.min(currentSlideRef.current + 1, pptxSlidesCountRef.current)
        : pagesViewedRef.current[pagesViewedRef.current.length - 1];

      pushProgressEvent({
        scrollPercent: highestScrollRef.current,
        pageNumber: fallbackPageNumber,
        pages: pagesViewedRef.current,
        activeSeconds,
        force: true,
      });
    }, SCAN_HEARTBEAT_MS);

    return () => {
      window.clearInterval(heartbeatId);
    };
  }, [isPresentation, isTeacher, material, open, pptPreviewMode, pushProgressEvent]);

  useEffect(() => {
    if (!open || !isPdf) {
      return;
    }

    const iframe = pdfIframeRef.current;
    if (!iframe) {
      return;
    }

    let cleanupPdfListeners = () => {};

    const syncPdfProgress = () => {
      if (!material || isTeacher || !iframe) {
        return;
      }

      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) {
          return;
        }

        const scrollRoot = (doc.scrollingElement || doc.documentElement || doc.body) as HTMLElement;
        const percentFromScroll = getScrollPercentFromElement(scrollRoot);

        const pageInput = doc.getElementById('pageNumber') as HTMLInputElement | null;
        const pageNumberCandidate = pageInput ? Number.parseInt(pageInput.value, 10) : undefined;
        const pageNumber = Number.isInteger(pageNumberCandidate) && (pageNumberCandidate || 0) > 0
          ? pageNumberCandidate
          : undefined;

        const mergedPages = pageNumber
          ? toUniqueSortedPages([...pagesViewedRef.current, pageNumber])
          : pagesViewedRef.current;

        pushProgressEvent({
          scrollPercent: percentFromScroll,
          pageNumber,
          pages: mergedPages,
          force: true,
        });
      } catch {
        pdfObserverReadyRef.current = false;
      }
    };

    const attachPdfListeners = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) {
          return;
        }

        const scrollRoot = (doc.scrollingElement || doc.documentElement || doc.body) as HTMLElement;
        const onScroll = () => {
          markInteraction();
          syncPdfProgress();
        };

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

    const onLoad = () => {
      cleanupPdfListeners();
      attachPdfListeners();
    };

    iframe.addEventListener('load', onLoad);
    attachPdfListeners();

    const pollId = window.setInterval(() => {
      if (pdfObserverReadyRef.current) {
        syncPdfProgress();
      }
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

    const timeoutId = window.setTimeout(() => {
      setEngagementLoadingTimedOut(true);
    }, 12_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [canFetchEngagement, engagementLoading]);

  useEffect(() => {
    if (!open || !material) {
      return;
    }

    return () => {
      finalizeViewSession();
    };
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
    if (!container || !material || isTeacher || isPresentation) {
      return;
    }

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
      pushProgressEvent({
        scrollPercent: normalizedPercent,
        pages: pagesViewedRef.current,
      });
    }, 250);
  }, [isPresentation, isTeacher, markInteraction, material, pushProgressEvent]);

  const handleDownload = useCallback(() => {
    markInteraction();

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

    if (!material || isTeacher || markingDone) {
      return;
    }

    setMarkingDone(true);

    const fallbackPageNumber = isPresentation && pptPreviewMode === 'extracted' && pptxSlidesCountRef.current > 0
      ? Math.min(currentSlideRef.current + 1, pptxSlidesCountRef.current)
      : pagesViewedRef.current[pagesViewedRef.current.length - 1];

    pushProgressEvent({
      scrollPercent: 100,
      pageNumber: fallbackPageNumber,
      pages: pagesViewedRef.current,
      force: true,
    });

    finalizeViewSession({
      forceComplete: true,
      forceScrollPercent: 100,
    });

    const nowIso = new Date().toISOString();
    setStudentProgress((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        completed: true,
        progress_percent: Math.max(current.progress_percent, 100),
        last_viewed_at: nowIso,
        completed_at: current.completed_at || nowIso,
      };
    });

    toast({
      title: 'Marked as done',
      description: 'Your reading progress was saved successfully.',
    });

    setMarkingDone(false);
    onOpenChange(false);
  }, [
    finalizeViewSession,
    isPresentation,
    isTeacher,
    markingDone,
    markInteraction,
    material,
    onOpenChange,
    pptPreviewMode,
    pushProgressEvent,
    toast,
  ]);

  const renderTeacherEngagement = () => {
    if (!isTeacher) return null;

    const getInitials = (item: (typeof engagementStats)[number]) => {
      const first = item.student?.first_name?.[0] ?? '';
      const last = item.student?.last_name?.[0] ?? '';
      return (first + last).toUpperCase() || '?';
    };

    const getFullName = (item: (typeof engagementStats)[number]) =>
      [item.student?.first_name, item.student?.last_name].filter(Boolean).join(' ').trim()
      || item.student?.email || 'Student';

    const getEventIcon = (type: string) => {
      switch (type) {
        case 'view_start': return <Eye className="h-3.5 w-3.5 text-blue-500" />;
        case 'view_end': return <Clock className="h-3.5 w-3.5 text-slate-500" />;
        case 'download': return <FileDown className="h-3.5 w-3.5 text-emerald-600" />;
        case 'scroll': return <Activity className="h-3.5 w-3.5 text-violet-500" />;
        default: return <BarChart2 className="h-3.5 w-3.5 text-muted-foreground" />;
      }
    };

    // Student detail view
    if (selectedEngagementStudent) {
      const item = selectedEngagementStudent;
      const fullName = getFullName(item);
      const allEvents = [...item.interaction_events].reverse();

      return (
        <TabsContent value="engagement" className="mt-0 flex min-h-0 flex-1 flex-col space-y-4">
          <button
            type="button"
            onClick={() => setSelectedEngagementStudent(null)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
          >
            <ArrowLeft className="h-4 w-4" />
            All Students
          </button>

          {/* Student header */}
          <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
            <Avatar className="h-12 w-12 flex-shrink-0">
              <AvatarFallback className="text-sm font-semibold bg-emerald-100 text-emerald-700">
                {getInitials(item)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-base truncate">{fullName}</p>
              <p className="text-xs text-muted-foreground">Last viewed {formatEventTime(item.last_viewed_at)}</p>
            </div>
            <Badge variant={item.completed ? 'default' : 'secondary'} className="shrink-0">
              {item.completed ? 'Completed' : 'In Progress'}
            </Badge>
          </div>

          {/* Progress */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Reading Progress</span>
              <span className="font-semibold tabular-nums">{item.progress_percent.toFixed(1)}%</span>
            </div>
            <Progress value={item.progress_percent} className="h-2" />
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Views', value: item.view_count, icon: <Eye className="h-4 w-4 text-blue-500" /> },
              { label: 'Downloads', value: item.download_count, icon: <FileDown className="h-4 w-4 text-emerald-600" /> },
              { label: 'Avg Session', value: item.avg_session_duration_seconds ? formatDuration(item.avg_session_duration_seconds) : 'N/A', icon: <Clock className="h-4 w-4 text-slate-500" /> },
              { label: 'Scan Time', value: formatDuration(item.total_scan_seconds), icon: <Activity className="h-4 w-4 text-violet-500" /> },
              { label: 'Total Events', value: item.event_count, icon: <BarChart2 className="h-4 w-4 text-orange-500" /> },
              { label: 'Pages Viewed', value: item.pages_viewed.length > 0 ? item.pages_viewed.join(', ') : 'N/A', icon: <BookOpen className="h-4 w-4 text-indigo-500" /> },
            ].map(({ label, value, icon }) => (
              <div key={label} className="rounded-lg border border-border bg-card p-3 flex items-start gap-2">
                <div className="mt-0.5">{icon}</div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                  <p className="text-sm font-semibold">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Full interaction timeline */}
          <div>
            <p className="text-sm font-semibold mb-3">Interaction Timeline</p>
            {allEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No interaction events captured yet.</p>
            ) : (
              <div className="space-y-2">
                {allEvents.map((event, index) => {
                  const eventDetails = getEventDetails(event);
                  return (
                    <div key={`${item.id}-${event.type}-${event.timestamp}-${index}`} className="flex items-start gap-3 p-3 rounded-lg border border-border/70 bg-muted/20">
                      <div className="mt-0.5 p-1.5 rounded-md bg-background border border-border/60">
                        {getEventIcon(event.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{getEventLabel(event)}</p>
                        {eventDetails && <p className="text-xs text-muted-foreground mt-0.5">{eventDetails}</p>}
                      </div>
                      <p className="text-[11px] text-muted-foreground shrink-0 mt-0.5">{formatEventTime(event.timestamp)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      );
    }

    // Student list view (Level 1)
    return (
      <TabsContent value="engagement" className="mt-0 flex min-h-0 flex-1 flex-col space-y-4">
        {/* Class summary banner */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Class Engagement</p>
            <Badge variant="secondary">{engagementStats.length} student{engagementStats.length !== 1 ? 's' : ''}</Badge>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Average Progress</span>
              <span className="font-semibold tabular-nums">{teacherAverageProgress.toFixed(1)}%</span>
            </div>
            <Progress value={teacherAverageProgress} className="h-2" />
          </div>
          {engagementStats.length > 0 && (
            <div className="flex gap-4 text-xs text-muted-foreground pt-1">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                {engagementStats.filter(s => s.completed).length} completed
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400"></span>
                {engagementStats.filter(s => !s.completed).length} in progress
              </span>
            </div>
          )}
        </div>

        {engagementLoading && !engagementLoadingTimedOut ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Loading engagement analytics...
          </div>
        ) : null}

        {engagementLoadingTimedOut ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground space-y-3">
            <p>Engagement request is taking longer than expected.</p>
            <Button type="button" size="sm" variant="outline" className="gap-2"
              onClick={() => { setEngagementLoadingTimedOut(false); void refetchEngagement(); }}>
              <RefreshCw className="h-4 w-4" /> Retry
            </Button>
          </div>
        ) : null}

        {engagementError ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground space-y-3">
            <p className="font-medium text-foreground">Could not load engagement analytics.</p>
            <p>{engagementErrorDetails instanceof Error ? engagementErrorDetails.message : 'Please try again.'}</p>
            <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => void refetchEngagement()}>
              <RefreshCw className="h-4 w-4" /> Retry
            </Button>
          </div>
        ) : null}

        {!engagementLoading && !engagementError && engagementStats.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-center space-y-2">
            <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No students have opened this material yet.</p>
          </div>
        ) : null}

        {/* Student list */}
        {!engagementLoading && !engagementError && engagementStats.length > 0 ? (
          <div className="space-y-2 min-h-0 flex-1 overflow-auto pr-1">
            {engagementStats.map((item) => {
              const fullName = getFullName(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedEngagementStudent(item)}
                  className="w-full text-left rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-sm transition-all p-4 group"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 flex-shrink-0">
                      <AvatarFallback className="text-sm font-semibold bg-emerald-100 text-emerald-700">
                        {getInitials(item)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">{fullName}</p>
                        <Badge variant={item.completed ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                          {item.completed ? 'Completed' : 'In Progress'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mb-1.5">
                        <Progress value={item.progress_percent} className="h-1.5 flex-1" />
                        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{item.progress_percent.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{item.view_count} views</span>
                        {item.download_count > 0 && <span className="flex items-center gap-1"><FileDown className="h-3 w-3" />{item.download_count} dl</span>}
                        <span>Last seen {formatEventTime(item.last_viewed_at)}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </TabsContent>
    );
  };

  const renderPreview = () => {
    if (!material?.url) {
      return (
        <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          This material does not have a file URL yet.
        </div>
      );
    }

    if (isImage) {
      return (
        <div className="rounded-lg border border-border bg-muted/20 p-2 md:p-4">
          <img
            src={material.url}
            alt={material.title}
            className="w-full rounded object-contain"
          />
        </div>
      );
    }

    if (isVideo) {
      return (
        <div className="rounded-lg border border-border bg-muted/20 p-2 md:p-4">
          <video
            controls
            className="w-full rounded"
            src={material.url}
          >
            Your browser does not support this video format.
          </video>
        </div>
      );
    }

    if (isPdf) {
      return (
        <div className="rounded-lg border border-border overflow-hidden bg-muted/20 h-[calc(100dvh-19rem)] min-h-[24rem]">
          <iframe
            ref={pdfIframeRef}
            src={`${material.url}#view=FitH`}
            title={material.title}
            className="h-full w-full"
          />
        </div>
      );
    }

    if (isDoc) {
      const docOfficeEmbedUrl = material?.url
        ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(material.url)}`
        : null;

      const modeToggle = (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { markInteraction(); setDocPreviewMode('office'); }}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${docPreviewMode === 'office' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
          >
            Office View
          </button>
          <button
            type="button"
            onClick={() => { markInteraction(); setDocPreviewMode('extracted'); }}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${docPreviewMode === 'extracted' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
          >
            Extracted
          </button>
        </div>
      );

      if (docPreviewMode === 'office') {
        return (
          <div className="rounded-lg border border-border bg-background p-4 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">Rendered via Microsoft Office Online</span>
              {modeToggle}
            </div>
            {docOfficeEmbedUrl ? (
              <div className="rounded-lg border border-border overflow-hidden bg-muted/20 h-[calc(100dvh-22rem)] min-h-[24rem]">
                <iframe
                  src={docOfficeEmbedUrl}
                  title={`${material.title} (Office preview)`}
                  className="h-full w-full"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                Office preview unavailable for this URL. Switch to Extracted view or use Download.
              </div>
            )}
          </div>
        );
      }

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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium text-foreground">DOCX extraction failed.</p>
              {modeToggle}
            </div>
            <p>{docxError}</p>
            <p>Switch to Office View or use Download to open in your office app.</p>
          </div>
        );
      }

      if (!docxHtml) {
        return (
          <div className="rounded-lg border border-dashed border-border p-6 bg-muted/20 space-y-2 text-sm text-muted-foreground">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>No DOCX content detected for extracted preview.</span>
              {modeToggle}
            </div>
          </div>
        );
      }

      return (
        <div className="rounded-lg border border-border bg-background p-4 md:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Extracted text</span>
            {modeToggle}
          </div>
          <article
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: docxHtml }}
          />
        </div>
      );
    }

    if (isPresentation) {
      if (pptPreviewMode === 'true-content') {
        return (
          <div className="rounded-lg border border-border bg-background p-4 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Badge variant="outline">True Slide View</Badge>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  onClick={() => {
                    markInteraction();
                    setPptPreviewMode('true-content');
                  }}
                >
                  True PPT
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    markInteraction();
                    setPptPreviewMode('extracted');
                  }}
                >
                  Extracted
                </Button>
              </div>
            </div>

            {pptxOfficeEmbedUrl ? (
              <div className="rounded-lg border border-border overflow-hidden bg-muted/20 h-[calc(100dvh-22rem)] min-h-[24rem]">
                <iframe
                  src={pptxOfficeEmbedUrl}
                  title={`${material.title} (True PPT preview)`}
                  className="h-full w-full"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                True PPT preview is unavailable for this file URL. Switch to Extracted view or use Download.
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              This mode preserves the real slide layout when the PPT URL is publicly reachable.
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
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  markInteraction();
                  setPptPreviewMode('true-content');
                }}
              >
                True PPT
              </Button>
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={() => {
                  markInteraction();
                  setPptPreviewMode('extracted');
                }}
              >
                Extracted
              </Button>
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
                className="mb-5 max-h-[40vh] w-full rounded object-contain border border-border/70 bg-white"
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

  if (!open || !material) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] bg-background" onMouseMove={markInteraction} onTouchStart={markInteraction}>
      <div className={`h-full w-full ${isTeacher ? 'px-3 py-3 md:px-6 md:py-5' : ''}`}>
        <div className={`${isTeacher ? 'mx-auto max-w-[1500px] rounded-xl border border-border bg-card/90 shadow-xl' : 'h-full w-full'} flex h-full flex-col overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 border-b border-border p-3 md:p-4">
            <h2 className="line-clamp-1 text-base md:text-2xl font-semibold text-foreground">{material.title}</h2>
            <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={closePreview}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              setActiveTab(value);
              markInteraction();
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="border-b border-border px-3 py-2 md:p-4">
              {/* Desktop tab list */}
              <TabsList className={`hidden sm:grid w-full ${isTeacher ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                {isTeacher ? <TabsTrigger value="engagement">Engagement</TabsTrigger> : null}
                <TabsTrigger value="details">Details</TabsTrigger>
              </TabsList>
              {/* Mobile compact tab row */}
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
                      <p className="text-xs text-muted-foreground shrink-0">
                        {scrollPercent.toFixed(0)}% read
                      </p>
                      <div className="flex items-center gap-2">
                        {!isTeacher ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={handleMarkAsDone}
                            disabled={markingDone}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {markingDone ? 'Saving...' : 'Mark as Done'}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant={isTeacher ? 'default' : 'outline'}
                          size="sm"
                          onClick={handleDownload}
                          className="gap-1.5 text-xs"
                        >
                          <Download className="h-3.5 w-3.5" />
                          {isTeacher ? 'Download File' : 'Download'}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div
                  ref={previewContainerRef}
                  onScroll={handleScroll}
                  className="min-h-0 flex-1 overflow-auto pr-1 pb-1"
                >
                  {renderPreview()}
                </div>

                {hasUrl && !canInlinePreview ? (
                  <p className="text-xs text-muted-foreground">
                    Inline preview is not available for this type. Download to open with the device app.
                  </p>
                ) : null}
              </TabsContent>

              {renderTeacherEngagement()}

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
                      {studentProgressLoading ? (
                        <p className="text-xs text-muted-foreground">Syncing your latest reading status...</p>
                      ) : null}
                      {studentProgressError ? (
                        <p className="text-xs text-muted-foreground">{studentProgressError}</p>
                      ) : null}
                    </>
                  ) : null}
                  {courseId ? (
                    <p className="text-sm"><span className="text-muted-foreground">Course:</span> {courseId}</p>
                  ) : null}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
