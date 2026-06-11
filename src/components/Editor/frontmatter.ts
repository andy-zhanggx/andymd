import { $nodeSchema, $remark } from '@milkdown/utils';
import remarkFrontmatter from 'remark-frontmatter';

/**
 * YAML frontmatter support, Typora-style: the leading `---` fence block is
 * parsed as metadata and rendered as a muted monospace block instead of
 * falling through CommonMark as a thematic break + setext heading.
 */
export const remarkFrontmatterPlugin = $remark(
  'remarkFrontmatter',
  () => remarkFrontmatter,
  'yaml',
);

export const frontmatterSchema = $nodeSchema('frontmatter', () => ({
  content: 'text*',
  group: 'block',
  marks: '',
  code: true,
  defining: true,
  isolating: true,
  parseDOM: [
    {
      tag: 'pre[data-type="frontmatter"]',
      preserveWhitespace: 'full',
    },
  ],
  toDOM: () => [
    'pre',
    { 'data-type': 'frontmatter', class: 'frontmatter' },
    ['code', 0],
  ],
  parseMarkdown: {
    match: (node) => node.type === 'yaml',
    runner: (state, node, type) => {
      const value = (node.value as string) ?? '';
      state.openNode(type);
      if (value) state.addText(value);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'frontmatter',
    runner: (state, node) => {
      state.addNode('yaml', undefined, node.content.firstChild?.text ?? '');
    },
  },
}));

export const frontmatter = [remarkFrontmatterPlugin, frontmatterSchema].flat();
