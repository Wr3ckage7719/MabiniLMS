import { describe, expect, it, vi } from 'vitest';

import {
  downloadAllMaterialsWithTracking,
  downloadMaterialWithTracking,
  openMaterialWithTracking,
} from '@/lib/material-actions';

describe('material-actions', () => {
  it('opens a material URL and triggers view tracking', () => {
    const openUrl = vi.fn();
    const trackView = vi.fn().mockResolvedValue(undefined);

    const result = openMaterialWithTracking(
      {
        id: 'material-1',
        title: 'Week 1 Reading',
        url: 'https://drive.google.com/file/d/material-1/view',
      },
      { openUrl, trackView }
    );

    expect(result).toBe(true);
    expect(openUrl).toHaveBeenCalledWith('https://drive.google.com/file/d/material-1/view');
    expect(trackView).toHaveBeenCalledTimes(1);
    expect(trackView).toHaveBeenCalledWith('material-1', expect.any(String));
  });

  it('returns false and skips side effects when material URL is missing', () => {
    const openUrl = vi.fn();
    const trackView = vi.fn().mockResolvedValue(undefined);

    const result = openMaterialWithTracking(
      {
        id: 'material-2',
        title: 'No URL Material',
      },
      { openUrl, trackView }
    );

    expect(result).toBe(false);
    expect(openUrl).not.toHaveBeenCalled();
    expect(trackView).not.toHaveBeenCalled();
  });

  it('downloads a material URL and triggers view tracking', () => {
    const downloadUrl = vi.fn();
    const trackView = vi.fn().mockResolvedValue(undefined);

    const result = downloadMaterialWithTracking(
      {
        id: 'material-3',
        title: 'Linear Algebra Module 1.pdf',
        url: 'https://example.com/module-1.pdf',
      },
      { downloadUrl, trackView }
    );

    expect(result).toBe(true);
    expect(downloadUrl).toHaveBeenCalledTimes(1);
    expect(downloadUrl).toHaveBeenCalledWith(
      'https://example.com/module-1.pdf',
      'Linear_Algebra_Module_1.pdf'
    );
    expect(trackView).toHaveBeenCalledTimes(1);
    expect(trackView).toHaveBeenCalledWith('material-3', expect.any(String));
  });

  it('downloads only materials with valid URLs when bulk action is triggered', () => {
    const downloadUrl = vi.fn();
    const trackView = vi.fn().mockResolvedValue(undefined);

    const count = downloadAllMaterialsWithTracking(
      [
        { id: 'm-1', title: 'Module A', url: 'https://example.com/a.pdf' },
        { id: 'm-2', title: 'Module B', url: '' },
        { id: 'm-3', title: 'Module C', url: 'https://example.com/c.pdf' },
      ],
      { downloadUrl, trackView }
    );

    expect(count).toBe(2);
    expect(downloadUrl).toHaveBeenCalledTimes(2);
    expect(trackView).toHaveBeenCalledTimes(2);
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
          trackView: vi.fn().mockRejectedValue(new Error('tracking failed')),
        }
      )
    ).not.toThrow();

    expect(openUrl).toHaveBeenCalledTimes(1);
  });
});
