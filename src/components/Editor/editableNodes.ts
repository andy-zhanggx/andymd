import katex from 'katex';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { NodeSelection } from '@milkdown/prose/state';
import type { EditorView, NodeView, NodeViewConstructor } from '@milkdown/prose/view';
import { katexOptionsCtx, mathInlineSchema, mathBlockSchema } from '@milkdown/plugin-math';
import { imageSchema } from '@milkdown/preset-commonmark';
import { $view } from '@milkdown/utils';
import type { $Node } from '@milkdown/utils';
import { pickAndImportImage } from './insertImage';
import { resolveImageSrc } from '../../lib/asset';
import { useDocumentStore } from '../../stores/documentStore';

/**
 * Image size rides in the alt text, Obsidian-style: `![alt|320](src)` (and
 * `![alt|320x200]`). Standard markdown has no size syntax, so this round-trips
 * losslessly as plain markdown (the width is just part of the alt string) and
 * renders natively in Obsidian — no image-schema change needed.
 */
const IMAGE_SIZE_RE = /^(.*?)\|(\d+)(?:x\d+)?$/;
export function parseImageAlt(raw: string | null | undefined): { alt: string; width: number | null } {
  const m = IMAGE_SIZE_RE.exec(raw ?? '');
  if (m) return { alt: m[1] ?? '', width: parseInt(m[2], 10) };
  return { alt: raw ?? '', width: null };
}
export function combineImageAlt(alt: string, width: number | null): string {
  return width && width > 0 ? `${alt}|${width}` : alt;
}

const IMAGE_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
  '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6"/>' +
  '<circle cx="8.5" cy="9.5" r="1.6" fill="currentColor"/>' +
  '<path d="M4 17l5-5 4 4 3-3 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Small "swap / replace" glyph for the floating change-image button.
const CHANGE_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
  '<path d="M4 9a7 7 0 0 1 11.7-3.2L18 8M20 15a7 7 0 0 1-11.7 3.2L6 16" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M18 4v4h-4M6 20v-4h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
  private applyBtn: HTMLButtonElement | null = null;
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
      this.editBtn = btn;
      this.dom.appendChild(btn);
    }
    // Click the rendered formula (or the block's edit button) to edit it. We
    // open the source editor directly rather than leaning on ProseMirror's
    // selectNode, which only fires on a *selection change* while the view has
    // focus — so re-clicking an already-selected block, or a block selected
    // before the view gained focus, would otherwise never open the editor.
    this.dom.addEventListener('mousedown', this.onMouseDown);
    this.renderMath();
  }

  // Editing entry differs by kind:
  //  - inline math (a small target): a single click opens the editor.
  //  - block math: a single click is left to ProseMirror so it node-selects the
  //    block and the cursor can navigate around/past it; editing is via a
  //    double-click or the hover "edit" affordance button. (Opening on every
  //    single click made it impossible to place the caret near a block formula.)
  private onMouseDown = (e: MouseEvent) => {
    if (this.editing) return; // clicks inside the open source field: let them through
    const onAffordance =
      !!this.editBtn && e.target instanceof Node && this.editBtn.contains(e.target);
    if (!this.inline && !onAffordance && e.detail < 2) return; // let PM select the node
    e.preventDefault();
    e.stopPropagation();
    this.beginEdit();
  };

  /** Focus the view, node-select this node, and open the source editor. */
  private beginEdit() {
    if (this.editing) return;
    this.view.focus();
    const pos = this.getPos();
    if (pos != null) {
      const { state } = this.view;
      // Setting the selection lets ProseMirror drive deselectNode → commit when
      // the user later clicks away; openEditor() below opens the field now even
      // if selectNode doesn't fire (no change / unfocused view).
      this.view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
    }
    this.openEditor();
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

  // ProseMirror-driven entry (e.g. arrow-keying onto the node). Click entry goes
  // through beginEdit(); both converge on openEditor().
  selectNode() {
    this.openEditor();
  }

  private openEditor() {
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
    // Explicit Apply button so committing isn't a hidden gesture (⌘-Enter / click
    // away). mousedown-preventDefault keeps the textarea focused (no blur-commit
    // race); the click commits and returns focus to the document.
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'math-apply';
    apply.setAttribute('contenteditable', 'false');
    apply.textContent = 'Apply';
    apply.addEventListener('mousedown', (e) => e.preventDefault());
    apply.addEventListener('click', (e) => {
      e.preventDefault();
      this.commit();
      this.view.focus();
    });
    this.applyBtn = apply;
    this.dom.appendChild(apply);
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
    this.applyBtn?.remove();
    this.applyBtn = null;
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
    if (this.applyBtn && e.target instanceof Node && this.applyBtn.contains(e.target)) return true;
    return this.editing && e.target === this.field;
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.dom.removeEventListener('mousedown', this.onMouseDown);
    this.teardownField();
  }
}

/**
 * Image NodeView. Three behaviours:
 *  - empty `src` renders a "Choose image…" placeholder button (toolbar insert
 *    drops one of these — it never pops a file dialog on its own);
 *  - a rendered image gets a hover "Change" button (re-pick the file) and a
 *    bottom-right drag handle to resize (width persisted into the alt, see
 *    parseImageAlt/combineImageAlt);
 *  - clicking the image itself just node-selects it (so it can be deleted) —
 *    no more inline alt/src text fields.
 */
class ImageNodeView implements NodeView {
  dom: HTMLElement;
  private node: ProseNode;
  private cleanupResize: (() => void) | null = null;

  constructor(
    node: ProseNode,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.node = node;
    this.dom = document.createElement('span');
    this.dom.className = 'image-node';
    this.dom.setAttribute('data-type', 'image');
    this.render();
  }

  private src(): string {
    return (this.node.attrs.src as string) ?? '';
  }

  private render() {
    this.teardownResize();
    this.dom.replaceChildren();
    if (!this.src()) {
      this.dom.classList.add('empty');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'image-placeholder';
      btn.setAttribute('contenteditable', 'false');
      btn.innerHTML = `${IMAGE_ICON}<span>Choose image…</span>`;
      btn.addEventListener('mousedown', this.onChoose);
      this.dom.appendChild(btn);
      return;
    }
    this.dom.classList.remove('empty');
    const { alt, width } = parseImageAlt(this.node.attrs.alt as string);
    const fig = document.createElement('span');
    fig.className = 'image-figure';

    const img = document.createElement('img');
    // Resolve the document-relative path to an asset URL here (instead of
    // relying solely on MarkdownEditor's MutationObserver) so a changed path
    // takes effect immediately, and wire load/error so a wrong/missing path is
    // visibly broken rather than silently showing nothing or a stale image.
    const docPath = useDocumentStore.getState().doc?.path ?? null;
    img.setAttribute('src', resolveImageSrc(this.src(), docPath));
    img.alt = alt;
    const title = this.node.attrs.title as string;
    if (title) img.title = title;
    if (width) img.style.width = `${width}px`;
    img.addEventListener('error', () => {
      fig.classList.add('broken');
      fig.dataset.missing = this.src();
    });
    img.addEventListener('load', () => {
      fig.classList.remove('broken');
      delete fig.dataset.missing;
    });
    fig.appendChild(img);

    const change = document.createElement('button');
    change.type = 'button';
    change.className = 'image-change';
    change.setAttribute('contenteditable', 'false');
    change.title = 'Change image';
    change.setAttribute('aria-label', 'Change image');
    change.innerHTML = CHANGE_ICON;
    change.addEventListener('mousedown', this.onChoose);
    fig.appendChild(change);

    const handle = document.createElement('span');
    handle.className = 'image-resize-handle';
    handle.setAttribute('contenteditable', 'false');
    handle.title = 'Drag to resize';
    handle.addEventListener('mousedown', this.onResizeDown);
    fig.appendChild(handle);

    this.dom.appendChild(fig);
  }

  // Open the native picker, import the file, and point this node at it. Used by
  // both the empty placeholder and the "Change" button.
  private onChoose = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void this.choose();
  };

  private async choose() {
    const res = await pickAndImportImage();
    if (!res) return;
    const pos = this.getPos();
    if (pos == null) return;
    // Preserve any caption + size the user already set; only swap the file.
    const { alt: curAlt, width } = parseImageAlt(this.node.attrs.alt as string);
    const alt = combineImageAlt(curAlt || res.alt, width);
    const { state } = this.view;
    this.view.dispatch(
      state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, src: res.relPath, alt }),
    );
    this.view.focus();
  }

  private onResizeDown = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const img = this.dom.querySelector('img');
    if (!img) return;
    this.dom.classList.add('resizing');
    const startX = e.clientX;
    const startW = img.getBoundingClientRect().width || img.naturalWidth || 200;
    const maxW = this.view.dom.clientWidth || 2000;
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(40, Math.min(Math.round(startW + (ev.clientX - startX)), maxW));
      img.style.width = `${w}px`;
    };
    const onUp = () => {
      this.teardownResize();
      this.dom.classList.remove('resizing');
      this.commitWidth(Math.round(img.getBoundingClientRect().width));
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    this.cleanupResize = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this.cleanupResize = null;
    };
  };

  private teardownResize() {
    this.cleanupResize?.();
  }

  private commitWidth(width: number | null) {
    const pos = this.getPos();
    if (pos == null) return;
    const { alt } = parseImageAlt(this.node.attrs.alt as string);
    const newAlt = combineImageAlt(alt, width);
    if (newAlt === this.node.attrs.alt) return;
    const { state } = this.view;
    this.view.dispatch(state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, alt: newAlt }));
  }

  update(node: ProseNode) {
    if (node.type !== this.node.type) return false;
    const sameImage = !!this.src() && node.attrs.src === this.node.attrs.src;
    this.node = node;
    const img = this.dom.querySelector('img');
    if (sameImage && img) {
      // Only alt/width changed (e.g. a resize commit) — patch in place so the
      // <img> doesn't reload and flash.
      const { alt, width } = parseImageAlt(node.attrs.alt as string);
      img.alt = alt;
      img.style.width = width ? `${width}px` : '';
      return true;
    }
    this.render();
    return true;
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.teardownResize();
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
