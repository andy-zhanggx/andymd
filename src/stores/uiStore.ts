import { create } from 'zustand';
import type { Release } from '../lib/changelog';

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

  // First-run onboarding tour
  tourOpen: boolean;
  startTour: () => void;
  endTour: () => void;

  // Software Update settings dialog
  updateSettingsOpen: boolean;
  setUpdateSettingsOpen: (open: boolean) => void;

  // "What's New" release-notes popup
  whatsNewOpen: boolean;
  whatsNewReleases: Release[];
  openWhatsNew: (releases: Release[]) => void;
  closeWhatsNew: () => void;

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

  tourOpen: false,
  startTour: () => set({ tourOpen: true }),
  endTour: () => set({ tourOpen: false }),

  updateSettingsOpen: false,
  setUpdateSettingsOpen: (open) => set({ updateSettingsOpen: open }),

  whatsNewOpen: false,
  whatsNewReleases: [],
  openWhatsNew: (releases) => set({ whatsNewOpen: true, whatsNewReleases: releases }),
  closeWhatsNew: () => set({ whatsNewOpen: false }),

  sourceMode: false,
  toggleSourceMode: () => set((s) => ({ sourceMode: !s.sourceMode })),
  focusMode: false,
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  typewriterMode: false,
  toggleTypewriterMode: () => set((s) => ({ typewriterMode: !s.typewriterMode })),
}));
