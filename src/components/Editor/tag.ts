import { $nodeSchema, $remark, $inputRule, $prose } from '@milkdown/utils';
import { InputRule } from '@milkdown/prose/inputrules';
import { Plugin } from '@milkdown/prose/state';
import { showTag } from '../../lib/tagActions';

/**
 * Obsidian `#tags`. In plain text a tag at the start of a line would be
 * serialized escaped (`\#project`), which Obsidian no longer reads as a
 * tag, so tags become inline atom nodes at parse time and are written back
 * verbatim. Clicking one filters the file tree to notes carrying it.
 *
 * A tag is `#` at the start of a text run or after whitespace, followed by
 * letters (any script), digits, `_`, `-` or `/`, with at least one
 * non-digit — the same rule the Rust tag index uses (`extract_tags`).
 */

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  [key: string]: unknown;
}

const TAG_CHAR = '[\\p{L}\\p{N}_\\-/]';
const TAG = new RegExp(`(^|\\s)#(${TAG_CHAR}+)`, 'gu');

export function isTagBody(s: string): boolean {
  return (
    /^[\p{L}\p{N}_\-/]+$/u.test(s) && /[^0-9]/.test(s) && !s.startsWith('/') && !s.endsWith('/')
  );
}

function splitText(value: string, atRunStart: boolean): MdNode[] | null {
  const out: MdNode[] = [];
  let last = 0;
  TAG.lastIndex = 0;
  for (let m = TAG.exec(value); m; m = TAG.exec(value)) {
    const lead = m[1];
    // `^` inside a text node is only a real boundary at the start of a run.
    if (m.index === 0 && lead === '' && !atRunStart) continue;
    let body = m[2];
    while (body.endsWith('/')) body = body.slice(0, -1);
    if (!isTagBody(body)) continue;
    const start = m.index + lead.length;
    if (start > last) out.push({ type: 'text', value: value.slice(last, start) });
    out.push({ type: 'obsidianTag', value: body });
    last = start + 1 + body.length;
    TAG.lastIndex = last;
  }
  if (!out.length) return null;
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  return out;
}

const SKIP = new Set(['code', 'inlineCode', 'link', 'linkReference', 'heading', 'yaml', 'math', 'inlineMath', 'html']);

function transform(node: MdNode): void {
  const children = node.children;
  if (!Array.isArray(children)) return;
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.type === 'text' && typeof c.value === 'string') {
      const prev = children[i - 1];
      // A tag must follow whitespace or start the paragraph/line: a text run
      // right after e.g. `**bold**` is glued to it.
      const atRunStart = i === 0 || prev?.type === 'break';
      const parts = splitText(c.value, atRunStart);
      if (parts) {
        children.splice(i, 1, ...parts);
        i += parts.length - 1;
      }
      continue;
    }
    if (SKIP.has(c.type)) continue;
    transform(c);
  }
}

export const remarkTag = $remark(
  'remarkObsidianTag',
  () =>
    function (this: unknown) {
      const data = (this as { data: () => Record<string, unknown[] | undefined> }).data();
      (data.toMarkdownExtensions ??= []).push({
        handlers: { obsidianTag: (node: MdNode) => `#${node.value ?? ''}` },
      });
      return (tree: unknown) => transform(tree as MdNode);
    },
);

export const tagSchema = $nodeSchema('tag', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  marks: '',
  attrs: { name: { default: '' } },
  parseDOM: [
    {
      tag: 'span[data-type="tag"]',
      priority: 100,
      getAttrs: (dom) => ({ name: (dom as HTMLElement).dataset.tag ?? '' }),
    },
  ],
  toDOM: (node) => [
    'span',
    { 'data-type': 'tag', 'data-tag': node.attrs.name, class: 'tag', title: `Show notes tagged #${node.attrs.name}` },
    `#${node.attrs.name}`,
  ],
  parseMarkdown: {
    match: (node) => node.type === 'obsidianTag',
    runner: (state, node, type) => {
      state.addNode(type, { name: (node.value as string) ?? '' });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'tag',
    runner: (state, node) => {
      state.addNode('obsidianTag', undefined, node.attrs.name as string);
    },
  },
}));

/** Typing whitespace after `#word` (at a word boundary) makes it a tag. */
export const tagInputRule = $inputRule((ctx) =>
  new InputRule(new RegExp(`(^|\\s)#(${TAG_CHAR}+)\\s$`, 'u'), (state, match, start, end) => {
    const $start = state.doc.resolve(start);
    if ($start.parent.type.spec.code || $start.parent.type.name === 'heading') return null;
    if ($start.marks().some((m) => m.type.name === 'inlineCode' || m.type.name === 'link')) return null;
    const body = match[2];
    if (!isTagBody(body)) return null;
    const from = start + match[1].length;
    const space = match[0].slice(-1);
    return state.tr
      .replaceWith(from, end, tagSchema.type(ctx).create({ name: body }))
      .insertText(space);
  }),
);

/** Click a tag → filter the file tree to notes carrying it. */
export const tagClick = $prose(
  () =>
    new Plugin({
      props: {
        handleClickOn(_view, _pos, node) {
          if (node.type.name !== 'tag') return false;
          showTag(node.attrs.name as string);
          return true;
        },
      },
    }),
);

export const tag = [remarkTag, tagSchema, tagInputRule, tagClick].flat();
