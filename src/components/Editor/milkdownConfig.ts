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
import { gfm, remarkGFMPlugin } from '@milkdown/preset-gfm';
import { frontmatter } from './frontmatter';
import { wikilink } from './wikilink';
import { searchPlugin } from './searchPlugin';
import { viewModePlugin } from './viewModePlugin';
import { autoPairPlugin } from './autoPairPlugin';
import { smartPunctuation } from './smartPunctuation';
import { highlight, superscript, subscript } from './marks';
import { htmlComment } from './htmlComment';
import { emoji } from '@milkdown/plugin-emoji';
import { diagram } from '@milkdown/plugin-diagram';
import 'katex/dist/katex.min.css';
import './prosemirror.css';

export interface BuildOpts {
  root: HTMLElement;
  initialValue: string;
  onChange: (markdown: string) => void;
  spellcheck?: boolean;
  /**
   * Wire the change listener (default true). Tests disable it: the listener
   * serializes the doc on a 200ms lodash debounce, and that deferred
   * serialization throws "Context editorView not found" if it fires after the
   * editor is destroyed — a teardown race that makes the suite flaky in CI.
   */
  listener?: boolean;
}

export function buildEditor(opts: BuildOpts) {
  const useListener = opts.listener ?? true;
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, opts.root);
      ctx.set(defaultValueCtx, opts.initialValue);
      ctx.set(editorViewOptionsCtx, {
        editable: () => true,
        attributes: { spellcheck: String(opts.spellcheck ?? true) },
      });
      if (useListener) {
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          opts.onChange(markdown);
        });
      }
      ctx.set(katexOptionsCtx.key, { throwOnError: false });
      // Disable GFM single-tilde strikethrough so `~x~` is free for subscript;
      // `~~x~~` remains strikethrough.
      ctx.set(remarkGFMPlugin.options.key, { singleTilde: false });
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
    .use(highlight)
    .use(superscript)
    .use(subscript)
    .use(emoji)
    // After emoji (and other inline splitters) so it can stitch fragmented
    // HTML comments back into a single node.
    .use(htmlComment)
    .use(diagram)
    .use(searchPlugin)
    .use(viewModePlugin)
    .use(autoPairPlugin)
    .use(smartPunctuation)
    .use(history)
    .use(clipboard)
    .use(cursor)
    .use(prism)
    .use(math);
  // Config callbacks run after all plugins register, so appending the listener
  // here (rather than mid-chain) keeps `ctx.get(listenerCtx)` above valid.
  if (useListener) editor.use(listener);
  return editor;
}
