import { useCallback, useEffect, useRef, useState } from 'react';

interface DocxPreviewProps {
  url: string;
  title: string;
  docxHtml: string;
  docxLoading: boolean;
  docxError: string | null;
  docxPages: string[];
  docxPagesLoading: boolean;
  docxPagesError: string | null;
  docPreviewMode: 'office' | 'extracted' | 'print';
  setDocPreviewMode: (mode: 'office' | 'extracted' | 'print') => void;
  markInteraction: () => void;
  onPageVisible?: (pageNumber: number) => void;
}

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2.0;

export function DocxPreview({
  url,
  title,
  docxHtml,
  docxLoading,
  docxError,
  docxPages,
  docxPagesLoading,
  docxPagesError,
  docPreviewMode,
  setDocPreviewMode,
  markInteraction,
  onPageVisible,
}: DocxPreviewProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [pageScale, setPageScale] = useState(1);
  const [manualZoom, setManualZoom] = useState<number | null>(null);

  const effectiveZoom = manualZoom ?? pageScale;

  const zoomIn = useCallback(() => {
    markInteraction();
    setManualZoom((z) => Math.min(ZOOM_MAX, Math.round(((z ?? pageScale) + ZOOM_STEP) * 10) / 10));
  }, [markInteraction, pageScale]);

  const zoomOut = useCallback(() => {
    markInteraction();
    setManualZoom((z) => Math.max(ZOOM_MIN, Math.round(((z ?? pageScale) - ZOOM_STEP) * 10) / 10));
  }, [markInteraction, pageScale]);

  const resetZoom = useCallback(() => {
    markInteraction();
    setManualZoom(null);
  }, [markInteraction]);

  // Measure natural A4 page width and compute auto-fit zoom factor.
  useEffect(() => {
    if (docPreviewMode !== 'print' || docxPages.length === 0) {
      setPageScale(1);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    const measure = () => {
      const section = canvas.querySelector('section.docx') as HTMLElement | null;
      if (!section) return;
      const naturalWidth = section.scrollWidth || section.offsetWidth;
      if (naturalWidth <= 0) return;
      // Subtract p-6 padding (24px each side)
      const available = canvas.clientWidth - 48;
      setPageScale(Math.min(1, Math.max(0.3, available / naturalWidth)));
    };

    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    // Brief delay so docx-preview styles are applied before measuring
    const tid = window.setTimeout(measure, 80);
    return () => { ro.disconnect(); window.clearTimeout(tid); };
  }, [docPreviewMode, docxPages]);

  // Reset manual zoom when the document changes (new pages loaded).
  useEffect(() => {
    setManualZoom(null);
  }, [docxPages]);

  // Track which pages become visible so the progress system records page numbers.
  useEffect(() => {
    if (!onPageVisible || !canvasRef.current || docxPages.length === 0 || docPreviewMode !== 'print') return;
    const canvas = canvasRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageNum = Number((entry.target as HTMLElement).dataset.page);
            if (pageNum > 0) onPageVisible(pageNum);
          }
        }
      },
      { threshold: 0.2 },
    );

    // Page wrappers are marked with data-page after render
    const pageEls = canvas.querySelectorAll<HTMLElement>('[data-page]');
    for (const el of Array.from(pageEls)) observer.observe(el);

    return () => observer.disconnect();
  }, [docxPages, docPreviewMode, onPageVisible]);

  const docOfficeEmbedUrl = url
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
    : null;

  const modeToggle = (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        onClick={() => { markInteraction(); setDocPreviewMode('print'); }}
        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${docPreviewMode === 'print' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
      >
        Print Layout
      </button>
      <button
        type="button"
        onClick={() => { markInteraction(); setDocPreviewMode('office'); }}
        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${docPreviewMode === 'office' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
      >
        Office Online
      </button>
      <button
        type="button"
        onClick={() => { markInteraction(); setDocPreviewMode('extracted'); }}
        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${docPreviewMode === 'extracted' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
      >
        Plain Text
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
              title={`${title} (Office preview)`}
              className="h-full w-full"
            />
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            Office preview unavailable for this URL. Switch to Print Layout or Plain Text, or use Download.
          </div>
        )}
      </div>
    );
  }

  if (docPreviewMode === 'print') {
    if (docxPagesLoading) {
      return (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-muted-foreground">Preparing print layout…</span>
            {modeToggle}
          </div>
          <div className="rounded-lg bg-neutral-300 dark:bg-neutral-700 p-6 flex flex-col items-center gap-6">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="w-full max-w-[793px] bg-white/50 dark:bg-white/10 animate-pulse shadow-lg rounded-sm"
                style={{ aspectRatio: '210 / 297' }}
              />
            ))}
          </div>
        </div>
      );
    }

    if (docxPagesError) {
      return (
        <div className="rounded-lg border border-dashed border-border p-6 bg-muted/20 space-y-2 text-sm text-muted-foreground">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-medium text-foreground">Print layout rendering failed.</p>
            {modeToggle}
          </div>
          <p>{docxPagesError}</p>
          <p>Try switching to Office Online or Plain Text view.</p>
        </div>
      );
    }

    if (docxPages.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-border p-6 bg-muted/20 space-y-2 text-sm text-muted-foreground">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>No pages to display.</span>
            {modeToggle}
          </div>
        </div>
      );
    }

    const zoomPct = `${Math.round(effectiveZoom * 100)}%`;

    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-muted-foreground">
              Print layout · {docxPages.length} page{docxPages.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={zoomOut}
                disabled={effectiveZoom <= ZOOM_MIN}
                className="rounded px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                −
              </button>
              <span className="text-xs tabular-nums w-10 text-center text-muted-foreground select-none">
                {zoomPct}
              </span>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={zoomIn}
                disabled={effectiveZoom >= ZOOM_MAX}
                className="rounded px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                +
              </button>
              {manualZoom !== null && (
                <button
                  type="button"
                  onClick={resetZoom}
                  className="rounded px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                >
                  Auto
                </button>
              )}
            </div>
          </div>
          {modeToggle}
        </div>
        <div
          ref={canvasRef}
          className="rounded-lg bg-neutral-300 dark:bg-neutral-700 p-6 flex flex-col items-center gap-4 overflow-x-auto"
        >
          {docxPages.map((pageHtml, index) => (
            <div key={index} data-page={index + 1} className="flex flex-col items-center gap-1.5">
              <div
                className="shadow-xl"
                style={effectiveZoom !== 1 ? { zoom: effectiveZoom } : undefined}
                dangerouslySetInnerHTML={{ __html: pageHtml }}
              />
              <span className="text-xs tabular-nums select-none text-neutral-500 dark:text-neutral-400">
                {index + 1} / {docxPages.length}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 'extracted' / plain text mode
  if (docxLoading) {
    return (
      <div className="rounded-lg border border-border p-6 bg-muted/20 text-sm text-muted-foreground">
        Rendering plain text preview...
      </div>
    );
  }

  if (docxError) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 bg-muted/20 space-y-2 text-sm text-muted-foreground">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium text-foreground">Plain text extraction failed.</p>
          {modeToggle}
        </div>
        <p>{docxError}</p>
        <p>Switch to Office Online view or use Download to open in your office app.</p>
      </div>
    );
  }

  if (!docxHtml) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 bg-muted/20 space-y-2 text-sm text-muted-foreground">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>No content detected for plain text preview.</span>
          {modeToggle}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-background p-4 md:p-6 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Plain text</span>
        {modeToggle}
      </div>
      <article
        className="prose prose-sm max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: docxHtml }}
      />
    </div>
  );
}
