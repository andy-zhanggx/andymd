import type { FileNode } from '../types';

function withMdExtension(name: string): string {
  return /\.(md|markdown)$/i.test(name) ? name : `${name}.md`;
}

/** Directory portion of an absolute POSIX path (`/a/b/c.md` → `/a/b`). */
function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i <= 0 ? '/' : path.slice(0, i);
}

/**
 * Resolve a `./`- or `../`-relative target against `fromDir`, collapsing `.`
 * and `..` segments. Returns the absolute path, or null if it escapes above
 * the filesystem root.
 */
function resolveRelative(fromDir: string, rel: string): string | null {
  const out: string[] = [];
  for (const seg of `${fromDir}/${rel}`.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length === 0) return null;
      out.pop();
    } else {
      out.push(seg);
    }
  }
  return `/${out.join('/')}`;
}

/** Find a file node whose absolute path matches `wantedLower` (case-insensitive). */
function findFileByPath(tree: FileNode, wantedLower: string): string | null {
  const stack: FileNode[] = [tree];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.kind === 'file' && node.path.toLowerCase() === wantedLower) return node.path;
    if (node.children) stack.push(...node.children);
  }
  return null;
}

/**
 * Resolve an Obsidian-style wikilink target against a vault file tree.
 * `./`- and `../`-relative targets resolve against the current file's
 * directory (`fromPath`); targets containing `/` are vault-root-relative
 * paths; bare names are matched by basename anywhere in the vault (first match
 * in tree order). Matching is case-insensitive, like Obsidian. Returns null
 * for any target that does not resolve to an existing file (a dead link).
 */
export function resolveWikilinkInTree(
  target: string,
  tree: FileNode,
  fromPath?: string | null,
): string | null {
  const cleaned = target.trim();
  if (!cleaned) return null;

  // `./x` / `../x` are relative to the current file's directory. Without an
  // open file there is no anchor to resolve against, so they are dead links.
  if (/^\.\.?\//.test(cleaned)) {
    if (!fromPath) return null;
    const abs = resolveRelative(dirOf(fromPath), cleaned);
    if (!abs) return null;
    return findFileByPath(tree, withMdExtension(abs).toLowerCase());
  }

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
