import { invoke } from '@tauri-apps/api/core';

export interface Version {
  ts: number; // unix millis
  file: string;
}

export const versionService = {
  /** Snapshot content for a file path (best-effort; deduped + pruned natively). */
  save: (path: string, content: string) =>
    invoke<void>('save_version', { path, content }).catch((e) => console.warn('save_version', e)),

  list: (path: string) => invoke<Version[]>('list_versions', { path }),

  read: (path: string, file: string) => invoke<string>('read_version', { path, file }),
};
