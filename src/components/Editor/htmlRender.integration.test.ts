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

describe('inline html rendering', () => {
  it('renders inline <b> as real bold, not literal tags', async () => {
    const e = await mount('Hello <b>bold</b> world');
    const view = e.ctx.get(editorViewCtx);
    expect(view.dom.querySelector('b')).not.toBeNull();
    expect(view.dom.textContent).not.toContain('<b>');
    const ser = e.ctx.get(serializerCtx);
    expect(ser(view.state.doc)).toBe('Hello <b>bold</b> world\n');
    await e.destroy();
  });

  it('renders an inline HTML table as a real <table> with cells', async () => {
    const md =
      'Before. <b>T</b><table><thead><tr><th>group</th><th>order</th></tr></thead>' +
      '<tbody><tr><td>cl</td><td>11.2</td></tr></tbody></table>';
    const e = await mount(md);
    const view = e.ctx.get(editorViewCtx);
    expect(view.dom.querySelector('table')).not.toBeNull();
    expect(view.dom.querySelectorAll('th').length).toBe(2);
    expect(view.dom.querySelectorAll('td').length).toBe(2);
    expect(view.dom.textContent).not.toContain('<table>');
    expect(view.dom.textContent).not.toContain('<th>');
    const ser = e.ctx.get(serializerCtx);
    expect(ser(view.state.doc)).toBe(md + '\n');
    await e.destroy();
  });

  it('renders <kbd> as a real element (round-trips losslessly)', async () => {
    const e = await mount('a <kbd>Esc</kbd> b');
    const view = e.ctx.get(editorViewCtx);
    expect(view.dom.querySelector('kbd')).not.toBeNull();
    expect(view.dom.querySelector('kbd')!.textContent).toBe('Esc');
    const ser = e.ctx.get(serializerCtx);
    expect(ser(view.state.doc)).toBe('a <kbd>Esc</kbd> b\n');
    await e.destroy();
  });

  it('leaves an unbalanced lone tag as literal text (safe fallback)', async () => {
    const e = await mount('keep <notclosed> literal');
    const view = e.ctx.get(editorViewCtx);
    expect(view.dom.textContent).toContain('<notclosed>');
    await e.destroy();
  });

  it('strips <script> from rendered html (defense in depth)', async () => {
    const e = await mount('x <div>safe<script>danger</script></div> y');
    const view = e.ctx.get(editorViewCtx);
    expect(view.dom.querySelector('div')).not.toBeNull();
    expect(view.dom.querySelector('script')).toBeNull();
    // but the original markup is preserved for round-trip
    const span = [...view.dom.querySelectorAll('span[data-type="html"]')].find((s) =>
      (s.getAttribute('data-value') || '').includes('<div>'),
    );
    expect(span!.getAttribute('data-value')).toContain('<script>danger</script>');
    await e.destroy();
  });
});
