import { describe, it, expect } from 'vitest';
import {
  generateRoomCode,
  normalizeRoomCode,
  isValidRoomCode,
  formatRoomCode,
  CODE_LENGTH,
  CODE_RE,
} from './roomCode';

describe('roomCode', () => {
  it('generates 8-char Crockford base32 codes with no ambiguous chars', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect(code).toMatch(CODE_RE);
      expect(code).not.toMatch(/[ILOU]/); // ambiguous chars excluded
    }
  });

  it('normalizes case, spaces, and dashes', () => {
    expect(normalizeRoomCode(' abcd-1234 ')).toBe('ABCD1234');
    expect(normalizeRoomCode('ab cd 12 34')).toBe('ABCD1234');
  });

  it('validates canonical and human-entered forms', () => {
    const code = generateRoomCode();
    expect(isValidRoomCode(code)).toBe(true);
    expect(isValidRoomCode(formatRoomCode(code))).toBe(true); // round-trips with dash
    expect(isValidRoomCode(code.toLowerCase())).toBe(true);
  });

  it('rejects malformed codes', () => {
    expect(isValidRoomCode('')).toBe(false);
    expect(isValidRoomCode('SHORT')).toBe(false);
    expect(isValidRoomCode('TOOLONG123')).toBe(false);
    expect(isValidRoomCode('ABCDILOU')).toBe(false); // ambiguous chars not in alphabet
  });

  it('formats as two groups of four', () => {
    expect(formatRoomCode('ABCD1234')).toBe('ABCD-1234');
    expect(formatRoomCode('abcd1234')).toBe('ABCD-1234');
  });
});
