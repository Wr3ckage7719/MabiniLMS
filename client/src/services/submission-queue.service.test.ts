import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const { postMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
}));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    post: postMock,
  },
}));

import {
  enqueueSubmission,
  flushSubmissionQueue,
  getSubmissionQueue,
} from '@/services/submission-queue.service';

const STORAGE_KEY = 'mabinilms:submission-queue:v1';

describe('submission-queue.service', () => {
  let onLineSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.localStorage.clear();
    postMock.mockReset();
    onLineSpy = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
  });

  afterEach(() => {
    onLineSpy.mockRestore();
  });

  it('stores provider-first metadata and legacy aliases when enqueuing', () => {
    const queued = enqueueSubmission({
      courseId: 'course-1',
      assignmentId: 'assignment-1',
      payload: {
        drive_file_id: 'drive-file-abc',
        drive_file_name: 'My Essay.pdf',
        content: 'Please review this draft.',
      },
    });

    expect(queued.payload.provider).toBe('google_drive');
    expect(queued.payload.provider_file_id).toBe('drive-file-abc');
    expect(queued.payload.provider_file_name).toBe('My Essay.pdf');
    expect(queued.payload.drive_file_id).toBe('drive-file-abc');
    expect(queued.payload.drive_file_name).toBe('My Essay.pdf');
    expect(getSubmissionQueue()).toHaveLength(1);
  });

  it('normalizes legacy queued payloads during sync', async () => {
    const queuedAt = new Date().toISOString();

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        items: [
          {
            syncKey: 'legacy-sync-1',
            assignmentId: 'assignment-1',
            courseId: 'course-1',
            payload: {
              drive_file_id: 'legacy-file-id',
              drive_file_name: 'Legacy File.pdf',
              content: 'Legacy payload content',
              sync_key: 'legacy-sync-1',
            },
            status: 'queued',
            attempts: 0,
            queuedAt,
          },
        ],
      })
    );

    postMock.mockResolvedValue({ success: true });

    const result = await flushSubmissionQueue();

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith(
      '/assignments/assignment-1/submit',
      expect.objectContaining({
        provider: 'google_drive',
        provider_file_id: 'legacy-file-id',
        provider_file_name: 'Legacy File.pdf',
        drive_file_id: 'legacy-file-id',
        drive_file_name: 'Legacy File.pdf',
        sync_key: 'legacy-sync-1',
      })
    );
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.remaining).toBe(0);
    expect(getSubmissionQueue()).toHaveLength(0);
  });
});
