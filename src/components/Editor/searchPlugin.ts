import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { EditorState } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import type { Node as PMNode } from '@milkdown/prose/model';
import { findInText, stepIndex } from '../../lib/search';

export interface Match {
  from: number;
  to: number;
}

export interface SearchState {
  query: string;
  caseSensitive: boolean;
  matches: Match[];
  current: number; // index into matches, or -1
}

const EMPTY: SearchState = { query: '', caseSensitive: false, matches: [], current: -1 };

export const searchKey = new PluginKey<SearchState>('andymd-search');

function computeMatches(doc: PMNode, query: string, caseSensitive: boolean): Match[] {
  const matches: Match[] = [];
  if (!query) return matches;
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (const off of findInText(node.text, query, caseSensitive)) {
        matches.push({ from: pos + off, to: pos + off + query.length });
      }
    }
    return true;
  });
  return matches;
}

/** The ProseMirror plugin that stores match state and paints decorations. */
export const searchPlugin = $prose(
  () =>
    new Plugin<SearchState>({
      key: searchKey,
      state: {
        init: () => EMPTY,
        apply(tr, value) {
          const meta = tr.getMeta(searchKey) as Partial<SearchState> | undefined;
          if (meta) {
            const query = meta.query ?? value.query;
            const caseSensitive = meta.caseSensitive ?? value.caseSensitive;
            const matches = computeMatches(tr.doc, query, caseSensitive);
            let current = meta.current ?? value.current;
            if (current >= matches.length) current = matches.length - 1;
            if (current < 0 && matches.length > 0) current = 0;
            return { query, caseSensitive, matches, current };
          }
          if (tr.docChanged && value.query) {
            const matches = computeMatches(tr.doc, value.query, value.caseSensitive);
            const current = matches.length === 0 ? -1 : Math.min(value.current, matches.length - 1);
            return { ...value, matches, current };
          }
          return value;
        },
      },
      props: {
        decorations(state) {
          const s = searchKey.getState(state);
          if (!s || s.matches.length === 0) return DecorationSet.empty;
          const decos = s.matches.map((m, i) =>
            Decoration.inline(m.from, m.to, {
              class: i === s.current ? 'search-match search-match-current' : 'search-match',
            }),
          );
          return DecorationSet.create(state.doc, decos);
        },
      },
    }),
);

export function getSearchState(state: EditorState): SearchState {
  return searchKey.getState(state) ?? EMPTY;
}

/**
 * Set the active query/case mode, (re)compute matches, and reveal the first
 * one. Does not steal focus, so it is safe to call on every keystroke while the
 * user types in the find input.
 */
export function setSearch(view: EditorView, query: string, caseSensitive: boolean): SearchState {
  let tr = view.state.tr.setMeta(searchKey, { query, caseSensitive, current: 0 });
  const matches = computeMatches(tr.doc, query, caseSensitive);
  if (matches.length > 0) {
    const m = matches[0];
    tr = tr.setSelection(TextSelection.create(tr.doc, m.from, m.to)).scrollIntoView();
  }
  view.dispatch(tr);
  return getSearchState(view.state);
}

/** Move to the next/previous match, select it and scroll it into view. */
export function navigate(view: EditorView, dir: 1 | -1): SearchState {
  const s = getSearchState(view.state);
  const next = stepIndex(s.matches.length, s.current, dir);
  if (next < 0) return s;
  const m = s.matches[next];
  const tr = view.state.tr
    .setMeta(searchKey, { current: next })
    .setSelection(TextSelection.create(view.state.doc, m.from, m.to))
    .scrollIntoView();
  view.dispatch(tr);
  view.focus();
  return getSearchState(view.state);
}

/** Replace the currently-highlighted match with `replacement`. */
export function replaceCurrent(view: EditorView, replacement: string): SearchState {
  const s = getSearchState(view.state);
  if (s.current < 0 || !s.matches[s.current]) return s;
  const m = s.matches[s.current];
  const tr = view.state.tr.insertText(replacement, m.from, m.to);
  // Keep the same query so the apply() recompute repaints remaining matches.
  tr.setMeta(searchKey, { query: s.query, caseSensitive: s.caseSensitive, current: s.current });
  view.dispatch(tr);
  return getSearchState(view.state);
}

/** Replace every match with `replacement`. Returns the number replaced. */
export function replaceAll(view: EditorView, replacement: string): number {
  const s = getSearchState(view.state);
  if (s.matches.length === 0) return 0;
  let tr = view.state.tr;
  // Apply from the end so earlier positions stay valid.
  for (let i = s.matches.length - 1; i >= 0; i--) {
    const m = s.matches[i];
    tr = tr.insertText(replacement, m.from, m.to);
  }
  tr.setMeta(searchKey, { query: s.query, caseSensitive: s.caseSensitive, current: -1 });
  view.dispatch(tr);
  return s.matches.length;
}

/** Clear all highlights (e.g. when the find bar closes). */
export function clearSearch(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(searchKey, { query: '', current: -1 }));
}
