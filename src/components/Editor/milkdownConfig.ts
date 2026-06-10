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
import { math } from '@milkdown/plugin-math';
import { prism } from '@milkdown/plugin-prism';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { nord } from '@milkdown/theme-nord';
import { frontmatter } from './frontmatter';
import { wikilink } from './wikilink';
import 'katex/dist/katex.min.css';
import '@milkdown/theme-nord/style.css';

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
    })
    .config(nord)
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
