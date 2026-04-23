import { create } from 'zustand';
import { AppConfig, DEFAULT_CONFIG, DocumentSession, SESSION_CAP } from '../types';
import { configService } from '../services/configService';

interface ConfigState {
  config: AppConfig;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AppConfig>) => Promise<void>;
  recordSession: (path: string, session: DocumentSession) => Promise<void>;
  getSession: (path: string) => DocumentSession | undefined;
  addRecentWorkspace: (root: string) => Promise<void>;
}

function trimSessions(sessions: Record<string, DocumentSession>): Record<string, DocumentSession> {
  const entries = Object.entries(sessions);
  if (entries.length <= SESSION_CAP) return sessions;
  entries.sort((a, b) => b[1].lastAccessedAt - a[1].lastAccessedAt);
  return Object.fromEntries(entries.slice(0, SESSION_CAP));
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: DEFAULT_CONFIG,
  loaded: false,

  async load() {
    const cfg = await configService.load();
    set({ config: cfg, loaded: true });
  },

  async update(patch) {
    const next = { ...get().config, ...patch };
    set({ config: next });
    await configService.save(next);
  },

  async recordSession(path, session) {
    const sessions = trimSessions({ ...get().config.sessions, [path]: session });
    await get().update({ sessions });
  },

  getSession(path) {
    return get().config.sessions[path];
  },

  async addRecentWorkspace(root) {
    const existing = get().config.recentWorkspaces.filter((r) => r !== root);
    const recentWorkspaces = [root, ...existing].slice(0, 10);
    await get().update({ recentWorkspaces, lastWorkspace: root });
  },
}));
