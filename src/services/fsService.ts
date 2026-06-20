import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { FileNode, ImportImageResult, ReadFileResult, WriteFileResult } from '../types';

export const fsService = {
  readFile: (path: string) => invoke<ReadFileResult>('read_file', { path }),

  writeFile: (path: string, content: string) =>
    invoke<WriteFileResult>('write_file', { path, content }),

  listWorkspace: (root: string, showHidden: boolean) =>
    invoke<FileNode>('list_workspace', { root, showHidden }),

  createFile: (parent: string, name: string) =>
    invoke<FileNode>('create_file', { parent, name }),

  createDir: (parent: string, name: string) => invoke<FileNode>('create_dir', { parent, name }),

  renamePath: (from: string, to: string) => invoke<void>('rename_path', { from, to }),

  deleteToTrash: (path: string) => invoke<void>('delete_to_trash', { path }),

  revealInFinder: (path: string) => invoke<void>('reveal_in_finder', { path }),

  importImage: (srcPath: string, docPath: string | null) =>
    invoke<ImportImageResult>('import_image', { srcPath, docPath }),

  importImageBytes: (fileName: string, data: number[], docPath: string | null) =>
    invoke<ImportImageResult>('import_image_bytes', { fileName, data, docPath }),

  findVaultRoot: (from: string) => invoke<string>('find_vault_root', { from }),

  countBacklinks: (vaultRoot: string, target: string) =>
    invoke<number>('count_backlinks', { vaultRoot, target }),

  openWorkspace: (root: string) => invoke<void>('open_workspace', { root }),

  takePendingOpens: () => invoke<string[]>('take_pending_opens'),

  // iOS: the app sandbox's Documents directory, used as the default vault when
  // there's no previously-opened workspace. Created (and seeded with a welcome
  // note) on first call by the Rust side.
  defaultVaultDir: () => invoke<string>('default_vault_dir'),
};

// Dev-only handle so browser-based QA can stub filesystem commands without a
// running Tauri backend.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__fsService = fsService;
}

export type FsEvent =
  | { kind: 'created'; path: string }
  | { kind: 'modified'; path: string }
  | { kind: 'removed'; path: string }
  | { kind: 'renamed'; from: string; to: string };

export function onWorkspaceChanged(cb: (ev: FsEvent) => void): Promise<UnlistenFn> {
  return listen<FsEvent>('workspace-changed', (e) => cb(e.payload));
}

export function onOpenFileRequest(cb: (path: string) => void): Promise<UnlistenFn> {
  return listen<string>('open-file-request', (e) => cb(e.payload));
}
