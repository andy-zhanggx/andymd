/** A character that can start an Obsidian `#tag` (letters of any script, digits, `_ - /`). */
const TAG_START = /[\p{L}\p{N}_\-/]/u;

/**
 * Relax ATX heading detection so `##text` (no space after #) is still
 * recognized as a heading — Typora-style convenience for Chinese writers
 * who don't add spaces between punctuation and content.
 *
 * Left alone, because they are not headings:
 *   - a single `#` followed by a tag character (`#project`, `#标签`) — an
 *     Obsidian tag, often on a line of its own;
 *   - anything inside fenced code (`#include <stdio.h>`) or the leading
 *     YAML frontmatter (`# comment`).
 */
export function lenifyHeadings(md: string): string {
  const lines = md.split('\n');
  let fence: { ch: string; len: number } | null = null;
  let inFrontmatter = lines[0]?.trimEnd() === '---';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inFrontmatter) {
      if (i > 0 && /^(---|\.\.\.)\s*$/.test(line)) inFrontmatter = false;
      continue;
    }
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      const ch = f[1][0];
      if (!fence) fence = { ch, len: f[1].length };
      else if (ch === fence.ch && f[1].length >= fence.len && line.trim() === f[1]) fence = null;
      continue;
    }
    if (fence) continue;
    lines[i] = line.replace(/^(#{1,6})([^\s#])/, (m, hashes: string, c: string) =>
      hashes.length === 1 && TAG_START.test(c) ? m : `${hashes} ${c}`,
    );
  }
  return lines.join('\n');
}
