import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../types';

describe('DEFAULT_CONFIG.updateToken', () => {
  it('defaults to an empty string', () => {
    expect(DEFAULT_CONFIG.updateToken).toBe('');
  });
});
