// @vitest-environment happy-dom
import { editorViewCtx } from '@milkdown/core';
import type { Editor } from '@milkdown/core';
import { getMarkdown } from '@milkdown/utils';
import { TextSelection } from '@milkdown/prose/state';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FileNode } from '../../types';

const readFile = vi.fn(async () => ({ content: '# Alpha\n\n## Beta\n', mtime: 1 }));
vi.mock('../../services/fsService', () => ({ fsService: { readFile } }));
vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (p: string) => `asset://localhost${p}`,
  invoke: vi.fn(async () => undefined),
}));

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

const tree: FileNode = {
  path: '/v',
  name: 'v',
  kind: 'dir',
  children: [
    { path: '/v/cur.md', name: 'cur.md', kind: 'file' },
    { path: '/v/Roadmap.md', name: 'Roadmap.md', kind: 'file' },
    { path: '/v/Recipes.md', name: 'Recipes.md', kind: 'file' },
  ],
};

async function mount(md: string): Promise<Editor> {
  ensure();
  const { buildEditor } = await import('./milkdownConfig');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const e = await buildEditor({ root, initialValue: md, onChange: () => {}, listener: false }).create();
  const view = e.ctx.get(editorViewCtx);
  view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
  return e;
}

function type(e: Editor, text: string) {
  const view = e.ctx.get(editorViewCtx);
  for (const ch of text) {
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) =>
      f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)),
    );
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}

function key(e: Editor, k: string) {
  const view = e.ctx.get(editorViewCtx);
  view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

beforeEach(async () => {
  const { useWorkspaceStore } = await import('../../stores/workspaceStore');
  const { useDocumentStore } = await import('../../stores/documentStore');
  useWorkspaceStore.setState({ workspace: { root: '/v', name: 'v', tree, expandedPaths: new Set() } });
  useDocumentStore.setState({
    doc: { path: '/v/cur.md', content: '', draft: '# Here\n\n## There\n', isDirty: false, mtime: 0, encoding: 'utf-8' },
  } as never);
});

describe('[[ autocomplete', () => {
  it('suggests files and inserts the chosen wikilink over auto-paired brackets', async () => {
    const { useLinkSuggestStore } = await import('../../stores/linkSuggestStore');
    const e = await mount('Go');
    type(e, ' [[r');
    const s = useLinkSuggestStore.getState();
    expect(s.open).toBe(true);
    expect(s.items.map((i) => i.label).slice(0, 2)).toEqual(['Recipes', 'Roadmap']);
    key(e, 'ArrowDown');
    key(e, 'Enter');
    expect(useLinkSuggestStore.getState().open).toBe(false);
    expect(e.action(getMarkdown())).toBe('Go [[Roadmap]]\n');
    await e.destroy();
  });

  it('suggests headings of the current note for [[#', async () => {
    const { useLinkSuggestStore } = await import('../../stores/linkSuggestStore');
    const e = await mount('x');
    type(e, ' [[#th');
    expect(useLinkSuggestStore.getState().items.map((i) => i.target)).toEqual(['#There']);
    key(e, 'Tab');
    expect(e.action(getMarkdown())).toBe('x [[#There]]\n');
    await e.destroy();
  });

  it('loads headings of another note', async () => {
    const { useLinkSuggestStore } = await import('../../stores/linkSuggestStore');
    const e = await mount('');
    type(e, '![[roadmap#');
    await vi.waitFor(() => expect(useLinkSuggestStore.getState().items.length).toBe(2));
    key(e, 'Enter');
    expect(e.action(getMarkdown())).toBe('![[roadmap#Alpha]]\n');
    await e.destroy();
  });

  it('Escape dismisses until the trigger changes', async () => {
    const { useLinkSuggestStore } = await import('../../stores/linkSuggestStore');
    const e = await mount('');
    type(e, '[[r');
    key(e, 'Escape');
    expect(useLinkSuggestStore.getState().open).toBe(false);
    type(e, 'o');
    expect(useLinkSuggestStore.getState().open).toBe(false);
    await e.destroy();
  });
});
