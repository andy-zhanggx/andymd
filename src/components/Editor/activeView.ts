import type { EditorView } from '@milkdown/prose/view';

/**
 * Module-level handle to the currently mounted editor's ProseMirror view.
 * Lets non-React code (keyboard shortcuts, menu actions) reach the editor
 * without prop-drilling. Set by MarkdownEditor on mount/unmount.
 */
let active: EditorView | null = null;

export function setActiveView(view: EditorView | null): void {
  active = view;
}

export function getActiveView(): EditorView | null {
  return active;
}
