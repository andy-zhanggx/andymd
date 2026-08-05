import { describe, expect, it, beforeEach, vi } from 'vitest';

const fsMock = {
  readFile: vi.fn(),
  writeFile: vi.fn(),
};
vi.mock('../services/fsService', () => ({
  fsService: {
    readFile: (...args: unknown[]) => fsMock.readFile(...args),
    writeFile: (...args: unknown[]) => fsMock.writeFile(...args),
  },
}));
vi.mock('../services/dialogService', () => ({
  dialogService: { saveMarkdownAs: vi.fn() },
}));

import { useDocumentStore } from './documentStore';
import { useWorkspaceStore } from './workspaceStore';
import { dialogService } from '../services/dialogService';

beforeEach(() => {
  fsMock.readFile.mockReset();
  fsMock.writeFile.mockReset();
  useDocumentStore.setState({
    tabs: [],
    activeId: null,
    doc: null,
    history: [],
    historyIndex: -1,
    drafts: {},
    conflicts: {},
  });
});

describe('documentStore', () => {
  it('open loads content', async () => {
    fsMock.readFile.mockResolvedValue({ content: '# x', mtime: 10 });
    await useDocumentStore.getState().open('/a.md');
    const d = useDocumentStore.getState().doc!;
    expect(d.content).toBe('# x');
    expect(d.draft).toBe('# x');
    expect(d.isDirty).toBe(false);
  });

  it('open makes the workspace follow the opened file', async () => {
    fsMock.readFile.mockResolvedValue({ content: 'x', mtime: 1 });
    const spy = vi
      .spyOn(useWorkspaceStore.getState(), 'followFile')
      .mockResolvedValue(undefined);
    await useDocumentStore.getState().open('/some/vault/a.md');
    expect(spy).toHaveBeenCalledWith('/some/vault/a.md');
    spy.mockRestore();
  });

  it('keeps an unsaved draft in memory and restores it when the file is reopened', async () => {
    fsMock.readFile.mockResolvedValue({ content: 'disk', mtime: 1 });
    const store = useDocumentStore.getState();
    await store.open('/a.md');
    // The editor flushes the latest content on switch-away (debounce-safe).
    store.stashDraft('/a.md', 'edited-a');
    await store.open('/b.md'); // switch to another file
    expect(useDocumentStore.getState().doc!.path).toBe('/b.md');
    await store.open('/a.md'); // come back
    const d = useDocumentStore.getState().doc!;
    expect(d.draft).toBe('edited-a');
    expect(d.isDirty).toBe(true);
  });

  it('clears the in-memory draft once the file is saved', async () => {
    fsMock.readFile.mockResolvedValue({ content: 'disk', mtime: 1 });
    fsMock.writeFile.mockResolvedValue({ mtime: 2 });
    const store = useDocumentStore.getState();
    await store.open('/a.md');
    store.stashDraft('/a.md', 'edited');
    store.setDraft('edited');
    await store.save();
    expect(useDocumentStore.getState().drafts['/a.md']).toBeUndefined();
  });

  it('setDraft marks dirty only when different', async () => {
    fsMock.readFile.mockResolvedValue({ content: 'a', mtime: 1 });
    await useDocumentStore.getState().open('/a.md');
    useDocumentStore.getState().setDraft('a');
    expect(useDocumentStore.getState().doc!.isDirty).toBe(false);
    useDocumentStore.getState().setDraft('b');
    expect(useDocumentStore.getState().doc!.isDirty).toBe(true);
  });

  it('save detects external modification and records the conflict', async () => {
    fsMock.readFile
      .mockResolvedValueOnce({ content: 'a', mtime: 1 })
      .mockResolvedValueOnce({ content: 'a-external', mtime: 2 });
    await useDocumentStore.getState().open('/a.md');
    useDocumentStore.getState().setDraft('a-mine');
    await expect(useDocumentStore.getState().save()).rejects.toThrow('EXTERNAL_MODIFIED');
    expect(useDocumentStore.getState().conflicts['/a.md']).toEqual({
      diskContent: 'a-external',
      diskMtime: 2,
    });
  });

  it('save writes when no conflict', async () => {
    fsMock.readFile
      .mockResolvedValueOnce({ content: 'a', mtime: 1 })
      .mockResolvedValueOnce({ content: 'a', mtime: 1 });
    fsMock.writeFile.mockResolvedValue({ mtime: 5 });
    await useDocumentStore.getState().open('/a.md');
    useDocumentStore.getState().setDraft('a-new');
    await useDocumentStore.getState().save();
    expect(fsMock.writeFile).toHaveBeenCalledWith('/a.md', 'a-new');
    expect(useDocumentStore.getState().doc!.isDirty).toBe(false);
  });

  it('saveAs triggers dialog for untitled', async () => {
    useDocumentStore.getState().newDraft();
    useDocumentStore.getState().setDraft('hi');
    (dialogService.saveMarkdownAs as ReturnType<typeof vi.fn>).mockResolvedValue('/chose.md');
    fsMock.writeFile.mockResolvedValue({ mtime: 9 });
    await useDocumentStore.getState().save();
    expect(dialogService.saveMarkdownAs).toHaveBeenCalled();
    expect(fsMock.writeFile).toHaveBeenCalledWith('/chose.md', 'hi');
    expect(useDocumentStore.getState().doc!.path).toBe('/chose.md');
  });

  it('open normalizes spaceless headings', async () => {
    fsMock.readFile.mockResolvedValue({
      content: '##数学解释\nsome text\n####标题\n',
      mtime: 1,
    });
    await useDocumentStore.getState().open('/a.md');
    const d = useDocumentStore.getState().doc!;
    expect(d.content).toBe('## 数学解释\nsome text\n#### 标题\n');
    expect(d.draft).toBe(d.content);
    expect(d.isDirty).toBe(false);
  });

  it('open preserves already-valid headings and leaves non-heading lines alone', async () => {
    fsMock.readFile.mockResolvedValue({
      content: '# Title\n## Heading\ntext with # in middle\n# 正常\n',
      mtime: 1,
    });
    await useDocumentStore.getState().open('/a.md');
    const d = useDocumentStore.getState().doc!;
    expect(d.content).toBe('# Title\n## Heading\ntext with # in middle\n# 正常\n');
  });
});

describe('documentStore navigation history', () => {
  const get = () => useDocumentStore.getState();

  beforeEach(() => {
    // Echo the path back so we can assert which file is loaded.
    fsMock.readFile.mockImplementation((path: string) =>
      Promise.resolve({ content: `# ${path}`, mtime: 1 }),
    );
  });

  it('records each opened path and exposes a moving index', async () => {
    await get().open('/a.md');
    expect(get().history).toEqual(['/a.md']);
    expect(get().historyIndex).toBe(0);
    await get().open('/b.md');
    expect(get().history).toEqual(['/a.md', '/b.md']);
    expect(get().historyIndex).toBe(1);
  });

  it('does not push a new entry when re-opening the current path', async () => {
    await get().open('/a.md');
    await get().open('/a.md');
    expect(get().history).toEqual(['/a.md']);
    expect(get().historyIndex).toBe(0);
  });

  it('back and forward move through history without mutating it', async () => {
    await get().open('/a.md');
    await get().open('/b.md');
    await get().open('/c.md');

    await get().back();
    expect(get().historyIndex).toBe(1);
    expect(get().doc!.path).toBe('/b.md');

    await get().back();
    expect(get().historyIndex).toBe(0);
    expect(get().doc!.path).toBe('/a.md');

    await get().forward();
    expect(get().historyIndex).toBe(1);
    expect(get().doc!.path).toBe('/b.md');

    expect(get().history).toEqual(['/a.md', '/b.md', '/c.md']);
  });

  it('back is a no-op at the start, forward is a no-op at the end', async () => {
    await get().open('/a.md');
    await get().back();
    expect(get().historyIndex).toBe(0);
    await get().forward();
    expect(get().historyIndex).toBe(0);
  });

  it('opening after going back truncates the forward stack', async () => {
    await get().open('/a.md');
    await get().open('/b.md');
    await get().open('/c.md');
    await get().back(); // at /b.md (index 1)
    await get().open('/d.md');
    expect(get().history).toEqual(['/a.md', '/b.md', '/d.md']);
    expect(get().historyIndex).toBe(2);
  });
});

describe('documentStore tabs', () => {
  const get = () => useDocumentStore.getState();

  beforeEach(() => {
    fsMock.readFile.mockImplementation((path: string) =>
      Promise.resolve({ content: `# ${path}`, mtime: 1 }),
    );
  });

  it('open() reuses a single tab; openInNewTab() adds tabs', async () => {
    await get().open('/a.md');
    expect(get().tabs).toHaveLength(1);
    await get().open('/b.md'); // replaces active tab
    expect(get().tabs).toHaveLength(1);
    await get().openInNewTab('/c.md');
    expect(get().tabs).toHaveLength(2);
    expect(get().doc!.path).toBe('/c.md');
  });

  it('opening an already-open path activates its tab instead of duplicating', async () => {
    await get().openInNewTab('/a.md');
    await get().openInNewTab('/b.md');
    expect(get().tabs).toHaveLength(2);
    await get().openInNewTab('/a.md');
    expect(get().tabs).toHaveLength(2);
    expect(get().doc!.path).toBe('/a.md');
  });

  it('closeTab removes the tab and focuses a neighbour', async () => {
    await get().openInNewTab('/a.md');
    await get().openInNewTab('/b.md');
    const firstId = get().tabs[0].id;
    await get().closeTab(get().tabs[1].id);
    expect(get().tabs).toHaveLength(1);
    expect(get().activeId).toBe(firstId);
    await get().closeTab(firstId);
    expect(get().tabs).toHaveLength(0);
    expect(get().doc).toBeNull();
  });

  it('restoreTabs rebuilds tabs and activates the saved path', async () => {
    await get().restoreTabs(['/a.md', '/b.md'], '/a.md');
    expect(get().tabs.map((t) => t.doc.path)).toEqual(['/a.md', '/b.md']);
    expect(get().doc!.path).toBe('/a.md');
  });

  it('each tab keeps its own navigation history', async () => {
    await get().open('/a.md');
    await get().open('/b.md'); // tab 0 history: a,b
    await get().openInNewTab('/c.md'); // tab 1 history: c
    expect(get().history).toEqual(['/c.md']);
    get().activateTab(get().tabs[0].id);
    expect(get().history).toEqual(['/a.md', '/b.md']);
    expect(get().historyIndex).toBe(1);
  });
});

describe('documentStore external change detection', () => {
  const get = () => useDocumentStore.getState();

  it('ignores paths that are not open in any tab', async () => {
    await get().checkExternalChange('/nope.md');
    expect(fsMock.readFile).not.toHaveBeenCalled();
  });

  it('refreshes mtime silently when disk content matches (self-save echo)', async () => {
    fsMock.readFile
      .mockResolvedValueOnce({ content: 'a', mtime: 1 })
      .mockResolvedValueOnce({ content: 'a', mtime: 7 });
    await get().open('/a.md');
    await get().checkExternalChange('/a.md');
    expect(get().doc!.mtime).toBe(7);
    expect(get().conflicts['/a.md']).toBeUndefined();
    expect(get().doc!.revision ?? 0).toBe(0); // no editor rebuild for a no-op
  });

  it('auto-reloads a clean tab from disk and bumps the revision', async () => {
    fsMock.readFile
      .mockResolvedValueOnce({ content: 'a', mtime: 1 })
      .mockResolvedValueOnce({ content: 'a-external', mtime: 2 });
    await get().open('/a.md');
    await get().checkExternalChange('/a.md');
    const d = get().doc!;
    expect(d.content).toBe('a-external');
    expect(d.draft).toBe('a-external');
    expect(d.isDirty).toBe(false);
    expect(d.mtime).toBe(2);
    expect(d.revision).toBe(1);
    expect(get().conflicts['/a.md']).toBeUndefined();
  });

  it('records a conflict for a dirty tab instead of clobbering the draft', async () => {
    fsMock.readFile
      .mockResolvedValueOnce({ content: 'a', mtime: 1 })
      .mockResolvedValueOnce({ content: 'a-external', mtime: 2 });
    await get().open('/a.md');
    get().setDraft('a-mine');
    await get().checkExternalChange('/a.md');
    expect(get().doc!.draft).toBe('a-mine'); // untouched
    expect(get().conflicts['/a.md']).toEqual({ diskContent: 'a-external', diskMtime: 2 });
  });

  it('detects changes in background tabs too', async () => {
    fsMock.readFile
      .mockResolvedValueOnce({ content: 'a', mtime: 1 })
      .mockResolvedValueOnce({ content: 'b', mtime: 1 })
      .mockResolvedValueOnce({ content: 'a-external', mtime: 2 });
    await get().open('/a.md');
    await get().openInNewTab('/b.md'); // /a.md is now a background tab
    await get().checkExternalChange('/a.md');
    const tabA = get().tabs.find((t) => t.doc.path === '/a.md')!;
    expect(tabA.doc.content).toBe('a-external');
    expect(get().doc!.path).toBe('/b.md'); // active tab untouched
  });

  it('keeps the buffer when the file disappeared from disk', async () => {
    fsMock.readFile
      .mockResolvedValueOnce({ content: 'a', mtime: 1 })
      .mockRejectedValueOnce(new Error('ENOENT'));
    await get().open('/a.md');
    get().setDraft('a-mine');
    await get().checkExternalChange('/a.md');
    expect(get().doc!.draft).toBe('a-mine');
    expect(get().conflicts['/a.md']).toBeUndefined();
  });

  // Base has stable middle lines so mine (first line) and theirs (last line)
  // merge cleanly — diff3 needs a base line untouched by BOTH sides between
  // two edits, otherwise they form one conflicting chunk (same as git).
  async function openConflicted() {
    fsMock.readFile
      .mockResolvedValueOnce({ content: 'title\nalpha\nbeta', mtime: 1 })
      .mockResolvedValueOnce({ content: 'title\nalpha\nbeta THEIRS', mtime: 2 });
    await get().open('/a.md');
    get().setDraft('title MINE\nalpha\nbeta');
    await get().checkExternalChange('/a.md');
    expect(get().conflicts['/a.md']).toBeDefined();
  }

  it('resolveConflict keepMine overwrites the disk with the draft', async () => {
    await openConflicted();
    fsMock.writeFile.mockResolvedValue({ mtime: 9 });
    await get().resolveConflict('/a.md', 'keepMine');
    expect(fsMock.writeFile).toHaveBeenCalledWith('/a.md', 'title MINE\nalpha\nbeta');
    const d = get().doc!;
    expect(d.isDirty).toBe(false);
    expect(d.mtime).toBe(9);
    expect(get().conflicts['/a.md']).toBeUndefined();
  });

  it('resolveConflict useTheirs adopts the disk version', async () => {
    await openConflicted();
    await get().resolveConflict('/a.md', 'useTheirs');
    const d = get().doc!;
    expect(d.draft).toBe('title\nalpha\nbeta THEIRS');
    expect(d.isDirty).toBe(false);
    expect(d.mtime).toBe(2);
    expect(d.revision).toBe(1);
    expect(get().conflicts['/a.md']).toBeUndefined();
  });

  it('resolveConflict merge three-way merges and leaves the draft dirty', async () => {
    await openConflicted();
    await get().resolveConflict('/a.md', 'merge');
    const d = get().doc!;
    expect(d.draft).toBe('title MINE\nalpha\nbeta THEIRS');
    expect(d.content).toBe('title\nalpha\nbeta THEIRS'); // new base = disk
    expect(d.isDirty).toBe(true);
    expect(d.mtime).toBe(2);
    expect(d.revision).toBe(1);
    expect(get().drafts['/a.md']).toBe('title MINE\nalpha\nbeta THEIRS');
    expect(get().conflicts['/a.md']).toBeUndefined();
  });

  it('a save after a merge succeeds without re-detecting a conflict', async () => {
    await openConflicted();
    await get().resolveConflict('/a.md', 'merge');
    // save() re-reads before writing; the disk still holds "theirs".
    fsMock.readFile.mockResolvedValueOnce({ content: 'title\nalpha\nbeta THEIRS', mtime: 2 });
    fsMock.writeFile.mockResolvedValue({ mtime: 10 });
    await get().save();
    expect(fsMock.writeFile).toHaveBeenCalledWith('/a.md', 'title MINE\nalpha\nbeta THEIRS');
    expect(get().doc!.isDirty).toBe(false);
  });

  it('merge with overlapping edits switches to source mode for marker cleanup', async () => {
    const { useUIStore } = await import('./uiStore');
    useUIStore.setState({ sourceMode: false });
    fsMock.readFile
      .mockResolvedValueOnce({ content: 'line', mtime: 1 })
      .mockResolvedValueOnce({ content: 'line THEIRS', mtime: 2 });
    await get().open('/a.md');
    get().setDraft('line MINE');
    await get().checkExternalChange('/a.md');
    await get().resolveConflict('/a.md', 'merge');
    expect(get().doc!.draft).toContain('<<<<<<<');
    expect(useUIStore.getState().sourceMode).toBe(true);
    useUIStore.setState({ sourceMode: false });
  });

  it('a clean merge stays in the visual editor', async () => {
    const { useUIStore } = await import('./uiStore');
    useUIStore.setState({ sourceMode: false });
    await openConflicted();
    await get().resolveConflict('/a.md', 'merge');
    expect(useUIStore.getState().sourceMode).toBe(false);
  });

  it('dismissConflict clears the pending conflict without touching the doc', async () => {
    await openConflicted();
    get().dismissConflict('/a.md');
    expect(get().conflicts['/a.md']).toBeUndefined();
    expect(get().doc!.draft).toBe('title MINE\nalpha\nbeta');
  });

  it('closing a tab drops its pending conflict', async () => {
    await openConflicted();
    get().setDraft(get().doc!.content); // make it clean so closeTab skips confirm
    await get().closeTab(get().activeId!);
    expect(get().conflicts['/a.md']).toBeUndefined();
  });

  it('a successful save clears a stale conflict entry', async () => {
    await openConflicted();
    // Disk went back to matching our base (e.g. the other editor undid its change).
    fsMock.readFile.mockResolvedValueOnce({ content: 'title\nalpha\nbeta', mtime: 1 });
    fsMock.writeFile.mockResolvedValue({ mtime: 11 });
    await get().save();
    expect(get().conflicts['/a.md']).toBeUndefined();
  });
});
