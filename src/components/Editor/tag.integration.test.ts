// @vitest-environment happy-dom
import { editorViewCtx } from '@milkdown/core';
import type { Editor } from '@milkdown/core';
import { getMarkdown } from '@milkdown/utils';
import { TextSelection } from '@milkdown/prose/state';
import { describe, it, expect, vi } from 'vitest';

const showTag = vi.fn();
vi.mock('../../lib/tagActions', () => ({ showTag }));

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
  return buildEditor({ root, initialValue: md, onChange: () => {}, listener: false }).create();
}

function tagsIn(e: Editor): string[] {
  const out: string[] = [];
  e.ctx.get(editorViewCtx).state.doc.descendants((n) => {
    if (n.type.name === 'tag') out.push(n.attrs.name as string);
  });
  return out;
}

describe('#tags', () => {
  const lossless = [
    '#project #idea\n',
    'text\n#tag at start\n',
    '#标签 内容\n',
    'a #b/c d #2024 C#sharp issue#1 end\n',
    'Mixed **bold** #tag and `#code` and [link #x](https://e.com/#frag)\n',
  ];
  for (const md of lossless) {
    it(`round-trips ${JSON.stringify(md)}`, async () => {
      const e = await mount(md);
      expect(e.action(getMarkdown())).toBe(md);
      await e.destroy();
    });
  }

  it('recognises tags only at word boundaries and outside code / links', async () => {
    const e = await mount('a #b/c d #2024 C#sharp #x/ `#code` [#l](u) #中文\n');
    expect(tagsIn(e)).toEqual(['b/c', 'x', '中文']);
    await e.destroy();
  });

  it('typing "#word " creates a tag; clicking it shows the tag', async () => {
    const e = await mount('Note');
    const view = e.ctx.get(editorViewCtx);
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    for (const ch of ' #todo more') {
      const { from, to } = view.state.selection;
      const handled = view.someProp('handleTextInput', (f) =>
        f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)),
      );
      if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
    }
    expect(tagsIn(e)).toEqual(['todo']);
    expect(e.action(getMarkdown())).toBe('Note #todo more\n');
    let pos = -1;
    view.state.doc.descendants((n, p) => {
      if (n.type.name === 'tag') pos = p;
    });
    view.someProp('handleClickOn', (f) =>
      f(view, pos, view.state.doc.nodeAt(pos)!, pos, new MouseEvent('click'), true),
    );
    expect(showTag).toHaveBeenCalledWith('todo');
    await e.destroy();
  });
});
