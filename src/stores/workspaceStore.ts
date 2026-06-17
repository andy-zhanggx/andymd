import { create } from 'zustand';
import { FileNode, Workspace } from '../types';
import { fsService } from '../services/fsService';
import { isPathInside } from '../lib/workspacePath';
import { useConfigStore } from './configStore';
import { menuService } from '../services/menuService';

interface WorkspaceState {
  workspace: Workspace | null;
  open: (root: string) => Promise<void>;
  followFile: (path: string) => Promise<void>;
  refresh: () => Promise<void>;
  toggleExpanded: (path: string) => void;
  createFile: (parent: string, name: string) => Promise<FileNode>;
  createFolder: (parent: string, name: string) => Promise<FileNode>;
  rename: (from: string, to: string) => Promise<void>;
  deleteEntry: (path: string) => Promise<void>;
  close: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspace: null,

  async open(root) {
    const showHidden = useConfigStore.getState().config.showHiddenFiles;
    let tree: FileNode;
    try {
      tree = await fsService.listWorkspace(root, showHidden);
    } catch {
      // The folder is gone or unreadable. Drop the stale recent entry so the
      // switcher self-heals (via the existing config update — no new store
      // method, to stay out of files other sessions are editing), then signal
      // callers to surface a message.
      const cfg = useConfigStore.getState();
      const recentWorkspaces = cfg.config.recentWorkspaces.filter((r) => r !== root);
      const lastWorkspace = cfg.config.lastWorkspace === root ? null : cfg.config.lastWorkspace;
      await cfg.update({ recentWorkspaces, lastWorkspace });
      void menuService.syncRecentMenu(cfg.config.recentFiles, recentWorkspaces);
      throw new Error(`WORKSPACE_UNAVAILABLE:${root}`);
    }
    await fsService.openWorkspace(root);
    const name = tree.name;
    set({ workspace: { root, name, tree, expandedPaths: new Set([root]) } });
    await useConfigStore.getState().addRecentWorkspace(root);
  },

  // Switch the sidebar to follow a freshly opened file. No-op when the file is
  // already inside the current workspace; otherwise resolves the file's vault
  // root (Obsidian `.obsidian` ancestor, else its own folder) and opens it.
  async followFile(path) {
    const ws = get().workspace;
    if (ws && isPathInside(path, ws.root)) return;
    let root: string;
    try {
      root = await fsService.findVaultRoot(path);
    } catch {
      return; // can't resolve a root — leave the workspace as-is
    }
    if (!root || (ws && ws.root === root)) return;
    await get().open(root);
  },

  async refresh() {
    const ws = get().workspace;
    if (!ws) return;
    const showHidden = useConfigStore.getState().config.showHiddenFiles;
    const tree = await fsService.listWorkspace(ws.root, showHidden);
    set({ workspace: { ...ws, tree } });
  },

  toggleExpanded(path) {
    const ws = get().workspace;
    if (!ws) return;
    const next = new Set(ws.expandedPaths);
    if (next.has(path)) next.delete(path); else next.add(path);
    set({ workspace: { ...ws, expandedPaths: next } });
  },

  async createFile(parent, name) {
    const node = await fsService.createFile(parent, name);
    await get().refresh();
    return node;
  },

  async createFolder(parent, name) {
    const node = await fsService.createDir(parent, name);
    await get().refresh();
    return node;
  },

  async rename(from, to) {
    await fsService.renamePath(from, to);
    await get().refresh();
  },

  async deleteEntry(path) {
    await fsService.deleteToTrash(path);
    await get().refresh();
  },

  close() {
    set({ workspace: null });
  },
}));
