import { describe, expect, it, vi, beforeEach } from 'vitest';

const { postMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
}));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: postMock,
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { materialsService } from '@/services/materials.service';

describe('materialsService.create', () => {
  beforeEach(() => {
    postMock.mockReset();
    postMock.mockResolvedValue({ success: true, data: {} });
  });

  it('posts JSON payload when no file is provided', async () => {
    await materialsService.create('course-1', {
      title: 'Reading 1',
      type: 'pdf',
      file_url: 'https://example.com/reading.pdf',
    });

    expect(postMock).toHaveBeenCalledWith('/courses/course-1/materials', {
      title: 'Reading 1',
      type: 'pdf',
      file_url: 'https://example.com/reading.pdf',
    });
  });

  it('posts multipart form-data payload when a file is provided', async () => {
    const file = new File(['test-content'], 'reading.pdf', { type: 'application/pdf' });

    await materialsService.create('course-2', {
      title: 'Reading 2',
      type: 'pdf',
      file,
    });

    const [url, payload, config] = postMock.mock.calls[0];

    expect(url).toBe('/courses/course-2/materials');
    expect(payload).toBeInstanceOf(FormData);
    expect((payload as FormData).get('title')).toBe('Reading 2');
    expect((payload as FormData).get('type')).toBe('pdf');
    expect((payload as FormData).get('file')).toBe(file);
    expect(config).toEqual({
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  });
});
