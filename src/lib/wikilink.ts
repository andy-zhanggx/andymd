import type { FileNode } from '../types';

function withMdExtension(name: string): string {
  return /\.(md|markdown)$/i.test(name) ? name : `${name}.md`;
}

/**
 * Resolve an Obsidian-style wikilink target against a vault file tree.
 * Targets containing `/` are vault-root-relative paths; bare names are
 * matched by basename anywhere in the vault (first match in tree order).
 * Matching is case-insensitive, like Obsidian.
 */
export function resolveWikilinkInTree(target: string, tree: FileNode): string | null {
  const cleaned = target.trim();
  if (!cleaned) return null;

  if (cleaned.includes('/')) {
    const segments = cleaned.split('/').filter(Boolean);
    const fileName = withMdExtension(segments[segments.length - 1]).toLowerCase();
    const dirs = segments.slice(0, -1).map((s) => s.toLowerCase());
    let node = tree;
    for (const dir of dirs) {
      const next = node.children?.find((c) => c.kind === 'dir' && c.name.toLowerCase() === dir);
      if (!next) return null;
      node = next;
    }
    const file = node.children?.find(
      (c) => c.kind === 'file' && c.name.toLowerCase() === fileName,
    );
    return file?.path ?? null;
  }

  const wanted = withMdExtension(cleaned).toLowerCase();
  const stack: FileNode[] = [tree];
  while (stack.length) {
    const node = stack.shift()!;
    if (node.kind === 'file' && node.name.toLowerCase() === wanted) return node.path;
    if (node.children) stack.push(...node.children);
  }
  return null;
}
