// @vitest-environment happy-dom
import { editorViewCtx } from '@milkdown/core';
import type { Editor } from '@milkdown/core';
import { describe, it, expect, afterEach } from 'vitest';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useDocumentStore } from '../../stores/documentStore';
import type { FileNode } from '../../types';

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

const tree: FileNode = {
  path: '/v',
  name: 'v',
  kind: 'dir',
  children: [{ path: '/v/real.md', name: 'real.md', kind: 'file' }],
};

function setVault(currentFile: string | null) {
  useWorkspaceStore.setState({
    workspace: { root: '/v', name: 'v', tree, expandedPaths: new Set(['/v']) } as never,
  });
  useDocumentStore.setState({
    doc: currentFile
      ? ({ path: currentFile, content: '', draft: '', isDirty: false, mtime: 0, encoding: 'utf-8' } as never)
      : null,
  });
}

function wikilinkFor(view: { dom: ParentNode }, target: string): HTMLElement {
  return [...view.dom.querySelectorAll('a[data-type="wikilink"]')].find(
    (a) => a.getAttribute('data-target') === target,
  ) as HTMLElement;
}

afterEach(() => {
  useWorkspaceStore.setState({ workspace: null });
  useDocumentStore.setState({ doc: null });
});

describe('wikilink dead-link decoration', () => {
  it('marks an unresolvable target dead, leaves a resolvable one alive', async () => {
    setVault('/v/current.md');
    const e = await mount('[[real]] and [[nope]]');
    const view = e.ctx.get(editorViewCtx);
    expect(wikilinkFor(view, 'real').classList.contains('wikilink-dead')).toBe(false);
    expect(wikilinkFor(view, 'nope').classList.contains('wikilink-dead')).toBe(true);
    await e.destroy();
  });

  it('treats a ./-relative link to a real file as alive', async () => {
    setVault('/v/current.md');
    const e = await mount('[[./real]] and [[./nope]]');
    const view = e.ctx.get(editorViewCtx);
    expect(wikilinkFor(view, './real').classList.contains('wikilink-dead')).toBe(false);
    expect(wikilinkFor(view, './nope').classList.contains('wikilink-dead')).toBe(true);
    await e.destroy();
  });

  it('does not flag anything when no vault is loaded', async () => {
    useWorkspaceStore.setState({ workspace: null });
    const e = await mount('[[whatever]]');
    const view = e.ctx.get(editorViewCtx);
    expect(wikilinkFor(view, 'whatever').classList.contains('wikilink-dead')).toBe(false);
    await e.destroy();
  });
});

function anchorFor(view: { dom: ParentNode }, href: string): HTMLElement {
  return [...view.dom.querySelectorAll('a[href]')].find(
    (a) => a.getAttribute('href') === href,
  ) as HTMLElement;
}

describe('markdown link dead-link decoration', () => {
  it('paints a dead markdown link grey-blue, leaves a resolvable one alone', async () => {
    setVault('/v/current.md');
    const e = await mount('[live](./real.md) and [dead](./missing.md)');
    const view = e.ctx.get(editorViewCtx);
    // The dead link's text is wrapped with the link-dead class; the live one isn't.
    expect(anchorFor(view, './missing.md').querySelector('.link-dead')).not.toBeNull();
    expect(anchorFor(view, './real.md').querySelector('.link-dead')).toBeNull();
    await e.destroy();
  });
});
