import { create } from 'zustand';
import { Document } from '../types';
import { fsService } from '../services/fsService';
import { dialogService } from '../services/dialogService';
import { lenifyHeadings } from '../lib/markdown';

interface DocumentState {
  doc: Document | null;
  open: (path: string) => Promise<void>;
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

export const useDocumentStore = create<DocumentState>((set, get) => ({
  doc: null,

  async open(path) {
    const { content: raw, mtime } = await fsService.readFile(path);
    const content = lenifyHeadings(raw);
    set({
      doc: { path, content, draft: content, isDirty: false, mtime, encoding: 'utf-8' },
    });
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
  },

  async saveAs() {
    const d = get().doc;
    if (!d) return;
    const defaultName = d.path?.split('/').pop() ?? 'Untitled.md';
    const target = await dialogService.saveMarkdownAs(defaultName);
    if (!target) return;
    const { mtime } = await fsService.writeFile(target, d.draft);
    set({ doc: { ...d, path: target, content: d.draft, isDirty: false, mtime } });
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
