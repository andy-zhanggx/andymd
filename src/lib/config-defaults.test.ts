import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../types';

describe('DEFAULT_CONFIG', () => {
  it('defaults lastSeenVersion to null', () => {
    expect(DEFAULT_CONFIG.lastSeenVersion).toBeNull();
  });
});
