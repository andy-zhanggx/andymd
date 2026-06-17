import { describe, it, expect } from 'vitest';
import {
  buildAuthHeaders,
  shouldCheckNow,
  effectiveToken,
  UPDATE_CHECK_INTERVAL_MS,
} from './updater';

describe('buildAuthHeaders', () => {
  it('returns a PRIVATE-TOKEN header when a token is present', () => {
    expect(buildAuthHeaders('abc')).toEqual({ 'PRIVATE-TOKEN': 'abc' });
  });
  it('returns no headers for empty/null token', () => {
    expect(buildAuthHeaders('')).toEqual({});
    expect(buildAuthHeaders(null)).toEqual({});
    expect(buildAuthHeaders(undefined)).toEqual({});
  });
});

describe('shouldCheckNow', () => {
  it('checks when never checked before', () => {
    expect(shouldCheckNow(null, 1_000_000, UPDATE_CHECK_INTERVAL_MS)).toBe(true);
  });
  it('does not check within the interval', () => {
    const now = 1_000_000;
    expect(shouldCheckNow(now - 1000, now, UPDATE_CHECK_INTERVAL_MS)).toBe(false);
  });
  it('checks once the interval has elapsed', () => {
    const now = 100_000_000;
    expect(shouldCheckNow(now - UPDATE_CHECK_INTERVAL_MS - 1, now, UPDATE_CHECK_INTERVAL_MS)).toBe(true);
  });
});

describe('effectiveToken', () => {
  it('prefers the config token', () => {
    expect(effectiveToken('cfg')).toBe('cfg');
  });
  it('falls back to empty string when config is blank and no env', () => {
    // VITE_GITLAB_TOKEN is unset in the test env.
    expect(effectiveToken('')).toBe('');
  });
});
