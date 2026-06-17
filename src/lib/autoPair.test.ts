import { describe, it, expect } from 'vitest';
import { decidePair, openerClose, isCloser } from './autoPair';

describe('openerClose / isCloser', () => {
  it('maps openers to closers', () => {
    expect(openerClose('(')).toBe(')');
    expect(openerClose('[')).toBe(']');
    expect(openerClose('x')).toBeNull();
  });
  it('identifies closers', () => {
    expect(isCloser(')')).toBe(true);
    expect(isCloser('(')).toBe(false);
  });
});

describe('decidePair', () => {
  it('closes a bracket with empty selection', () => {
    expect(decidePair('(', true, 'a', '')).toEqual({ kind: 'close', open: '(', close: ')' });
  });

  it('wraps a selection', () => {
    expect(decidePair('[', false, '', '')).toEqual({ kind: 'wrap', open: '[', close: ']' });
  });

  it('skips over an existing closer', () => {
    expect(decidePair(')', true, 'x', ')')).toEqual({ kind: 'skip' });
  });

  it('skips over an existing quote', () => {
    expect(decidePair('"', true, 'x', '"')).toEqual({ kind: 'skip' });
  });

  it('auto-closes a quote at a word boundary', () => {
    expect(decidePair('"', true, ' ', '')).toEqual({ kind: 'close', open: '"', close: '"' });
    expect(decidePair('"', true, '', '')).toEqual({ kind: 'close', open: '"', close: '"' });
  });

  it('does NOT auto-close a quote mid-word (apostrophe)', () => {
    expect(decidePair("'", true, 'n', '')).toBeNull(); // don|'t
  });

  it('does nothing for ordinary characters', () => {
    expect(decidePair('a', true, 'x', '')).toBeNull();
  });
});
