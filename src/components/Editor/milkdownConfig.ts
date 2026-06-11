import {
  Editor,
  defaultValueCtx,
  editorViewOptionsCtx,
  rootCtx,
} from '@milkdown/core';
import { clipboard } from '@milkdown/plugin-clipboard';
import { cursor } from '@milkdown/plugin-cursor';
import { history } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { math, mathBlockSchema, katexOptionsCtx } from '@milkdown/plugin-math';
import katex from 'katex';
import { prism } from '@milkdown/plugin-prism';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { frontmatter } from './frontmatter';
import { wikilink } from './wikilink';
import 'katex/dist/katex.min.css';
import './prosemirror.css';

export interface BuildOpts {
  root: HTMLElement;
  initialValue: string;
  onChange: (markdown: string) => void;
}

export function buildEditor(opts: BuildOpts) {
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, opts.root);
      ctx.set(defaultValueCtx, opts.initialValue);
      ctx.set(editorViewOptionsCtx, { editable: () => true });
      ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
        opts.onChange(markdown);
      });
      ctx.set(katexOptionsCtx.key, { throwOnError: false });
      // plugin-math renders $$ blocks with the same options as inline math,
      // so they come out textstyle and left-aligned; force displayMode here.
      ctx.set(mathBlockSchema.ctx.key, () => ({
        content: 'text*',
        group: 'block',
        marks: '',
        defining: true,
        atom: true,
        isolating: true,
        attrs: { value: { default: '' } },
        parseDOM: [
          {
            tag: 'div[data-type="math_block"]',
            preserveWhitespace: 'full' as const,
            getAttrs: (dom) => ({ value: (dom as HTMLElement).dataset.value ?? '' }),
          },
        ],
        toDOM: (node) => {
          const code: string = node.attrs.value;
          const dom = document.createElement('div');
          dom.dataset.type = 'math_block';
          dom.dataset.value = code;
          katex.render(code, dom, { ...ctx.get(katexOptionsCtx.key), displayMode: true });
          return dom;
        },
        parseMarkdown: {
          match: ({ type }) => type === 'math',
          runner: (state, node, type) => {
            state.addNode(type, { value: node.value as string });
          },
        },
        toMarkdown: {
          match: (node) => node.type.name === 'math_block',
          runner: (state, node) => {
            state.addNode('math', undefined, node.attrs.value);
          },
        },
      }));
    })
    .use(commonmark)
    .use(gfm)
    .use(frontmatter)
    .use(wikilink)
    .use(listener)
    .use(history)
    .use(clipboard)
    .use(cursor)
    .use(prism)
    .use(math);
}
