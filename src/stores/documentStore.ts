import { create } from 'zustand';
import { Document } from '../types';
import { fsService } from '../services/fsService';
import { dialogService } from '../services/dialogService';
import { useWorkspaceStore } from './workspaceStore';
import { lenifyHeadings } from '../lib/markdown';
import { uniqueChildName } from '../lib/workspacePath';
import { useConfigStore } from './configStore';
import { versionService } from '../services/versionService';

interface DocumentState {
  doc: Document | null;
  /**
   * Browser-style navigation history of opened file paths. `historyIndex` is
   * the current position; entries after it are the "forward" stack. Lets link
   * jumps (and any open()) be retraced with back()/forward().
   */
  history: string[];
  historyIndex: number;
  open: (path: string) => Promise<void>;
  back: () => Promise<void>;
  forward: () => Promise<void>;
  newFile: () => Promise<void>;
  newDraft: () => void;
  setDraft: (draft: string) => void;
  save: () => Promise<void>;
  saveAs: () => Promise<void>;
  reload: () => Promise<void>;
  close: () => void;
  closeWithConfirmation: () => Promise<boolean>;
}

function emptyDraft(): Document {
  return {
    path: null,
    content: '',
    draft: '',
    isDirty: false,
    mtime: 0,
    encoding: 'utf-8',
  };
}

// Read a file from disk and make it the open document. Shared by open() and the
// history navigators (back/forward) so they load identically; only open() also
// pushes onto the navigation history.
async function loadDoc(
  set: (partial: Partial<DocumentState>) => void,
  path: string,
): Promise<void> {
  const { content: raw, mtime } = await fsService.readFile(path);
  const content = lenifyHeadings(raw);
  set({
    doc: { path, content, draft: content, isDirty: false, mtime, encoding: 'utf-8' },
  });
  // Make the sidebar (namespace) follow the file's vault. Never let a
  // workspace-follow failure prevent the document from opening.
  try {
    await useWorkspaceStore.getState().followFile(path);
  } catch {
    // ignore — the document is already open
  }
  // Best-effort: recording recents persists config; never let it surface.
  void useConfigStore.getState().addRecentFile(path).catch(() => {});
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  doc: null,
  history: [],
  historyIndex: -1,

  async open(path) {
    // Record into history before loading. Re-opening the already-current path
    // (e.g. clicking a link to the current note) reloads without a new entry.
    // Opening anything else truncates the forward stack, like a browser.
    const { history, historyIndex } = get();
    if (history[historyIndex] !== path) {
      const trimmed = history.slice(0, historyIndex + 1);
      trimmed.push(path);
      set({ history: trimmed, historyIndex: trimmed.length - 1 });
    }
    await loadDoc(set, path);
  },

  async back() {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const idx = historyIndex - 1;
    set({ historyIndex: idx });
    await loadDoc(set, history[idx]);
  },

  async forward() {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const idx = historyIndex + 1;
    set({ historyIndex: idx });
    await loadDoc(set, history[idx]);
  },

  // Create a real, editable file. Inside a workspace this writes an
  // `Untitled.md` (deduped) into the workspace root and opens it, so it shows
  // up in the sidebar immediately — mirroring how Obsidian's ⌘N works. With no
  // workspace open, fall back to an in-memory draft.
  async newFile() {
    const ws = useWorkspaceStore.getState();
    if (!ws.workspace) {
      get().newDraft();
      return;
    }
    const root = ws.workspace.root;
    const name = uniqueChildName(ws.workspace.tree.children, 'Untitled', 'md');
    try {
      const node = await ws.createFile(root, name);
      await get().open(node.path);
    } catch (e) {
      console.error('newFile failed; falling back to draft', e);
      get().newDraft();
    }
  },

  newDraft() {
    set({ doc: emptyDraft() });
  },

  setDraft(draft) {
    const d = get().doc;
    if (!d) return;
    set({ doc: { ...d, draft, isDirty: draft !== d.content } });
  },

  async save() {
    const d = get().doc;
    if (!d) return;
    if (!d.path) {
      return get().saveAs();
    }
    try {
      const fresh = await fsService.readFile(d.path);
      if (fresh.mtime > d.mtime && fresh.content !== d.content) {
        throw new Error('EXTERNAL_MODIFIED');
      }
    } catch (e) {
      if ((e as Error).message === 'EXTERNAL_MODIFIED') throw e;
      // file may have been deleted; proceed to write
    }
    const { mtime } = await fsService.writeFile(d.path, d.draft);
    set({ doc: { ...d, content: d.draft, isDirty: false, mtime } });
    void versionService.save(d.path, d.draft);
  },

  async saveAs() {
    const d = get().doc;
    if (!d) return;
    const defaultName = d.path?.split('/').pop() ?? 'Untitled.md';
    const target = await dialogService.saveMarkdownAs(defaultName);
    if (!target) return;
    const { mtime } = await fsService.writeFile(target, d.draft);
    set({ doc: { ...d, path: target, content: d.draft, isDirty: false, mtime } });
    void versionService.save(target, d.draft);
  },

  async reload() {
    const d = get().doc;
    if (!d?.path) return;
    const { content: raw, mtime } = await fsService.readFile(d.path);
    const content = lenifyHeadings(raw);
    set({ doc: { path: d.path, content, draft: content, isDirty: false, mtime, encoding: 'utf-8' } });
  },

  close() {
    set({ doc: null });
  },

  async closeWithConfirmation() {
    const d = get().doc;
    if (!d) return true;
    if (!d.isDirty) { set({ doc: null }); return true; }
    const name = d.path?.split('/').pop() ?? 'Untitled';
    const ans = window.confirm(`Save changes to ${name} before closing?`);
    if (ans) {
      try { await get().save(); } catch { return false; }
    }
    set({ doc: null });
    return true;
  },
}));

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__docStore = useDocumentStore;
}
