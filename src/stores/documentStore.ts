import { create } from 'zustand';
import { Document } from '../types';
import { fsService } from '../services/fsService';
import { dialogService } from '../services/dialogService';
import { useWorkspaceStore } from './workspaceStore';
import { lenifyHeadings } from '../lib/markdown';
import { uniqueChildName } from '../lib/workspacePath';
import { useConfigStore } from './configStore';
import { versionService } from '../services/versionService';
import { MULTI_TABS } from '../featureFlags';

/**
 * A single editor tab. Each tab owns its own document buffer and its own
 * browser-style navigation history, so back/forward stay independent per tab.
 */
export interface Tab {
  id: string;
  doc: Document;
  history: string[];
  historyIndex: number;
}

interface DocumentState {
  tabs: Tab[];
  activeId: string | null;
  /**
   * Live projection of the ACTIVE tab. Kept in sync on every mutation so the
   * many consumers that read `doc` / `history` / `historyIndex` need no change
   * when we went from a single document to a list of tabs.
   */
  doc: Document | null;
  history: string[];
  historyIndex: number;

  open: (path: string) => Promise<void>;
  openInNewTab: (path: string) => Promise<void>;
  newTab: () => void;
  closeTab: (id: string) => Promise<void>;
  activateTab: (id: string) => void;
  moveTab: (from: number, to: number) => void;
  cycleTab: (delta: number) => void;
  restoreTabs: (paths: string[], activePath: string | null) => Promise<void>;
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

let tabSeq = 0;
function nextId(): string {
  tabSeq += 1;
  return `t${tabSeq}`;
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

function makeTab(doc: Document): Tab {
  // A real file seeds a one-entry history; an unsaved draft has none to navigate.
  const history = doc.path ? [doc.path] : [];
  return { id: nextId(), doc, history, historyIndex: history.length - 1 };
}

// Read a file from disk into a fresh Document (no store mutation).
async function readDocument(path: string): Promise<Document> {
  const { content: raw, mtime } = await fsService.readFile(path);
  const content = lenifyHeadings(raw);
  return { path, content, draft: content, isDirty: false, mtime, encoding: 'utf-8' };
}

// Side effects after a file becomes visible: make the sidebar follow its vault,
// and record it in the recent-files list. Both are best-effort.
function afterOpen(path: string): void {
  void useWorkspaceStore.getState().followFile(path).catch(() => {});
  void useConfigStore.getState().addRecentFile(path).catch(() => {});
}

// Project the active tab's fields onto the top-level convenience getters.
function project(tabs: Tab[], activeId: string | null): Pick<DocumentState, 'doc' | 'history' | 'historyIndex'> {
  const active = tabs.find((t) => t.id === activeId);
  return active
    ? { doc: active.doc, history: active.history, historyIndex: active.historyIndex }
    : { doc: null, history: [], historyIndex: -1 };
}

export const useDocumentStore = create<DocumentState>((set, get) => {
  // Commit a new tab list (+ active id) and refresh the projection in one go.
  const commit = (tabs: Tab[], activeId: string | null) => {
    set({ tabs, activeId, ...project(tabs, activeId) });
  };

  // Replace the active tab in-place with a transformed copy.
  const patchActive = (fn: (tab: Tab) => Tab) => {
    const { tabs, activeId } = get();
    const idx = tabs.findIndex((t) => t.id === activeId);
    if (idx < 0) return;
    const next = tabs.slice();
    next[idx] = fn(tabs[idx]);
    commit(next, activeId);
  };

  // Persist the open-tab session (saved files only) so a relaunch can restore it.
  // No-op while the feature is gated off, to keep the config clean for single-doc
  // users.
  const persist = () => {
    if (!MULTI_TABS) return;
    const { tabs, activeId } = get();
    const openTabs = tabs.map((t) => t.doc.path).filter((p): p is string => !!p);
    const active = tabs.find((t) => t.id === activeId);
    void useConfigStore
      .getState()
      .update({ openTabs, activeTabPath: active?.doc.path ?? null })
      .catch(() => {});
  };

  // Prompt before discarding unsaved edits in the active tab. Returns false to
  // abort the pending action (e.g. a save failed); true means proceed.
  const confirmDiscardActive = async (): Promise<boolean> => {
    const active = get().tabs.find((t) => t.id === get().activeId);
    if (!active || !active.doc.isDirty) return true;
    const name = active.doc.path?.split('/').pop() ?? 'Untitled';
    if (window.confirm(`Save changes to ${name} before replacing it?`)) {
      try {
        await get().save();
      } catch {
        return false;
      }
    }
    return true;
  };

  return {
    tabs: [],
    activeId: null,
    doc: null,
    history: [],
    historyIndex: -1,

    async open(path) {
      const { tabs, activeId } = get();
      const active = tabs.find((t) => t.id === activeId);

      // Re-opening the path already shown in the active tab: reload it from disk
      // without touching history or spawning a tab (matches the old behaviour).
      if (active && active.doc.path === path) {
        const doc = await readDocument(path);
        patchActive((t) => ({ ...t, doc }));
        afterOpen(path);
        return;
      }

      // Already open elsewhere → just surface that tab; never duplicate a file.
      const other = tabs.find((t) => t.doc.path === path);
      if (other) {
        get().activateTab(other.id);
        return;
      }

      // No active tab yet → this becomes the first tab.
      if (!active) {
        const tab = makeTab(await readDocument(path));
        commit([...tabs, tab], tab.id);
        afterOpen(path);
        persist();
        return;
      }

      // Replace the active tab, guarding against clobbering unsaved work, and
      // push the path onto that tab's history like a browser navigation.
      if (!(await confirmDiscardActive())) return;
      const doc = await readDocument(path);
      patchActive((t) => {
        const trimmed = t.history.slice(0, t.historyIndex + 1);
        trimmed.push(path);
        return { ...t, doc, history: trimmed, historyIndex: trimmed.length - 1 };
      });
      afterOpen(path);
      persist();
    },

    async openInNewTab(path) {
      const existing = get().tabs.find((t) => t.doc.path === path);
      if (existing) {
        get().activateTab(existing.id);
        return;
      }
      const tab = makeTab(await readDocument(path));
      commit([...get().tabs, tab], tab.id);
      afterOpen(path);
      persist();
    },

    newTab() {
      const tab = makeTab(emptyDraft());
      commit([...get().tabs, tab], tab.id);
      persist();
    },

    async closeTab(id) {
      const { tabs } = get();
      const idx = tabs.findIndex((t) => t.id === id);
      if (idx < 0) return;
      const tab = tabs[idx];
      if (tab.doc.isDirty) {
        const name = tab.doc.path?.split('/').pop() ?? 'Untitled';
        if (window.confirm(`Save changes to ${name} before closing?`)) {
          // Save the target tab; if it isn't active, activate it first so save()
          // operates on the right document, then restore focus afterwards.
          const wasActive = get().activeId;
          if (wasActive !== id) get().activateTab(id);
          try {
            await get().save();
          } catch {
            return; // keep the tab open if the save failed
          }
          if (wasActive !== id && get().tabs.some((t) => t.id === wasActive)) {
            get().activateTab(wasActive!);
          }
        }
      }
      const remaining = get().tabs.filter((t) => t.id !== id);
      let nextActive = get().activeId;
      if (nextActive === id) {
        // Focus the neighbour that took this tab's slot (or the new last tab).
        nextActive = remaining.length ? remaining[Math.min(idx, remaining.length - 1)].id : null;
      }
      commit(remaining, nextActive);
      persist();
    },

    activateTab(id) {
      if (!get().tabs.some((t) => t.id === id)) return;
      commit(get().tabs, id);
      // Make the sidebar follow the now-active file, but don't churn the recent
      // list just for switching tabs.
      const active = get().tabs.find((t) => t.id === id);
      if (active?.doc.path) {
        void useWorkspaceStore.getState().followFile(active.doc.path).catch(() => {});
      }
      persist();
    },

    moveTab(from, to) {
      const tabs = get().tabs.slice();
      if (from < 0 || from >= tabs.length || to < 0 || to >= tabs.length) return;
      const [moved] = tabs.splice(from, 1);
      tabs.splice(to, 0, moved);
      commit(tabs, get().activeId);
      persist();
    },

    cycleTab(delta) {
      const { tabs, activeId } = get();
      if (tabs.length < 2) return;
      const idx = tabs.findIndex((t) => t.id === activeId);
      const nextIdx = (idx + delta + tabs.length) % tabs.length;
      get().activateTab(tabs[nextIdx].id);
    },

    async restoreTabs(paths, activePath) {
      const tabs: Tab[] = [];
      for (const p of paths) {
        try {
          tabs.push(makeTab(await readDocument(p)));
        } catch {
          // skip files that have since moved or been deleted
        }
      }
      if (tabs.length === 0) return;
      const active = tabs.find((t) => t.doc.path === activePath) ?? tabs[tabs.length - 1];
      commit(tabs, active.id);
      if (active.doc.path) {
        void useWorkspaceStore.getState().followFile(active.doc.path).catch(() => {});
      }
    },

    async back() {
      const active = get().tabs.find((t) => t.id === get().activeId);
      if (!active || active.historyIndex <= 0) return;
      const idx = active.historyIndex - 1;
      const doc = await readDocument(active.history[idx]);
      patchActive((t) => ({ ...t, doc, historyIndex: idx }));
    },

    async forward() {
      const active = get().tabs.find((t) => t.id === get().activeId);
      if (!active || active.historyIndex >= active.history.length - 1) return;
      const idx = active.historyIndex + 1;
      const doc = await readDocument(active.history[idx]);
      patchActive((t) => ({ ...t, doc, historyIndex: idx }));
    },

    // Create a real, editable file. Inside a workspace this writes an
    // `Untitled.md` (deduped) into the workspace root and opens it in a new tab,
    // so it shows up in the sidebar immediately — mirroring Obsidian's ⌘N. With
    // no workspace open, fall back to an in-memory draft tab.
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
        // New tab when tabs are on; replace the single document when gated off.
        if (MULTI_TABS) await get().openInNewTab(node.path);
        else await get().open(node.path);
      } catch (e) {
        console.error('newFile failed; falling back to draft', e);
        get().newDraft();
      }
    },

    newDraft() {
      const { tabs, activeId } = get();
      const active = tabs.find((t) => t.id === activeId);
      // With tabs gated off, a draft replaces the single open document instead
      // of stacking an invisible extra tab.
      if (!MULTI_TABS && active) {
        patchActive((t) => ({ ...t, doc: emptyDraft(), history: [], historyIndex: -1 }));
        persist();
        return;
      }
      const tab = makeTab(emptyDraft());
      commit([...tabs, tab], tab.id);
      persist();
    },

    setDraft(draft) {
      patchActive((t) => ({ ...t, doc: { ...t.doc, draft, isDirty: draft !== t.doc.content } }));
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
      patchActive((t) => ({ ...t, doc: { ...t.doc, content: t.doc.draft, isDirty: false, mtime } }));
      void versionService.save(d.path, d.draft);
    },

    async saveAs() {
      const d = get().doc;
      if (!d) return;
      const defaultName = d.path?.split('/').pop() ?? 'Untitled.md';
      const target = await dialogService.saveMarkdownAs(defaultName);
      if (!target) return;
      const { mtime } = await fsService.writeFile(target, d.draft);
      patchActive((t) => ({
        ...t,
        doc: { ...t.doc, path: target, content: t.doc.draft, isDirty: false, mtime },
      }));
      void versionService.save(target, d.draft);
      persist();
    },

    async reload() {
      const d = get().doc;
      if (!d?.path) return;
      const doc = await readDocument(d.path);
      patchActive((t) => ({ ...t, doc }));
    },

    close() {
      const id = get().activeId;
      if (id) void get().closeTab(id);
    },

    async closeWithConfirmation() {
      const id = get().activeId;
      if (!id) return true;
      await get().closeTab(id);
      return true;
    },
  };
});

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__docStore = useDocumentStore;
}
