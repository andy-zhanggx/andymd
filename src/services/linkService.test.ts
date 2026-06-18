// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const openUrl = vi.fn();
const openPath = vi.fn();
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: (...a: unknown[]) => openUrl(...a),
  openPath: (...a: unknown[]) => openPath(...a),
}));

import { openMarkdownLink } from './linkService';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useDocumentStore } from '../stores/documentStore';
import type { FileNode } from '../types';

const tree: FileNode = {
  path: '/ws',
  name: 'ws',
  kind: 'dir',
  children: [
    { path: '/ws/README.md', name: 'README.md', kind: 'file' },
    { path: '/ws/real.md', name: 'real.md', kind: 'file' },
    {
      path: '/ws/07.data',
      name: '07.data',
      kind: 'dir',
      children: [
        { path: '/ws/07.data/README.md', name: 'README.md', kind: 'file' },
        { path: '/ws/07.data/raw.csv', name: 'raw.csv', kind: 'file' },
      ],
    },
  ],
};

let opened: string[];

beforeEach(() => {
  openUrl.mockClear();
  openPath.mockClear();
  opened = [];
  useWorkspaceStore.setState({
    workspace: { root: '/ws', name: 'ws', tree, expandedPaths: new Set() } as never,
  });
  useDocumentStore.setState({
    doc: { path: '/ws/README.md', content: '', draft: '', isDirty: false, mtime: 0, encoding: 'utf-8' } as never,
    // Record openDoc calls instead of hitting the filesystem.
    open: (async (p: string) => {
      opened.push(p);
    }) as never,
  });
  window.alert = vi.fn();
});

const FROM = '/ws/README.md';

describe('openMarkdownLink', () => {
  it('a ./ link opens the resolved markdown note (clickable + ./ resolve)', async () => {
    await openMarkdownLink('./real.md', FROM);
    expect(opened).toEqual(['/ws/real.md']);
  });

  it('a directory link opens its index note', async () => {
    await openMarkdownLink('07.data/', FROM);
    expect(opened).toEqual(['/ws/07.data/README.md']);
  });

  it('a non-markdown file is handed to the OS', async () => {
    await openMarkdownLink('07.data/raw.csv', FROM);
    expect(openPath).toHaveBeenCalledWith('/ws/07.data/raw.csv');
    expect(opened).toEqual([]);
  });

  it('an external link opens in the browser', async () => {
    await openMarkdownLink('https://example.com', FROM);
    expect(openUrl).toHaveBeenCalledWith('https://example.com');
  });

  it('a dead in-vault link navigates nowhere (and notifies)', async () => {
    await openMarkdownLink('./missing.md', FROM);
    expect(opened).toEqual([]);
    expect(openPath).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalled();
  });
});
