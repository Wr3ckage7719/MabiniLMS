import {
  formatProviderFileSize,
  normalizeSubmissionStorageMetadata,
} from '@/lib/submission-storage';

describe('normalizeSubmissionStorageMetadata', () => {
  it('prefers provider-first metadata when available', () => {
    const normalized = normalizeSubmissionStorageMetadata({
      storage_provider: 'google_drive',
      provider_file_id: 'provider-file-123',
      provider_file_name: 'Essay Final.pdf',
      provider_view_link: 'https://drive.google.com/file/d/provider-file-123/view',
      provider_mime_type: 'application/pdf',
      provider_size_bytes: 10240,
      submission_snapshot_at: '2026-04-20T10:20:30.000Z',
      content: 'Attached my final draft.',
      storage_metadata_complete: true,
    });

    expect(normalized.storageProvider).toBe('google_drive');
    expect(normalized.providerFileId).toBe('provider-file-123');
    expect(normalized.providerFileName).toBe('Essay Final.pdf');
    expect(normalized.providerViewLink).toBe('https://drive.google.com/file/d/provider-file-123/view');
    expect(normalized.providerMimeType).toBe('application/pdf');
    expect(normalized.providerSizeBytes).toBe(10240);
    expect(normalized.snapshotAt).toBe('2026-04-20T10:20:30.000Z');
    expect(normalized.submissionText).toBe('Attached my final draft.');
    expect(normalized.metadataComplete).toBe(true);
  });

  it('falls back to legacy drive fields for mixed rows', () => {
    const normalized = normalizeSubmissionStorageMetadata({
      drive_file_id: 'legacy-drive-file-456',
      drive_file_name: 'Legacy Essay.docx',
      drive_view_link: 'https://drive.google.com/file/d/legacy-drive-file-456/view',
      submission_text: 'Legacy submission notes',
      storage_consistency_issues: [
        {
          code: 'missing_provider_file_id',
          message: 'provider_file_id fallback applied',
          severity: 'warning',
          fallback_applied: true,
        },
      ],
    });

    expect(normalized.providerFileId).toBe('legacy-drive-file-456');
    expect(normalized.providerFileName).toBe('Legacy Essay.docx');
    expect(normalized.providerViewLink).toBe('https://drive.google.com/file/d/legacy-drive-file-456/view');
    expect(normalized.submissionText).toBe('Legacy submission notes');
    expect(normalized.metadataComplete).toBe(false);
    expect(normalized.consistencyIssues).toHaveLength(1);
  });

  it('builds a Google Drive view link when provider id exists but view link is missing', () => {
    const normalized = normalizeSubmissionStorageMetadata({
      provider_file_id: 'generated-view-link-id',
    });

    expect(normalized.providerViewLink).toBe(
      'https://drive.google.com/file/d/generated-view-link-id/view'
    );
    expect(normalized.submissionUrl).toBe(
      'https://drive.google.com/file/d/generated-view-link-id/view'
    );
  });
});

describe('formatProviderFileSize', () => {
  it('formats bytes into readable units', () => {
    expect(formatProviderFileSize(999)).toBe('999 B');
    expect(formatProviderFileSize(1536)).toBe('1.5 KB');
    expect(formatProviderFileSize(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('returns null for invalid inputs', () => {
    expect(formatProviderFileSize(null)).toBeNull();
    expect(formatProviderFileSize(undefined)).toBeNull();
    expect(formatProviderFileSize(-1)).toBeNull();
  });
});
