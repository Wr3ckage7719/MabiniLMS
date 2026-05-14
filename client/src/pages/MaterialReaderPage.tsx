import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getClassHomePath } from '@/lib/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, CheckCircle2, Loader2, Download, ZoomIn, ZoomOut } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { materialsService } from '@/services/materials.service';
import {
  trackScrollProgress,
  trackViewEnd,
  trackViewStart,
  downloadMaterialWithTracking,
} from '@/lib/material-actions';
import {
  renderDocxToPages,
  convertPptxToSlides,
  type PptxSlidePreview,
} from '@/lib/material-preview';
import { openPdf, type PdfDocumentHandle } from '@/lib/pdf-reader';
import { useStudentLesson } from '@/hooks-api/useLessons';

type FileKind = 'pdf' | 'docx' | 'pptx' | 'image' | 'video' | 'unsupported';

interface MaterialMeta {
  id: string;
  title: string;
  url: string;
  kind: FileKind;
}

const URL_EXTENSION_RE = /\.([a-z0-9]+)(?:\?.*)?(?:#.*)?$/i;

const detectKindFromUrl = (url: string, declaredType?: string): FileKind => {
  const ext = (URL_EXTENSION_RE.exec(url || '')?.[1] || '').toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx' || ext === 'doc') return 'docx';
  if (ext === 'pptx' || ext === 'ppt') return 'pptx';
  if (ext === 'mp4' || ext === 'webm') return 'video';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';

  const t = (declaredType || '').toLowerCase();
  if (t === 'pdf') return 'pdf';
  if (t === 'video') return 'video';
  if (t === 'document') return 'docx';
  return 'unsupported';
};


export default function MaterialReaderPage() {
  const { id, lessonId, materialId } = useParams();
  const classId = id ?? '';
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const lessonQuery = useStudentLesson(classId, lessonId);
  const lesson = lessonQuery.data ?? null;

  const nextMaterial = useMemo(() => {
    if (!lesson) return null;
    const idx = lesson.materials.findIndex((m) => m.material_id === materialId);
    if (idx < 0) return null;
    return lesson.materials[idx + 1] ?? null;
  }, [lesson, materialId]);

  const [meta, setMeta] = useState<MaterialMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // PDF state
  const [pdfHandle, setPdfHandle] = useState<PdfDocumentHandle | null>(null);
  const [pdfReady, setPdfReady] = useState(false);
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // DOCX state
  const [docxPages, setDocxPages] = useState<string[] | null>(null);

  // PPTX state
  const [pptxSlides, setPptxSlides] = useState<PptxSlidePreview[] | null>(null);

  // Reader theme
  const [readerTheme, setReaderTheme] = useState<'light' | 'sepia' | 'dark'>('light');

  useEffect(() => {
    const saved = window.localStorage.getItem('mabini.reader-theme');
    if (saved === 'light' || saved === 'sepia' || saved === 'dark') setReaderTheme(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('mabini.reader-theme', readerTheme);
  }, [readerTheme]);

  const surfaceBg = readerTheme === 'dark' ? 'bg-zinc-900' : readerTheme === 'sepia' ? 'bg-[#f5ecd9]' : 'bg-white';
  const surfaceText = readerTheme === 'dark' ? 'text-zinc-100' : readerTheme === 'sepia' ? 'text-zinc-800' : 'text-zinc-900';
  const proseInvertClass = readerTheme === 'dark' ? 'prose-invert' : '';

  // Common
  const [pageIndex, setPageIndex] = useState(0); // 0-based
  const [totalPages, setTotalPages] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const pagesViewedRef = useRef<Set<number>>(new Set());
  const sessionStartRef = useRef<number>(Date.now());
  const trackingStartedRef = useRef(false);
  const finalizedRef = useRef(false);
  const reachedEndRef = useRef(false);

  // Download state — spam protection via cooldown ref
  const [downloading, setDownloading] = useState(false);
  const downloadCooldownRef = useRef<number | null>(null);

  // DOCX mobile zoom — CSS zoom affects layout (unlike transform: scale), so
  // margin: 0 auto centers the page correctly and overflow-x: hidden never clips.
  // We temporarily clear zoom before reading scrollWidth to always get the
  // natural (unzoomed) page width, preventing a ResizeObserver feedback loop.
  const docxSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [docxZoom, setDocxZoom] = useState(1);
  useEffect(() => {
    if (!docxSurfaceRef.current || !docxPages) return;
    const el = docxSurfaceRef.current;
    const measure = () => {
      const prev = el.style.zoom;
      el.style.zoom = '';
      const naturalWidth = el.scrollWidth;
      el.style.zoom = prev;
      if (naturalWidth <= 0) return;
      const availableWidth = el.parentElement?.offsetWidth ?? (window.innerWidth - 32);
      setDocxZoom(naturalWidth > availableWidth ? availableWidth / naturalWidth : 1);
    };
    requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [docxPages, pageIndex]);

  // Manual zoom override. null = auto (DOCX uses fit-to-width; PDF/image
  // use 1.0). Range 25%-200% in 10% steps. Resets when the material
  // changes so each new file starts at its sensible default.
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 2.0;
  const ZOOM_STEP = 0.1;
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  useEffect(() => {
    setManualZoom(null);
  }, [meta?.id]);

  const supportsZoom = meta?.kind === 'pdf' || meta?.kind === 'docx' || meta?.kind === 'image';
  const autoZoom = meta?.kind === 'docx' ? docxZoom : 1;
  const effectiveZoom = manualZoom ?? autoZoom;

  const zoomIn = useCallback(() => {
    setManualZoom((z) => Math.min(ZOOM_MAX, Math.round(((z ?? autoZoom) + ZOOM_STEP) * 10) / 10));
  }, [autoZoom]);
  const zoomOut = useCallback(() => {
    setManualZoom((z) => Math.max(ZOOM_MIN, Math.round(((z ?? autoZoom) - ZOOM_STEP) * 10) / 10));
  }, [autoZoom]);
  const resetZoom = useCallback(() => {
    setManualZoom(null);
  }, []);

  // Load material metadata
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);

    void (async () => {
      try {
        if (!materialId) {
          throw new Error('Missing material id');
        }
        const response = await materialsService.getById(materialId);
        const data = (response as { data?: Record<string, unknown> }).data || (response as Record<string, unknown>);
        const url = String((data as { file_url?: string; url?: string }).file_url || (data as { url?: string }).url || '');
        const title = String((data as { title?: string }).title || 'Material');
        const declaredType = String((data as { type?: string }).type || '');

        if (!url) {
          throw new Error('This material has no file attached.');
        }

        const kind = detectKindFromUrl(url, declaredType);

        if (!active) return;
        setMeta({ id: materialId, title, url, kind });
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Could not load material.';
        setLoadError(message);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [materialId]);

  // Kick off view tracking once we have the material
  useEffect(() => {
    if (!meta || trackingStartedRef.current) return;
    trackingStartedRef.current = true;
    sessionStartRef.current = Date.now();
    void trackViewStart(meta.id);
  }, [meta]);

  // PDF load — render at 2x for sharpness on Retina/HiDPI displays.
  useEffect(() => {
    if (!meta || meta.kind !== 'pdf') return;
    let active = true;
    let handle: PdfDocumentHandle | null = null;

    void (async () => {
      try {
        handle = await openPdf(meta.url);
        if (!active) {
          await handle.destroy();
          return;
        }
        setPdfHandle(handle);
        setTotalPages(handle.numPages);
        setPdfReady(true);
      } catch (err) {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : 'Could not open PDF.');
      }
    })();

    return () => {
      active = false;
      if (handle) {
        void handle.destroy();
      }
    };
  }, [meta]);

  // DOCX load — renderDocxToPages uses docx-preview to split into real Word pages
  useEffect(() => {
    if (!meta || meta.kind !== 'docx') return;
    let active = true;

    void (async () => {
      try {
        const pages = await renderDocxToPages(meta.url);
        if (!active) return;
        setDocxPages(pages);
        setTotalPages(pages.length);
      } catch (err) {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : 'Could not render document.');
      }
    })();

    return () => {
      active = false;
    };
  }, [meta]);

  // PPTX load
  useEffect(() => {
    if (!meta || meta.kind !== 'pptx') return;
    let active = true;

    void (async () => {
      try {
        const slides = await convertPptxToSlides(meta.url);
        if (!active) return;
        if (slides.length === 0) {
          throw new Error('No slides found in this presentation.');
        }
        setPptxSlides(slides);
        setTotalPages(slides.length);
      } catch (err) {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : 'Could not render presentation.');
      }
    })();

    return () => {
      active = false;
    };
  }, [meta]);

  // Single-page kinds — image / video / single-page DOCX. The reader still
  // marks the material as fully read once the page has been visited; the
  // pager just collapses to a single page indicator.
  useEffect(() => {
    if (!meta) return;
    if (meta.kind === 'image' || meta.kind === 'video') {
      setTotalPages(1);
    }
  }, [meta]);

  // Render PDF page when index, handle, or zoom changes. Base scale 2.0
  // keeps text sharp; multiplying by effectiveZoom re-rasterises at the
  // requested zoom so manual zoom-in stays sharp instead of pixelating
  // the way CSS zoom would.
  useEffect(() => {
    if (!pdfHandle || !pdfCanvasRef.current || meta?.kind !== 'pdf') return;
    const canvas = pdfCanvasRef.current;
    let active = true;
    void (async () => {
      try {
        await pdfHandle.renderPage(pageIndex + 1, canvas, 2.0 * effectiveZoom);
      } catch (err) {
        if (!active) return;
        toast({
          title: 'Could not render page',
          description: err instanceof Error ? err.message : 'Try the next page.',
          variant: 'destructive',
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [pdfHandle, pageIndex, toast, effectiveZoom, meta?.kind]);

  // Track page change — every visited page is added to the viewed set, and
  // the cumulative scroll percent is reported. The backend marks the
  // material `completed=true` once scroll percent rolls past 100, which is
  // what flips the lesson `viewed` flag for the gate.
  useEffect(() => {
    if (!meta || totalPages === 0) return;
    pagesViewedRef.current.add(pageIndex + 1);
    const pagesViewed = Array.from(pagesViewedRef.current).sort((a, b) => a - b);
    const scrollPercent = Math.round(((pageIndex + 1) / totalPages) * 100);
    void trackScrollProgress(meta.id, {
      scrollPercent,
      pageNumber: pageIndex + 1,
      pagesViewed,
    });
    if (pageIndex + 1 >= totalPages) {
      reachedEndRef.current = true;
    }
  }, [meta, pageIndex, totalPages]);

  const finalize = useCallback(
    async (forceComplete = false): Promise<void> => {
      if (!meta || finalizedRef.current) return;
      finalizedRef.current = true;
      const elapsed = Math.max(0, Math.round((Date.now() - sessionStartRef.current) / 1000));
      const finalPercent = totalPages > 0 ? Math.round(((pageIndex + 1) / totalPages) * 100) : 0;
      await trackViewEnd(meta.id, {
        timeSpentSeconds: elapsed,
        finalScrollPercent: finalPercent,
        completed: forceComplete || reachedEndRef.current,
        pageNumber: pageIndex + 1,
      });
    },
    [meta, pageIndex, totalPages]
  );

  // Finalize on unmount (fire-and-forget — can't await in cleanup)
  useEffect(() => {
    return () => { void finalize(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Finalize on tab close
  useEffect(() => {
    const handler = () => { void finalize(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [finalize]);

  const goBack = useCallback(() => {
    void finalize();
    if (lessonId) {
      navigate(`/class/${classId}/lessons/${lessonId}`);
    } else {
      navigate(getClassHomePath(user?.role, classId));
    }
  }, [classId, finalize, lessonId, navigate, user?.role]);

  const handlePrev = useCallback(() => {
    setPageIndex((current) => Math.max(0, current - 1));
  }, []);

  const handleNext = useCallback(() => {
    setPageIndex((current) => Math.min(totalPages - 1, current + 1));
  }, [totalPages]);

  const handleDownload = useCallback(() => {
    if (!meta || downloading) return;
    if (downloadCooldownRef.current && Date.now() < downloadCooldownRef.current) return;

    setDownloading(true);
    downloadCooldownRef.current = Date.now() + 2000;

    const fired = downloadMaterialWithTracking({ id: meta.id, title: meta.title, url: meta.url });

    if (!fired) {
      setDownloading(false);
      toast({
        title: 'Download unavailable',
        description: 'This material has no downloadable file.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Download started',
      description: 'Your file is being saved. This download has been recorded.',
    });

    window.setTimeout(() => { setDownloading(false); }, 2000);
  }, [meta, downloading, toast]);

  // Keyboard nav: arrow keys and Page Up/Down. Helps on desktop where
  // reaching for the mouse to flip pages slows down reading.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        handleNext();
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        handlePrev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleNext, handlePrev]);

  const handleFinish = useCallback(async () => {
    reachedEndRef.current = true;
    setFinishing(true);
    try {
      await finalize(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lessons', 'student', classId] }),
        queryClient.invalidateQueries({ queryKey: ['lessons', 'student', classId, lessonId] }),
      ]);
      toast({
        title: 'Material marked as read',
        description: nextMaterial
          ? `Open "${nextMaterial.title}" next, or mark the lesson as done.`
          : 'You can now mark this lesson as done to unlock its assessments.',
      });
      if (nextMaterial) {
        navigate(`/class/${classId}/lessons/${lessonId}/materials/${nextMaterial.material_id}`);
      } else {
        goBack();
      }
    } finally {
      setFinishing(false);
    }
  }, [classId, finalize, goBack, lessonId, navigate, nextMaterial, queryClient, toast]);

  const progressPercent = totalPages > 0 ? Math.round(((pageIndex + 1) / totalPages) * 100) : 0;
  const isLastPage = totalPages > 0 && pageIndex >= totalPages - 1;
  const isFirstPage = pageIndex <= 0;

  const body = useMemo(() => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading material…</p>
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" size="sm" onClick={goBack}>
            Back to lesson
          </Button>
        </div>
      );
    }

    if (!meta) return null;

    if (meta.kind === 'pdf') {
      return (
        <div className={`flex justify-center ${surfaceBg} rounded-lg`}>
          {!pdfReady ? (
            <div className="flex flex-col items-center justify-center gap-2 py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Preparing PDF…</p>
            </div>
          ) : null}
          <canvas
            ref={pdfCanvasRef}
            className={`max-w-full rounded-lg border shadow ${readerTheme === 'dark' ? '[filter:invert(1)_hue-rotate(180deg)]' : ''}`}
          />
        </div>
      );
    }

    if (meta.kind === 'docx') {
      if (!docxPages) {
        return (
          <div className="flex flex-col items-center justify-center gap-2 py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Preparing document…</p>
          </div>
        );
      }
      return (
        <div className="docx-reader-host">
          <div
            ref={docxSurfaceRef}
            className="docx-page-surface"
            style={{
              zoom: effectiveZoom !== 1 ? effectiveZoom : undefined,
              ...(readerTheme === 'dark' ? { filter: 'invert(1) hue-rotate(180deg)' } : {}),
            }}
            dangerouslySetInnerHTML={{ __html: docxPages[pageIndex] || '' }}
          />
        </div>
      );
    }

    if (meta.kind === 'pptx') {
      if (!pptxSlides) {
        return (
          <div className="flex flex-col items-center justify-center gap-2 py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Preparing slides…</p>
          </div>
        );
      }
      const slide = pptxSlides[pageIndex];
      return (
        <div className={`mx-auto max-w-4xl aspect-video rounded-lg border ${surfaceBg} shadow flex flex-col p-6 md:p-10 overflow-y-auto`}>
          {slide?.imageDataUrl ? (
            <img
              src={slide.imageDataUrl}
              alt={slide.title}
              className="mx-auto mb-4 max-h-72 object-contain"
            />
          ) : null}
          <h2 className={`text-xl md:text-2xl font-semibold ${surfaceText}`}>{slide?.title}</h2>
          <ul className={`mt-4 space-y-2 text-sm md:text-base ${readerTheme === 'dark' ? 'text-zinc-300' : 'text-zinc-800'}`}>
            {(slide?.lines || []).slice(1).map((line, idx) => (
              <li key={idx} className="leading-relaxed">{line}</li>
            ))}
          </ul>
        </div>
      );
    }

    if (meta.kind === 'image') {
      return (
        <div className="flex justify-center overflow-auto">
          <img
            src={meta.url}
            alt={meta.title}
            className={`max-h-[80vh] rounded-lg border ${surfaceBg}`}
            style={effectiveZoom !== 1 ? { zoom: effectiveZoom } : undefined}
          />
        </div>
      );
    }

    if (meta.kind === 'video') {
      return (
        <div className="flex justify-center">
          <video src={meta.url} controls className="max-h-[80vh] w-full max-w-4xl rounded-lg bg-black" />
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
        <p className="text-sm text-muted-foreground">
          This file type can't be viewed in-app yet. Open in a new tab from your lesson page.
        </p>
      </div>
    );
  }, [loading, loadError, meta, pdfReady, docxPages, pptxSlides, pageIndex, effectiveZoom, readerTheme, surfaceBg, surfaceText, goBack]);

  const showPager = !loading && !loadError && totalPages > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-3 md:px-6 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" className="rounded-xl gap-1.5" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to lesson</span>
          </Button>
          {/* Mobile download button */}
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl sm:hidden"
            onClick={handleDownload}
            disabled={downloading || !meta?.url}
            aria-label="Download material"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </Button>
          {/* Mobile zoom controls — only for kinds that benefit from zoom */}
          {supportsZoom ? (
            <div className="flex items-center gap-0.5 rounded-lg border bg-card sm:hidden" role="group" aria-label="Zoom">
              <button
                type="button"
                onClick={zoomOut}
                disabled={effectiveZoom <= ZOOM_MIN}
                className="p-1.5 text-muted-foreground hover:bg-muted rounded-l-lg disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={zoomIn}
                disabled={effectiveZoom >= ZOOM_MAX}
                className="p-1.5 text-muted-foreground hover:bg-muted rounded-r-lg disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          <div className="min-w-0 flex-1 text-center">
            <p className="text-sm md:text-base font-semibold truncate">{meta?.title || ''}</p>
            {totalPages > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Page {pageIndex + 1} of {totalPages} · {progressPercent}% read
              </p>
            ) : null}
          </div>
          <div className="hidden sm:flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl gap-1.5"
              onClick={handleDownload}
              disabled={downloading || !meta?.url}
              aria-label="Download material"
              title="Download this material file"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="hidden md:inline text-xs">{downloading ? 'Saving…' : 'Download'}</span>
            </Button>
            {/* Desktop zoom controls — full pill with percentage + Auto reset */}
            {supportsZoom ? (
              <div className="flex items-center gap-1 rounded-lg border bg-card p-0.5" role="group" aria-label="Zoom">
                <button
                  type="button"
                  onClick={zoomOut}
                  disabled={effectiveZoom <= ZOOM_MIN}
                  className="px-1.5 py-0.5 rounded text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="text-[10px] tabular-nums w-9 text-center text-muted-foreground select-none">
                  {Math.round(effectiveZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={zoomIn}
                  disabled={effectiveZoom >= ZOOM_MAX}
                  className="px-1.5 py-0.5 rounded text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                {manualZoom !== null ? (
                  <button
                    type="button"
                    onClick={resetZoom}
                    className="px-1.5 py-0.5 rounded text-[10px] uppercase text-muted-foreground hover:bg-muted"
                    aria-label="Reset zoom"
                  >
                    Auto
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-center gap-1 rounded-lg border bg-card p-0.5">
              {(['light', 'sepia', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setReaderTheme(t)}
                  className={`px-2 py-1 text-[10px] uppercase rounded-md transition ${readerTheme === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                >{t}</button>
              ))}
            </div>
            {reachedEndRef.current || isLastPage ? (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Ready
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">In progress</Badge>
            )}
          </div>
        </div>
        {totalPages > 0 ? (
          <Progress value={progressPercent} className="h-1.5 rounded-none" />
        ) : null}
      </header>

      <main className="flex-1 px-3 md:px-6 py-6 pb-32">{body}</main>

      {showPager ? (
        <footer className="sticky bottom-0 z-30 border-t bg-background/95 backdrop-blur shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          {isLastPage && nextMaterial && !finishing && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 px-4 py-2 text-sm text-emerald-800 dark:text-emerald-200 mx-3 md:mx-6 mt-2">
              Up next: <strong>{nextMaterial.title}</strong> — tap "Mark read & next" to continue.
            </div>
          )}
          <div className="max-w-6xl mx-auto px-3 md:px-6 py-3 md:py-4 flex items-center gap-2 md:gap-3">
            <Button
              variant="outline"
              size="lg"
              className="rounded-xl gap-1.5 h-11 px-3 md:px-5"
              onClick={handlePrev}
              disabled={isFirstPage}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="hidden sm:inline">Previous</span>
            </Button>

            <div className="flex-1 text-center">
              <p className="text-xs md:text-sm font-medium">
                Page {pageIndex + 1} <span className="text-muted-foreground">of {totalPages}</span>
              </p>
              <p className="text-[10px] md:text-[11px] text-muted-foreground mt-0.5">
                Tap Next to read on — your reading progress is tracked here.
              </p>
            </div>

            {isLastPage ? (
              <Button
                size="lg"
                className="rounded-xl gap-1.5 h-11 px-3 md:px-5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => void handleFinish()}
                disabled={finishing}
                aria-label="Mark material as read"
              >
                {finishing ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                <span className="hidden sm:inline">
                  {finishing ? 'Saving...' : nextMaterial ? 'Mark read & next' : 'Mark as read'}
                </span>
                <span className="sm:hidden">{finishing ? '...' : 'Done'}</span>
              </Button>
            ) : (
              <Button
                size="lg"
                className="rounded-xl gap-1.5 h-11 px-3 md:px-5"
                onClick={handleNext}
                aria-label="Next page"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-5 w-5" />
              </Button>
            )}
          </div>
        </footer>
      ) : null}
    </div>
  );
}
