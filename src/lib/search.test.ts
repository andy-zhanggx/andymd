import { describe, it, expect } from 'vitest';
import { findInText, stepIndex } from './search';

describe('findInText', () => {
  it('returns empty for an empty query', () => {
    expect(findInText('hello world', '')).toEqual([]);
  });

  it('finds all non-overlapping occurrences', () => {
    // "the cat sat on the mat" → "at" at indices 5, 9, 20
    expect(findInText('the cat sat on the mat', 'at')).toEqual([5, 9, 20]);
  });

  it('is case-insensitive by default', () => {
    expect(findInText('Hello HELLO hello', 'hello')).toEqual([0, 6, 12]);
  });

  it('respects case-sensitive mode', () => {
    expect(findInText('Hello HELLO hello', 'hello', true)).toEqual([12]);
  });

  it('does not return overlapping matches', () => {
    expect(findInText('aaaa', 'aa')).toEqual([0, 2]);
  });

  it('handles CJK text', () => {
    expect(findInText('你好世界你好', '你好')).toEqual([0, 4]);
  });
});

describe('stepIndex', () => {
  it('returns -1 with no matches', () => {
    expect(stepIndex(0, -1, 1)).toBe(-1);
  });

  it('starts at first match going forward from none', () => {
    expect(stepIndex(3, -1, 1)).toBe(0);
  });

  it('starts at last match going backward from none', () => {
    expect(stepIndex(3, -1, -1)).toBe(2);
  });

  it('wraps forward past the end', () => {
    expect(stepIndex(3, 2, 1)).toBe(0);
  });

  it('wraps backward past the start', () => {
    expect(stepIndex(3, 0, -1)).toBe(2);
  });
});
