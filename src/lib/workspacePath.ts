import { FileNode } from '../types';

/**
 * True when `filePath` lives inside the directory `root` (or is `root` itself).
 * Both are absolute POSIX paths. Used to decide whether opening a file should
 * keep the current workspace or switch the sidebar to the file's vault.
 */
export function isPathInside(filePath: string, root: string): boolean {
  if (!root) return false;
  const base = root.replace(/\/+$/, '');
  return filePath === base || filePath.startsWith(`${base}/`);
}

/** Depth-first lookup of the tree node with the given absolute path. */
export function findNode(node: FileNode | null | undefined, path: string): FileNode | null {
  if (!node) return null;
  if (node.path === path) return node;
  for (const child of node.children ?? []) {
    const hit = findNode(child, path);
    if (hit) return hit;
  }
  return null;
}

/**
 * Pick a collision-free child name like `Untitled.md`, `Untitled 1.md`, …
 * (Obsidian-style) given a folder's existing children. Comparison is
 * case-insensitive to stay safe on case-insensitive filesystems (macOS/Windows).
 */
export function uniqueChildName(
  children: FileNode[] | undefined,
  base = 'Untitled',
  ext = 'md',
): string {
  const taken = new Set((children ?? []).map((c) => c.name.toLowerCase()));
  const candidate = (n: number) => (n === 0 ? `${base}.${ext}` : `${base} ${n}.${ext}`);
  let n = 0;
  while (taken.has(candidate(n).toLowerCase())) n++;
  return candidate(n);
}
