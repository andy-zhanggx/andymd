import { create } from 'zustand';

export type SidebarTab = 'files' | 'outline';

interface UIState {
  // Find / Replace bar
  findOpen: boolean;
  replaceMode: boolean;
  openFind: (replace: boolean) => void;
  closeFind: () => void;

  // Sidebar tab (file tree vs document outline)
  sidebarTab: SidebarTab;
  setSidebarTab: (tab: SidebarTab) => void;

  // Version history modal
  versionHistoryOpen: boolean;
  setVersionHistoryOpen: (open: boolean) => void;

  // Editor view modes
  sourceMode: boolean;
  toggleSourceMode: () => void;
  focusMode: boolean;
  toggleFocusMode: () => void;
  typewriterMode: boolean;
  toggleTypewriterMode: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  findOpen: false,
  replaceMode: false,
  openFind: (replace) => set({ findOpen: true, replaceMode: replace }),
  closeFind: () => set({ findOpen: false }),

  sidebarTab: 'files',
  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  versionHistoryOpen: false,
  setVersionHistoryOpen: (open) => set({ versionHistoryOpen: open }),

  sourceMode: false,
  toggleSourceMode: () => set((s) => ({ sourceMode: !s.sourceMode })),
  focusMode: false,
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  typewriterMode: false,
  toggleTypewriterMode: () => set((s) => ({ typewriterMode: !s.typewriterMode })),
}));
