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

function mathValues(e: Editor): string[] {
  const view = e.ctx.get(editorViewCtx);
  const out: string[] = [];
  view.state.doc.descendants((n) => {
    if (n.type.name === 'math_block') out.push(n.attrs.value as string);
  });
  return out;
}

describe('Obsidian-style $$ display math (close at line end, content after opener)', () => {
  it('closes a multi-line $$ block at a line-end $$ instead of swallowing following prose', async () => {
    const md = [
      '$$\\begin{aligned}',
      'x = y',
      '\\end{aligned} \\tag{55}$$',
      '',
      'hello world after math',
    ].join('\n');
    const e = await mount(md);
    const view = e.ctx.get(editorViewCtx);
    const maths = mathValues(e);
    expect(maths).toHaveLength(1);
    // The opener-line content (stolen as micromark "meta") is part of the math.
    expect(maths[0]).toContain('\\begin{aligned}');
    expect(maths[0]).toContain('\\tag{55}');
    // The prose after the block is a paragraph again, not math.
    expect(maths[0]).not.toContain('hello world');
    expect(view.state.doc.textContent).toContain('hello world after math');
    await e.destroy();
  });

  it('repairs several consecutive line-end-closed blocks (cascading swallow)', async () => {
    const md = [
      'intro paragraph',
      '',
      '$$\\begin{aligned}',
      'a = b',
      '\\end{aligned} \\tag{1}$$',
      '',
      'middle paragraph',
      '',
      '$$\\begin{aligned}',
      'c = d',
      '\\end{aligned} \\tag{2}$$',
      '',
      'closing paragraph',
    ].join('\n');
    const e = await mount(md);
    const view = e.ctx.get(editorViewCtx);
    const maths = mathValues(e);
    expect(maths).toHaveLength(2);
    expect(maths[0]).toContain('\\tag{1}');
    expect(maths[1]).toContain('\\tag{2}');
    for (const t of ['intro paragraph', 'middle paragraph', 'closing paragraph']) {
      expect(view.state.doc.textContent).toContain(t);
    }
    await e.destroy();
  });

  it('leaves well-formed $$ blocks and fenced ```math blocks alone', async () => {
    const md = ['$$', 'E = mc^2', '$$', '', '```math', 'a $$ b', '```'].join('\n');
    const e = await mount(md);
    const maths = mathValues(e);
    expect(maths).toHaveLength(2);
    expect(maths[0].trim()).toBe('E = mc^2');
    // Fenced math may legitimately contain $$ and must not be split.
    expect(maths[1].trim()).toBe('a $$ b');
    await e.destroy();
  });

  it('round-trips the repaired block through the serializer as normalized $$ math', async () => {
    const md = ['$$\\begin{aligned}', 'x = y', '\\end{aligned}$$', '', 'after'].join('\n');
    const e = await mount(md);
    const view = e.ctx.get(editorViewCtx);
    const out = e.ctx.get(serializerCtx)(view.state.doc);
    expect(out).toContain('\\begin{aligned}');
    expect(out).toContain('after');
    await e.destroy();
  });
});
