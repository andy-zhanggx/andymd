import { describe, it, expect } from 'vitest';
import { docStats } from './docStats';

describe('docStats', () => {
  it('counts words, chars, chars-no-spaces, lines', () => {
    const s = docStats('hello world\nsecond line');
    expect(s.words).toBe(4);
    expect(s.chars).toBe('hello world\nsecond line'.length);
    expect(s.charsNoSpaces).toBe('helloworldsecondline'.length);
    expect(s.lines).toBe(2);
  });

  it('is empty for empty input', () => {
    expect(docStats('')).toEqual({
      words: 0,
      chars: 0,
      charsNoSpaces: 0,
      lines: 0,
      readingTimeMin: 0,
    });
  });

  it('rounds reading time up to at least 1 minute', () => {
    expect(docStats('a few words here').readingTimeMin).toBe(1);
    const long = Array.from({ length: 450 }, () => 'word').join(' ');
    expect(docStats(long).readingTimeMin).toBe(3); // 450/200 → ceil 3
  });

  it('counts CJK characters as words', () => {
    expect(docStats('你好世界').words).toBe(4);
  });
});
