import { $remark } from '@milkdown/utils';

/**
 * Re-merge inline HTML that CommonMark fragments tag-by-tag.
 *
 * `remark.parse` tokenises inline HTML into one `html` node per tag, with the
 * element's text content left as plain `text` nodes between them. So a snippet
 * like:
 *
 *     Before. <b>T</b><table><tr><th>group</th></tr></table>
 *
 * becomes `text("Before. ") html("<b>") text("T") html("</b>") html("<table>")
 * html("<tr>") html("<th>") text("group") html("</th>") …`. The html node's
 * `toDOM` then renders each fragment as escaped literal text, so the reader sees
 * a wall of raw `<table>`/`<th>` tags instead of a rendered table.
 *
 * This transformer (a sibling of `htmlComment`) walks each parent's children and
 * stitches a *balanced* run of html-and-literal fragments — one that opens with
 * a tag and returns to tag-depth zero — back into a single `html` node holding
 * the reconstructed source. The html schema then renders that whole element
 * (see `isRenderableHtml` in milkdownConfig) and serialises its `value`
 * verbatim, so the markup round-trips losslessly.
 *
 * Unbalanced fragments (a stray `<b>` with no close, malformed tags) never
 * reach depth zero, so they are left untouched and keep their literal rendering.
 */

interface MdastNode {
  type: string;
  value?: unknown;
  children?: MdastNode[];
}

// Void elements never have a closing tag, so they don't change tag depth.
const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** +1 for an opening tag, -1 for a closing tag, 0 for void/self-closing/non-element. */
function tagDelta(html: string): number {
  const s = html.trim();
  if (/^<\/\s*[a-zA-Z]/.test(s)) return -1;
  const m = /^<\s*([a-zA-Z][\w-]*)/.exec(s);
  if (!m) return 0; // comment, doctype, or not a tag at all
  if (/\/\s*>$/.test(s)) return 0; // self-closing <x/>
  if (VOID.has(m[1].toLowerCase())) return 0;
  return 1;
}

/** The original markdown source a fragment contributes, or null if unrecoverable. */
function sourceOf(node: MdastNode): string | null {
  // Emoji nodes carry the rendered <img> in `value`; the source char is the alt.
  if (node.type === 'emoji' && typeof node.value === 'string') {
    const alt = /alt="([^"]*)"/.exec(node.value);
    if (alt) return alt[1];
  }
  if (typeof node.value === 'string') return node.value;
  // A node with children (strong, link, …) can't be cheaply reconstructed:
  // bail so we don't silently drop or reorder its content.
  return null;
}

function mergeChildren(children: MdastNode[]): MdastNode[] {
  const out: MdastNode[] = [];
  let i = 0;
  while (i < children.length) {
    const node = children[i];
    const opensRun =
      node.type === 'html' && typeof node.value === 'string' && tagDelta(node.value) === 1;

    if (opensRun) {
      let acc = '';
      let depth = 0;
      let j = i;
      let balanced = false;
      while (j < children.length) {
        const part = children[j];
        const src = sourceOf(part);
        if (src === null) break; // unrecoverable fragment — abandon the run
        acc += src;
        if (part.type === 'html') depth += tagDelta(part.value as string);
        if (depth <= 0) {
          balanced = true;
          break;
        }
        j++;
      }
      if (balanced && depth === 0) {
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

export const htmlMerge = $remark('mergeInlineHtml', () => () => (tree: MdastNode) => {
  walk(tree);
});
