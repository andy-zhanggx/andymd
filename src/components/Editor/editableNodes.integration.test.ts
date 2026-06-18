// @vitest-environment happy-dom
import { editorViewCtx, serializerCtx } from '@milkdown/core';
import type { Editor } from '@milkdown/core';
import { NodeSelection, TextSelection } from '@milkdown/prose/state';
import { describe, it, expect } from 'vitest';

function ensure() {
  const d = document as any;
  if (d.compatMode !== 'CSS1Compat')
    Object.defineProperty(d, 'compatMode', { configurable: true, get: () => 'CSS1Compat' });
  if (!d.doctype && d.documentElement)
    d.insertBefore(d.implementation.createDocumentType('html', '', ''), d.documentElement);
}
async function mount(md: string): Promise<Editor> {
  ensure();
  const { buildEditor } = await import('./milkdownConfig');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const e = await buildEditor({ root, initialValue: md, onChange: () => {}, listener: false }).create();
  await new Promise((r) => setTimeout(r, 0));
  return e;
}

function posOf(e: Editor, nodeName: string): number {
  const view = e.ctx.get(editorViewCtx);
  let pos = -1;
  view.state.doc.descendants((node, p) => {
    if (pos === -1 && node.type.name === nodeName) pos = p;
    return pos === -1;
  });
  return pos;
}

function select(e: Editor, pos: number) {
  const view = e.ctx.get(editorViewCtx);
  // A real click focuses the editor; ProseMirror only fires selectNode on
  // block atoms when the view has focus.
  view.focus();
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
}
function deselect(e: Editor) {
  const view = e.ctx.get(editorViewCtx);
  // Move the selection off the node, which fires the NodeView's deselectNode.
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 0)));
}

describe('editable atom nodes (inline math, block math, image)', () => {
  it('inline math: selecting reveals an editable source field; editing it updates the formula', async () => {
    const e = await mount('Inline $y = mx + b$ here');
    const view = e.ctx.get(editorViewCtx);
    const pos = posOf(e, 'math_inline');
    expect(pos).toBeGreaterThanOrEqual(0);

    select(e, pos);
    const field = view.dom.querySelector<HTMLTextAreaElement>('.math-source');
    expect(field, 'an editable source field appears on selection').not.toBeNull();
    expect(field!.value).toBe('y = mx + b');

    field!.value = 'a^2 + b^2';
    deselect(e);

    const ser = e.ctx.get(serializerCtx);
    expect(ser(view.state.doc)).toContain('$a^2 + b^2$');
    await e.destroy();
  });

  it('block math: editing the source field updates the math block (and keeps ```math fence)', async () => {
    const e = await mount('```math\nE = mc^2\n```');
    const view = e.ctx.get(editorViewCtx);
    const pos = posOf(e, 'math_block');
    expect(pos).toBeGreaterThanOrEqual(0);

    select(e, pos);
    const field = view.dom.querySelector<HTMLTextAreaElement>('.math-source');
    expect(field).not.toBeNull();
    expect(field!.value).toBe('E = mc^2');

    field!.value = '\\int_0^1 x dx';
    deselect(e);

    const ser = e.ctx.get(serializerCtx);
    const out = ser(view.state.doc);
    expect(out).toContain('```math');
    expect(out).toContain('\\int_0^1 x dx');
    await e.destroy();
  });

  it('image: renders the <img> plus a Change button and a resize handle', async () => {
    const e = await mount('![cat](cat.png)');
    const view = e.ctx.get(editorViewCtx);
    expect(view.dom.querySelector('.image-figure img'), 'image renders').not.toBeNull();
    expect(view.dom.querySelector('.image-change'), 'has a Change button').not.toBeNull();
    expect(view.dom.querySelector('.image-resize-handle'), 'has a resize handle').not.toBeNull();
    // No more inline alt/src text fields.
    expect(view.dom.querySelector('.image-src')).toBeNull();
    await e.destroy();
  });

  it('image: an empty src renders a "Choose image" placeholder button', async () => {
    const e = await mount('![]()');
    const view = e.ctx.get(editorViewCtx);
    const btn = view.dom.querySelector('.image-placeholder');
    expect(btn, 'placeholder button shown when src is empty').not.toBeNull();
    expect(btn!.textContent).toContain('Choose image');
    expect(view.dom.querySelector('.image-figure')).toBeNull();
    await e.destroy();
  });

  it('image: width rides in the alt (Obsidian |width) and sizes the <img>', async () => {
    const e = await mount('![cat|320](cat.png)');
    const view = e.ctx.get(editorViewCtx);
    const img = view.dom.querySelector<HTMLImageElement>('.image-figure img')!;
    expect(img.style.width).toBe('320px');
    expect(img.alt).toBe('cat'); // the |320 is stripped from the visible alt
    // Round-trips back to markdown unchanged.
    expect(e.ctx.get(serializerCtx)(view.state.doc)).toContain('![cat|320](cat.png)');
    await e.destroy();
  });

  it('block math: shows an expand affordance whose click opens the source editor', async () => {
    const e = await mount('```math\nE = mc^2\n```');
    const view = e.ctx.get(editorViewCtx);
    const block = view.dom.querySelector('div[data-type="math_block"]')!;
    const btn = block.querySelector<HTMLButtonElement>('button.math-edit-affordance');
    expect(btn, 'block math has an expand-to-edit button').not.toBeNull();

    expect(view.dom.querySelector('.math-source')).toBeNull();
    btn!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    const field = view.dom.querySelector<HTMLTextAreaElement>('.math-source');
    expect(field, 'clicking the affordance opens the source editor').not.toBeNull();
    expect(field!.value).toBe('E = mc^2');
    await e.destroy();
  });

  it('block math: a single click does NOT edit (so the caret can navigate); double-click opens', async () => {
    const e = await mount('```math\nE = mc^2\n```');
    const view = e.ctx.get(editorViewCtx);
    const rendered = view.dom.querySelector('.math-block .math-rendered')!;
    expect(view.dom.querySelector('.math-source')).toBeNull();
    // Single click (detail 1) leaves it to ProseMirror to node-select → no editor.
    rendered.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 }));
    expect(view.dom.querySelector('.math-source'), 'single click does not open the editor').toBeNull();
    // Double click (detail 2) opens the source editor.
    rendered.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 2 }));
    const field = view.dom.querySelector<HTMLTextAreaElement>('.math-source');
    expect(field, 'double-click opens the editor').not.toBeNull();
    expect(field!.value).toBe('E = mc^2');
    await e.destroy();
  });

  it('block math: stays editable after committing and double-clicking again (regression)', async () => {
    const e = await mount('```math\nE = mc^2\n```');
    const view = e.ctx.get(editorViewCtx);
    // First edit via node-selection, change, commit by deselecting.
    select(e, posOf(e, 'math_block'));
    const f1 = view.dom.querySelector<HTMLTextAreaElement>('.math-source')!;
    f1.value = 'a + b';
    deselect(e);
    expect(view.dom.querySelector('.math-source')).toBeNull();
    // Double-click the (now deselected) formula — must reopen even though the
    // node may be re-selected with no selection change.
    const rendered = view.dom.querySelector('.math-block .math-rendered')!;
    rendered.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 2 }));
    const f2 = view.dom.querySelector<HTMLTextAreaElement>('.math-source');
    expect(f2, 'second edit reopens the editor').not.toBeNull();
    expect(f2!.value).toBe('a + b');
    await e.destroy();
  });

  it('inline math has no block expand affordance', async () => {
    const e = await mount('Inline $y = mx + b$ here');
    const view = e.ctx.get(editorViewCtx);
    expect(view.dom.querySelector('.math-inline .math-edit-affordance')).toBeNull();
    expect(view.dom.querySelector('button.math-edit-affordance')).toBeNull();
    await e.destroy();
  });

  it('inline math still renders KaTeX when not being edited', async () => {
    const e = await mount('Inline $y = mx + b$ here');
    const view = e.ctx.get(editorViewCtx);
    expect(view.dom.querySelectorAll('.katex').length).toBeGreaterThan(0);
    await e.destroy();
  });
});
