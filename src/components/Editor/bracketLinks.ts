import type { Transaction } from '@milkdown/prose/state';

const EMBED_END = /!\[\[([^[\]\n]+)\]\]$/;
const LINK_END = /(^|[^!])\[\[([^[\]\n]+)\]\]$/;

/**
 * If the text of the textblock ending at `end` (in `tr.doc`) finishes with a
 * complete `[[target|alias]]` or `![[embed]]`, replace it in `tr` with the
 * matching node and return true. Shared by the `]]` input rule and the
 * auto-pair plugin, whose type-over of an auto-inserted `]` never reaches the
 * input rules.
 */
export function applyBracketLink(tr: Transaction, end: number): boolean {
  const doc = tr.doc;
  const $end = doc.resolve(end);
  if (!$end.parent.isTextblock || $end.parent.type.spec.code) return false;
  if ($end.marks().some((m) => m.type.name === 'inlineCode' || m.type.spec.code)) return false;
  const start = $end.start();
  // One placeholder char per inline atom keeps string offsets = doc offsets.
  const text = doc.textBetween(start, end, undefined, '￼');
  const { nodes } = doc.type.schema;

  const e = EMBED_END.exec(text);
  if (e && nodes.wiki_embed) {
    tr.replaceWith(end - e[0].length, end, nodes.wiki_embed.create({ value: e[1] }));
    return true;
  }

  const l = LINK_END.exec(text);
  if (l && nodes.wikilink) {
    const inner = l[2];
    const pipe = inner.indexOf('|');
    const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
    const alias = pipe === -1 ? null : inner.slice(pipe + 1).trim() || null;
    if (!target) return false;
    tr.replaceWith(end - l[0].length + l[1].length, end, nodes.wikilink.create({ target, alias }));
    return true;
  }
  return false;
}
