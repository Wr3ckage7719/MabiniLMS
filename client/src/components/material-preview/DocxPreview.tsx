import { useEffect, useRef, useState } from 'react';

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
}

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
}: DocxPreviewProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [pageScale, setPageScale] = useState(1);

  // Measure the natural page width from the first rendered section and compute
  // a zoom factor so pages always fit the canvas without horizontal overflow.
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
      // 24px padding on each side (p-6)
      const available = canvas.clientWidth - 48;
      setPageScale(Math.min(1, Math.max(0.3, available / naturalWidth)));
    };

    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    // Short delay so docx-preview styles are fully applied before we measure
    const tid = window.setTimeout(measure, 80);
    return () => { ro.disconnect(); window.clearTimeout(tid); };
  }, [docPreviewMode, docxPages]);

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

    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            Print layout · {docxPages.length} page{docxPages.length !== 1 ? 's' : ''}
          </span>
          {modeToggle}
        </div>
        <div
          ref={canvasRef}
          className="rounded-lg bg-neutral-300 dark:bg-neutral-700 p-6 flex flex-col items-center gap-4 overflow-x-auto"
        >
          {docxPages.map((pageHtml, index) => (
            <div key={index} className="flex flex-col items-center gap-1.5">
              <div
                className="shadow-xl"
                style={pageScale < 1 ? { zoom: pageScale } : undefined}
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
