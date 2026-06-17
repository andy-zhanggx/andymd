import { create } from 'zustand';
import { CollabSession, type CollabStatus, type Peer } from './collabSession';
import { generateRoomCode, normalizeRoomCode, isValidRoomCode } from './roomCode';
import { resolveUser } from './identity';

export type CollabRole = 'host' | 'guest';
export type CollabConnState = 'idle' | CollabStatus;

// The live session is kept outside the reactive store: it holds a Y.Doc,
// awareness, and a WebSocket, none of which should be diffed by React. The
// editor reaches it through getActiveSession().
let activeSession: CollabSession | null = null;
export const getActiveSession = (): CollabSession | null => activeSession;

interface CollabState {
  state: CollabConnState;
  role: CollabRole | null;
  roomCode: string | null;
  peers: Peer[];
  error: string | null;

  /** True while a room is active (hosting or joined). */
  isActive: () => boolean;

  host: (serverUrl: string, displayName: string) => string;
  join: (serverUrl: string, rawCode: string, displayName: string) => void;
  leave: () => void;
}

export const useCollabStore = create<CollabState>((set, get) => {
  const start = (role: CollabRole, serverUrl: string, code: string, displayName: string) => {
    activeSession?.destroy();
    const user = resolveUser(displayName, `${code}:${Date.now()}`);
    const session = new CollabSession({
      serverUrl,
      code,
      user,
      onStatus: (status) => set({ state: status }),
      onPeers: (peers) => set({ peers }),
      onAuthFailed: (reason) => set({ state: 'error', error: reason }),
    });
    activeSession = session;
    set({ state: 'connecting', role, roomCode: code, peers: [], error: null });
  };

  return {
    state: 'idle',
    role: null,
    roomCode: null,
    peers: [],
    error: null,

    isActive: () => get().state !== 'idle' && get().roomCode !== null,

    host(serverUrl, displayName) {
      const code = generateRoomCode();
      start('host', serverUrl, code, displayName);
      return code;
    },

    join(serverUrl, rawCode, displayName) {
      const code = normalizeRoomCode(rawCode);
      if (!isValidRoomCode(code)) {
        set({ state: 'error', error: 'Invalid code', role: 'guest', roomCode: null });
        return;
      }
      start('guest', serverUrl, code, displayName);
    },

    leave() {
      activeSession?.destroy();
      activeSession = null;
      set({ state: 'idle', role: null, roomCode: null, peers: [], error: null });
    },
  };
});

// Dev-only handle so browser-based QA can drive/inspect the real store instance
// (a dynamic import() in the console resolves to a separate module copy).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__collabStore = useCollabStore;
  (window as unknown as Record<string, unknown>).__collabSession = getActiveSession;
}
