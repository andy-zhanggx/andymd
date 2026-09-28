import { create } from 'zustand';
import { fsService, onSemanticStatus } from '../services/fsService';
import { useConfigStore } from './configStore';
import { OFF_STATUS, type SemanticHit, type SemanticStatus } from '../lib/semantic';

interface SemanticState {
  /** Mirror of the Rust side's phase; pushed via `semantic-status` events. */
  status: SemanticStatus;
  query: string;
  hits: SemanticHit[];
  searching: boolean;
  /** Kick off (or resume) indexing for `root` using the configured mirror. */
  start: (root: string) => Promise<void>;
  /** Persist the opt-in (and mirror), then start indexing. */
  enable: (root: string, endpoint: string) => Promise<void>;
  /** Search `root`; an empty query clears results. Re-runs itself when the index becomes ready. */
  search: (root: string, query: string) => Promise<void>;
  clear: () => void;
  /** Feed a status update (also used by tests instead of the Tauri event). */
  onStatus: (status: SemanticStatus) => void;
}

let listening = false;
let gen = 0;
let lastRoot: string | null = null;

function ensureListening() {
  if (listening) return;
  listening = true;
  onSemanticStatus((s) => useSemanticStore.getState().onStatus(s)).catch(() => {
    // No Tauri backend (web preview): status stays whatever the stubs return.
    listening = false;
  });
}

export const useSemanticStore = create<SemanticState>((set, get) => ({
  status: OFF_STATUS,
  query: '',
  hits: [],
  searching: false,

  async start(root) {
    ensureListening();
    lastRoot = root;
    const endpoint = useConfigStore.getState().config.semanticModelEndpoint.trim();
    try {
      await fsService.semanticStart(root, endpoint || null);
    } catch (err) {
      set({ status: { ...OFF_STATUS, root, phase: 'error', message: String(err) } });
    }
  },

  async enable(root, endpoint) {
    await useConfigStore.getState().update({
      semanticSearch: true,
      semanticModelEndpoint: endpoint.trim(),
    });
    await get().start(root);
  },

  async search(root, query) {
    const q = query.trim();
    const id = ++gen;
    lastRoot = root;
    if (!q) {
      set({ query: '', hits: [], searching: false });
      return;
    }
    set({ query: q, searching: true });
    try {
      const res = await fsService.semanticSearch(root, q);
      if (id !== gen) return;
      set({ hits: res.hits, status: res.status, searching: false });
    } catch (err) {
      if (id !== gen) return;
      console.warn('semantic search failed', err);
      set({ hits: [], searching: false });
    }
  },

  clear() {
    gen += 1;
    set({ query: '', hits: [], searching: false });
  },

  onStatus(status) {
    const wasReady = get().status.phase === 'ready';
    set({ status });
    // A query typed while the index was building answers itself once ready.
    const { query } = get();
    if (status.phase === 'ready' && !wasReady && query && lastRoot) {
      void get().search(lastRoot, query);
    }
  },
}));

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__semanticStore = useSemanticStore;
}
