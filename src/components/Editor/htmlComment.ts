import { $remark } from '@milkdown/utils';

/**
 * Re-merge HTML comments that other remark transformers fragment.
 *
 * `remark.parse` correctly keeps a block comment `<!-- … -->` as a single
 * `html` node, even when it spans blank lines (CommonMark type-2 HTML blocks
 * are not terminated by blank lines). But Milkdown's emoji transformer scans
 * the *value* of every literal node — including `html` nodes — and splits them
 * to extract emoji. So a comment like:
 *
 *     <!-- status: eg:
 *
 *     🟢 OnTrack -->
 *
 * gets shredded into `html("<!-- … eg:\n\n")` + `emoji(🟢)` + `html(" OnTrack -->")`,
 * which renders the inner emoji as a stray green circle and shows the comment
 * delimiters as literal text. (Other marker-style transformers can split on
 * `==`, `~`, etc. the same way.)
 *
 * This transformer runs after those splitters and stitches the fragments back
 * into one `html` node, recovering each fragment's original source text. The
 * merged node round-trips losslessly and renders as a single (muted) comment.
 */

const COMMENT_START = '<!--';
const COMMENT_END = '-->';

interface MdastNode {
  type: string;
  value?: unknown;
  children?: MdastNode[];
}

/** Original markdown source a fragment contributes to a comment, or null if unrecoverable. */
function sourceOf(node: MdastNode): string | null {
  // Emoji nodes carry the rendered <img> in `value`; the original character
  // survives in its alt attribute.
  if (node.type === 'emoji' && typeof node.value === 'string') {
    const alt = /alt="([^"]*)"/.exec(node.value);
    if (alt) return alt[1];
  }
  if (typeof node.value === 'string') return node.value;
  // A node with children (link, strong, …) can't be reconstructed cheaply;
  // signal "give up" so we don't silently drop content.
  return null;
}

function mergeChildren(children: MdastNode[]): MdastNode[] {
  const out: MdastNode[] = [];
  let i = 0;
  while (i < children.length) {
    const node = children[i];
    const isOpenFragment =
      node.type === 'html' &&
      typeof node.value === 'string' &&
      node.value.includes(COMMENT_START) &&
      !node.value.includes(COMMENT_END);

    if (isOpenFragment) {
      let acc = node.value as string;
      let j = i + 1;
      let closed = false;
      let recoverable = true;
      while (j < children.length) {
        const part = sourceOf(children[j]);
        if (part === null) {
          recoverable = false;
          break;
        }
        acc += part;
        if (part.includes(COMMENT_END)) {
          closed = true;
          break;
        }
        j++;
      }
      if (recoverable && closed) {
        out.push({ type: 'html', value: acc });
        i = j + 1;
        continue;
      }
    }
    out.push(node);
    i += 1;
  }
  return out;
}

function walk(node: MdastNode): void {
  if (!Array.isArray(node.children)) return;
  node.children = mergeChildren(node.children);
  for (const child of node.children) walk(child);
}

export const htmlComment = $remark('mergeHtmlComment', () => () => (tree: MdastNode) => {
  walk(tree);
});
