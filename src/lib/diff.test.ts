import { describe, expect, it } from 'vitest';
import { diffLines, lcsPairs, unifiedRows } from './diff';

describe('lcsPairs', () => {
  it('matches identical inputs fully', () => {
    expect(lcsPairs(['a', 'b'], ['a', 'b'])).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });

  it('finds the common subsequence around edits', () => {
    expect(lcsPairs(['a', 'x', 'c'], ['a', 'y', 'c'])).toEqual([
      [0, 0],
      [2, 2],
    ]);
  });

  it('handles disjoint inputs', () => {
    expect(lcsPairs(['a'], ['b'])).toEqual([]);
  });
});

describe('diffLines', () => {
  it('reports identical texts as one equal run', () => {
    expect(diffLines('a\nb', 'a\nb')).toEqual([{ type: 'equal', lines: ['a', 'b'] }]);
  });

  it('reports a changed line as del + add', () => {
    expect(diffLines('a\nx\nc', 'a\ny\nc')).toEqual([
      { type: 'equal', lines: ['a'] },
      { type: 'del', lines: ['x'] },
      { type: 'add', lines: ['y'] },
      { type: 'equal', lines: ['c'] },
    ]);
  });

  it('reports pure insertion and deletion', () => {
    expect(diffLines('a\nc', 'a\nb\nc')).toEqual([
      { type: 'equal', lines: ['a'] },
      { type: 'add', lines: ['b'] },
      { type: 'equal', lines: ['c'] },
    ]);
    expect(diffLines('a\nb\nc', 'a\nc')).toEqual([
      { type: 'equal', lines: ['a'] },
      { type: 'del', lines: ['b'] },
      { type: 'equal', lines: ['c'] },
    ]);
  });

  it('handles trailing changes', () => {
    expect(diffLines('a', 'a\nb')).toEqual([
      { type: 'equal', lines: ['a'] },
      { type: 'add', lines: ['b'] },
    ]);
  });
});

describe('unifiedRows', () => {
  const a = ['1', '2', '3', '4', '5', '6', '7', '8'].join('\n');
  const b = ['1', '2', '3', '4', 'FIVE', '6', '7', '8'].join('\n');

  it('keeps context lines and collapses the rest into a gap', () => {
    const rows = unifiedRows(a, b, 2);
    expect(rows.map((r) => `${r.type}:${r.text}`)).toEqual([
      'gap:⋯',
      'equal:3',
      'equal:4',
      'del:5',
      'add:FIVE',
      'equal:6',
      'equal:7',
      'gap:⋯',
    ]);
  });

  it('numbers lines on both sides', () => {
    const rows = unifiedRows('x\na', 'y\na', 1);
    expect(rows[0]).toMatchObject({ type: 'del', text: 'x', aLine: 1 });
    expect(rows[1]).toMatchObject({ type: 'add', text: 'y', bLine: 1 });
    expect(rows[2]).toMatchObject({ type: 'equal', text: 'a', aLine: 2, bLine: 2 });
  });

  it('shows everything when texts are short', () => {
    const rows = unifiedRows('a\nb', 'a\nc', 5);
    expect(rows.some((r) => r.type === 'gap')).toBe(false);
  });
});
