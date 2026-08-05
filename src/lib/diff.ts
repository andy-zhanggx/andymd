// Line-based diff used by the external-change conflict dialog and the
// three-way merge. Pure functions, no DOM.

export type DiffOpType = 'equal' | 'add' | 'del';

export interface DiffOp {
  type: DiffOpType;
  lines: string[];
}

/** A render-ready row of a unified diff, with context collapsed into gaps. */
export interface DiffRow {
  type: DiffOpType | 'gap';
  text: string;
  /** 1-based line number in `a` (del/equal rows). */
  aLine?: number;
  /** 1-based line number in `b` (add/equal rows). */
  bLine?: number;
}

export function splitLines(text: string): string[] {
  return text.split('\n');
}

// Matched line pairs [indexInA, indexInB] of a longest common subsequence,
// in ascending order. Common prefix/suffix are peeled off first so the DP
// table only covers the changed middle; a huge middle (beyond ~4M cells)
// falls back to "no matches", i.e. whole-block replace.
const MAX_DP_CELLS = 4_000_000;

export function lcsPairs(a: string[], b: string[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  let start = 0;
  let endA = a.length;
  let endB = b.length;

  while (start < endA && start < endB && a[start] === b[start]) {
    pairs.push([start, start]);
    start++;
  }
  const suffix: Array<[number, number]> = [];
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
    suffix.push([endA, endB]);
  }

  const n = endA - start;
  const m = endB - start;
  if (n > 0 && m > 0 && n * m <= MAX_DP_CELLS) {
    // Standard LCS DP over the middle slice.
    const width = m + 1;
    const table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * width + j] =
          a[start + i] === b[start + j]
            ? table[(i + 1) * width + j + 1] + 1
            : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[start + i] === b[start + j]) {
        pairs.push([start + i, start + j]);
        i++;
        j++;
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
        i++;
      } else {
        j++;
      }
    }
  }

  suffix.reverse();
  pairs.push(...suffix);
  return pairs;
}

/** Line diff of two texts as a sequence of equal/del/add runs. */
export function diffLines(aText: string, bText: string): DiffOp[] {
  const a = splitLines(aText);
  const b = splitLines(bText);
  const pairs = lcsPairs(a, b);
  const ops: DiffOp[] = [];
  const push = (type: DiffOpType, lines: string[]) => {
    if (lines.length === 0) return;
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.lines.push(...lines);
    else ops.push({ type, lines: [...lines] });
  };

  let ai = 0;
  let bi = 0;
  for (const [pa, pb] of pairs) {
    push('del', a.slice(ai, pa));
    push('add', b.slice(bi, pb));
    push('equal', [a[pa]]);
    ai = pa + 1;
    bi = pb + 1;
  }
  push('del', a.slice(ai));
  push('add', b.slice(bi));
  return ops;
}

/**
 * Unified-diff rows for rendering: changed lines plus `context` equal lines
 * around them; longer equal runs collapse into a single `gap` row.
 */
export function unifiedRows(aText: string, bText: string, context = 2): DiffRow[] {
  const ops = diffLines(aText, bText);
  const rows: DiffRow[] = [];
  let aLine = 1;
  let bLine = 1;

  ops.forEach((op, idx) => {
    if (op.type === 'del') {
      for (const text of op.lines) rows.push({ type: 'del', text, aLine: aLine++ });
      return;
    }
    if (op.type === 'add') {
      for (const text of op.lines) rows.push({ type: 'add', text, bLine: bLine++ });
      return;
    }
    // Equal run: keep the trailing `context` lines before a change and the
    // leading `context` lines after one; collapse the rest into a gap.
    const isFirst = idx === 0;
    const isLast = idx === ops.length - 1;
    const head = isFirst ? 0 : context; // lines kept after the previous change
    const tail = isLast ? 0 : context; // lines kept before the next change
    op.lines.forEach((text, i) => {
      const keep = i < head || i >= op.lines.length - tail;
      if (keep) {
        rows.push({ type: 'equal', text, aLine, bLine });
      } else if (rows[rows.length - 1]?.type !== 'gap') {
        rows.push({ type: 'gap', text: '⋯' });
      }
      aLine++;
      bLine++;
    });
  });
  return rows;
}
