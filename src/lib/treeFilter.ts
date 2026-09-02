/**
 * File-tree search — pure helpers for the sidebar filter.
 *
 * The Rust `search_index` command answers "which files match?" from its
 * pre-built index; these helpers turn that answer into a pruned copy of the
 * workspace tree that shows only the hits and the folders needed to reach them.
 */

import type { FileNode } from '../types';

/** One matching file, as returned by the Rust index. */
export interface IndexHit {
  path: string;
  relPath: string;
  /** The query occurs in the file's relative path. */
  nameHit: boolean;
  /** The query occurs in the file's text. */
  contentHit: boolean;
}

export interface IndexSearchResults {
  /** False while the index is still being built; `files` is then empty. */
  ready: boolean;
  files: IndexHit[];
  /** True when the hit cap was reached. */
  truncated: boolean;
}

export type TreeFilterStatus = 'indexing' | 'searching' | 'done';

/** What the search box hands the sidebar once a query is active. */
export interface TreeFilter {
  query: string;
  /** Keyed by absolute path. */
  hits: Map<string, IndexHit>;
  truncated: boolean;
  status: TreeFilterStatus;
  /** Bumped on every result so the tree can re-expand to the new hit set. */
  version: number;
}

/**
 * Copy of `root` keeping only the files whose path is in `keep`, plus their
 * ancestor folders. Sibling order is preserved; folders left empty are dropped.
 * The root node itself is always returned (possibly with no children).
 */
export function pruneTree(root: FileNode, keep: ReadonlySet<string>): FileNode {
  const prune = (node: FileNode): FileNode | null => {
    if (node.kind === 'file') return keep.has(node.path) ? node : null;
    const children = (node.children ?? []).map(prune).filter((n): n is FileNode => n !== null);
    if (children.length === 0) return null;
    return { ...node, children };
  };
  const children = (root.children ?? []).map(prune).filter((n): n is FileNode => n !== null);
  return { ...root, children };
}

/** Number of file nodes under `node`. */
export function countFiles(node: FileNode): number {
  if (node.kind === 'file') return 1;
  return (node.children ?? []).reduce((n, c) => n + countFiles(c), 0);
}

/** Human hint for the search box footer, e.g. `12 files`, `2000+ files`. */
export function hitSummary(filter: TreeFilter, shown: number): string {
  if (filter.status === 'indexing') return 'Indexing…';
  if (filter.status === 'searching') return 'Searching…';
  const n = `${shown}${filter.truncated ? '+' : ''}`;
  return shown === 1 ? '1 file' : `${n} files`;
}
