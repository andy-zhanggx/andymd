/**
 * Pure logic behind `[[` autocomplete: trigger detection, ranking, and the
 * link text Obsidian would write for a file.
 */
import type { FlatFile } from './quickOpen';
import type { Heading } from './outline';

export interface Trigger {
  /** `![[` rather than `[[`. */
  embed: boolean;
  /** Everything typed after the brackets. */
  query: string;
  /** Offset of the `[[` / `![[` in the text passed to `detectTrigger`. */
  from: number;
}

/**
 * Is the caret inside an unfinished `[[…` / `![[…`? `textBefore` is the
 * textblock's text up to the caret. A `|` (alias) or `]` ends the lookup —
 * from there on the user is writing the alias / closing the link.
 */
export function detectTrigger(textBefore: string): Trigger | null {
  const m = /(!?)\[\[([^[\]\n|]*)$/.exec(textBefore);
  if (!m) return null;
  return { embed: m[1] === '!', query: m[2], from: m.index };
}

export type Suggestion =
  | { kind: 'file'; label: string; detail: string; target: string; path: string }
  | { kind: 'heading'; label: string; detail: string; target: string; level: number }
  | { kind: 'raw'; label: string; detail: string; target: string };

const MD = /\.(md|markdown)$/i;

function stem(name: string): string {
  return name.replace(MD, '');
}

/**
 * The shortest target that still resolves to `file`: the bare note name when
 * it is unique in the vault, otherwise its vault-relative path. Markdown
 * extensions are dropped; attachments keep theirs (`pic.png`).
 */
export function linkTextFor(file: FlatFile, files: FlatFile[]): string {
  const isMd = MD.test(file.name);
  const short = isMd ? stem(file.name) : file.name;
  const lower = file.name.toLowerCase();
  const clash = files.some((f) => f.path !== file.path && f.name.toLowerCase() === lower);
  if (!clash) return short;
  return isMd ? stem(file.relPath) : file.relPath;
}

function isSubsequence(q: string, s: string): boolean {
  let i = 0;
  for (const ch of s) if (ch === q[i]) i++;
  return i === q.length;
}

function score(file: FlatFile, q: string): number {
  const name = stem(file.name).toLowerCase();
  const rel = file.relPath.toLowerCase();
  const bonus = MD.test(file.name) ? 5 : 0;
  if (!q) return 1 + bonus;
  if (name === q) return 100 + bonus;
  if (name.startsWith(q)) return 80 + bonus;
  const at = name.indexOf(q);
  if (at >= 0) return 60 - Math.min(at, 20) + bonus;
  if (rel.includes(q)) return 40 + bonus;
  if (isSubsequence(q, name)) return 20 + bonus;
  return 0;
}

/**
 * Files matching `query`, best first. Notes outrank attachments at equal
 * match quality; ties break on shorter, then alphabetical, paths.
 */
export function rankFiles(files: FlatFile[], query: string, limit = 50): FlatFile[] {
  const q = query.trim().toLowerCase();
  return files
    .map((f) => ({ f, s: score(f, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.f.relPath.length - b.f.relPath.length || a.f.relPath.localeCompare(b.f.relPath))
    .slice(0, limit)
    .map((x) => x.f);
}

export function fileSuggestions(files: FlatFile[], query: string, limit = 50): Suggestion[] {
  const out: Suggestion[] = rankFiles(files, query, limit).map((f) => ({
    kind: 'file',
    label: MD.test(f.name) ? stem(f.name) : f.name,
    detail: f.relPath,
    target: linkTextFor(f, files),
    path: f.path,
  }));
  const q = query.trim();
  // Linking to a note that doesn't exist yet is normal in a vault.
  if (q && !out.some((s) => s.target.toLowerCase() === q.toLowerCase())) {
    out.push({ kind: 'raw', label: q, detail: 'New link', target: q });
  }
  return out;
}

/** Split a heading-mode query: `note#head` → ['note', 'head']. */
export function splitHeadingQuery(query: string): [string, string] | null {
  const i = query.indexOf('#');
  if (i === -1) return null;
  return [query.slice(0, i), query.slice(i + 1)];
}

export function headingSuggestions(notePart: string, headings: Heading[], query: string): Suggestion[] {
  const q = query.trim().toLowerCase();
  return headings
    .filter((h) => !q || h.text.toLowerCase().includes(q))
    .slice(0, 50)
    .map((h) => ({
      kind: 'heading' as const,
      label: h.text,
      detail: `H${h.level}`,
      target: `${notePart}#${h.text}`,
      level: h.level,
    }));
}
