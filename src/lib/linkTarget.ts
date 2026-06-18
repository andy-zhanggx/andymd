import type { FileNode } from '../types';
import { decodePath, dirname, resolvePosixPath } from './asset';

/**
 * What a markdown link's href points at, resolved against the current file and
 * the in-memory vault tree. This is what decides how a click is handled and
 * whether a link is painted as a dead link.
 *
 * - `external`  — http(s)/mailto, open in the OS browser
 * - `mdfile`    — an existing markdown note, open it in the editor
 * - `osfile`    — an existing non-markdown file or a folder, hand to the OS
 * - `dead`      — resolves to a path inside the vault that doesn't exist
 * - `ignore`    — pure `#anchor`, or nothing resolvable
 */
export type LinkTarget =
  | { kind: 'external'; href: string }
  | { kind: 'mdfile'; absPath: string }
  | { kind: 'osfile'; absPath: string }
  | { kind: 'dead'; absPath: string }
  | { kind: 'ignore' };

const INDEX_NAMES = ['readme.md', 'index.md'];

function findNode(tree: FileNode, absLower: string): FileNode | null {
  const stack: FileNode[] = [tree];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.path.toLowerCase() === absLower) return node;
    if (node.children) stack.push(...node.children);
  }
  return null;
}

/** A directory link opens its index note (README.md / index.md / <dir>.md). */
function dirIndex(dir: FileNode): FileNode | null {
  const names = [...INDEX_NAMES, `${dir.name.toLowerCase()}.md`];
  return (
    dir.children?.find((c) => c.kind === 'file' && names.includes(c.name.toLowerCase())) ?? null
  );
}

function classifyFile(absPath: string): LinkTarget {
  return /\.(md|markdown)$/i.test(absPath)
    ? { kind: 'mdfile', absPath }
    : { kind: 'osfile', absPath };
}

/**
 * Resolve a markdown link `href` (relative to `fromPath`) against the vault
 * `tree`. Directory links open their index note; extensionless links fall back
 * to `<name>.md`; links that land on a missing path *inside* the vault are
 * `dead`. Links outside the vault (or when no tree is loaded) are classified by
 * extension and left for the click handler / OS to deal with — never marked
 * dead, so out-of-vault links aren't false-flagged.
 */
export function resolveLinkTarget(
  href: string,
  fromPath: string | null,
  tree: FileNode | null,
): LinkTarget {
  if (/^(https?:\/\/|mailto:)/i.test(href)) return { kind: 'external', href };

  const pathPart = href.split('#')[0];
  if (!pathPart) return { kind: 'ignore' };

  const decoded = decodePath(pathPart);
  const absPath = decoded.startsWith('/')
    ? resolvePosixPath(decoded)
    : fromPath
      ? resolvePosixPath(`${dirname(fromPath)}/${decoded}`)
      : null;
  if (!absPath) return { kind: 'ignore' };

  if (tree) {
    const node = findNode(tree, absPath.toLowerCase());
    if (node) {
      if (node.kind === 'dir') {
        const index = dirIndex(node);
        return index ? { kind: 'mdfile', absPath: index.path } : { kind: 'osfile', absPath: node.path };
      }
      return classifyFile(node.path);
    }
    // Extensionless link to a note (Obsidian-style): try `<path>.md`.
    const md = findNode(tree, `${absPath}.md`.toLowerCase());
    if (md) return { kind: 'mdfile', absPath: md.path };
    // Inside the vault but no such entry → genuinely dead.
    if (absPath.toLowerCase().startsWith(`${tree.path.toLowerCase()}/`)) {
      return { kind: 'dead', absPath };
    }
  }

  // No tree, or a path outside the vault: classify by extension and let the
  // click handler attempt to open it (existence unknown — not flagged dead).
  return classifyFile(absPath);
}
