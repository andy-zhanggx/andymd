import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FileNode } from '../types';

const fsMock = {
  findVaultRoot: vi.fn(),
  listWorkspace: vi.fn(),
  openWorkspace: vi.fn(),
};
vi.mock('../services/fsService', () => ({
  fsService: {
    findVaultRoot: (...a: unknown[]) => fsMock.findVaultRoot(...a),
    listWorkspace: (...a: unknown[]) => fsMock.listWorkspace(...a),
    openWorkspace: (...a: unknown[]) => fsMock.openWorkspace(...a),
  },
}));
const cfgMock = vi.hoisted(() => {
  const config = {
    showHiddenFiles: false,
    recentWorkspaces: [] as string[],
    recentFiles: [] as string[],
    lastWorkspace: null as string | null,
  };
  return {
    config,
    addRecentWorkspace: vi.fn().mockResolvedValue(undefined),
    update: vi.fn(async (patch: Record<string, unknown>) => {
      Object.assign(config, patch);
    }),
  };
});
vi.mock('./configStore', () => ({ useConfigStore: { getState: () => cfgMock } }));
vi.mock('../services/menuService', () => ({
  menuService: { syncRecentMenu: vi.fn().mockResolvedValue(undefined) },
}));

import { useWorkspaceStore } from './workspaceStore';

const dir = (root: string): FileNode => ({
  path: root,
  name: root.split('/').pop() ?? root,
  kind: 'dir',
  children: [],
});

function setWorkspace(root: string) {
  useWorkspaceStore.setState({
    workspace: { root, name: root.split('/').pop() ?? root, tree: dir(root), expandedPaths: new Set() },
  });
}

beforeEach(() => {
  fsMock.findVaultRoot.mockReset();
  fsMock.listWorkspace.mockReset();
  fsMock.openWorkspace.mockReset();
  cfgMock.update.mockClear();
  cfgMock.config.recentWorkspaces = [];
  cfgMock.config.lastWorkspace = null;
  useWorkspaceStore.setState({ workspace: null });
});

describe('open with a missing folder', () => {
  it('prunes the stale recent entry and throws WORKSPACE_UNAVAILABLE', async () => {
    cfgMock.config.recentWorkspaces = ['/gone', '/keep'];
    cfgMock.config.lastWorkspace = '/gone';
    fsMock.listWorkspace.mockRejectedValue(new Error('ENOENT'));

    await expect(useWorkspaceStore.getState().open('/gone')).rejects.toThrow(/WORKSPACE_UNAVAILABLE/);

    expect(cfgMock.update).toHaveBeenCalledWith({
      recentWorkspaces: ['/keep'],
      lastWorkspace: null,
    });
    expect(useWorkspaceStore.getState().workspace).toBeNull();
  });

  it('keeps lastWorkspace when a different recent is missing', async () => {
    cfgMock.config.recentWorkspaces = ['/gone', '/current'];
    cfgMock.config.lastWorkspace = '/current';
    fsMock.listWorkspace.mockRejectedValue(new Error('ENOENT'));

    await expect(useWorkspaceStore.getState().open('/gone')).rejects.toThrow(/WORKSPACE_UNAVAILABLE/);
    expect(cfgMock.update).toHaveBeenCalledWith({
      recentWorkspaces: ['/current'],
      lastWorkspace: '/current',
    });
  });
});

describe('followFile', () => {
  it('opens the file vault when no workspace is open', async () => {
    fsMock.findVaultRoot.mockResolvedValue('/vaultB');
    fsMock.listWorkspace.mockResolvedValue(dir('/vaultB'));
    fsMock.openWorkspace.mockResolvedValue(undefined);

    await useWorkspaceStore.getState().followFile('/vaultB/note.md');

    expect(fsMock.findVaultRoot).toHaveBeenCalledWith('/vaultB/note.md');
    expect(useWorkspaceStore.getState().workspace?.root).toBe('/vaultB');
  });

  it('does nothing for a file inside the current workspace', async () => {
    setWorkspace('/vaultA');
    await useWorkspaceStore.getState().followFile('/vaultA/sub/a.md');
    expect(fsMock.findVaultRoot).not.toHaveBeenCalled();
    expect(fsMock.listWorkspace).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().workspace?.root).toBe('/vaultA');
  });

  it('switches the workspace for a file from another vault', async () => {
    setWorkspace('/vaultA');
    fsMock.findVaultRoot.mockResolvedValue('/vaultB');
    fsMock.listWorkspace.mockResolvedValue(dir('/vaultB'));
    fsMock.openWorkspace.mockResolvedValue(undefined);

    await useWorkspaceStore.getState().followFile('/vaultB/note.md');

    expect(useWorkspaceStore.getState().workspace?.root).toBe('/vaultB');
  });

  it('keeps the workspace when the resolved root equals the current one', async () => {
    setWorkspace('/vaultA');
    // Prefix-similar path that is NOT inside /vaultA, but resolves back to it.
    fsMock.findVaultRoot.mockResolvedValue('/vaultA');
    await useWorkspaceStore.getState().followFile('/vaultA-notes/x.md');
    expect(fsMock.listWorkspace).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().workspace?.root).toBe('/vaultA');
  });

  it('leaves the workspace untouched when vault resolution fails', async () => {
    setWorkspace('/vaultA');
    fsMock.findVaultRoot.mockRejectedValue(new Error('nope'));
    await useWorkspaceStore.getState().followFile('/elsewhere/x.md');
    expect(useWorkspaceStore.getState().workspace?.root).toBe('/vaultA');
  });
});
