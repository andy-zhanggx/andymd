import { create } from 'zustand';

interface UIState {
  openFileDialog: boolean;
  setOpenFileDialog: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  openFileDialog: false,
  setOpenFileDialog: (open) => set({ openFileDialog: open }),
}));
