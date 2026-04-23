import { describe, expect, it } from 'vitest';
import { wordCount } from './wordCount';

describe('wordCount', () => {
  it('counts words and chars', () => {
    expect(wordCount('hello world')).toEqual({ words: 2, chars: 11 });
  });

  it('treats whitespace-only as zero words', () => {
    expect(wordCount('   \n  ')).toEqual({ words: 0, chars: 6 });
  });

  it('handles empty string', () => {
    expect(wordCount('')).toEqual({ words: 0, chars: 0 });
  });
});
