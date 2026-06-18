import { invoke } from '@tauri-apps/api/core';

export const dialogService = {
  pickWorkspaceDir: () => invoke<string | null>('pick_workspace_dir'),

  pickMarkdownFile: () => invoke<string | null>('pick_markdown_file'),

  pickImageFile: () => invoke<string | null>('pick_image_file'),

  saveMarkdownAs: (defaultName: string) =>
    invoke<string | null>('save_markdown_dialog', { defaultName }),

  saveExportAs: (defaultName: string, extension: string) =>
    invoke<string | null>('save_export_dialog', { defaultName, extension }),
};
