import { $remark } from '@milkdown/utils';

/**
 * Repair Obsidian-style `$$ … $$` display math that micromark mis-fences.
 *
 * remark-math (micromark) only closes a `$$` block on a line that contains
 * nothing but `$$`. Obsidian vaults routinely write display math as
 *
 *     $$\begin{aligned}
 *     x = y
 *     \end{aligned} \tag{55}$$
 *
 * where the opener line carries content and the closer sits at the end of the
 * last content line. micromark then (a) stows the opener-line content in the
 * node's `meta` (which our math_block schema never reads, so it vanishes) and
 * (b) never sees a closer, so the math node swallows every following block
 * until the next `$$` line — or the end of the document. One such block can
 * turn half a document into a single math literal.
 *
 * This transformer restores Obsidian semantics on the mdast: for each `math`
 * node it folds `meta` back into the LaTeX and closes the block at the first
 * unescaped `$$` found inside the swallowed value. Whatever followed that
 * closer is real markdown again — it is re-parsed with the full processor
 * syntax (GFM, math, …) and spliced back in after the math node. Spliced
 * content is scanned too, so a cascade of such blocks unwinds one per pass.
 *
 * Registered before `fencedMath`, so ```math fences are still `code` nodes
 * here and can't be touched; the `fenced` flag is also checked for safety.
 */

interface MdastNode {
  type: string;
  value?: unknown;
  meta?: unknown;
  fenced?: boolean;
  children?: MdastNode[];
}

interface MinimalProcessor {
  parse: (doc: string) => MdastNode;
}

/** Index of the first `$$` in `text` not escaped by a backslash, or -1. */
function findCloser(text: string): number {
  let from = 0;
  for (;;) {
    const i = text.indexOf('$$', from);
    if (i === -1) return -1;
    if (i === 0 || text[i - 1] !== '\\') return i;
    from = i + 1;
  }
}

function repair(parent: MdastNode, processor: MinimalProcessor): void {
  const children = parent.children;
  if (!Array.isArray(children)) return;
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.type !== 'math' || node.fenced === true || typeof node.value !== 'string') {
      repair(node, processor);
      continue;
    }
    const meta = typeof node.meta === 'string' && node.meta.length > 0 ? node.meta : null;
    const full = meta ? `${meta}\n${node.value}` : node.value;
    const closer = findCloser(full);
    if (closer === -1) {
      // Nothing swallowed; just fold the opener-line content back in.
      if (meta) {
        node.value = full;
        node.meta = null;
      }
      continue;
    }
    node.value = full.slice(0, closer).replace(/\s+$/, '');
    node.meta = null;
    const rest = full.slice(closer + 2);
    if (rest.trim().length > 0) {
      // Leading newline keeps a `rest` that starts with `---` from being
      // taken for frontmatter (only valid at offset 0).
      const tree = processor.parse(`\n${rest}`);
      const spliced = Array.isArray(tree.children) ? tree.children : [];
      children.splice(i + 1, 0, ...spliced);
      // Loop continues at i+1: spliced nodes get scanned (and recursed into)
      // themselves, unwinding cascades of mis-fenced blocks.
    }
  }
}

export const obsidianMath = $remark(
  'obsidianMath',
  () =>
    function (this: unknown) {
      // unified invokes attachers with the processor as `this`; keep it so the
      // swallowed remainder re-parses with the full syntax extension set.
      const processor = this as MinimalProcessor;
      return (tree: unknown) => {
        repair(tree as MdastNode, processor);
      };
    },
);
