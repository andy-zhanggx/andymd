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
import { dialogService } from '../services/dialogService';

beforeEach(() => {
  fsMock.readFile.mockReset();
  fsMock.writeFile.mockReset();
  useDocumentStore.setState({ doc: null });
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
});
