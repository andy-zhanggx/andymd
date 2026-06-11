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

  it('counts each CJK character as a word', () => {
    expect(wordCount('你好世界')).toEqual({ words: 4, chars: 4 });
  });

  it('ignores CJK punctuation in the word count', () => {
    expect(wordCount('你好，世界。')).toEqual({ words: 4, chars: 6 });
  });

  it('counts mixed CJK and Latin text', () => {
    // 4 CJK chars + "and" + "English" = 6 words
    expect(wordCount('中文 and English 混排')).toEqual({ words: 6, chars: 17 });
  });

  it('counts kana and hangul as words', () => {
    expect(wordCount('ひらがな 한글')).toEqual({ words: 6, chars: 7 });
  });
});
