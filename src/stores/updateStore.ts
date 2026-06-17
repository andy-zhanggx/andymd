import { create } from 'zustand';

export type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'error';

interface UpdateState {
  status: UpdateStatus;
  availableVersion: string | null;
  lastCheckedAt: number | null;
  setChecking: () => void;
  setDownloading: (version: string) => void;
  setReady: () => void;
  setIdle: (checkedAt: number) => void;
  setError: () => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  status: 'idle',
  availableVersion: null,
  lastCheckedAt: null,
  setChecking: () => set({ status: 'checking' }),
  setDownloading: (version) => set({ status: 'downloading', availableVersion: version }),
  setReady: () => set({ status: 'ready' }),
  setIdle: (checkedAt) => set({ status: 'idle', lastCheckedAt: checkedAt }),
  setError: () => set({ status: 'error' }),
}));
