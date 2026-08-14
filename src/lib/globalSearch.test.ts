import { describe, it, expect } from 'vitest';
import {
  highlightSegments,
  flattenResults,
  countMatches,
  type SearchResults,
} from './globalSearch';

describe('highlightSegments', () => {
  it('marks case-insensitive occurrences', () => {
    expect(highlightSegments('Hello hello world', 'hello')).toEqual([
      { text: 'Hello', hit: true },
      { text: ' ', hit: false },
      { text: 'hello', hit: true },
      { text: ' world', hit: false },
    ]);
  });

  it('returns the whole line when the query is empty or absent', () => {
    expect(highlightSegments('some text', '')).toEqual([{ text: 'some text', hit: false }]);
    expect(highlightSegments('some text', 'zzz')).toEqual([{ text: 'some text', hit: false }]);
  });

  it('handles a match spanning the full line and CJK text', () => {
    expect(highlightSegments('目标', '目标')).toEqual([{ text: '目标', hit: true }]);
    expect(highlightSegments('前缀目标后缀', '目标')).toEqual([
      { text: '前缀', hit: false },
      { text: '目标', hit: true },
      { text: '后缀', hit: false },
    ]);
  });
});

const SAMPLE: SearchResults = {
  truncated: false,
  files: [
    {
      path: '/v/a.md',
      relPath: 'a.md',
      truncated: false,
      matches: [
        { line: 1, text: 'one' },
        { line: 5, text: 'two' },
      ],
    },
    {
      path: '/v/b/c.md',
      relPath: 'b/c.md',
      truncated: false,
      matches: [{ line: 3, text: 'three' }],
    },
  ],
};

describe('flattenResults / countMatches', () => {
  it('flattens files into rows in display order', () => {
    const rows = flattenResults(SAMPLE);
    expect(rows.map((r) => `${r.relPath}:${r.line}`)).toEqual(['a.md:1', 'a.md:5', 'b/c.md:3']);
  });

  it('counts matches across files', () => {
    expect(countMatches(SAMPLE)).toBe(3);
  });
});
