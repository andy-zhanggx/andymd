import { describe, expect, it } from 'vitest';
import { OFF_STATUS, groupHits, scoreToBar, statusLabel, type SemanticHit } from './semantic';

const hit = (path: string, score: number, heading = 'H'): SemanticHit => ({
  path,
  relPath: path.slice(1),
  heading,
  line: 1,
  snippet: 's',
  score,
});

describe('statusLabel', () => {
  it('describes each phase', () => {
    expect(statusLabel(OFF_STATUS, null)).toBe('Off');
    expect(statusLabel({ ...OFF_STATUS, phase: 'loading-model' }, null)).toBe('Loading model…');
    expect(statusLabel({ ...OFF_STATUS, phase: 'indexing' }, null)).toBe('Indexing…');
    expect(statusLabel({ ...OFF_STATUS, phase: 'indexing', done: 12, total: 90 }, null)).toBe(
      'Indexing 12/90',
    );
    expect(statusLabel({ ...OFF_STATUS, phase: 'error' }, null)).toBe('Error');
    expect(statusLabel({ ...OFF_STATUS, phase: 'ready' }, null)).toBe('Ready');
    expect(statusLabel({ ...OFF_STATUS, phase: 'ready' }, 1)).toBe('1 hit');
    expect(statusLabel({ ...OFF_STATUS, phase: 'ready' }, 7)).toBe('7 hits');
  });
});

describe('groupHits', () => {
  it('groups by file keeping best-first order', () => {
    const groups = groupHits([hit('/a', 0.9), hit('/b', 0.8), hit('/a', 0.7), hit('/c', 0.6)]);
    expect(groups.map((g) => g.relPath)).toEqual(['a', 'b', 'c']);
    expect(groups[0].hits.map((h) => h.score)).toEqual([0.9, 0.7]);
    expect(groupHits([])).toEqual([]);
  });
});

describe('scoreToBar', () => {
  it('stretches the useful band and clamps', () => {
    expect(scoreToBar(0.1)).toBe(0);
    expect(scoreToBar(0.3)).toBe(0);
    expect(scoreToBar(0.575)).toBeCloseTo(0.5);
    expect(scoreToBar(0.85)).toBe(1);
    expect(scoreToBar(0.99)).toBe(1);
  });
});
