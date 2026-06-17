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
import { commonmark, htmlSchema, htmlAttr } from '@milkdown/preset-commonmark';
import { gfm, remarkGFMPlugin } from '@milkdown/preset-gfm';
import { frontmatter } from './frontmatter';
import { fencedMath } from './fencedMath';
import { wikilink } from './wikilink';
import { searchPlugin } from './searchPlugin';
import { viewModePlugin } from './viewModePlugin';
import { autoPairPlugin } from './autoPairPlugin';
import { smartPunctuation } from './smartPunctuation';
import { highlight, superscript, subscript } from './marks';
import { htmlComment } from './htmlComment';
import { htmlMerge } from './htmlMerge';
import { editableNodeViews } from './editableNodes';
import { emoji } from '@milkdown/plugin-emoji';
import { diagram } from '@milkdown/plugin-diagram';
import { collab } from '@milkdown/plugin-collab';
import 'katex/dist/katex.min.css';
import './prosemirror.css';

/** Void/self-closing elements that render on their own (no closing tag). */
const RENDERABLE_VOID =
  /^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)(\s[^>]*)?\/?>$/i;

/**
 * True when `value` is a self-contained HTML element worth rendering as real
 * DOM: a balanced `<tag …>…</tag>` (the htmlMerge transformer only ever emits
 * these) or a single void/self-closing element. A lone unbalanced fragment
 * (`<b>` with no close) returns false and keeps its literal rendering.
 */
function isRenderableHtml(value: string): boolean {
  const s = value.trim();
  if (/^<([a-zA-Z][\w-]*)(\s[^>]*)?>[\s\S]*<\/\s*\1\s*>$/.test(s)) return true;
  if (RENDERABLE_VOID.test(s)) return true;
  if (/^<[a-zA-Z][\w-]*(\s[^>]*)?\/>$/.test(s)) return true;
  return false;
}

/**
 * Render `value` into `el` as DOM, stripped of script-bearing surface area.
 * `innerHTML` never executes scripts, but we still drop `<script>`/embeds and
 * event-handler / `javascript:` attributes so authored markup can't smuggle in
 * active content. The original markup lives on in `data-value` for round-trip.
 */
function renderHtmlInto(el: HTMLElement, value: string): void {
  el.innerHTML = value;
  el.querySelectorAll('script, iframe, object, embed').forEach((n) => n.remove());
  el.querySelectorAll('*').forEach((node) => {
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || /^\s*javascript:/i.test(attr.value)) {
        node.removeAttribute(attr.name);
      }
    }
  });
}

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
  /**
   * Enable real-time collaboration. Adds the Yjs-backed `collab` plugin and
   * drops the local `history` plugin (collab provides shared undo via y-undo).
   * The editor's content is then driven by the Y.Doc bound in MarkdownEditor,
   * not by `initialValue`.
   */
  collab?: boolean;
}

export function buildEditor(opts: BuildOpts) {
  const useListener = opts.listener ?? true;
  const useCollab = opts.collab ?? false;
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
      // Render HTML comments (`<!-- … -->`) as their inner text, muted, rather
      // than showing the raw `<!--`/`-->` delimiters as literal content, and
      // render balanced inline HTML (a `<b>…</b>`, a `<table>…</table>` stitched
      // back together by the htmlMerge transformer) as actual DOM, the way
      // Typora does. The full markup is preserved in data-value so serialization
      // round-trips losslessly. Unbalanced/standalone fragments keep their
      // literal rendering so malformed markup stays visible.
      ctx.set(htmlSchema.ctx.key, () => ({
        atom: true,
        group: 'inline',
        inline: true,
        attrs: { value: { default: '', validate: 'string' } },
        toDOM: (node) => {
          const value: string = node.attrs.value ?? '';
          const span = document.createElement('span');
          Object.entries(ctx.get(htmlAttr.key)(node) as Record<string, string>).forEach(
            ([k, v]) => span.setAttribute(k, v),
          );
          span.dataset.value = value;
          span.dataset.type = 'html';
          const comment = /^<!--([\s\S]*)-->$/.exec(value.trim());
          if (comment) {
            span.classList.add('html-comment');
            span.textContent = comment[1].trim();
          } else if (isRenderableHtml(value)) {
            span.classList.add('html-render');
            renderHtmlInto(span, value);
          } else {
            span.textContent = value;
          }
          return span;
        },
        parseDOM: [
          {
            tag: 'span[data-type="html"]',
            getAttrs: (dom) => ({ value: (dom as HTMLElement).dataset.value ?? '' }),
          },
        ],
        parseMarkdown: {
          match: ({ type }) => type === 'html',
          runner: (state, node, type) => {
            state.addNode(type, { value: node.value as string });
          },
        },
        toMarkdown: {
          match: (node) => node.type.name === 'html',
          runner: (state, node) => {
            state.addNode('html', undefined, node.attrs.value);
          },
        },
      }));
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
        attrs: { value: { default: '' }, fenced: { default: false } },
        parseDOM: [
          {
            tag: 'div[data-type="math_block"]',
            preserveWhitespace: 'full' as const,
            getAttrs: (dom) => ({
              value: (dom as HTMLElement).dataset.value ?? '',
              fenced: (dom as HTMLElement).dataset.fenced === 'true',
            }),
          },
        ],
        toDOM: (node) => {
          const code: string = node.attrs.value;
          const dom = document.createElement('div');
          dom.dataset.type = 'math_block';
          dom.dataset.value = code;
          if (node.attrs.fenced) dom.dataset.fenced = 'true';
          katex.render(code, dom, { ...ctx.get(katexOptionsCtx.key), displayMode: true });
          return dom;
        },
        parseMarkdown: {
          match: ({ type }) => type === 'math',
          runner: (state, node, type) => {
            state.addNode(type, {
              value: node.value as string,
              fenced: (node as { fenced?: boolean }).fenced === true,
            });
          },
        },
        toMarkdown: {
          match: (node) => node.type.name === 'math_block',
          runner: (state, node) => {
            // Preserve the author's original fence: ```math round-trips as a
            // fenced code block, while `$$ … $$` round-trips via remark-math.
            if (node.attrs.fenced) {
              state.addNode('code', undefined, node.attrs.value as string, { lang: 'math' });
            } else {
              state.addNode('math', undefined, node.attrs.value);
            }
          },
        },
      }));
    })
    .use(commonmark)
    .use(gfm)
    .use(frontmatter)
    .use(fencedMath)
    .use(wikilink)
    .use(highlight)
    .use(superscript)
    .use(subscript)
    .use(emoji)
    // After emoji (and other inline splitters) so it can stitch fragmented
    // HTML comments back into a single node.
    .use(htmlComment)
    // After htmlComment so comments are already merged; stitches fragmented
    // inline HTML (tables, `<b>…</b>`) back into single renderable nodes.
    .use(htmlMerge)
    .use(diagram)
    .use(searchPlugin)
    .use(viewModePlugin)
    .use(autoPairPlugin)
    .use(smartPunctuation)
    .use(clipboard)
    .use(cursor)
    .use(prism)
    .use(math)
    // Click-to-edit NodeViews for the atom nodes (inline/block math, image).
    .use(editableNodeViews);
  // Shared (Yjs) undo replaces the local history stack in collab mode; using
  // both fights over the same transactions.
  if (useCollab) editor.use(collab);
  else editor.use(history);
  // Config callbacks run after all plugins register, so appending the listener
  // here (rather than mid-chain) keeps `ctx.get(listenerCtx)` above valid.
  if (useListener) editor.use(listener);
  return editor;
}
