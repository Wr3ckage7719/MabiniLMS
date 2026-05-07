interface PdfPreviewProps {
  url: string;
  title: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}

export function PdfPreview({ url, title, iframeRef }: PdfPreviewProps) {
  return (
    <div className="rounded-lg border border-border overflow-hidden bg-muted/20 h-[calc(100dvh-14rem)] min-h-[20rem] sm:h-[calc(100dvh-19rem)] sm:min-h-[24rem]">
      <iframe
        ref={iframeRef}
        src={`${url}#view=FitH`}
        title={title}
        className="h-full w-full"
      />
    </div>
  );
}
