interface VideoPreviewProps {
  url: string;
}

export function VideoPreview({ url }: VideoPreviewProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-2 md:p-4">
      <video controls className="w-full rounded" src={url}>
        Your browser does not support this video format.
      </video>
    </div>
  );
}
