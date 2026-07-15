// Three-way line merge (diff3) for external-change conflicts.
// base   = the disk snapshot the editor loaded from (doc.content)
// mine   = the current editor draft
// theirs = the new content found on disk

import { lcsPairs, splitLines } from './diff';

export const CONFLICT_MINE = '<<<<<<< Your version';
export const CONFLICT_SEP = '=======';
export const CONFLICT_THEIRS = '>>>>>>> Disk version';

export interface MergeResult {
  merged: string;
  /** Number of overlapping regions left as conflict-marker blocks. */
  conflicts: number;
}

function sameLines(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((line, i) => line === b[i]);
}

export function merge3(baseText: string, mineText: string, theirsText: string): MergeResult {
  const base = splitLines(baseText);
  const mine = splitLines(mineText);
  const theirs = splitLines(theirsText);

  const mineMatch = new Map(lcsPairs(base, mine));
  const theirsMatch = new Map(lcsPairs(base, theirs));

  const out: string[] = [];
  let conflicts = 0;
  let i = 0; // base cursor
  let j = 0; // mine cursor
  let k = 0; // theirs cursor

  const emitChunk = (bChunk: string[], mChunk: string[], tChunk: string[]) => {
    if (bChunk.length === 0 && mChunk.length === 0 && tChunk.length === 0) return;
    if (sameLines(mChunk, tChunk)) {
      out.push(...mChunk); // both made the same change (or none)
    } else if (sameLines(mChunk, bChunk)) {
      out.push(...tChunk); // only theirs changed
    } else if (sameLines(tChunk, bChunk)) {
      out.push(...mChunk); // only mine changed
    } else {
      conflicts++;
      out.push(CONFLICT_MINE, ...mChunk, CONFLICT_SEP, ...tChunk, CONFLICT_THEIRS);
    }
  };

  while (i < base.length || j < mine.length || k < theirs.length) {
    // Perfectly aligned stable line: all three cursors sit on the same line.
    if (i < base.length && mineMatch.get(i) === j && theirsMatch.get(i) === k) {
      out.push(base[i]);
      i++;
      j++;
      k++;
      continue;
    }
    // Scan forward to the next base line that survives in BOTH sides — the
    // next anchor. Everything before it forms one unstable chunk per side.
    let ni = i;
    while (ni < base.length && !(mineMatch.has(ni) && theirsMatch.has(ni))) ni++;
    const nj = ni < base.length ? mineMatch.get(ni)! : mine.length;
    const nk = ni < base.length ? theirsMatch.get(ni)! : theirs.length;
    emitChunk(base.slice(i, ni), mine.slice(j, nj), theirs.slice(k, nk));
    i = ni;
    j = nj;
    k = nk;
  }

  return { merged: out.join('\n'), conflicts };
}
