/**
 * Rewrite links after a file or folder is renamed/moved, so nothing that
 * pointed at it goes dead. Pure: the caller reads the candidate notes, calls
 * `rewriteNote` on each, confirms with the user, and writes the results.
 *
 * Handled forms (inside fenced / inline code nothing is touched):
 *   - `[[Name]]`, `[[Name#Heading|alias]]`, `![[Name]]` — bare names get the
 *     new name, or the vault path if the new name is ambiguous;
 *   - `[[folder/Name]]` — vault-root paths get the new path;
 *   - `[[./Name]]`, `[[../x/Name]]` — relative paths are recomputed;
 *   - `[text](rel/path.md#frag)`, `![alt](img.png)` — recomputed relative to
 *     the linking note, keeping `#frag`, `<…>` wrapping and %-encoding style.
 * A moved note's own relative links are recomputed from its new folder.
 */
import type { FileNode } from '../types';
import { resolveVaultFile, splitWikilinkTarget } from './wikilink';
import { decodePath, dirname, resolvePosixPath } from './asset';

export interface Rename {
  /** Absolute path before (file or folder). */
  from: string;
  /** Absolute path after. */
  to: string;
}

export interface RelinkContext {
  /** Vault root (absolute). */
  root: string;
  /** Vault tree as it was BEFORE the rename (links resolve against it). */
  tree: FileNode;
  rename: Rename;
}

/** Where `path` lives after the rename (unchanged when unaffected). */
export function mapPath(path: string, { from, to }: Rename): string {
  if (path === from) return to;
  if (path.startsWith(`${from}/`)) return to + path.slice(from.length);
  return path;
}

/** POSIX relative path from directory `fromDir` to `to` (both absolute). */
export function relativePath(fromDir: string, to: string): string {
  const a = fromDir.split('/').filter(Boolean);
  const b = to.split('/').filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const up = a.slice(i).map(() => '..');
  return [...up, ...b.slice(i)].join('/') || '.';
}

function allFilesAfter(tree: FileNode, rename: Rename): string[] {
  const out: string[] = [];
  const walk = (n: FileNode) => {
    if (n.kind === 'file') out.push(mapPath(n.path, rename));
    n.children?.forEach(walk);
  };
  walk(tree);
  return out;
}

const MD = /\.(md|markdown)$/i;
const baseOf = (p: string) => p.split('/').pop() ?? p;

/** Ranges of fenced code blocks and inline code spans, to be left alone. */
function codeRanges(text: string): [number, number][] {
  const ranges: [number, number][] = [];
  const fence = /^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^\1?\2[ \t]*$|(?![\s\S]))/gm;
  for (let m = fence.exec(text); m; m = fence.exec(text)) ranges.push([m.index, m.index + m[0].length]);
  const inline = /(`+)[^`\n]*?[^`]\1(?!`)|`[^`\n]`/g;
  for (let m = inline.exec(text); m; m = inline.exec(text)) {
    const at = m.index;
    if (!ranges.some(([s, e]) => at >= s && at < e)) ranges.push([at, at + m[0].length]);
  }
  return ranges;
}

function inRanges(pos: number, ranges: [number, number][]): boolean {
  return ranges.some(([s, e]) => pos >= s && pos < e);
}

interface Ctx extends RelinkContext {
  oldNote: string;
  newNote: string;
  after: string[];
}

function newWikiPath(pathPart: string, newTarget: string, ctx: Ctx): string {
  const keepExt = MD.test(pathPart) || !MD.test(newTarget);
  const strip = (p: string) => (keepExt ? p : p.replace(MD, ''));
  if (/^\.\.?\//.test(pathPart)) {
    const rel = relativePath(dirname(ctx.newNote), newTarget);
    return strip(rel.startsWith('../') ? rel : `./${rel}`);
  }
  const fromRoot = relativePath(ctx.root, newTarget);
  if (pathPart.includes('/')) return strip(fromRoot);
  // Bare name: still unique after the rename? Otherwise disambiguate by path.
  const name = baseOf(newTarget).toLowerCase();
  const clash = ctx.after.some((p) => p !== newTarget && baseOf(p).toLowerCase() === name);
  return strip(clash ? fromRoot : baseOf(newTarget));
}

function rewriteWiki(inner: string, ctx: Ctx): string | null {
  const pipe = inner.indexOf('|');
  const targetPart = pipe === -1 ? inner : inner.slice(0, pipe);
  const aliasPart = pipe === -1 ? '' : inner.slice(pipe);
  const hash = targetPart.indexOf('#');
  const pathPart = (hash === -1 ? targetPart : targetPart.slice(0, hash)).trim();
  const subPart = hash === -1 ? '' : targetPart.slice(hash);
  if (!pathPart) return null;
  const { path } = splitWikilinkTarget(pathPart);
  const target = resolveVaultFile(path, ctx.tree, ctx.oldNote);
  if (!target) return null;
  const newTarget = mapPath(target, ctx.rename);
  const relative = /^\.\.?\//.test(pathPart);
  if (newTarget === target && !(relative && ctx.newNote !== ctx.oldNote)) return null;
  const next = newWikiPath(pathPart, newTarget, ctx);
  // Obsidian matches case-insensitively; don't churn `[[note]]` → `[[Note]]`.
  if (next.toLowerCase() === pathPart.toLowerCase()) return null;
  return `${next}${subPart}${aliasPart}`;
}

function isExternal(dest: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(dest) || dest.startsWith('#') || dest.startsWith('//');
}

function encodeLike(raw: string, rel: string): string {
  if (/%[89a-f][0-9a-f]/i.test(raw)) return encodeURI(rel);
  if (raw.includes('%20')) return rel.replace(/ /g, '%20');
  return rel;
}

function rewriteDest(rawDest: string, ctx: Ctx): string | null {
  const wrapped = rawDest.startsWith('<') && rawDest.endsWith('>');
  const dest = wrapped ? rawDest.slice(1, -1) : rawDest;
  if (!dest || isExternal(dest)) return null;
  const cut = dest.search(/[?#]/);
  const pathRaw = cut === -1 ? dest : dest.slice(0, cut);
  const suffix = cut === -1 ? '' : dest.slice(cut);
  if (!pathRaw) return null;
  const decoded = decodePath(pathRaw);
  const abs = decoded.startsWith('/')
    ? resolvePosixPath(decoded)
    : resolvePosixPath(`${dirname(ctx.oldNote)}/${decoded}`);
  const newAbs = mapPath(abs, ctx.rename);
  if (newAbs === abs && ctx.newNote === ctx.oldNote) return null;
  let rel: string;
  if (decoded.startsWith('/')) rel = newAbs;
  else {
    rel = relativePath(dirname(ctx.newNote), newAbs);
    if (pathRaw.startsWith('./') && !rel.startsWith('../')) rel = `./${rel}`;
  }
  let out = encodeLike(pathRaw, rel) + suffix;
  if (out === dest) return null;
  if (wrapped || (!/%20/.test(pathRaw) && / /.test(out))) out = `<${out}>`;
  return out;
}

/**
 * Rewrite every link in `content` (the note at `oldNote`, which will live at
 * `newNote`) that the rename affects. Returns the new text and the number of
 * links changed.
 */
export function rewriteNote(
  content: string,
  oldNote: string,
  newNote: string,
  context: RelinkContext,
): { content: string; changes: number } {
  const ctx: Ctx = { ...context, oldNote, newNote, after: allFilesAfter(context.tree, context.rename) };
  const code = codeRanges(content);
  let changes = 0;
  // Wikilinks and embeds.
  let out = content.replace(/\[\[([^[\]\n]+?)\]\]/g, (m, inner: string, at: number) => {
    if (inRanges(at, code)) return m;
    const next = rewriteWiki(inner, ctx);
    if (next === null) return m;
    changes++;
    return `[[${next}]]`;
  });
  // Markdown links / images: `](dest "title")`. Positions shifted above only
  // by wikilink edits, so recompute code ranges on the new text.
  const code2 = codeRanges(out);
  out = out.replace(/\]\((<[^>\n]*>|[^)\s]+)((?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\))/g, (m, dest: string, tail: string, at: number) => {
    if (inRanges(at, code2)) return m;
    const next = rewriteDest(dest, ctx);
    if (next === null) return m;
    changes++;
    return `](${next}${tail}`;
  });
  return { content: out, changes };
}

/**
 * Lowercased strings a note must contain to possibly link into `rename.from`
 * (used to prefilter candidates on the Rust side): the old name, without and
 * with `.md`, raw and %-encoded.
 */
export function mentionNeedles(rename: Rename): string[] {
  const base = baseOf(rename.from);
  const stem = base.replace(MD, '');
  const set = new Set<string>();
  for (const s of [stem, base]) {
    set.add(s.toLowerCase());
    set.add(encodeURI(s).toLowerCase());
    set.add(s.replace(/ /g, '%20').toLowerCase());
  }
  return [...set].filter(Boolean);
}
