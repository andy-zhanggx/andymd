// @vitest-environment happy-dom
import { editorViewCtx, serializerCtx } from '@milkdown/core';
import type { Editor } from '@milkdown/core';
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

describe('fenced math code blocks (```math / ```latex)', () => {
  it('renders a ```math fenced block as a KaTeX math_block, not a code block', async () => {
    const md = '```math\n\\mathcal{G}_m(\\alpha,\\beta)\n:=\n\\left\\{ g_m \\right\\}\n```';
    const e = await mount(md);
    const view = e.ctx.get(editorViewCtx);
    // It must be a rendered math block, not a prism code block.
    expect(view.dom.querySelectorAll('.katex').length).toBeGreaterThan(0);
    expect(view.dom.querySelectorAll('[data-type="math_block"]').length).toBe(1);
    expect(view.dom.querySelector('pre code')).toBeNull();
    await e.destroy();
  });

  it('round-trips a ```math block back to ```math (not $$)', async () => {
    const md = '```math\nE = mc^2\n```';
    const e = await mount(md);
    const view = e.ctx.get(editorViewCtx);
    const ser = e.ctx.get(serializerCtx);
    const out = ser(view.state.doc);
    expect(out).toContain('```math');
    expect(out).toContain('E = mc^2');
    expect(out).not.toContain('$$');
    await e.destroy();
  });

  it('still renders ```latex fenced blocks as math', async () => {
    const md = '```latex\n\\frac{1}{2}\n```';
    const e = await mount(md);
    const view = e.ctx.get(editorViewCtx);
    expect(view.dom.querySelectorAll('.katex').length).toBeGreaterThan(0);
    await e.destroy();
  });

  it('leaves a plain ```js code block as a code block', async () => {
    const md = '```js\nconst x = 1;\n```';
    const e = await mount(md);
    const view = e.ctx.get(editorViewCtx);
    expect(view.dom.querySelector('pre')).not.toBeNull();
    expect(view.dom.querySelectorAll('[data-type="math_block"]').length).toBe(0);
    await e.destroy();
  });

  it('preserves native $$ blocks (serialized as $$, rendered as math)', async () => {
    const md = '$$\na^2 + b^2\n$$';
    const e = await mount(md);
    const view = e.ctx.get(editorViewCtx);
    const ser = e.ctx.get(serializerCtx);
    expect(view.dom.querySelectorAll('.katex').length).toBeGreaterThan(0);
    const out = ser(view.state.doc);
    expect(out).toContain('$$');
    expect(out).not.toContain('```math');
    await e.destroy();
  });
});
