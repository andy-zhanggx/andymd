/**
 * Pure helpers for the Related panel: which section the caret is in, and
 * which semantic hits make useful link suggestions.
 */
import type { SemanticHit } from './semantic';

/** 1-based line of every ATX heading outside fenced code, in order. */
export function headingLines(markdown: string): number[] {
  const out: number[] = [];
  let fence: string | null = null;
  markdown.split('\n').forEach((line, i) => {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return;
    }
    if (!fence && /^#{1,6}(\s|[^\s#])/.test(line)) out.push(i + 1);
  });
  return out;
}

/**
 * A line inside the section that starts at heading number `headingIndex`
 * (0-based, document order; -1 = before the first heading), suitable for the
 * Rust side's "chunk containing this line" lookup: the section's last line.
 */
export function sectionLine(markdown: string, headingIndex: number): number {
  const lines = headingLines(markdown);
  const total = markdown.split('\n').length;
  const next = lines[headingIndex + 1];
  if (next !== undefined) return Math.max(1, next - 1);
  return total;
}

export interface LinkSuggestion {
  path: string;
  relPath: string;
  heading: string;
  snippet: string;
  score: number;
}

/** Key for "don't suggest linking `to` from `from` again". */
export function dismissKey(from: string, to: string): string {
  return `${from}→${to}`;
}

/**
 * Turn raw semantic hits for a paragraph into link suggestions: one per note
 * (its best section), never the current note or one already linked or
 * dismissed, only above `threshold`, best first, at most `max`.
 */
export function pickSuggestions(
  hits: SemanticHit[],
  opts: {
    currentPath: string;
    linked: ReadonlySet<string>;
    dismissed: ReadonlySet<string>;
    threshold: number;
    max: number;
  },
): LinkSuggestion[] {
  const seen = new Set<string>();
  const out: LinkSuggestion[] = [];
  for (const h of [...hits].sort((a, b) => b.score - a.score)) {
    if (h.score < opts.threshold) break;
    if (seen.has(h.path)) continue;
    seen.add(h.path);
    if (h.path === opts.currentPath || opts.linked.has(h.path)) continue;
    if (opts.dismissed.has(dismissKey(opts.currentPath, h.path))) continue;
    if (!/\.(md|markdown)$/i.test(h.path)) continue;
    out.push({ path: h.path, relPath: h.relPath, heading: h.heading, snippet: h.snippet, score: h.score });
    if (out.length >= opts.max) break;
  }
  return out;
}
