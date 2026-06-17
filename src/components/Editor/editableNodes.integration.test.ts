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

  it('image: selecting reveals alt/src fields; editing them updates the node', async () => {
    const e = await mount('![cat](cat.png)');
    const view = e.ctx.get(editorViewCtx);
    const pos = posOf(e, 'image');
    expect(pos).toBeGreaterThanOrEqual(0);

    select(e, pos);
    const srcField = view.dom.querySelector<HTMLInputElement>('.image-src');
    const altField = view.dom.querySelector<HTMLInputElement>('.image-alt');
    expect(srcField, 'src field appears').not.toBeNull();
    expect(altField, 'alt field appears').not.toBeNull();
    expect(srcField!.value).toBe('cat.png');
    expect(altField!.value).toBe('cat');

    srcField!.value = 'dog.png';
    altField!.value = 'dog';
    deselect(e);

    const ser = e.ctx.get(serializerCtx);
    expect(ser(view.state.doc)).toContain('![dog](dog.png)');
    await e.destroy();
  });

  it('inline math still renders KaTeX when not being edited', async () => {
    const e = await mount('Inline $y = mx + b$ here');
    const view = e.ctx.get(editorViewCtx);
    expect(view.dom.querySelectorAll('.katex').length).toBeGreaterThan(0);
    await e.destroy();
  });
});
