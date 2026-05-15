import { describe, expect, it } from 'vitest';
import { extractApiErrorMessage } from './api-errors';

describe('extractApiErrorMessage', () => {
  it('returns the server error.message when present', () => {
    const error = {
      response: { data: { error: { message: 'Submit all required assessments first.' } } },
      message: 'Request failed with status code 403',
    };
    expect(extractApiErrorMessage(error)).toBe('Submit all required assessments first.');
  });

  it('falls back to response.data.message when error.message is absent', () => {
    const error = { response: { data: { message: 'Forbidden.' } } };
    expect(extractApiErrorMessage(error)).toBe('Forbidden.');
  });

  it('uses the JS error.message when no server payload exists', () => {
    expect(extractApiErrorMessage(new Error('Network down'))).toBe('Network down');
  });

  it('skips the noisy axios "Request failed with status code" fallback', () => {
    const error = { message: 'Request failed with status code 403' };
    expect(extractApiErrorMessage(error, 'Please try again.')).toBe('Please try again.');
  });

  it('returns the fallback for unknown error shapes', () => {
    expect(extractApiErrorMessage(null, 'fallback')).toBe('fallback');
    expect(extractApiErrorMessage(undefined, 'fallback')).toBe('fallback');
    expect(extractApiErrorMessage('a string', 'fallback')).toBe('fallback');
  });
});
