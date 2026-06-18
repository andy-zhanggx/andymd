import { describe, it, expect } from 'vitest';
import { shouldCheckNow, UPDATE_CHECK_INTERVAL_MS } from './updater';

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
