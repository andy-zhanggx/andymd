import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FileNode } from '../types';

const disk: Record<string, string> = {};
const fs = {
  findFilesMentioning: vi.fn(async (_root: string, needles: string[]) =>
    Object.keys(disk).filter((p) => needles.some((n) => disk[p].toLowerCase().includes(n))),
  ),
  readFile: vi.fn(async (p: string) => ({ content: disk[p], mtime: 1 })),
  writeFile: vi.fn(async (p: string, c: string) => {
    disk[p] = c;
    return { mtime: 2 };
  }),
  renamePath: vi.fn(async (from: string, to: string) => {
    disk[to] = disk[from];
    delete disk[from];
  }),
  listWorkspace: vi.fn(async () => tree),
};
vi.mock('./fsService', () => ({ fsService: fs }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: (p: string) => p }));

const tree: FileNode = {
  path: '/v',
  name: 'v',
  kind: 'dir',
  children: [
    { path: '/v/A.md', name: 'A.md', kind: 'file' },
    { path: '/v/B.md', name: 'B.md', kind: 'file' },
    { path: '/v/Target.md', name: 'Target.md', kind: 'file' },
  ],
};

beforeEach(async () => {
  for (const k of Object.keys(disk)) delete disk[k];
  Object.assign(disk, {
    '/v/A.md': 'Link to [[Target]].\n',
    '/v/B.md': 'Nothing here.\n',
    '/v/Target.md': '# Target\n',
  });
  vi.clearAllMocks();
  const { useWorkspaceStore } = await import('../stores/workspaceStore');
  useWorkspaceStore.setState({ workspace: { root: '/v', name: 'v', tree, expandedPaths: new Set() } });
  const { useDocumentStore } = await import('../stores/documentStore');
  const doc = (path: string, draft?: string) => ({
    path,
    content: disk[path],
    draft: draft ?? disk[path],
    isDirty: draft !== undefined && draft !== disk[path],
    mtime: 1,
    encoding: 'utf-8' as const,
  });
  useDocumentStore.setState({
    tabs: [
      { id: 'a', doc: doc('/v/A.md', 'Link to [[Target]]. Edited.\n'), history: ['/v/A.md'], historyIndex: 0 },
      { id: 't', doc: doc('/v/Target.md'), history: ['/v/Target.md'], historyIndex: 0 },
    ],
    activeId: 't',
    doc: doc('/v/Target.md'),
    drafts: {},
    conflicts: {},
  } as never);
});

async function answer(choice: 'update' | 'skip' | 'cancel') {
  const { useUIStore } = await import('../stores/uiStore');
  await vi.waitFor(() => expect(useUIStore.getState().relinkPrompt).not.toBeNull());
  const p = useUIStore.getState().relinkPrompt!;
  expect(p.files).toEqual([{ relPath: 'A.md', changes: 1 }]);
  p.resolve(choice);
}

describe('renameWithLinks', () => {
  it('rewrites linking notes on disk and in open buffers, and retargets tabs', async () => {
    const { renameWithLinks } = await import('./relinkService');
    const { useDocumentStore } = await import('../stores/documentStore');
    const done = renameWithLinks('/v/Target.md', '/v/Goal.md');
    await answer('update');
    await done;
    expect(disk['/v/Goal.md']).toBe('# Target\n');
    expect(disk['/v/A.md']).toBe('Link to [[Goal]].\n');
    const tabs = useDocumentStore.getState().tabs;
    expect(tabs.map((t) => t.doc.path)).toEqual(['/v/A.md', '/v/Goal.md']);
    expect(tabs[0].doc.draft).toBe('Link to [[Goal]]. Edited.\n');
    expect(tabs[0].doc.content).toBe('Link to [[Goal]].\n');
    expect(tabs[1].history).toEqual(['/v/Goal.md']);
  });

  it('"Rename Only" renames without touching links; Cancel does nothing', async () => {
    const { renameWithLinks } = await import('./relinkService');
    let done = renameWithLinks('/v/Target.md', '/v/Goal.md');
    await answer('skip');
    await done;
    expect(disk['/v/A.md']).toBe('Link to [[Target]].\n');
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(disk['/v/Goal.md']).toBeDefined();

    // Put it back, then cancel.
    disk['/v/Target.md'] = disk['/v/Goal.md'];
    delete disk['/v/Goal.md'];
    fs.renamePath.mockClear();
    done = renameWithLinks('/v/Target.md', '/v/Goal.md');
    await answer('cancel');
    await done;
    expect(fs.renamePath).not.toHaveBeenCalled();
  });

  it('renames silently when nothing links to the file', async () => {
    const { renameWithLinks } = await import('./relinkService');
    const { useUIStore } = await import('../stores/uiStore');
    await renameWithLinks('/v/B.md', '/v/C.md');
    expect(useUIStore.getState().relinkPrompt).toBeNull();
    expect(fs.renamePath).toHaveBeenCalledWith('/v/B.md', '/v/C.md');
  });
});
