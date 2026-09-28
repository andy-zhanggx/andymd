import { $nodeSchema, $remark, $inputRule, $view, $prose } from '@milkdown/utils';
import { InputRule } from '@milkdown/prose/inputrules';
import { Plugin, TextSelection } from '@milkdown/prose/state';
import type { Node as PMNode } from '@milkdown/prose/model';

/**
 * Obsidian callouts:
 *
 *     > [!note] Optional title
 *     > Body…
 *
 * CommonMark sees a blockquote whose text starts with `[!note]`, and the
 * default serializer escapes that bracket (`> \[!note]`), which breaks the
 * callout in Obsidian. So the blockquote becomes its own `callout` node
 * (title + body blocks) at parse time, and a dedicated to-markdown handler
 * writes the `[!type]` header back unescaped.
 *
 * Round-trip notes:
 *   - `kind` keeps the author's spelling (`NOTE` stays `NOTE`); styling uses
 *     its lowercase form.
 *   - `fold` is `''`, `'+'` (foldable, open) or `'-'` (foldable, closed).
 *     Collapsing in the editor is view state only; the source never changes.
 *   - `gap` records a blank `>` line between the header and the body.
 */

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  position?: { start: { line: number }; end: { line: number } };
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

const HEADER = /^\[!([A-Za-z0-9_-]+)\]([+-]?)[ \t]*/;

/** Split a paragraph's phrasing at its first line end: [title, rest]. */
function splitFirstLine(children: MdNode[]): [MdNode[], MdNode[]] {
  const title: MdNode[] = [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.type === 'break') return [title, children.slice(i + 1)];
    if (c.type === 'text' && typeof c.value === 'string' && c.value.includes('\n')) {
      const nl = c.value.indexOf('\n');
      const before = c.value.slice(0, nl);
      const after = c.value.slice(nl + 1);
      if (before) title.push({ ...c, value: before });
      const rest = children.slice(i + 1);
      if (after) rest.unshift({ ...c, value: after });
      return [title, rest];
    }
    title.push(c);
  }
  return [title, []];
}

function trimTitleEnd(nodes: MdNode[]): MdNode[] {
  const last = nodes[nodes.length - 1];
  if (last?.type === 'text' && typeof last.value === 'string') {
    const v = last.value.replace(/[ \t]+$/, '');
    if (!v) return nodes.slice(0, -1);
    return [...nodes.slice(0, -1), { ...last, value: v }];
  }
  return nodes;
}

/** Turn a callout-shaped blockquote into a `callout` mdast node, or null. */
export function toCallout(bq: MdNode): MdNode | null {
  const blocks = bq.children ?? [];
  const p = blocks[0];
  if (!p || p.type !== 'paragraph' || !p.children?.length) return null;
  const first = p.children[0];
  if (first.type !== 'text' || typeof first.value !== 'string') return null;
  const m = HEADER.exec(first.value);
  if (!m) return null;

  const stripped = first.value.slice(m[0].length);
  const phrasing = stripped ? [{ ...first, value: stripped }, ...p.children.slice(1)] : p.children.slice(1);
  const [titleRaw, rest] = splitFirstLine(phrasing);
  const body: MdNode[] = [];
  if (rest.length) body.push({ type: 'paragraph', children: rest });
  body.push(...blocks.slice(1));

  // A blank `>` line between header and body — only possible when the header
  // paragraph ended on its own line. Positions say so exactly; without them
  // (programmatic trees) assume the common blank-line form.
  let gap = false;
  if (!rest.length && blocks.length > 1) {
    const endLine = p.position?.end.line;
    const nextLine = blocks[1].position?.start.line;
    gap = endLine != null && nextLine != null ? nextLine > endLine + 1 : true;
  }

  return {
    type: 'callout',
    kind: m[1],
    fold: m[2],
    gap,
    children: [{ type: 'calloutTitle', children: trimTitleEnd(titleRaw) }, ...body],
  };
}

function transform(node: MdNode): void {
  const children = node.children;
  if (!Array.isArray(children)) return;
  for (let i = 0; i < children.length; i++) {
    if (children[i].type === 'blockquote') {
      const c = toCallout(children[i]);
      if (c) children[i] = c;
    }
    transform(children[i]);
  }
}

/* ---------------- to-markdown ---------------- */

interface ToMdState {
  enter: (name: string) => () => void;
  createTracker: (info: unknown) => {
    move: (s: string) => void;
    shift: (n: number) => void;
    current: () => Record<string, unknown>;
  };
  containerPhrasing: (node: MdNode, info: Record<string, unknown>) => string;
  containerFlow: (node: MdNode, info: Record<string, unknown>) => string;
  indentLines: (value: string, map: (line: string, index: number, blank: boolean) => string) => string;
}

export function calloutToMarkdown(node: MdNode, _parent: unknown, state: ToMdState, info: unknown): string {
  const exit = state.enter('blockquote');
  const tracker = state.createTracker(info);
  tracker.move('> ');
  tracker.shift(2);
  const [title, ...body] = node.children ?? [];
  let value = `[!${String(node.kind ?? 'note')}]${String(node.fold ?? '')}`;
  if (title?.children?.length) {
    const text = state.containerPhrasing(title, { ...tracker.current(), before: ' ', after: '\n' });
    if (text) value += ` ${text}`;
  }
  if (body.length) {
    const flow = state.containerFlow({ type: 'root', children: body }, tracker.current());
    value += (node.gap ? '\n\n' : '\n') + flow;
  }
  const out = state.indentLines(value, (line, _i, blank) => `>${blank ? '' : ' '}${line}`);
  exit();
  return out;
}

export const remarkCallout = $remark(
  'remarkCallout',
  () =>
    function (this: unknown) {
      const data = (this as { data: () => Record<string, unknown[] | undefined> }).data();
      (data.toMarkdownExtensions ??= []).push({ handlers: { callout: calloutToMarkdown } });
      return (tree: unknown) => transform(tree as MdNode);
    },
);

/* ---------------- schema ---------------- */

export const calloutTitleSchema = $nodeSchema('callout_title', () => ({
  content: 'inline*',
  defining: true,
  parseDOM: [{ tag: 'div[data-type="callout_title"]' }],
  toDOM: () => ['div', { 'data-type': 'callout_title', class: 'callout-title' }, 0],
  parseMarkdown: {
    match: (node) => node.type === 'calloutTitle',
    runner: (state, node, type) => {
      state.openNode(type);
      state.next(node.children);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'callout_title',
    runner: (state, node) => {
      state.openNode('calloutTitle');
      state.next(node.content);
      state.closeNode();
    },
  },
}));

export function calloutClass(kind: string): string {
  return `callout callout-${kind.toLowerCase()}`;
}

export const calloutSchema = $nodeSchema('callout', () => ({
  group: 'block',
  content: 'callout_title block*',
  defining: true,
  attrs: {
    kind: { default: 'note' },
    fold: { default: '' },
    gap: { default: false },
  },
  parseDOM: [
    {
      tag: 'div[data-type="callout"]',
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        return {
          kind: el.dataset.callout ?? 'note',
          fold: el.dataset.fold ?? '',
          gap: el.dataset.gap === 'true',
        };
      },
    },
  ],
  toDOM: (node) => [
    'div',
    {
      'data-type': 'callout',
      'data-callout': node.attrs.kind,
      'data-fold': node.attrs.fold,
      ...(node.attrs.gap ? { 'data-gap': 'true' } : {}),
      class: calloutClass(node.attrs.kind as string),
    },
    0,
  ],
  parseMarkdown: {
    match: (node) => node.type === 'callout',
    runner: (state, node, type) => {
      state.openNode(type, {
        kind: (node.kind as string) || 'note',
        fold: (node.fold as string) || '',
        gap: node.gap === true,
      });
      state.next(node.children);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'callout',
    runner: (state, node) => {
      state.openNode('callout', undefined, {
        kind: node.attrs.kind,
        fold: node.attrs.fold,
        gap: node.attrs.gap,
      });
      state.next(node.content);
      state.closeNode();
    },
  },
}));

/**
 * Foldable callouts (`[!x]+` / `[!x]-`) get a chevron that collapses the
 * body. Collapse is view state: it starts from the source's `-`/`+` and never
 * writes back, exactly like Obsidian's reading view.
 */
export const calloutView = $view(calloutSchema.node, () => (initial: PMNode) => {
  let node = initial;
  const dom = document.createElement('div');
  const contentDOM = document.createElement('div');
  contentDOM.className = 'callout-content';
  let toggle: HTMLButtonElement | null = null;
  let collapsed = node.attrs.fold === '-';

  const apply = () => {
    dom.className = calloutClass(node.attrs.kind as string);
    dom.dataset.type = 'callout';
    dom.dataset.callout = node.attrs.kind as string;
    dom.dataset.fold = node.attrs.fold as string;
    if (node.attrs.gap) dom.dataset.gap = 'true';
    else delete dom.dataset.gap;
    const kind = String(node.attrs.kind);
    dom.style.setProperty('--callout-label', JSON.stringify(kind.charAt(0).toUpperCase() + kind.slice(1).toLowerCase()));
    dom.classList.toggle('callout-collapsed', collapsed && node.attrs.fold !== '');
    if (node.attrs.fold && !toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'callout-fold';
      toggle.contentEditable = 'false';
      toggle.setAttribute('aria-label', 'Toggle callout');
      toggle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        collapsed = !collapsed;
        apply();
      });
      dom.insertBefore(toggle, contentDOM);
    } else if (!node.attrs.fold && toggle) {
      toggle.remove();
      toggle = null;
    }
    toggle?.setAttribute('aria-expanded', String(!collapsed));
  };
  dom.appendChild(contentDOM);
  apply();

  return {
    dom,
    contentDOM,
    update: (next: PMNode) => {
      if (next.type !== node.type) return false;
      if (next.attrs.fold !== node.attrs.fold) collapsed = next.attrs.fold === '-';
      node = next;
      apply();
      return true;
    },
    ignoreMutation: (m: { target: Node; type: string }) =>
      (toggle != null && toggle.contains(m.target)) ||
      (m.type === 'attributes' && m.target === dom),
  };
});

/**
 * Typing `[!type] ` at the start of a blockquote's first paragraph turns the
 * blockquote into a callout (whatever followed on that line becomes the
 * title). Without this the literal text would serialize escaped.
 */
export const calloutInputRule = $inputRule((ctx) =>
  new InputRule(/^\[!([A-Za-z0-9_-]+)\]([+-]?)\s$/, (state, match, start, end) => {
    const $start = state.doc.resolve(start);
    const para = $start.parent;
    if (para.type.name !== 'paragraph' || $start.depth < 2) return null;
    const bq = $start.node($start.depth - 1);
    if (bq.type.name !== 'blockquote' || $start.index($start.depth - 1) !== 0) return null;
    const calloutType = calloutSchema.type(ctx);
    const titleType = calloutTitleSchema.type(ctx);

    const afterMarker = para.content.cut(end - $start.start());
    const title = titleType.create(null, afterMarker);
    const body: PMNode[] = [];
    bq.forEach((child, _o, i) => {
      if (i > 0) body.push(child);
    });
    const callout = calloutType.create({ kind: match[1], fold: match[2], gap: false }, [title, ...body]);
    const bqPos = $start.before($start.depth - 1);
    const tr = state.tr.replaceWith(bqPos, bqPos + bq.nodeSize, callout);
    // Caret into the title, after any carried-over text.
    return tr.setSelection(TextSelection.near(tr.doc.resolve(bqPos + 2 + title.content.size)));
  }),
);

/**
 * Enter in a callout title moves to the first body block, creating an empty
 * paragraph when the callout has no body yet (the title is a single line).
 */
export const calloutKeymap = $prose(
  () =>
    new Plugin({
      props: {
        handleKeyDown(view, event) {
          if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
            return false;
          }
          const { $from, empty } = view.state.selection;
          if (!empty || $from.parent.type.name !== 'callout_title') return false;
          const afterTitle = $from.after();
          const callout = $from.node($from.depth - 1);
          let tr = view.state.tr;
          if (callout.childCount < 2) {
            tr = tr.insert(afterTitle, view.state.schema.nodes.paragraph.create());
          }
          tr.setSelection(TextSelection.near(tr.doc.resolve(afterTitle + 1)));
          view.dispatch(tr.scrollIntoView());
          return true;
        },
      },
    }),
);

export const callout = [remarkCallout, calloutTitleSchema, calloutSchema, calloutView, calloutInputRule, calloutKeymap].flat();

/**
 * Insert an empty callout after the caret's top-level block (or in place of
 * it when that block is an empty paragraph) and put the caret in its title.
 */
export function insertCallout(view: import('@milkdown/prose/view').EditorView, kind = 'note'): boolean {
  const { state } = view;
  const { nodes } = state.schema;
  if (!nodes.callout || !nodes.callout_title || !nodes.paragraph) return false;
  const node = nodes.callout.create({ kind, fold: '', gap: false }, [nodes.callout_title.create()]);
  const $from = state.selection.$from;
  let tr;
  let pos: number;
  if ($from.depth < 1) {
    pos = state.doc.content.size;
    tr = state.tr.insert(pos, node);
  } else {
    const top = $from.node(1);
    const start = $from.before(1);
    if (top.type === nodes.paragraph && top.content.size === 0) {
      pos = start;
      tr = state.tr.replaceWith(start, $from.after(1), node);
    } else {
      pos = $from.after(1);
      tr = state.tr.insert(pos, node);
    }
  }
  tr.setSelection(TextSelection.create(tr.doc, pos + 2));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}
