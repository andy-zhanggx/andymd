import { useEffect } from 'react';
import type { EditorView } from '@milkdown/prose/view';
import { useConfigStore } from '../stores/configStore';
import { useDocumentStore } from '../stores/documentStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useSemanticStore } from '../stores/semanticStore';
import { useRelatedStore } from '../stores/relatedStore';
import { getActiveView } from '../components/Editor/activeView';
import { sectionLine } from '../lib/related';
import { resolveVaultFile } from '../lib/wikilink';
import { resolveLinkTarget } from '../lib/linkTarget';

const DEBOUNCE_MS = 700;

/** Headings before the caret (0-based index of the caret's section; -1 before the first). */
function caretHeadingIndex(view: EditorView): number {
  const at = view.state.selection.from;
  let index = -1;
  view.state.doc.descendants((node, pos) => {
    if (pos >= at) return false;
    if (node.type.name === 'heading') index++;
    return true;
  });
  return index;
}

function caretParagraph(view: EditorView): string {
  const { $from } = view.state.selection;
  return $from.parent.isTextblock && $from.parent.type.name !== 'code_block' ? $from.parent.textContent : '';
}

/** Vault paths this note already links to (wikilinks, embeds, Markdown links). */
function linkedPaths(view: EditorView, fromPath: string): Set<string> {
  const tree = useWorkspaceStore.getState().workspace?.tree;
  const out = new Set<string>();
  if (!tree) return out;
  view.state.doc.descendants((node) => {
    if (node.type.name === 'wikilink') {
      const p = resolveVaultFile(node.attrs.target as string, tree, fromPath);
      if (p) out.add(p);
    } else if (node.type.name === 'wiki_embed') {
      const p = resolveVaultFile(String(node.attrs.value).split('|')[0], tree, fromPath);
      if (p) out.add(p);
    } else if (node.isText) {
      const href = node.marks.find((m) => m.type.name === 'link')?.attrs.href as string | undefined;
      if (href) {
        const t = resolveLinkTarget(href, fromPath, tree);
        if (t.kind === 'mdfile') out.add(t.absPath);
      }
    }
    return true;
  });
  return out;
}

/**
 * Keeps the Related panel's data fresh while semantic search is on: related
 * notes follow the open note (and, in section mode, the caret's section);
 * link suggestions follow the caret's paragraph. Everything is debounced and
 * reads vectors already in the index, except the one paragraph query.
 */
export function useRelatedAutoRefresh() {
  const enabled = useConfigStore((s) => s.config.semanticSearch);
  const status = useSemanticStore((s) => s.status);
  const root = useWorkspaceStore((s) => s.workspace?.root ?? null);
  const path = useDocumentStore((s) => s.doc?.path ?? null);
  const savedContent = useDocumentStore((s) => s.doc?.content ?? null);
  const mode = useRelatedStore((s) => s.mode);
  const ready = enabled && status.phase === 'ready' && status.root === root && !!root;

  useEffect(() => {
    const store = useRelatedStore.getState();
    if (!ready || !root || !path) {
      store.clear();
      return;
    }
    let timer: number | null = null;
    let lastSection: number | null = null;
    let lastParagraph: string | null = null;

    const run = (force: boolean) => {
      const view = getActiveView();
      const draft = useDocumentStore.getState().doc?.draft ?? '';
      if (mode === 'section') {
        const idx = view ? caretHeadingIndex(view) : -1;
        if (force || idx !== lastSection) {
          lastSection = idx;
          void store.refreshRelated(root, path, sectionLine(draft, idx));
        }
      } else if (force) {
        void store.refreshRelated(root, path, null);
      }
      if (view) {
        const paragraph = caretParagraph(view);
        if (force || paragraph !== lastParagraph) {
          lastParagraph = paragraph;
          void store.refreshSuggestions(root, path, paragraph, linkedPaths(view, path));
        }
      }
    };
    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => run(false), DEBOUNCE_MS);
    };

    run(true);
    document.addEventListener('selectionchange', schedule);
    const unsub = useDocumentStore.subscribe((s, prev) => {
      if (s.doc?.draft !== prev.doc?.draft) schedule();
    });
    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('selectionchange', schedule);
      unsub();
    };
    // `savedContent`: a save re-embeds the note, so re-ask once it lands.
  }, [ready, root, path, mode, savedContent]);
}
