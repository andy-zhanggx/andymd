import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import { fsService } from './fsService';

describe('fsService', () => {
  beforeEach(() => invokeMock.mockReset());

  it('readFile passes path', async () => {
    invokeMock.mockResolvedValue({ content: 'x', mtime: 1 });
    const res = await fsService.readFile('/a.md');
    expect(invokeMock).toHaveBeenCalledWith('read_file', { path: '/a.md' });
    expect(res).toEqual({ content: 'x', mtime: 1 });
  });

  it('writeFile passes path and content', async () => {
    invokeMock.mockResolvedValue({ mtime: 2 });
    await fsService.writeFile('/a.md', 'hi');
    expect(invokeMock).toHaveBeenCalledWith('write_file', { path: '/a.md', content: 'hi' });
  });

  it('listWorkspace passes showHidden flag', async () => {
    invokeMock.mockResolvedValue({ path: '/', name: 'root', kind: 'dir', children: [] });
    await fsService.listWorkspace('/', false);
    expect(invokeMock).toHaveBeenCalledWith('list_workspace', { root: '/', showHidden: false });
  });
});
