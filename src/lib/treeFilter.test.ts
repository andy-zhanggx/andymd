import { describe, expect, it } from 'vitest';
import type { FileNode } from '../types';
import { countFiles, hitSummary, pruneTree, type TreeFilter } from './treeFilter';

const file = (path: string): FileNode => ({ path, name: path.split('/').pop()!, kind: 'file' });
const dir = (path: string, children: FileNode[]): FileNode => ({
  path,
  name: path.split('/').pop()!,
  kind: 'dir',
  children,
});

const tree = dir('/v', [
  dir('/v/Projects', [
    file('/v/Projects/roadmap.md'),
    dir('/v/Projects/archive', [file('/v/Projects/archive/old.md')]),
  ]),
  dir('/v/Empty', []),
  file('/v/todo.md'),
  file('/v/zeta.md'),
]);

const filter = (over: Partial<TreeFilter> = {}): TreeFilter => ({
  query: 'x',
  hits: new Map(),
  truncated: false,
  status: 'done',
  version: 1,
  ...over,
});

describe('pruneTree', () => {
  it('keeps matching files with their ancestor folders, in original order', () => {
    const out = pruneTree(tree, new Set(['/v/zeta.md', '/v/Projects/archive/old.md']));
    expect(out.children!.map((n) => n.path)).toEqual(['/v/Projects', '/v/zeta.md']);
    const projects = out.children![0];
    expect(projects.children!.map((n) => n.path)).toEqual(['/v/Projects/archive']);
    expect(projects.children![0].children!.map((n) => n.path)).toEqual([
      '/v/Projects/archive/old.md',
    ]);
  });

  it('drops folders left empty and returns a childless root for no hits', () => {
    const out = pruneTree(tree, new Set());
    expect(out.path).toBe('/v');
    expect(out.children).toEqual([]);
  });

  it('does not mutate the source tree', () => {
    const before = JSON.stringify(tree);
    pruneTree(tree, new Set(['/v/todo.md']));
    expect(JSON.stringify(tree)).toBe(before);
  });
});

describe('countFiles', () => {
  it('counts file nodes recursively', () => {
    expect(countFiles(tree)).toBe(4);
    expect(countFiles(file('/v/a.md'))).toBe(1);
    expect(countFiles(dir('/v/e', []))).toBe(0);
  });
});

describe('hitSummary', () => {
  it('reports status while busy and a count when done', () => {
    expect(hitSummary(filter({ status: 'indexing' }), 0)).toBe('Indexing…');
    expect(hitSummary(filter({ status: 'searching' }), 3)).toBe('Searching…');
    expect(hitSummary(filter(), 0)).toBe('0 files');
    expect(hitSummary(filter(), 1)).toBe('1 file');
    expect(hitSummary(filter(), 12)).toBe('12 files');
    expect(hitSummary(filter({ truncated: true }), 2000)).toBe('2000+ files');
  });
});
