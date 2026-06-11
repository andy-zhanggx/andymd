import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { FileNode, ReadFileResult, WriteFileResult } from '../types';

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

  findVaultRoot: (from: string) => invoke<string>('find_vault_root', { from }),

  openWorkspace: (root: string) => invoke<void>('open_workspace', { root }),

  takePendingOpens: () => invoke<string[]>('take_pending_opens'),
};

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
