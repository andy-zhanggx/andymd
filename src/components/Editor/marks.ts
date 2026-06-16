import { $markSchema, $remark } from '@milkdown/utils';
import remarkFlexibleMarkers from 'remark-flexible-markers';

/**
 * Typora-style highlight: `==text==` ↔ a ProseMirror mark rendered as <mark>.
 *
 * Parsing is handled by remark-flexible-markers, which rewrites `==text==`
 * text into mdast `mark` nodes during the transform phase. That package targets
 * md→HTML and ships NO markdown serializer, so we register our own
 * mdast-util-to-markdown handler to turn `mark` nodes back into `==text==`.
 */
export const remarkHighlightParse = $remark(
  'remarkHighlightParse',
  () => remarkFlexibleMarkers,
);

export const remarkHighlightStringify = $remark('remarkHighlightStringify', () => {
  return function (this: { data: () => Record<string, unknown> }) {
    const data = this.data();
    const extensions = (data.toMarkdownExtensions ||= []) as Array<{
      handlers: Record<string, unknown>;
    }>;
    extensions.push({
      handlers: {
        mark(
          node: { children: unknown[] },
          _parent: unknown,
          state: { containerPhrasing: (n: unknown, info: unknown) => string },
          info: Record<string, unknown>,
        ) {
          const value = state.containerPhrasing(node, { ...info, before: '=', after: '=' });
          return `==${value}==`;
        },
      },
    });
  };
});

export const highlightSchema = $markSchema('highlight', () => ({
  parseDOM: [{ tag: 'mark' }],
  toDOM: () => ['mark', { class: 'md-highlight' }, 0],
  parseMarkdown: {
    match: (node) => node.type === 'mark',
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'highlight',
    runner: (state, mark) => {
      state.withMark(mark, 'mark');
    },
  },
}));

export const highlight = [remarkHighlightParse, remarkHighlightStringify, highlightSchema].flat();

// ── Superscript: ^text^ ↔ <sup> ──────────────────────────────────────────
// `^text^` (no spaces/carets inside, pandoc-style) becomes a superscript mark.
// We own both directions: a tree transformer rewrites text nodes into
// `superscript` mdast nodes, and a toMarkdown handler renders them back.
// (Subscript `~text~` is intentionally NOT added — GFM already claims single
// `~` for strikethrough, which is the more standard behavior.)

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

const SUP_RE = /\^([^^\s]+)\^/g;

function splitSuperscript(value: string): MdNode[] | null {
  const out: MdNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  SUP_RE.lastIndex = 0;
  while ((m = SUP_RE.exec(value))) {
    if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) });
    out.push({ type: 'superscript', children: [{ type: 'text', value: m[1] }] });
    last = m.index + m[0].length;
  }
  if (out.length === 0) return null;
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  return out;
}

function transformSuperscript(tree: MdNode): void {
  if (!tree.children) return;
  const next: MdNode[] = [];
  for (const child of tree.children) {
    if (child.type === 'text' && typeof child.value === 'string') {
      const parts = splitSuperscript(child.value);
      if (parts) next.push(...parts);
      else next.push(child);
    } else {
      transformSuperscript(child);
      next.push(child);
    }
  }
  tree.children = next;
}

export const remarkSuperscriptParse = $remark('remarkSuperscriptParse', () => {
  return () => (tree: MdNode) => transformSuperscript(tree);
});

export const remarkSuperscriptStringify = $remark('remarkSuperscriptStringify', () => {
  return function (this: { data: () => Record<string, unknown> }) {
    const data = this.data();
    const extensions = (data.toMarkdownExtensions ||= []) as Array<{
      handlers: Record<string, unknown>;
    }>;
    extensions.push({
      handlers: {
        superscript(
          node: { children: unknown[] },
          _parent: unknown,
          state: { containerPhrasing: (n: unknown, info: unknown) => string },
          info: Record<string, unknown>,
        ) {
          const value = state.containerPhrasing(node, { ...info, before: '^', after: '^' });
          return `^${value}^`;
        },
      },
    });
  };
});

export const superscriptSchema = $markSchema('superscript', () => ({
  parseDOM: [{ tag: 'sup' }],
  toDOM: () => ['sup', { class: 'md-sup' }, 0],
  parseMarkdown: {
    match: (node) => node.type === 'superscript',
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'superscript',
    runner: (state, mark) => {
      state.withMark(mark, 'superscript');
    },
  },
}));

export const superscript = [
  remarkSuperscriptParse,
  remarkSuperscriptStringify,
  superscriptSchema,
].flat();
