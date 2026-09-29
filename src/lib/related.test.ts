import { describe, it, expect } from 'vitest';
import { dismissKey, headingLines, pickSuggestions, sectionLine } from './related';
import type { SemanticHit } from './semantic';

const md = ['intro', '# A', 'a body', '```', '# not a heading', '```', '## B', 'b body', 'more'].join('\n');

describe('sections', () => {
  it('finds heading lines outside code', () => {
    expect(headingLines(md)).toEqual([2, 7]);
  });
  it('gives the last line of the caret section', () => {
    expect(sectionLine(md, -1)).toBe(1);
    expect(sectionLine(md, 0)).toBe(6);
    expect(sectionLine(md, 1)).toBe(9);
  });
});

const hit = (path: string, score: number, heading = ''): SemanticHit => ({
  path,
  relPath: path.slice(3),
  heading,
  line: 1,
  snippet: 's',
  score,
});

describe('pickSuggestions', () => {
  it('keeps one per note above threshold, skipping self, linked and dismissed notes', () => {
    const hits = [
      hit('/v/self.md', 0.99),
      hit('/v/a.md', 0.9, 'best'),
      hit('/v/a.md', 0.8),
      hit('/v/linked.md', 0.85),
      hit('/v/gone.md', 0.84),
      hit('/v/pic.png', 0.83),
      hit('/v/b.md', 0.7),
      hit('/v/c.md', 0.4),
    ];
    const out = pickSuggestions(hits, {
      currentPath: '/v/self.md',
      linked: new Set(['/v/linked.md']),
      dismissed: new Set([dismissKey('/v/self.md', '/v/gone.md')]),
      threshold: 0.6,
      max: 5,
    });
    expect(out.map((s) => [s.path, s.heading])).toEqual([
      ['/v/a.md', 'best'],
      ['/v/b.md', ''],
    ]);
  });
});
