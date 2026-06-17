import { invoke } from '@tauri-apps/api/core';

export const menuService = {
  /** Rebuild the native "Open Recent" submenu from the current recents. */
  syncRecentMenu: (recentFiles: string[], recentWorkspaces: string[]) =>
    invoke<void>('rebuild_recent_menu', { recentFiles, recentWorkspaces }).catch((e) => {
      console.warn('rebuild_recent_menu failed', e);
    }),
};
