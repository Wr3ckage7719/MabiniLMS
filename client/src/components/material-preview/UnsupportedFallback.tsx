export function UnsupportedFallback() {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground space-y-2">
      <p className="font-medium text-foreground">Inline preview is not available for this file type.</p>
      <p>Use the Download button to view the file in your device app.</p>
    </div>
  );
}
