// @vitest-environment happy-dom
import { editorViewCtx } from '@milkdown/core';
import type { Editor } from '@milkdown/core';
import { getMarkdown } from '@milkdown/utils';
import { TextSelection } from '@milkdown/prose/state';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FileNode } from '../../types';

const files: Record<string, string> = {
  '/v/other.md': '---\ntitle: x\n---\n# Other\n\nIntro text.\n\n## Part\n\nPart body with $x^2$.\n\n## Next\n\nNot included.\n',
};
const readFile = vi.fn(async (p: string) => {
  if (!(p in files)) throw new Error('nope');
  return { content: files[p], mtime: 1 };
});
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
    { path: '/v/other.md', name: 'other.md', kind: 'file' },
    { path: '/v/assets', name: 'assets', kind: 'dir', children: [{ path: '/v/assets/Pic.png', name: 'Pic.png', kind: 'file' }] },
  ],
};

async function mount(md: string): Promise<Editor> {
  ensure();
  const { buildEditor } = await import('./milkdownConfig');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const e = await buildEditor({ root, initialValue: md, onChange: () => {}, listener: false }).create();
  await new Promise((r) => setTimeout(r, 0));
  return e;
}

function typeText(e: Editor, text: string) {
  const view = e.ctx.get(editorViewCtx);
  for (const ch of text) {
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) =>
      f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)),
    );
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}

beforeEach(async () => {
  const { useWorkspaceStore } = await import('../../stores/workspaceStore');
  const { useDocumentStore } = await import('../../stores/documentStore');
  useWorkspaceStore.setState({ workspace: { root: '/v', name: 'v', tree, expandedPaths: new Set() } });
  useDocumentStore.setState({
    doc: { path: '/v/cur.md', content: '', draft: '', isDirty: false, mtime: 0, encoding: 'utf-8' },
  } as never);
});

describe('wiki embeds', () => {
  const lossless = [
    'See ![[pic.png]] and ![[other#Part|x]] ok\n',
    '![[other]]\n',
    '![[Pic.png|300]]\n',
    'Mixed [[other]] and ![[other]] and `![[code]]`\n',
  ];
  for (const md of lossless) {
    it(`round-trips ${JSON.stringify(md)}`, async () => {
      const e = await mount(md);
      expect(e.action(getMarkdown())).toBe(md);
      await e.destroy();
    });
  }

  it('parses into wiki_embed nodes but leaves inline code alone', async () => {
    const e = await mount('a ![[x]] `![[y]]`\n');
    const names: string[] = [];
    e.ctx.get(editorViewCtx).state.doc.descendants((n) => {
      names.push(n.type.name);
    });
    expect(names.filter((n) => n === 'wiki_embed')).toHaveLength(1);
    await e.destroy();
  });

  it('renders an image embed with its size', async () => {
    const e = await mount('![[pic.png|300]]\n');
    const img = e.ctx.get(editorViewCtx).dom.querySelector<HTMLImageElement>('.wiki-embed-image img');
    expect(img?.getAttribute('src')).toBe('asset://localhost/v/assets/Pic.png');
    expect(img?.width).toBe(300);
    await e.destroy();
  });

  it('renders a note section, skipping frontmatter and later sections', async () => {
    const e = await mount('![[other#part]]\n');
    await vi.waitFor(() => {
      const body = e.ctx.get(editorViewCtx).dom.querySelector('.wiki-embed-body');
      expect(body?.textContent).toContain('Part body');
    });
    const dom = e.ctx.get(editorViewCtx).dom;
    const body = dom.querySelector('.wiki-embed-body')!;
    expect(body.textContent).not.toContain('Not included');
    expect(body.textContent).not.toContain('Intro');
    expect(dom.querySelector('.wiki-embed-header')?.textContent).toBe('other › part');
    await e.destroy();
  });

  it('marks unresolved embeds dead', async () => {
    const e = await mount('![[missing]]\n');
    expect(e.ctx.get(editorViewCtx).dom.querySelector('.wiki-embed-dead')?.textContent).toBe('![[missing]]');
    await e.destroy();
  });

  it('typing ![[x]] creates an embed; typing [[y|z]] creates a wikilink', async () => {
    const e = await mount('start\n');
    const view = e.ctx.get(editorViewCtx);
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    typeText(e, ' ![[other]] and [[y|z]]');
    const names: string[] = [];
    view.state.doc.descendants((n) => {
      names.push(n.type.name);
    });
    expect(names).toContain('wiki_embed');
    expect(names).toContain('wikilink');
    expect(e.action(getMarkdown())).toBe('start ![[other]] and [[y|z]]\n');
    await e.destroy();
  });
});
