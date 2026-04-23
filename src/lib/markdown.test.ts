import { describe, expect, it } from 'vitest';
import { lenifyHeadings } from './markdown';

describe('lenifyHeadings', () => {
  it('inserts space after leading #s for all levels H1-H6', () => {
    const out = lenifyHeadings('#a\n##b\n###c\n####d\n#####e\n######f');
    expect(out).toBe('# a\n## b\n### c\n#### d\n##### e\n###### f');
  });

  it('leaves already-spaced headings untouched', () => {
    const src = '# Title\n## Heading 2\n### With multiple words';
    expect(lenifyHeadings(src)).toBe(src);
  });

  it('does not modify # appearing mid-line', () => {
    const src = 'text with # not a heading\nprice is $100 # off';
    expect(lenifyHeadings(src)).toBe(src);
  });

  it('does not treat 7+ # as a heading', () => {
    // 7 # is not a heading in CommonMark; our regex matches 1-6 and then [^\s#],
    // so 7+ # followed by non-space stays untouched.
    const src = '#######7hash';
    expect(lenifyHeadings(src)).toBe(src);
  });

  it('handles mixed valid and invalid lines', () => {
    const src = '# Good\n##bad\ntext\n### Also good\n####nope';
    expect(lenifyHeadings(src)).toBe('# Good\n## bad\ntext\n### Also good\n#### nope');
  });
});
