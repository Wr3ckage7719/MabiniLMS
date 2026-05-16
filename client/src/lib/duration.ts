// Formats a duration in seconds as a compact human label: "12m 30s",
// "1h 5m", "45s", or "—" for falsy/non-positive values. Used in
// engagement views to show time-spent-on-material in a small badge.
export function formatDurationSeconds(seconds: number | null | undefined): string {
  if (!Number.isFinite(seconds as number) || (seconds ?? 0) <= 0) return '—';
  const total = Math.round(seconds as number);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) {
    const rem = total % 60;
    return rem === 0 ? `${minutes}m` : `${minutes}m ${rem}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin === 0 ? `${hours}h` : `${hours}h ${remMin}m`;
}
