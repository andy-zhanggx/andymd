import { create } from 'zustand';
import type { Suggestion } from '../lib/linkSuggest';

export interface LinkSuggestController {
  accept: (index: number) => void;
  dismiss: () => void;
}

interface LinkSuggestState {
  open: boolean;
  items: Suggestion[];
  active: number;
  loading: boolean;
  /** Viewport coords of the `[[` the popup hangs under. */
  x: number;
  y: number;
  controller: LinkSuggestController | null;
  show: (s: Pick<LinkSuggestState, 'items' | 'loading' | 'x' | 'y'> & { resetActive: boolean }) => void;
  close: () => void;
  move: (dir: 1 | -1) => void;
  setActive: (i: number) => void;
  setController: (c: LinkSuggestController | null) => void;
}

/** UI state of the `[[` autocomplete popup; driven by the linkSuggest plugin. */
export const useLinkSuggestStore = create<LinkSuggestState>((set, get) => ({
  open: false,
  items: [],
  active: 0,
  loading: false,
  x: 0,
  y: 0,
  controller: null,
  show: ({ items, loading, x, y, resetActive }) =>
    set((s) => ({
      open: true,
      items,
      loading,
      x,
      y,
      active: resetActive ? 0 : Math.min(s.active, Math.max(0, items.length - 1)),
    })),
  close: () => {
    if (get().open) set({ open: false, items: [], active: 0, loading: false });
  },
  move: (dir) => {
    const { items, active } = get();
    if (!items.length) return;
    set({ active: (active + dir + items.length) % items.length });
  },
  setActive: (i) => set({ active: i }),
  setController: (c) => set({ controller: c }),
}));
