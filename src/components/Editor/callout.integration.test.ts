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

async function roundTrip(md: string): Promise<string> {
  const e = await mount(md);
  const out = e.action(getMarkdown());
  await e.destroy();
  return out;
}

describe('callouts', () => {
  const lossless = [
    '> [!note] Title here\n> body line\n',
    '> [!warning]-\n> folded body\n',
    '> [!TIP]+ Open **bold** title\n>\n> Paragraph one.\n>\n> Paragraph two.\n',
    '> [!info]\n',
    '> [!question] Only a title\n',
    '> [!note] Outer\n> > [!tip] Inner\n> > inner body\n',
    '> [!example] List\n>\n> * one\n>\n> * two\n',
    'Before.\n\n> [!danger] Mid\n> text\n\nAfter.\n',
  ];
  for (const md of lossless) {
    it(`round-trips ${JSON.stringify(md)}`, async () => {
      expect(await roundTrip(md)).toBe(md);
    });
  }

  it('leaves plain blockquotes alone', async () => {
    expect(await roundTrip('> just a quote\n')).toBe('> just a quote\n');
  });

  it('parses into callout + title nodes with attrs', async () => {
    const e = await mount('> [!Warning]- Careful\n> body\n');
    const doc = e.ctx.get(editorViewCtx).state.doc;
    const c = doc.firstChild!;
    expect(c.type.name).toBe('callout');
    expect(c.attrs).toMatchObject({ kind: 'Warning', fold: '-' });
    expect(c.firstChild!.type.name).toBe('callout_title');
    expect(c.firstChild!.textContent).toBe('Careful');
    expect(c.child(1).textContent).toBe('body');
    await e.destroy();
  });

  it('renders with kind class and starts collapsed for `-`', async () => {
    const e = await mount('> [!Warning]- Careful\n> body\n');
    const el = e.ctx.get(editorViewCtx).dom.querySelector('.callout');
    expect(el?.classList.contains('callout-warning')).toBe(true);
    expect(el?.classList.contains('callout-collapsed')).toBe(true);
    expect(el?.querySelector('.callout-fold')).not.toBeNull();
    await e.destroy();
  });

  it('typing `[!tip] ` in a blockquote converts it to a callout', async () => {
    const e = await mount('> x\n');
    const view = e.ctx.get(editorViewCtx);
    // Clear the quote's text, then type the marker char by char.
    const { TextSelection } = await import('@milkdown/prose/state');
    view.dispatch(view.state.tr.delete(2, 3));
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    for (const ch of '[!tip] ') {
      const { from, to } = view.state.selection;
      const handled = view.someProp('handleTextInput', (f) =>
        f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)),
      );
      if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
    }
    expect(view.state.doc.firstChild!.type.name).toBe('callout');
    expect(view.state.doc.firstChild!.attrs.kind).toBe('tip');
    view.dispatch(view.state.tr.insertText('Hello'));
    expect(e.action(getMarkdown())).toBe('> [!tip] Hello\n');
    await e.destroy();
  });

  it('insertCallout replaces an empty paragraph and puts the caret in the title', async () => {
    const { insertCallout } = await import('./callout');
    const e = await mount('Intro\n\n\n');
    const view = e.ctx.get(editorViewCtx);
    const { TextSelection } = await import('@milkdown/prose/state');
    view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)));
    expect(insertCallout(view, 'tip')).toBe(true);
    view.dispatch(view.state.tr.insertText('Heads up'));
    expect(e.action(getMarkdown())).toBe('Intro\n\n> [!tip] Heads up\n');
    // Enter leaves the title for a fresh body paragraph.
    view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    view.dispatch(view.state.tr.insertText('Body'));
    expect(e.action(getMarkdown())).toBe('Intro\n\n> [!tip] Heads up\n> Body\n');
    await e.destroy();
  });
});
