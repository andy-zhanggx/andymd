import { describe, expect, it, beforeEach, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../types';

const saveSpy = vi.fn();
vi.mock('../services/configService', () => ({
  configService: {
    load: async () => ({ ...DEFAULT_CONFIG, fontSize: 20 }),
    save: (c: unknown) => { saveSpy(c); return Promise.resolve(); },
  },
}));

import { useConfigStore } from './configStore';

beforeEach(async () => {
  saveSpy.mockReset();
  useConfigStore.setState({ config: DEFAULT_CONFIG, loaded: false });
});

describe('configStore', () => {
  it('load populates config from service', async () => {
    await useConfigStore.getState().load();
    expect(useConfigStore.getState().config.fontSize).toBe(20);
    expect(useConfigStore.getState().loaded).toBe(true);
  });

  it('update merges and saves', async () => {
    await useConfigStore.getState().update({ fontSize: 22 });
    expect(useConfigStore.getState().config.fontSize).toBe(22);
    expect(saveSpy).toHaveBeenCalled();
  });

  it('addRecentWorkspace dedupes and caps at 10', async () => {
    for (let i = 0; i < 12; i++) {
      await useConfigStore.getState().addRecentWorkspace(`/path/${i}`);
    }
    expect(useConfigStore.getState().config.recentWorkspaces.length).toBe(10);
    expect(useConfigStore.getState().config.recentWorkspaces[0]).toBe('/path/11');
  });

  it('addRecentFile dedupes and caps at 10', async () => {
    for (let i = 0; i < 12; i++) {
      await useConfigStore.getState().addRecentFile(`/f/${i}.md`);
    }
    const recent = useConfigStore.getState().config.recentFiles;
    expect(recent.length).toBe(10);
    expect(recent[0]).toBe('/f/11.md');
    await useConfigStore.getState().addRecentFile('/f/5.md');
    expect(useConfigStore.getState().config.recentFiles[0]).toBe('/f/5.md');
    expect(useConfigStore.getState().config.recentFiles.length).toBe(10);
  });

  it('clearRecent empties both recent lists', async () => {
    await useConfigStore.getState().addRecentFile('/a.md');
    await useConfigStore.getState().addRecentWorkspace('/ws');
    await useConfigStore.getState().clearRecent();
    expect(useConfigStore.getState().config.recentFiles).toEqual([]);
    expect(useConfigStore.getState().config.recentWorkspaces).toEqual([]);
  });

  it('recordSession caps at SESSION_CAP', async () => {
    for (let i = 0; i < 201; i++) {
      await useConfigStore.getState().recordSession(`/f${i}.md`, {
        scrollTop: 0,
        selection: { anchor: 0, head: 0 },
        lastAccessedAt: i,
      });
    }
    const sessions = useConfigStore.getState().config.sessions;
    expect(Object.keys(sessions).length).toBeLessThanOrEqual(200);
    expect(sessions['/f0.md']).toBeUndefined();
    expect(sessions['/f200.md']).toBeDefined();
  });
});
