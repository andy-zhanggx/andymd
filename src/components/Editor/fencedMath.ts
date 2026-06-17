import { $remark } from '@milkdown/utils';

/**
 * Render fenced ```math / ```latex / ```katex code blocks as real math.
 *
 * Many markdown authors (and GitHub/GitLab) write block math as a fenced code
 * block tagged `math` rather than the `$$ … $$` form that remark-math parses:
 *
 *     ```math
 *     \mathcal{G}_m(\alpha,\beta)
 *     ```
 *
 * Without help, Milkdown routes that through the code-block schema and prism,
 * so it shows as a gray monospace code box instead of a typeset formula.
 *
 * This remark transformer rewrites such `code` nodes into mdast `math` nodes
 * (the same node type remark-math produces), so the math_block schema picks
 * them up and KaTeX renders them. The converted node is tagged `fenced: true`
 * so the math_block schema can serialize it back to ```math rather than `$$`,
 * preserving the author's original fence (see milkdownConfig).
 */

const MATH_LANGS = new Set(['math', 'latex', 'tex', 'katex']);

interface MdastNode {
  type: string;
  lang?: unknown;
  value?: unknown;
  children?: MdastNode[];
  [key: string]: unknown;
}

function walk(node: MdastNode): void {
  if (!Array.isArray(node.children)) return;
  for (const child of node.children) {
    if (
      child.type === 'code' &&
      typeof child.lang === 'string' &&
      MATH_LANGS.has(child.lang.toLowerCase())
    ) {
      child.type = 'math';
      child.fenced = true;
      delete child.lang;
    } else {
      walk(child);
    }
  }
}

export const fencedMath = $remark('fencedMath', () => () => (tree: MdastNode) => {
  walk(tree);
});
