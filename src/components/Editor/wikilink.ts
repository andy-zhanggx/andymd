import { $nodeSchema, $remark } from '@milkdown/utils';
import remarkWikiLink from 'remark-wiki-link';

/**
 * Obsidian-style wikilinks: [[target]] and [[target|alias]] parse to an
 * inline atom node rendered as a link, and serialize back verbatim.
 * Navigation is handled by a click listener in MarkdownEditor.
 */
export const remarkWikiLinkPlugin = $remark('remarkWikiLink', () => remarkWikiLink, {
  aliasDivider: '|',
});

export const wikilinkSchema = $nodeSchema('wikilink', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  marks: '',
  attrs: {
    target: { default: '' },
    alias: { default: null },
  },
  parseDOM: [
    {
      tag: 'a[data-type="wikilink"]',
      getAttrs: (dom) => ({
        target: (dom as HTMLElement).getAttribute('data-target') ?? '',
        alias: (dom as HTMLElement).getAttribute('data-alias'),
      }),
    },
  ],
  toDOM: (node) => [
    'a',
    {
      'data-type': 'wikilink',
      'data-target': node.attrs.target,
      ...(node.attrs.alias ? { 'data-alias': node.attrs.alias } : {}),
      class: 'wikilink',
      href: '#',
    },
    node.attrs.alias || node.attrs.target,
  ],
  parseMarkdown: {
    match: (node) => node.type === 'wikiLink',
    runner: (state, node, type) => {
      const target = (node.value as string) ?? '';
      const data = node.data as { alias?: string } | undefined;
      const alias = data?.alias && data.alias !== target ? data.alias : null;
      state.addNode(type, { target, alias });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'wikilink',
    runner: (state, node) => {
      state.addNode('wikiLink', undefined, node.attrs.target, {
        data: { alias: node.attrs.alias ?? node.attrs.target },
      });
    },
  },
}));

export const wikilink = [remarkWikiLinkPlugin, wikilinkSchema].flat();
