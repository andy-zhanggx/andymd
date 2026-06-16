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
