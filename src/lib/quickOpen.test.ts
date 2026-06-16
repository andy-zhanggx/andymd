import { describe, it, expect } from 'vitest';
import { flattenFiles, filterFiles, normalizeNewFileName, createTarget } from './quickOpen';
import type { FileNode } from '../types';

const tree: FileNode = {
  path: '/vault',
  name: 'vault',
  kind: 'dir',
  children: [
    { path: '/vault/a.md', name: 'a.md', kind: 'file' },
    {
      path: '/vault/sub',
      name: 'sub',
      kind: 'dir',
      children: [{ path: '/vault/sub/b.md', name: 'b.md', kind: 'file' }],
    },
  ],
};

describe('flattenFiles', () => {
  it('returns every file with workspace-relative paths', () => {
    const files = flattenFiles(tree, '/vault');
    expect(files.map((f) => f.relPath)).toEqual(['a.md', 'sub/b.md']);
  });
});

describe('filterFiles', () => {
  const files = flattenFiles(tree, '/vault');
  it('matches case-insensitively on relative path', () => {
    expect(filterFiles(files, 'SUB').map((f) => f.name)).toEqual(['b.md']);
  });
  it('returns all when query blank', () => {
    expect(filterFiles(files, '   ')).toHaveLength(2);
  });
});

describe('normalizeNewFileName', () => {
  it('appends .md when no markdown extension', () => {
    expect(normalizeNewFileName('Ideas')).toBe('Ideas.md');
    expect(normalizeNewFileName('  notes/today ')).toBe('notes/today.md');
  });
  it('keeps an existing markdown extension', () => {
    expect(normalizeNewFileName('plan.markdown')).toBe('plan.markdown');
    expect(normalizeNewFileName('./x.md')).toBe('x.md');
  });
});

describe('createTarget', () => {
  const files = flattenFiles(tree, '/vault');
  it('is null for empty query', () => {
    expect(createTarget('  ', files)).toBeNull();
  });
  it('flags existing files', () => {
    expect(createTarget('a.md', files)).toEqual({ name: 'a.md', exists: true });
    expect(createTarget('a', files)).toEqual({ name: 'a.md', exists: true });
  });
  it('reports a new file as creatable', () => {
    expect(createTarget('fresh', files)).toEqual({ name: 'fresh.md', exists: false });
  });
});
