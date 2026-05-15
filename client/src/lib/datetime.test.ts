import { describe, expect, it } from 'vitest';
import { formatDateTime, formatDateOnly, formatTimeOnly, parseServerDate, APP_TIME_ZONE } from './datetime';

describe('datetime helpers', () => {
  it('renders a UTC ISO string in Asia/Manila (UTC+8)', () => {
    // 2026-05-15T03:34:31Z is 11:34:31 in Manila — the exact bug case from
    // the report. Asserting 11:34:31 ensures the formatter applies the
    // configured timezone instead of falling back to the host's local zone.
    expect(formatDateTime('2026-05-15T03:34:31Z')).toBe('15/05/2026, 11:34:31 PHT');
  });

  it('preserves seconds when input contains them', () => {
    expect(formatDateTime('2026-01-01T00:00:00.500Z')).toBe('01/01/2026, 08:00:00 PHT');
  });

  it('returns fallback for empty / invalid input', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
    expect(formatDateTime('not a date')).toBe('—');
    expect(formatDateTime('', 'n/a')).toBe('n/a');
  });

  it('formatDateOnly drops the time portion', () => {
    expect(formatDateOnly('2026-05-15T03:34:31Z')).toBe('15/05/2026');
  });

  it('formatTimeOnly drops the date portion', () => {
    expect(formatTimeOnly('2026-05-15T03:34:31Z')).toBe('11:34:31');
  });

  it('exposes the configured timezone constant', () => {
    expect(APP_TIME_ZONE).toBe('Asia/Manila');
  });

  it('treats naive timestamps from TIMESTAMP-without-tz columns as UTC', () => {
    // Postgres returns assignments.due_date / submissions.submitted_at without
    // a Z marker. Before this fix the value was parsed as device-local time,
    // shifting every rendered value by the host offset. The formatter should
    // produce the same wall-clock time as the Z-suffixed equivalent.
    expect(formatDateTime('2026-05-15T05:00:00')).toBe('15/05/2026, 13:00:00 PHT');
    expect(parseServerDate('2026-05-15T05:00:00')!.toISOString()).toBe('2026-05-15T05:00:00.000Z');
  });

  it('respects an explicit timezone suffix when present', () => {
    expect(parseServerDate('2026-05-15T05:00:00+00:00')!.toISOString()).toBe('2026-05-15T05:00:00.000Z');
    expect(parseServerDate('2026-05-15T13:00:00+08:00')!.toISOString()).toBe('2026-05-15T05:00:00.000Z');
  });
});
