import { create } from 'zustand';
import type { Release } from '../lib/changelog';
import { clampZoom, stepZoom, ZoomMode } from '../lib/zoom';

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

  // Document zoom (Acrobat-style reading modes). `zoomLevel` only applies in
  // 'custom' mode; in 'fit-width' the rendered zoom is `fitWidthZoom`, measured
  // from the scroller by the layout (App) and pushed here.
  zoomMode: ZoomMode;
  zoomLevel: number;
  fitWidthZoom: number;
  /** The zoom actually rendered right now, whichever mode is active. */
  effectiveZoom: () => number;
  setZoomLevel: (level: number) => void;
  zoomStep: (dir: 1 | -1) => void;
  setFitWidth: () => void;
  setFitWidthZoom: (zoom: number) => void;
  actualSize: () => void;
  hydrateZoom: (mode: ZoomMode, level: number) => void;
}

/** Zoom changes worth persisting — pinch spams these, so config saves are debounced. */
export function onZoomChanged(fn: (mode: ZoomMode, level: number) => void): () => void {
  zoomListeners.add(fn);
  return () => zoomListeners.delete(fn);
}
const zoomListeners = new Set<(mode: ZoomMode, level: number) => void>();
function emitZoom(mode: ZoomMode, level: number) {
  zoomListeners.forEach((fn) => fn(mode, level));
}

export const useUIStore = create<UIState>((set, get) => ({
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

  zoomMode: 'custom',
  zoomLevel: 1,
  fitWidthZoom: 1,
  effectiveZoom: () => {
    const s = get();
    return s.zoomMode === 'fit-width' ? s.fitWidthZoom : s.zoomLevel;
  },
  setZoomLevel: (level) => {
    const next = clampZoom(level);
    set({ zoomMode: 'custom', zoomLevel: next });
    emitZoom('custom', next);
  },
  // Stepping out of fit-width starts from the zoom the user is looking at
  // (Acrobat behavior), not from a stale custom level.
  zoomStep: (dir) => {
    const s = get();
    const next = stepZoom(s.effectiveZoom(), dir);
    set({ zoomMode: 'custom', zoomLevel: next });
    emitZoom('custom', next);
  },
  setFitWidth: () => {
    set({ zoomMode: 'fit-width' });
    emitZoom('fit-width', get().zoomLevel);
  },
  setFitWidthZoom: (zoom) => set({ fitWidthZoom: clampZoom(zoom) }),
  actualSize: () => {
    set({ zoomMode: 'custom', zoomLevel: 1 });
    emitZoom('custom', 1);
  },
  hydrateZoom: (mode, level) => set({ zoomMode: mode, zoomLevel: clampZoom(level) }),
}));
