interface DocxPreviewProps {
  url: string;
  title: string;
  docxHtml: string;
  docxLoading: boolean;
  docxError: string | null;
  docPreviewMode: 'office' | 'extracted';
  setDocPreviewMode: (mode: 'office' | 'extracted') => void;
  markInteraction: () => void;
}

export function DocxPreview({
  url,
  title,
  docxHtml,
  docxLoading,
  docxError,
  docPreviewMode,
  setDocPreviewMode,
  markInteraction,
}: DocxPreviewProps) {
  const docOfficeEmbedUrl = url
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
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
              title={`${title} (Office preview)`}
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
