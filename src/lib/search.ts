/**
 * Pure text-search helpers shared by the editor's Find/Replace feature.
 *
 * The ProseMirror search plugin walks the document's text nodes and uses
 * `findInText` to locate occurrences inside each node's string. Keeping the
 * matching logic here makes it unit-testable without a live editor.
 */

/**
 * Return the start offsets of every occurrence of `query` inside `text`.
 * Overlapping matches are not returned (search resumes after each match).
 * An empty query yields no matches.
 */
export function findInText(text: string, query: string, caseSensitive = false): number[] {
  if (!query) return [];
  const hay = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const out: number[] = [];
  let idx = hay.indexOf(needle);
  while (idx !== -1) {
    out.push(idx);
    idx = hay.indexOf(needle, idx + needle.length);
  }
  return out;
}

/**
 * Given the number of matches and the current index, compute the next index
 * when stepping `dir` (+1 forward, -1 back), wrapping around the ends.
 * Returns -1 when there are no matches.
 */
export function stepIndex(count: number, current: number, dir: 1 | -1): number {
  if (count <= 0) return -1;
  if (current < 0) return dir === 1 ? 0 : count - 1;
  return (current + dir + count) % count;
}
