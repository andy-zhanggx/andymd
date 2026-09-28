import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import {
  detectTrigger,
  fileSuggestions,
  headingSuggestions,
  splitHeadingQuery,
  type Suggestion,
  type Trigger,
} from '../../lib/linkSuggest';
import { flattenFiles, type FlatFile } from '../../lib/quickOpen';
import { parseOutline, type Heading } from '../../lib/outline';
import { resolveWikilinkInTree } from '../../lib/wikilink';
import { fsService } from '../../services/fsService';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useDocumentStore } from '../../stores/documentStore';
import { useLinkSuggestStore } from '../../stores/linkSuggestStore';

/**
 * `[[` autocomplete. While the caret sits in an unfinished `[[query` (or
 * `![[query`), a popup lists matching vault files; `[[note#` switches to that
 * note's headings (`[[#` to this note's). ↑/↓ pick, Enter/Tab insert the
 * wikilink / embed node (swallowing an auto-paired `]]`), Esc dismisses.
 *
 * Keys are caught in the capture phase on the editor's parent element so they
 * win over the Enter/Tab keymaps of the presets.
 */

const key = new PluginKey('andymd-link-suggest');

interface Active {
  trigger: Trigger;
  /** Absolute position of the `[[` / `![[`. */
  from: number;
}

function activeTrigger(view: EditorView): Active | null {
  const { selection } = view.state;
  if (!selection.empty) return null;
  const $from = selection.$from;
  const parent = $from.parent;
  if (!parent.isTextblock || parent.type.spec.code) return null;
  if ($from.marks().some((m) => m.type.name === 'inlineCode')) return null;
  const before = parent.textBetween(0, $from.parentOffset, undefined, '￼');
  const trigger = detectTrigger(before);
  if (!trigger) return null;
  return { trigger, from: $from.start() + trigger.from };
}

let filesCache: { tree: unknown; files: FlatFile[] } | null = null;
function vaultFiles(): FlatFile[] {
  const ws = useWorkspaceStore.getState().workspace;
  if (!ws) return [];
  if (filesCache?.tree !== ws.tree) filesCache = { tree: ws.tree, files: flattenFiles(ws.tree, ws.root) };
  return filesCache.files;
}

const headingCache = new Map<string, Promise<Heading[]>>();
function headingsOf(path: string): Promise<Heading[]> {
  let p = headingCache.get(path);
  if (!p) {
    p = fsService
      .readFile(path)
      .then((r) => parseOutline(r.content))
      .catch(() => []);
    headingCache.set(path, p);
    // Short-lived: a note edited elsewhere gets fresh headings next time.
    setTimeout(() => headingCache.delete(path), 10_000);
  }
  return p;
}

export function insertSuggestion(view: EditorView, item: Suggestion): boolean {
  const act = activeTrigger(view);
  if (!act) return false;
  const { state } = view;
  const to0 = state.selection.from;
  const end = state.selection.$from.end();
  const to = state.doc.textBetween(to0, Math.min(to0 + 2, end)) === ']]' ? to0 + 2 : to0;
  const { nodes } = state.schema;
  const node = act.trigger.embed
    ? nodes.wiki_embed?.create({ value: item.target })
    : nodes.wikilink?.create({ target: item.target, alias: null });
  if (!node) return false;
  view.dispatch(state.tr.replaceWith(act.from, to, node).scrollIntoView());
  view.focus();
  return true;
}

export const linkSuggestPlugin = $prose(
  () =>
    new Plugin({
      key,
      view(view) {
        const store = useLinkSuggestStore.getState;
        let dismissedFrom: number | null = null;
        let lastQuery: string | null = null;
        let req = 0;

        const refresh = () => {
          const act = activeTrigger(view);
          if (!act) {
            dismissedFrom = null;
            lastQuery = null;
            store().close();
            return;
          }
          if (dismissedFrom === act.from) return;
          const { query } = act.trigger;
          const resetActive = query !== lastQuery;
          lastQuery = query;
          let coords = { left: 0, bottom: 0 };
          try {
            coords = view.coordsAtPos(act.from);
          } catch {
            // Detached / not laid out (tests) — keep the origin.
          }
          const place = { x: coords.left, y: coords.bottom };
          const id = ++req;

          const hq = splitHeadingQuery(query);
          if (!hq) {
            store().show({ items: fileSuggestions(vaultFiles(), query), loading: false, resetActive, ...place });
            return;
          }
          const [notePart, headingQuery] = hq;
          const doc = useDocumentStore.getState().doc;
          const tree = useWorkspaceStore.getState().workspace?.tree;
          const path = notePart.trim()
            ? tree
              ? resolveWikilinkInTree(notePart, tree, doc?.path ?? null)
              : null
            : (doc?.path ?? '');
          if (path === null) {
            store().show({ items: [], loading: false, resetActive, ...place });
            return;
          }
          // The open note: use the live buffer, not what's on disk.
          if (!notePart.trim() || path === doc?.path) {
            const hs = parseOutline(doc?.draft ?? '');
            store().show({ items: headingSuggestions(notePart, hs, headingQuery), loading: false, resetActive, ...place });
            return;
          }
          store().show({ items: [], loading: true, resetActive, ...place });
          void headingsOf(path).then((hs) => {
            if (id !== req) return;
            store().show({
              items: headingSuggestions(notePart, hs, headingQuery),
              loading: false,
              resetActive: false,
              ...place,
            });
          });
        };

        store().setController({
          accept: (i) => {
            const item = store().items[i];
            if (item) insertSuggestion(view, item);
            store().close();
          },
          dismiss: () => {
            dismissedFrom = activeTrigger(view)?.from ?? null;
            store().close();
          },
        });

        const onKey = (e: KeyboardEvent) => {
          const s = store();
          if (!s.open || e.isComposing) return;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            s.move(e.key === 'ArrowDown' ? 1 : -1);
          } else if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && s.items.length) {
            s.controller?.accept(s.active);
          } else if (e.key === 'Escape') {
            s.controller?.dismiss();
          } else {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
        };
        const host = view.dom.parentElement ?? view.dom;
        host.addEventListener('keydown', onKey, true);
        const onBlur = () => store().close();
        view.dom.addEventListener('blur', onBlur);

        return {
          update: refresh,
          destroy: () => {
            host.removeEventListener('keydown', onKey, true);
            view.dom.removeEventListener('blur', onBlur);
            store().close();
            store().setController(null);
          },
        };
      },
    }),
);
