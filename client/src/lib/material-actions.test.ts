import { describe, expect, it, vi } from 'vitest';

import {
  downloadAllMaterialsWithTracking,
  downloadMaterialWithTracking,
  openMaterialWithTracking,
} from '@/lib/material-actions';

describe('material-actions', () => {
  it('opens a material URL and triggers view tracking', () => {
    const openUrl = vi.fn();
    const trackViewStart = vi.fn().mockResolvedValue(undefined);

    const result = openMaterialWithTracking(
      {
        id: 'material-1',
        title: 'Week 1 Reading',
        url: 'https://drive.google.com/file/d/material-1/view',
      },
      { openUrl, trackViewStart }
    );

    expect(result).toBe(true);
    expect(openUrl).toHaveBeenCalledWith('https://drive.google.com/file/d/material-1/view');
    expect(trackViewStart).toHaveBeenCalledTimes(1);
    expect(trackViewStart).toHaveBeenCalledWith('material-1');
  });

  it('returns false and skips side effects when material URL is missing', () => {
    const openUrl = vi.fn();
    const trackViewStart = vi.fn().mockResolvedValue(undefined);

    const result = openMaterialWithTracking(
      {
        id: 'material-2',
        title: 'No URL Material',
      },
      { openUrl, trackViewStart }
    );

    expect(result).toBe(false);
    expect(openUrl).not.toHaveBeenCalled();
    expect(trackViewStart).not.toHaveBeenCalled();
  });

  it('downloads a material URL and triggers view tracking', () => {
    const downloadUrl = vi.fn();
    const trackDownload = vi.fn().mockResolvedValue(undefined);

    const result = downloadMaterialWithTracking(
      {
        id: 'material-3',
        title: 'Linear Algebra Module 1.pdf',
        url: 'https://example.com/module-1.pdf',
      },
      { downloadUrl, trackDownload }
    );

    expect(result).toBe(true);
    expect(downloadUrl).toHaveBeenCalledTimes(1);
    expect(downloadUrl).toHaveBeenCalledWith(
      'https://example.com/module-1.pdf',
      'Linear_Algebra_Module_1.pdf'
    );
    expect(trackDownload).toHaveBeenCalledTimes(1);
    expect(trackDownload).toHaveBeenCalledWith('material-3', {
      fileName: 'Linear_Algebra_Module_1.pdf',
    });
  });

  it('downloads only materials with valid URLs when bulk action is triggered', () => {
    const downloadUrl = vi.fn();
    const trackDownload = vi.fn().mockResolvedValue(undefined);

    const count = downloadAllMaterialsWithTracking(
      [
        { id: 'm-1', title: 'Module A', url: 'https://example.com/a.pdf' },
        { id: 'm-2', title: 'Module B', url: '' },
        { id: 'm-3', title: 'Module C', url: 'https://example.com/c.pdf' },
      ],
      { downloadUrl, trackDownload }
    );

    expect(count).toBe(2);
    expect(downloadUrl).toHaveBeenCalledTimes(2);
    expect(trackDownload).toHaveBeenCalledTimes(2);
  });

  it('swallows tracking errors so open action still succeeds', () => {
    const openUrl = vi.fn();

    expect(() =>
      openMaterialWithTracking(
        {
          id: 'material-4',
          title: 'Fault-tolerant open',
          url: 'https://example.com/fault-tolerant',
        },
        {
          openUrl,
          trackViewStart: vi.fn().mockRejectedValue(new Error('tracking failed')),
        }
      )
    ).not.toThrow();

    expect(openUrl).toHaveBeenCalledTimes(1);
  });
});
