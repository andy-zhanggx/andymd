import katex from 'katex';
import type { Ctx } from '@milkdown/ctx';
import type { Node as ProseNode } from '@milkdown/prose/model';
import type { EditorView, NodeView } from '@milkdown/prose/view';
import { katexOptionsCtx, mathInlineSchema, mathBlockSchema } from '@milkdown/plugin-math';
import { imageSchema } from '@milkdown/preset-commonmark';
import { $view } from '@milkdown/utils';

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

class MathNodeView implements NodeView {
  dom: HTMLElement;
  private rendered: HTMLElement;
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
    this.renderMath();
  }

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
    return this.editing && e.target === this.field;
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
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

export const mathInlineView = $view(
  mathInlineSchema.node,
  (ctx) => (node, view, getPos) => new MathNodeView(node, view, getPos, true, ctx),
);

export const mathBlockView = $view(
  mathBlockSchema.node,
  (ctx) => (node, view, getPos) => new MathNodeView(node, view, getPos, false, ctx),
);

export const imageView = $view(
  imageSchema.node,
  () => (node, view, getPos) => new ImageNodeView(node, view, getPos),
);

export const editableNodeViews = [mathInlineView, mathBlockView, imageView];
