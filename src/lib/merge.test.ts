import { describe, expect, it } from 'vitest';
import { CONFLICT_MINE, CONFLICT_SEP, CONFLICT_THEIRS, merge3 } from './merge';

describe('merge3', () => {
  const base = ['title', 'alpha', 'beta', 'gamma'].join('\n');

  it('returns base when nothing changed', () => {
    expect(merge3(base, base, base)).toEqual({ merged: base, conflicts: 0 });
  });

  it('takes mine when only mine changed', () => {
    const mine = ['title', 'alpha MINE', 'beta', 'gamma'].join('\n');
    expect(merge3(base, mine, base)).toEqual({ merged: mine, conflicts: 0 });
  });

  it('takes theirs when only theirs changed', () => {
    const theirs = ['title', 'alpha', 'beta THEIRS', 'gamma'].join('\n');
    expect(merge3(base, base, theirs)).toEqual({ merged: theirs, conflicts: 0 });
  });

  it('merges non-overlapping edits from both sides', () => {
    const mine = ['title MINE', 'alpha', 'beta', 'gamma'].join('\n');
    const theirs = ['title', 'alpha', 'beta', 'gamma THEIRS'].join('\n');
    expect(merge3(base, mine, theirs)).toEqual({
      merged: ['title MINE', 'alpha', 'beta', 'gamma THEIRS'].join('\n'),
      conflicts: 0,
    });
  });

  it('accepts identical changes from both sides without conflict', () => {
    const both = ['title', 'alpha SAME', 'beta', 'gamma'].join('\n');
    expect(merge3(base, both, both)).toEqual({ merged: both, conflicts: 0 });
  });

  it('merges an insertion on one side with an edit on the other', () => {
    const mine = ['title', 'alpha', 'inserted', 'beta', 'gamma'].join('\n');
    const theirs = ['title', 'alpha', 'beta', 'gamma THEIRS'].join('\n');
    expect(merge3(base, mine, theirs)).toEqual({
      merged: ['title', 'alpha', 'inserted', 'beta', 'gamma THEIRS'].join('\n'),
      conflicts: 0,
    });
  });

  it('marks overlapping edits as a conflict block', () => {
    const mine = ['title', 'alpha MINE', 'beta', 'gamma'].join('\n');
    const theirs = ['title', 'alpha THEIRS', 'beta', 'gamma'].join('\n');
    const { merged, conflicts } = merge3(base, mine, theirs);
    expect(conflicts).toBe(1);
    expect(merged.split('\n')).toEqual([
      'title',
      CONFLICT_MINE,
      'alpha MINE',
      CONFLICT_SEP,
      'alpha THEIRS',
      CONFLICT_THEIRS,
      'beta',
      'gamma',
    ]);
  });

  it('counts multiple independent conflicts', () => {
    const mine = ['A1', 'alpha', 'beta', 'D1'].join('\n');
    const theirs = ['A2', 'alpha', 'beta', 'D2'].join('\n');
    const { conflicts } = merge3(base, mine, theirs);
    expect(conflicts).toBe(2);
  });

  it('handles a deletion on one side cleanly', () => {
    const mine = ['title', 'beta', 'gamma'].join('\n'); // deleted alpha
    const theirs = ['title', 'alpha', 'beta', 'gamma THEIRS'].join('\n');
    expect(merge3(base, mine, theirs)).toEqual({
      merged: ['title', 'beta', 'gamma THEIRS'].join('\n'),
      conflicts: 0,
    });
  });

  it('conflicts when one side deletes what the other edits', () => {
    const mine = ['title', 'beta', 'gamma'].join('\n'); // deleted alpha
    const theirs = ['title', 'alpha THEIRS', 'beta', 'gamma'].join('\n');
    const { conflicts } = merge3(base, mine, theirs);
    expect(conflicts).toBe(1);
  });
});
