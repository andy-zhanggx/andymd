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
  useDocumentStore.setState({ doc: null, history: [], historyIndex: -1, drafts: {} });
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

  it('save detects external modification', async () => {
    fsMock.readFile
      .mockResolvedValueOnce({ content: 'a', mtime: 1 })
      .mockResolvedValueOnce({ content: 'a-external', mtime: 2 });
    await useDocumentStore.getState().open('/a.md');
    useDocumentStore.getState().setDraft('a-mine');
    await expect(useDocumentStore.getState().save()).rejects.toThrow('EXTERNAL_MODIFIED');
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
