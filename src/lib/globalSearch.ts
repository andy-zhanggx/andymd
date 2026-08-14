/**
 * Vault-wide search — pure helpers for the GlobalSearch panel.
 *
 * The Rust `search_workspace` command returns per-file line matches; these
 * helpers turn them into renderable segments (match highlighting is computed
 * here in JS/UTF-16 space so it always agrees with what React renders) and a
 * flat list for keyboard navigation.
 */

export interface SearchMatch {
  /** 1-based line number in the file. */
  line: number;
  /** The (possibly trimmed) line text containing the match. */
  text: string;
}

export interface FileMatches {
  path: string;
  relPath: string;
  matches: SearchMatch[];
  truncated: boolean;
}

export interface SearchResults {
  files: FileMatches[];
  truncated: boolean;
}

export const EMPTY_RESULTS: SearchResults = { files: [], truncated: false };

export interface Segment {
  text: string;
  hit: boolean;
}

/** Split `text` into segments, marking case-insensitive occurrences of `query`. */
export function highlightSegments(text: string, query: string): Segment[] {
  const q = query.trim();
  if (!q) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const out: Segment[] = [];
  let pos = 0;
  for (;;) {
    const idx = lower.indexOf(needle, pos);
    if (idx < 0) break;
    if (idx > pos) out.push({ text: text.slice(pos, idx), hit: false });
    out.push({ text: text.slice(idx, idx + needle.length), hit: true });
    pos = idx + needle.length;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), hit: false });
  return out.length > 0 ? out : [{ text, hit: false }];
}

/** One selectable row in the results list. */
export interface ResultRow {
  path: string;
  relPath: string;
  line: number;
  text: string;
}

/** Flatten grouped results into selectable rows, in display order. */
export function flattenResults(results: SearchResults): ResultRow[] {
  const rows: ResultRow[] = [];
  for (const f of results.files) {
    for (const m of f.matches) {
      rows.push({ path: f.path, relPath: f.relPath, line: m.line, text: m.text });
    }
  }
  return rows;
}

/** Total match count across all files. */
export function countMatches(results: SearchResults): number {
  return results.files.reduce((n, f) => n + f.matches.length, 0);
}
