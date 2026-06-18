import { describe, expect, it } from 'vitest';
import { frontmatterKeyCount } from './frontmatter';

describe('frontmatterKeyCount', () => {
  it('returns 0 when there is no frontmatter', () => {
    expect(frontmatterKeyCount('# Hello\n\nsome text')).toBe(0);
    expect(frontmatterKeyCount('')).toBe(0);
  });

  it('counts top-level keys of a simple block', () => {
    const text = ['---', 'title: Hi', 'tags: [a, b]', 'created: 2026-06-18', '---', '', 'body'].join(
      '\n',
    );
    expect(frontmatterKeyCount(text)).toBe(3);
  });

  it('counts a person note like Obsidian (14 properties)', () => {
    const text = [
      '---',
      'type: person',
      'employee_code: "4527"',
      'title: "Zhang Jin (Carl)"',
      'name: "Zhang Jin (Carl)"',
      'email: zhangc@sea.com',
      'seatalk_id: "1452995079"',
      'region: "SG > 5SPD Office"',
      'rank: "Principal Engineer"',
      'level: "16"',
      'departments: ["[[Recommendation]]"]',
      'manager: "[[Andy Zhang]]"',
      'reports:',
      '  - "[[Liu Weijie]]"',
      '  - "[[Pei Tao]]"',
      'status: in-position',
      'created: 2026-06-11',
      '---',
      '',
      '# Zhang Jin (Carl)',
    ].join('\n');
    expect(frontmatterKeyCount(text)).toBe(14);
  });

  it('ignores nested keys, list items, and comments', () => {
    const text = [
      '---',
      'name: ego',
      '# a comment',
      'tools:',
      '  - Read',
      '  - Write',
      'nested:',
      '  inner: value',
      '---',
    ].join('\n');
    expect(frontmatterKeyCount(text)).toBe(3); // name, tools, nested
  });

  it('returns 0 for an unterminated block', () => {
    expect(frontmatterKeyCount('---\ntitle: Hi\n\nbody without close')).toBe(0);
  });

  it('does not treat a horizontal rule mid-document as frontmatter', () => {
    expect(frontmatterKeyCount('text\n\n---\n\nmore')).toBe(0);
  });
});
