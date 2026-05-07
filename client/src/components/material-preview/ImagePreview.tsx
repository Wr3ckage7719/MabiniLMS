interface ImagePreviewProps {
  url: string;
  title: string;
}

export function ImagePreview({ url, title }: ImagePreviewProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-2 md:p-4">
      <img src={url} alt={title} className="w-full rounded object-contain" />
    </div>
  );
}
