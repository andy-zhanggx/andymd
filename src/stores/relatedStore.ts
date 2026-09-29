import { create } from 'zustand';
import { fsService } from '../services/fsService';
import type { SemanticHit } from '../lib/semantic';
import { dismissKey, pickSuggestions, type LinkSuggestion } from '../lib/related';

/** Similarity a paragraph→note hit needs before we suggest a link. */
export const SUGGEST_THRESHOLD = 0.6;
const MAX_SUGGESTIONS = 3;
const DISMISSED_KEY = 'andymd.dismissedLinkSuggestions';

export type RelatedMode = 'note' | 'section';

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>) {
  try {
    // Keep the newest few thousand; this is a convenience, not a record.
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set].slice(-2000)));
  } catch {
    // Storage unavailable — dismissals last for this session only.
  }
}

interface RelatedState {
  mode: RelatedMode;
  setMode: (m: RelatedMode) => void;
  /** Related notes for `relatedKey` (path + section line). */
  hits: SemanticHit[];
  relatedKey: string | null;
  loading: boolean;
  /** Link suggestions for the caret paragraph of `suggestionsFor`. */
  suggestions: LinkSuggestion[];
  suggestionsFor: string | null;
  dismissed: Set<string>;
  refreshRelated: (root: string, path: string, line: number | null) => Promise<void>;
  refreshSuggestions: (root: string, path: string, paragraph: string, linked: ReadonlySet<string>) => Promise<void>;
  dismiss: (from: string, to: string) => void;
  clear: () => void;
}

let relatedGen = 0;
let suggestGen = 0;

export const useRelatedStore = create<RelatedState>((set, get) => ({
  mode: 'note',
  setMode: (mode) => set({ mode }),
  hits: [],
  relatedKey: null,
  loading: false,
  suggestions: [],
  suggestionsFor: null,
  dismissed: loadDismissed(),

  async refreshRelated(root, path, line) {
    const key = `${path}#${line ?? ''}`;
    const id = ++relatedGen;
    set({ loading: get().relatedKey !== key, relatedKey: key });
    try {
      const res = await fsService.semanticRelated(root, path, line, 20);
      if (id !== relatedGen) return;
      set({ hits: res.hits, loading: false });
    } catch (err) {
      if (id !== relatedGen) return;
      console.warn('related notes failed', err);
      set({ hits: [], loading: false });
    }
  },

  async refreshSuggestions(root, path, paragraph, linked) {
    const id = ++suggestGen;
    const text = paragraph.trim();
    if (text.length < 30) {
      set({ suggestions: [], suggestionsFor: path });
      return;
    }
    try {
      const res = await fsService.semanticSearch(root, text, 12);
      if (id !== suggestGen) return;
      const suggestions = pickSuggestions(res.hits, {
        currentPath: path,
        linked,
        dismissed: get().dismissed,
        threshold: SUGGEST_THRESHOLD,
        max: MAX_SUGGESTIONS,
      });
      set({ suggestions, suggestionsFor: path });
    } catch (err) {
      if (id !== suggestGen) return;
      console.warn('link suggestions failed', err);
      set({ suggestions: [], suggestionsFor: path });
    }
  },

  dismiss(from, to) {
    const dismissed = new Set(get().dismissed);
    dismissed.add(dismissKey(from, to));
    saveDismissed(dismissed);
    set({ dismissed, suggestions: get().suggestions.filter((s) => s.path !== to) });
  },

  clear() {
    relatedGen++;
    suggestGen++;
    set({ hits: [], relatedKey: null, loading: false, suggestions: [], suggestionsFor: null });
  },
}));
