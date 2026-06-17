// Builders for remote presence rendering, passed to the collab plugin's
// yCursorOpts. y-prosemirror calls `cursorBuilder(user)` to make the caret DOM
// and `selectionBuilder(user)` to style the highlighted range, where `user` is
// the awareness `user` field we set in collabSession ({ name, color }).
import type { DecorationAttrs } from '@milkdown/prose/view';
import type { CollabUser } from './identity';

const FALLBACK_COLOR = '#0091ff';

/** Colored caret with a floating name label (Google-Docs style). */
export function cursorBuilder(user: Partial<CollabUser> | undefined): HTMLElement {
  const color = user?.color || FALLBACK_COLOR;
  const name = user?.name || 'Anonymous';

  const caret = document.createElement('span');
  caret.classList.add('collab-caret');
  caret.setAttribute('style', `border-color: ${color}`);

  const label = document.createElement('span');
  label.classList.add('collab-caret-label');
  label.setAttribute('style', `background-color: ${color}`);
  label.textContent = name;

  caret.appendChild(label);
  return caret;
}

/** Translucent selection highlight in the user's color. */
export function selectionBuilder(user: Partial<CollabUser> | undefined): DecorationAttrs {
  const color = user?.color || FALLBACK_COLOR;
  return {
    style: `background-color: ${hexToRgba(color, 0.25)}`,
    class: 'collab-selection',
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
