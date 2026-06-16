import { create } from 'zustand';
import { AppConfig, DEFAULT_CONFIG, DocumentSession, SESSION_CAP } from '../types';
import { configService } from '../services/configService';
import { menuService } from '../services/menuService';

interface ConfigState {
  config: AppConfig;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AppConfig>) => Promise<void>;
  recordSession: (path: string, session: DocumentSession) => Promise<void>;
  getSession: (path: string) => DocumentSession | undefined;
  addRecentWorkspace: (root: string) => Promise<void>;
  addRecentFile: (path: string) => Promise<void>;
  clearRecent: () => Promise<void>;
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
    void menuService.syncRecentMenu(cfg.recentFiles, cfg.recentWorkspaces);
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
    void menuService.syncRecentMenu(get().config.recentFiles, recentWorkspaces);
  },

  async addRecentFile(path) {
    const existing = get().config.recentFiles.filter((r) => r !== path);
    const recentFiles = [path, ...existing].slice(0, 10);
    await get().update({ recentFiles });
    void menuService.syncRecentMenu(recentFiles, get().config.recentWorkspaces);
  },

  async clearRecent() {
    await get().update({ recentFiles: [], recentWorkspaces: [] });
    void menuService.syncRecentMenu([], []);
  },
}));

// Dev-only handle so browser-based QA can drive the app's real store instance
// (dynamic import() in the console resolves to a separate module copy).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__configStore = useConfigStore;
}
