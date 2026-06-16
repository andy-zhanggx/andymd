import type { FileNode } from '../types';

export interface FlatFile {
  path: string; // absolute
  name: string;
  relPath: string; // relative to workspace root
}

function relativeTo(root: string, path: string): string {
  const prefix = root.endsWith('/') ? root : `${root}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path.split('/').pop() ?? path;
}

/** Depth-first flatten of every file node under a workspace tree. */
export function flattenFiles(tree: FileNode, root: string): FlatFile[] {
  const out: FlatFile[] = [];
  const walk = (node: FileNode) => {
    if (node.kind === 'file') {
      out.push({ path: node.path, name: node.name, relPath: relativeTo(root, node.path) });
    } else {
      node.children?.forEach(walk);
    }
  };
  walk(tree);
  return out;
}

/** Case-insensitive substring filter over relative path; query trimmed. */
export function filterFiles(files: FlatFile[], query: string): FlatFile[] {
  const q = query.trim().toLowerCase();
  if (!q) return files;
  return files.filter((f) => f.relPath.toLowerCase().includes(q));
}

/** Append a markdown extension unless one is already present. */
export function normalizeNewFileName(query: string): string {
  let name = query.trim().replace(/^\.\/+/, '');
  if (!/\.(md|markdown|mdown|mkd)$/i.test(name)) name += '.md';
  return name;
}

export interface CreateTarget {
  name: string; // normalized, may contain a subpath
  exists: boolean;
}

/**
 * Resolve what "create" would do for the current query, or null when the query
 * is empty. `exists` is true when a file with the same relative path/name is
 * already present (so the UI suppresses the create affordance).
 */
export function createTarget(query: string, files: FlatFile[]): CreateTarget | null {
  if (!query.trim()) return null;
  const name = normalizeNewFileName(query);
  const lower = name.toLowerCase();
  const exists = files.some(
    (f) => f.relPath.toLowerCase() === lower || f.name.toLowerCase() === lower
  );
  return { name, exists };
}
