// Zoom model shared by the editor, status bar, shortcuts, and pinch gesture.
// Levels are multipliers: 1 = 100%. Aligned with Acrobat/browser conventions.

import type { EditorWidth } from '../types';

export type ZoomMode = 'custom' | 'fit-width';

/** Content column width per editorWidth setting; null = fluid ("full"). */
export const EDITOR_COLUMN_WIDTH: Record<EditorWidth, number | null> = {
  narrow: 620,
  normal: 740,
  wide: 920,
  full: null,
};

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;

/** Preset ladder for ⌘+/⌘− stepping and the status-bar popover (percent). */
export const ZOOM_PRESETS = [
  25, 33, 50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400,
] as const;

export function clampZoom(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, level));
}

/**
 * Next ladder stop in the given direction from an arbitrary level (pinch can
 * leave us between stops). A small epsilon keeps 100% → 110% from getting
 * stuck when the current level is 99.999…% after float math.
 */
export function stepZoom(level: number, dir: 1 | -1): number {
  const pct = level * 100;
  const eps = 0.5;
  if (dir === 1) {
    for (const p of ZOOM_PRESETS) {
      if (p > pct + eps) return p / 100;
    }
    return ZOOM_MAX;
  }
  for (let i = ZOOM_PRESETS.length - 1; i >= 0; i--) {
    const p = ZOOM_PRESETS[i];
    if (p < pct - eps) return p / 100;
  }
  return ZOOM_MIN;
}

/**
 * Acrobat's Fit Width: zoom so a fixed content column fills the pane. A fluid
 * column (`columnWidth === null`, editorWidth "full") already fills — zoom 1.
 */
export function fitWidthZoom(scrollerWidth: number, columnWidth: number | null): number {
  if (columnWidth === null || columnWidth <= 0 || scrollerWidth <= 0) return 1;
  return clampZoom(scrollerWidth / columnWidth);
}

export function formatZoom(level: number): string {
  return `${Math.round(level * 100)}%`;
}
