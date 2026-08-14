// @vitest-environment happy-dom
import { editorViewCtx } from '@milkdown/core';
import type { Editor } from '@milkdown/core';
import { getMarkdown } from '@milkdown/utils';
import { describe, it, expect } from 'vitest';

function ensure() {
  const d = document as unknown as {
    compatMode: string;
    doctype: DocumentType | null;
    documentElement: HTMLElement;
    implementation: DOMImplementation;
    insertBefore: (a: Node, b: Node) => void;
  };
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

const FOOTNOTE_MD = 'Text with a note.[^1]\n\n[^1]: The note body.\n';

describe('footnotes (GFM)', () => {
  it('parses [^1] into footnote reference + definition nodes', async () => {
    const e = await mount(FOOTNOTE_MD);
    const view = e.ctx.get(editorViewCtx);
    let refs = 0;
    let defs = 0;
    view.state.doc.descendants((n) => {
      if (n.type.name === 'footnote_reference') refs += 1;
      if (n.type.name === 'footnote_definition') defs += 1;
      return true;
    });
    expect(refs).toBe(1);
    expect(defs).toBe(1);
    await e.destroy();
  });

  it('renders the reference as sup and the definition as dl', async () => {
    const e = await mount(FOOTNOTE_MD);
    const sup = document.querySelector('sup[data-type="footnote_reference"]');
    const dl = document.querySelector('dl[data-type="footnote_definition"]');
    expect(sup?.textContent).toBe('1');
    expect(dl).not.toBeNull();
    expect(dl?.textContent).toContain('The note body.');
    await e.destroy();
  });

  it('round-trips back to markdown', async () => {
    const e = await mount(FOOTNOTE_MD);
    let md = '';
    e.action((ctx) => {
      md = getMarkdown()(ctx);
    });
    expect(md).toContain('[^1]');
    expect(md).toContain('[^1]: The note body.');
    await e.destroy();
  });
});
