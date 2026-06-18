// @vitest-environment happy-dom
import { editorViewCtx, serializerCtx } from '@milkdown/core';
import type { Editor } from '@milkdown/core';
import { describe, it, expect } from 'vitest';
import { linkMarkRangeAt, buildLinkEdit } from './linkTooltip';

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
function posOfLink(e: Editor): number {
  const view = e.ctx.get(editorViewCtx);
  let pos = -1;
  view.state.doc.descendants((node, p) => {
    if (pos === -1 && node.marks.some((m) => m.type.name === 'link')) pos = p;
    return pos === -1;
  });
  return pos;
}

describe('linkTooltip helpers', () => {
  it('linkMarkRangeAt reports the link range, href and text', async () => {
    const e = await mount('see [the docs](https://example.com/docs) now');
    const view = e.ctx.get(editorViewCtx);
    const pos = posOfLink(e);
    const range = linkMarkRangeAt(view.state, pos);
    expect(range).not.toBeNull();
    expect(range!.href).toBe('https://example.com/docs');
    expect(range!.text).toBe('the docs');
    await e.destroy();
  });

  it('buildLinkEdit rewrites BOTH the text and the URL', async () => {
    const e = await mount('see [the docs](https://example.com/docs) now');
    const view = e.ctx.get(editorViewCtx);
    const range = linkMarkRangeAt(view.state, posOfLink(e))!;
    const tr = buildLinkEdit(view.state, range.from, range.to, 'the guide', 'https://example.com/guide');
    view.dispatch(tr);
    const out = e.ctx.get(serializerCtx)(view.state.doc);
    expect(out).toContain('[the guide](https://example.com/guide)');
    expect(out).not.toContain('the docs');
    expect(out).not.toContain('example.com/docs');
    await e.destroy();
  });

  it('buildLinkEdit changing only the URL keeps the text', async () => {
    const e = await mount('[home](https://old.com)');
    const view = e.ctx.get(editorViewCtx);
    const range = linkMarkRangeAt(view.state, posOfLink(e))!;
    view.dispatch(buildLinkEdit(view.state, range.from, range.to, 'home', 'https://new.com'));
    const out = e.ctx.get(serializerCtx)(view.state.doc);
    expect(out).toContain('[home](https://new.com)');
    await e.destroy();
  });
});

describe('linkTooltip hover behaviour', () => {
  it('hovering a markdown link shows a tooltip with the URL and edit fields', async () => {
    const e = await mount('see [the docs](https://example.com/docs)');
    const view = e.ctx.get(editorViewCtx);
    const anchor = view.dom.querySelector('a[href]') as HTMLAnchorElement;
    expect(anchor).not.toBeNull();

    anchor.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const tip = document.querySelector('.link-tooltip') as HTMLElement;
    expect(tip).not.toBeNull();
    expect(tip.style.display).not.toBe('none');
    expect(tip.querySelector('.link-tooltip-url')!.textContent).toBe('https://example.com/docs');

    const hrefInput = tip.querySelector('.link-tooltip-form input') as HTMLInputElement;
    const inputs = tip.querySelectorAll('.link-tooltip-form input');
    expect((inputs[0] as HTMLInputElement).value).toBe('the docs'); // text
    expect((inputs[1] as HTMLInputElement).value).toBe('https://example.com/docs'); // href
    void hrefInput;
    await e.destroy();
  });

  it('does NOT show the tooltip for wikilinks', async () => {
    const e = await mount('[[Some Note]]');
    const view = e.ctx.get(editorViewCtx);
    const anchor = view.dom.querySelector('a[data-type="wikilink"]') as HTMLAnchorElement;
    expect(anchor).not.toBeNull();
    anchor.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const tip = document.querySelector('.link-tooltip') as HTMLElement;
    // Tooltip element exists (created by the plugin view) but stays hidden.
    expect(tip.style.display).toBe('none');
    await e.destroy();
  });
});
