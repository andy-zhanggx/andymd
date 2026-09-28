import { describe, expect, it } from 'vitest';
import { lenifyHeadings } from './markdown';

describe('lenifyHeadings', () => {
  it('inserts space after leading #s for levels H2-H6', () => {
    const out = lenifyHeadings('##b\n###c\n####d\n#####e\n######f\n##标题');
    expect(out).toBe('## b\n### c\n#### d\n##### e\n###### f\n## 标题');
  });

  it('treats a single # before a tag character as an Obsidian tag, not H1', () => {
    const src = '#project #idea\n#标签\n#a/b';
    expect(lenifyHeadings(src)).toBe(src);
    // Punctuation after a single # can't start a tag — still a heading.
    expect(lenifyHeadings('#【注意】')).toBe('# 【注意】');
  });

  it('leaves fenced code and frontmatter alone', () => {
    const src = '---\n#comment: yes\n---\n```c\n#include <stdio.h>\n```\n##after';
    expect(lenifyHeadings(src)).toBe('---\n#comment: yes\n---\n```c\n#include <stdio.h>\n```\n## after');
    const tilde = '~~~~\n##x\n~~~\n##y\n~~~~\n##z';
    expect(lenifyHeadings(tilde)).toBe('~~~~\n##x\n~~~\n##y\n~~~~\n## z');
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
