import katex from 'katex';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { NodeSelection } from '@milkdown/prose/state';
import type { EditorView, NodeView, NodeViewConstructor } from '@milkdown/prose/view';
import { katexOptionsCtx, mathInlineSchema, mathBlockSchema } from '@milkdown/plugin-math';
import { imageSchema } from '@milkdown/preset-commonmark';
import { $view } from '@milkdown/utils';
import type { $Node } from '@milkdown/utils';

// The Milkdown context object, derived from $view's factory signature so we
// don't depend on `@milkdown/ctx` directly (it's only a pnpm override here).
type Ctx = Parameters<Parameters<typeof $view>[1]>[0];

/**
 * Click-to-edit NodeViews for the editor's "atom" nodes.
 *
 * `math_inline`, `math_block` and `image` are ProseMirror atom nodes: once
 * rendered (KaTeX / <img>) they are opaque leaves the cursor cannot enter, so
 * there is no way to change the formula or the image source — the node is a
 * black box. These NodeViews give each one a Typora-style editing affordance:
 * selecting the node (a click) swaps the rendered output for a small source
 * editor; committing (blur / Enter / selecting away) writes the edit back into
 * the document and re-renders.
 */

/** Build math_inline / math_block schema's source from the live node. */
function mathSource(node: ProseNode, inline: boolean): string {
  return inline ? node.textContent : ((node.attrs.value as string) ?? '');
}

// "Expand"-style corner-bracket icon for the block-math edit affordance — a
// clearer, larger click target than clicking the formula itself (which was easy
// to miss and read like a scrollbar).
const EXPAND_ICON =
  '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
  '<path d="M6 2.5H3.5a1 1 0 0 0-1 1V6M10 2.5h2.5a1 1 0 0 1 1 1V6M6 13.5H3.5a1 1 0 0 1-1-1V10M10 13.5h2.5a1 1 0 0 0 1-1V10" ' +
  'stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

class MathNodeView implements NodeView {
  dom: HTMLElement;
  private rendered: HTMLElement;
  private editBtn: HTMLButtonElement | null = null;
  private field: HTMLTextAreaElement | null = null;
  private editing = false;
  private node: ProseNode;

  constructor(
    node: ProseNode,
    private view: EditorView,
    private getPos: () => number | undefined,
    private inline: boolean,
    private ctx: Ctx,
  ) {
    this.node = node;
    const tag = inline ? 'span' : 'div';
    this.dom = document.createElement(tag);
    this.dom.classList.add('math-node', inline ? 'math-inline' : 'math-block');
    this.dom.setAttribute('data-type', inline ? 'math_inline' : 'math_block');
    this.rendered = document.createElement(tag);
    this.rendered.className = 'math-rendered';
    this.dom.appendChild(this.rendered);
    // Block math gets an explicit hover "expand to edit" button (top-right). The
    // whole block is also a click target (see CSS), but the icon makes the
    // edit affordance obvious instead of relying on clicking the formula.
    if (!inline) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'math-edit-affordance';
      btn.setAttribute('contenteditable', 'false');
      btn.setAttribute('aria-label', 'Edit formula');
      btn.title = 'Edit formula';
      btn.innerHTML = EXPAND_ICON;
      btn.addEventListener('mousedown', this.onAffordanceDown);
      this.editBtn = btn;
      this.dom.appendChild(btn);
    }
    this.renderMath();
  }

  // Enter edit mode by selecting the node (ProseMirror then calls selectNode,
  // which swaps in the source textarea). mousedown + preventDefault keeps focus
  // off the button and stops ProseMirror's own selection handling.
  private onAffordanceDown = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (this.editing) return;
    const pos = this.getPos();
    if (pos == null) {
      this.selectNode();
      return;
    }
    // Focus first: ProseMirror only fires selectNode on block atoms once the
    // view has focus, and that is what opens the source editor.
    this.view.focus();
    const { state } = this.view;
    this.view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
  };

  private renderMath() {
    const src = mathSource(this.node, this.inline);
    this.dom.dataset.value = src;
    if (!src) {
      this.rendered.textContent = this.inline ? '∅' : '(empty math)';
      this.rendered.classList.add('math-empty');
      return;
    }
    this.rendered.classList.remove('math-empty');
    try {
      katex.render(src, this.rendered, {
        ...this.ctx.get(katexOptionsCtx.key),
        displayMode: !this.inline,
      });
    } catch {
      this.rendered.textContent = src;
    }
  }

  selectNode() {
    if (this.editing) return;
    this.editing = true;
    this.dom.classList.add('editing');
    const src = mathSource(this.node, this.inline);
    const field = document.createElement('textarea');
    field.className = 'math-source';
    field.value = src;
    field.spellcheck = false;
    field.rows = this.inline ? 1 : Math.max(2, src.split('\n').length);
    this.field = field;
    this.dom.appendChild(field);
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
    field.addEventListener('keydown', this.onKeyDown);
    field.addEventListener('blur', this.onBlur);
  }

  deselectNode() {
    this.commit();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.cancel();
      this.view.focus();
    } else if (e.key === 'Enter' && (this.inline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      this.commit();
      this.view.focus();
    }
  };

  private onBlur = () => this.commit();

  private teardownField(): string | null {
    const field = this.field;
    if (!field) return null;
    field.removeEventListener('keydown', this.onKeyDown);
    field.removeEventListener('blur', this.onBlur);
    const value = field.value;
    field.remove();
    this.field = null;
    this.editing = false;
    this.dom.classList.remove('editing');
    return value;
  }

  private cancel() {
    this.teardownField();
    this.renderMath();
  }

  private commit() {
    if (!this.editing) return;
    const next = this.teardownField();
    if (next === null) return;
    if (next === mathSource(this.node, this.inline)) {
      this.renderMath();
      return;
    }
    const pos = this.getPos();
    if (pos == null) {
      this.renderMath();
      return;
    }
    const { state } = this.view;
    const type = this.node.type;
    if (this.inline) {
      const newNode = next
        ? type.create(this.node.attrs, state.schema.text(next))
        : type.create(this.node.attrs);
      this.view.dispatch(state.tr.replaceWith(pos, pos + this.node.nodeSize, newNode));
    } else {
      this.view.dispatch(
        state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, value: next }),
      );
    }
  }

  update(node: ProseNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (!this.editing) this.renderMath();
    return true;
  }

  stopEvent(e: Event) {
    if (this.editBtn && e.target instanceof Node && this.editBtn.contains(e.target)) return true;
    return this.editing && e.target === this.field;
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.editBtn?.removeEventListener('mousedown', this.onAffordanceDown);
    this.teardownField();
  }
}

class ImageNodeView implements NodeView {
  dom: HTMLElement;
  private img: HTMLImageElement;
  private panel: HTMLElement | null = null;
  private srcField: HTMLInputElement | null = null;
  private altField: HTMLInputElement | null = null;
  private editing = false;
  private node: ProseNode;

  constructor(
    node: ProseNode,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.node = node;
    this.dom = document.createElement('span');
    this.dom.className = 'image-node';
    this.dom.setAttribute('data-type', 'image');
    this.img = document.createElement('img');
    this.dom.appendChild(this.img);
    this.renderImage();
  }

  private renderImage() {
    const { src, alt, title } = this.node.attrs as Record<string, string>;
    if (this.img.getAttribute('src') !== src) this.img.setAttribute('src', src ?? '');
    this.img.setAttribute('alt', alt ?? '');
    if (title) this.img.setAttribute('title', title);
    else this.img.removeAttribute('title');
  }

  selectNode() {
    if (this.editing) return;
    this.editing = true;
    this.dom.classList.add('editing');
    const { src, alt } = this.node.attrs as Record<string, string>;
    const panel = document.createElement('span');
    panel.className = 'image-edit';
    panel.setAttribute('contenteditable', 'false');

    const altField = document.createElement('input');
    altField.className = 'image-alt';
    altField.placeholder = 'alt text';
    altField.value = alt ?? '';

    const srcField = document.createElement('input');
    srcField.className = 'image-src';
    srcField.placeholder = 'image path';
    srcField.value = src ?? '';

    panel.append(altField, srcField);
    this.altField = altField;
    this.srcField = srcField;
    this.panel = panel;
    this.dom.appendChild(panel);

    altField.focus();
    altField.addEventListener('keydown', this.onKeyDown);
    srcField.addEventListener('keydown', this.onKeyDown);
    altField.addEventListener('blur', this.onBlur);
    srcField.addEventListener('blur', this.onBlur);
  }

  deselectNode() {
    this.commit();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.teardownPanel();
      this.view.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.commit();
      this.view.focus();
    }
  };

  // Commit only once focus leaves the whole panel, not when moving between the
  // two inputs.
  private onBlur = () => {
    setTimeout(() => {
      if (!this.editing || !this.panel) return;
      const active = this.dom.ownerDocument.activeElement;
      if (active && this.panel.contains(active)) return;
      this.commit();
    }, 0);
  };

  private teardownPanel(): { src: string; alt: string } | null {
    if (!this.panel) return null;
    const result = { src: this.srcField?.value ?? '', alt: this.altField?.value ?? '' };
    this.altField?.removeEventListener('keydown', this.onKeyDown);
    this.srcField?.removeEventListener('keydown', this.onKeyDown);
    this.altField?.removeEventListener('blur', this.onBlur);
    this.srcField?.removeEventListener('blur', this.onBlur);
    this.panel.remove();
    this.panel = null;
    this.srcField = null;
    this.altField = null;
    this.editing = false;
    this.dom.classList.remove('editing');
    return result;
  }

  private commit() {
    if (!this.editing) return;
    const next = this.teardownPanel();
    if (!next) return;
    const attrs = this.node.attrs as Record<string, string>;
    if (next.src === attrs.src && next.alt === attrs.alt) return;
    const pos = this.getPos();
    if (pos == null) return;
    const { state } = this.view;
    this.view.dispatch(
      state.tr.setNodeMarkup(pos, undefined, { ...attrs, src: next.src, alt: next.alt }),
    );
  }

  update(node: ProseNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (!this.editing) this.renderImage();
    return true;
  }

  stopEvent(e: Event) {
    return this.editing && this.panel != null && this.panel.contains(e.target as Node);
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.teardownPanel();
  }
}

// `@milkdown/plugin-math@7.5.9` bundles `@milkdown/utils@7.5.9`, whose `$Node`
// type is structurally identical to the 7.20.0 one we import `$view` from but
// nominally distinct (duplicate package). Bridge the schema nodes through the
// local `$Node` so `$view` accepts them; the runtime objects are the same.
const asNode = (n: unknown) => n as unknown as $Node;

export const mathInlineView = $view(
  asNode(mathInlineSchema.node),
  (ctx): NodeViewConstructor =>
    (node, view, getPos) => new MathNodeView(node, view, getPos, true, ctx),
);

export const mathBlockView = $view(
  asNode(mathBlockSchema.node),
  (ctx): NodeViewConstructor =>
    (node, view, getPos) => new MathNodeView(node, view, getPos, false, ctx),
);

export const imageView = $view(
  asNode(imageSchema.node),
  (): NodeViewConstructor => (node, view, getPos) => new ImageNodeView(node, view, getPos),
);

export const editableNodeViews = [mathInlineView, mathBlockView, imageView];
