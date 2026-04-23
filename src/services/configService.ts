import { invoke } from '@tauri-apps/api/core';
import { AppConfig, DEFAULT_CONFIG } from '../types';

export const configService = {
  async load(): Promise<AppConfig> {
    const raw = await invoke<unknown>('get_config');
    if (!raw || typeof raw !== 'object') {
      return { ...DEFAULT_CONFIG };
    }

    return { ...DEFAULT_CONFIG, ...(raw as Partial<AppConfig>) };
  },

  save(config: AppConfig): Promise<void> {
    return invoke<void>('save_config', { config });
  },
};
