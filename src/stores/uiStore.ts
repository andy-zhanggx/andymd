import { create } from 'zustand';

export type SidebarTab = 'files' | 'outline';

interface UIState {
  // Open / quick-open file dialog
  openFileDialog: boolean;
  setOpenFileDialog: (open: boolean) => void;

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

  // Collaboration (share / join) dialog
  collabDialogOpen: boolean;
  setCollabDialogOpen: (open: boolean) => void;

  // First-run onboarding tour
  tourOpen: boolean;
  startTour: () => void;
  endTour: () => void;

  // Editor view modes
  sourceMode: boolean;
  toggleSourceMode: () => void;
  focusMode: boolean;
  toggleFocusMode: () => void;
  typewriterMode: boolean;
  toggleTypewriterMode: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  openFileDialog: false,
  setOpenFileDialog: (open) => set({ openFileDialog: open }),

  findOpen: false,
  replaceMode: false,
  openFind: (replace) => set({ findOpen: true, replaceMode: replace }),
  closeFind: () => set({ findOpen: false }),

  sidebarTab: 'files',
  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  versionHistoryOpen: false,
  setVersionHistoryOpen: (open) => set({ versionHistoryOpen: open }),

  collabDialogOpen: false,
  setCollabDialogOpen: (open) => set({ collabDialogOpen: open }),

  tourOpen: false,
  startTour: () => set({ tourOpen: true }),
  endTour: () => set({ tourOpen: false }),

  sourceMode: false,
  toggleSourceMode: () => set((s) => ({ sourceMode: !s.sourceMode })),
  focusMode: false,
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  typewriterMode: false,
  toggleTypewriterMode: () => set((s) => ({ typewriterMode: !s.typewriterMode })),
}));
