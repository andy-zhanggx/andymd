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

describe('html comment rendering', () => {
  it('does not show the raw <!-- --> delimiters, only the inner content', async () => {
    const e = await mount('<!-- hello -->');
    const view = e.ctx.get(editorViewCtx);
    const span = view.dom.querySelector('span[data-type="html"]')!;
    expect(span).not.toBeNull();
    // The visible text is the inner content, not the literal markup.
    expect(span.textContent).toBe('hello');
    expect(span.textContent).not.toContain('<!--');
    expect(span.textContent).not.toContain('-->');
    // It is marked as a comment for styling.
    expect(span.classList.contains('html-comment')).toBe(true);
    await e.destroy();
  });

  it('round-trips losslessly (data-value keeps full markup)', async () => {
    const md = '# T\n\n<!-- **ka_progress**: ${x} 模板 -->\n\nafter';
    const e = await mount(md);
    const view = e.ctx.get(editorViewCtx);
    const span = view.dom.querySelector('span[data-type="html"]')!;
    expect(span.getAttribute('data-value')).toBe('<!-- **ka_progress**: ${x} 模板 -->');
    const ser = e.ctx.get(serializerCtx);
    expect(ser(view.state.doc)).toBe('# T\n\n<!-- **ka_progress**: ${x} 模板 -->\n\nafter\n');
    await e.destroy();
  });

  it('leaves non-comment inline HTML showing its literal markup', async () => {
    const e = await mount('a <kbd>Esc</kbd> b');
    const view = e.ctx.get(editorViewCtx);
    const spans = [...view.dom.querySelectorAll('span[data-type="html"]')];
    const kbd = spans.find((s) => (s.getAttribute('data-value') || '').includes('kbd'));
    expect(kbd).toBeTruthy();
    expect(kbd!.textContent).toContain('<kbd>');
    expect(kbd!.classList.contains('html-comment')).toBe(false);
    await e.destroy();
  });
});
