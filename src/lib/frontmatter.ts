/**
 * Count the top-level keys of a document's YAML frontmatter — the number
 * Obsidian shows as "N properties" in its status bar.
 *
 * A frontmatter block is a leading `---` fence, its YAML body, and a closing
 * `---` (or `...`) fence on its own line. Only top-level keys (no leading
 * indentation) are counted; nested mapping keys and list items are part of
 * their parent property, exactly as Obsidian counts them.
 */
export function frontmatterKeyCount(text: string): number {
  // The block must be the very first thing in the file (an optional BOM aside).
  const body = text.replace(/^﻿/, '');
  if (!/^---[ \t]*\r?\n/.test(body)) return 0;

  const lines = body.split('\n');
  let count = 0;
  // Start after the opening `---` line.
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '');
    // Closing fence ends the block.
    if (line === '---' || line === '...') return count;
    // A top-level key: no leading whitespace, `key:` form. Skip comments,
    // list items, and indented (nested) lines.
    if (/^[^\s#-][^:]*:(\s|$)/.test(line)) count++;
  }
  // No closing fence → not a valid frontmatter block.
  return 0;
}
