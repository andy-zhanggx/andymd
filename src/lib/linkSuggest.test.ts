import { describe, it, expect } from 'vitest';
import {
  detectTrigger,
  fileSuggestions,
  headingSuggestions,
  linkTextFor,
  rankFiles,
  splitHeadingQuery,
} from './linkSuggest';
import type { FlatFile } from './quickOpen';

const f = (relPath: string): FlatFile => ({
  path: `/v/${relPath}`,
  name: relPath.split('/').pop()!,
  relPath,
});
const files = [f('Projects/Roadmap.md'), f('road trip.md'), f('a/Index.md'), f('b/Index.md'), f('img/roadmap.png')];

describe('detectTrigger', () => {
  it('finds an open [[ or ![[ before the caret', () => {
    expect(detectTrigger('see [[road')).toEqual({ embed: false, query: 'road', from: 4 });
    expect(detectTrigger('![[pic')).toEqual({ embed: true, query: 'pic', from: 0 });
    expect(detectTrigger('x [[')).toEqual({ embed: false, query: '', from: 2 });
    expect(detectTrigger('[[note#he')).toMatchObject({ query: 'note#he' });
  });
  it('stops at an alias pipe or a closed link', () => {
    expect(detectTrigger('[[note|al')).toBeNull();
    expect(detectTrigger('[[note]] and')).toBeNull();
    expect(detectTrigger('[single')).toBeNull();
  });
});

describe('ranking', () => {
  it('prefers prefix matches on the note name, notes before attachments', () => {
    expect(rankFiles(files, 'road').map((x) => x.relPath)).toEqual([
      'road trip.md',
      'Projects/Roadmap.md',
      'img/roadmap.png',
    ]);
  });
  it('matches path segments and subsequences', () => {
    expect(rankFiles(files, 'projects').map((x) => x.relPath)).toEqual(['Projects/Roadmap.md']);
    expect(rankFiles(files, 'rdmp').map((x) => x.relPath)).toContain('Projects/Roadmap.md');
  });
});

describe('linkTextFor', () => {
  it('uses the bare name when unique, the path when ambiguous', () => {
    expect(linkTextFor(files[0], files)).toBe('Roadmap');
    expect(linkTextFor(files[2], files)).toBe('a/Index');
    expect(linkTextFor(files[4], files)).toBe('roadmap.png');
  });
});

describe('suggestions', () => {
  it('offers a raw "new link" when nothing matches exactly', () => {
    const s = fileSuggestions(files, 'Brand new');
    expect(s[s.length - 1]).toMatchObject({ kind: 'raw', target: 'Brand new' });
    expect(fileSuggestions(files, 'roadmap').some((x) => x.kind === 'raw')).toBe(false);
  });
  it('builds heading targets', () => {
    expect(splitHeadingQuery('note#Int')).toEqual(['note', 'Int']);
    expect(splitHeadingQuery('note')).toBeNull();
    const hs = [
      { level: 1, text: 'Intro', index: 0 },
      { level: 2, text: 'Details', index: 1 },
    ];
    expect(headingSuggestions('note', hs, 'int')).toEqual([
      { kind: 'heading', label: 'Intro', detail: 'H1', target: 'note#Intro', level: 1 },
    ]);
    expect(headingSuggestions('', hs, '').map((h) => h.target)).toEqual(['#Intro', '#Details']);
  });
});
