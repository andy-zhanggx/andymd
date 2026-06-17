import { describe, it, expect } from 'vitest';
import { parseOutline, stripInline } from './outline';

describe('stripInline', () => {
  it('removes emphasis, code, links, wikilinks, highlight', () => {
    expect(stripInline('**bold** and *italic*')).toBe('bold and italic');
    expect(stripInline('a `code` b')).toBe('a code b');
    expect(stripInline('see [docs](http://x)')).toBe('see docs');
    expect(stripInline('a [[Page|alias]] b')).toBe('a alias b');
    expect(stripInline('a [[Page]] b')).toBe('a Page b');
    expect(stripInline('~~old~~ ==new==')).toBe('old new');
  });
});

describe('parseOutline', () => {
  it('parses ATX headings with levels and order', () => {
    const md = '# A\n\nsome text\n\n## B\n\n### C\n';
    expect(parseOutline(md)).toEqual([
      { level: 1, text: 'A', index: 0 },
      { level: 2, text: 'B', index: 1 },
      { level: 3, text: 'C', index: 2 },
    ]);
  });

  it('recognizes lenient CJK headings (no space)', () => {
    expect(parseOutline('##标题')).toEqual([{ level: 2, text: '标题', index: 0 }]);
  });

  it('ignores # lines inside fenced code blocks', () => {
    const md = '# Real\n\n```\n# not a heading\n```\n\n## Also Real\n';
    expect(parseOutline(md).map((h) => h.text)).toEqual(['Real', 'Also Real']);
  });

  it('strips trailing closing hashes', () => {
    expect(parseOutline('## Title ##')[0].text).toBe('Title');
  });

  it('cleans inline markdown in heading text', () => {
    expect(parseOutline('# **Bold** Title')[0].text).toBe('Bold Title');
  });

  it('returns empty for headingless docs', () => {
    expect(parseOutline('just a paragraph')).toEqual([]);
  });
});
