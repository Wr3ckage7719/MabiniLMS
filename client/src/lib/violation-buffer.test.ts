import { beforeEach, describe, expect, it, vi } from 'vitest';

const { reportExamViolationMock } = vi.hoisted(() => ({
  reportExamViolationMock: vi.fn(),
}));

vi.mock('@/services/exams.service', () => ({
  examsService: {
    reportExamViolation: reportExamViolationMock,
  },
}));

// Reset module between tests so the in-memory buffer starts fresh.
// We don't need to delete the IDB — the buffer is reset via replaceAll.
let service: typeof import('./violation-buffer');

const clearIdbViolations = (): Promise<void> =>
  new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('mabini-queues');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });

beforeEach(async () => {
  reportExamViolationMock.mockReset();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

  // Fresh module with fresh buffer state.
  vi.resetModules();
  service = await import('./violation-buffer');
});

describe('violation-buffer', () => {
  it('online + successful POST: not buffered', async () => {
    const fakeResult = { violation_count: 1, terminated: false, auto_submitted: false };
    reportExamViolationMock.mockResolvedValueOnce(fakeResult);

    const out = await service.reportViolationDurable('attempt-1', 'visibility_hidden');

    expect(out.buffered).toBe(false);
    expect(out.result).toEqual(fakeResult);
    expect(service.getQueuedViolationCount()).toBe(0);
  });

  it('offline: buffered immediately, IDB receives the entry', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const out = await service.reportViolationDurable('attempt-2', 'fullscreen_exit');

    expect(out.buffered).toBe(true);
    expect(service.getQueuedViolationCount()).toBe(1);
  });

  it('online + failing POST: buffered', async () => {
    reportExamViolationMock.mockRejectedValueOnce(new Error('Network error'));

    const out = await service.reportViolationDurable('attempt-3', 'copy');

    expect(out.buffered).toBe(true);
    expect(service.getQueuedViolationCount()).toBe(1);
  });

  it('flushViolationBuffer drains buffer when calls succeed', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await service.reportViolationDurable('attempt-4', 'paste');
    await service.reportViolationDurable('attempt-4', 'cut');
    expect(service.getQueuedViolationCount()).toBe(2);

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    reportExamViolationMock.mockResolvedValue({ violation_count: 1, terminated: false, auto_submitted: false });

    const result = await service.flushViolationBuffer();

    expect(result.synced).toBe(2);
    expect(result.remaining).toBe(0);
    expect(reportExamViolationMock).toHaveBeenCalledTimes(2);
  });

  it('flushViolationBuffer halts on first failure', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await service.reportViolationDurable('attempt-5', 'context_menu');
    await service.reportViolationDurable('attempt-5', 'devtools_open');

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    reportExamViolationMock.mockRejectedValue(new Error('Server error'));

    const result = await service.flushViolationBuffer();

    expect(result.synced).toBe(0);
    expect(result.remaining).toBe(2);
    // Only called once — bails after the first failure.
    expect(reportExamViolationMock).toHaveBeenCalledTimes(1);
  });
});
