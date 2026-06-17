import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { Node as PMNode } from '@milkdown/prose/model';
import { resolveWikilinkInTree } from '../../lib/wikilink';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useDocumentStore } from '../../stores/documentStore';

/**
 * Paints a `wikilink-dead` class on any wikilink whose target does not resolve
 * to an existing note in the current vault, so unreachable links read as muted
 * grey-blue dead links instead of looking like working ones.
 *
 * Resolution reuses `resolveWikilinkInTree` (so `./` / `../` relative links and
 * the dead-link verdict stay consistent with click navigation) against the live
 * workspace tree and the current document's path. Decorations recompute on edits
 * and whenever the vault tree changes, so links flip dead/alive without needing
 * a manual reload.
 */

const key = new PluginKey<DecorationSet>('andymd-wikilink-deadlink');

/** True when `target` does not resolve to an existing note in the current vault. */
function isDeadLink(target: string): boolean {
  const tree = useWorkspaceStore.getState().workspace?.tree;
  if (!tree) return false; // no vault context loaded — don't flag anything
  const fromPath = useDocumentStore.getState().doc?.path ?? null;
  return resolveWikilinkInTree(target, tree, fromPath) === null;
}

function computeDecorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'wikilink' && isDeadLink(node.attrs.target as string)) {
      decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'wikilink-dead' }));
    }
  });
  return DecorationSet.create(doc, decos);
}

export const wikilinkDeadLinkPlugin = $prose(
  () =>
    new Plugin<DecorationSet>({
      key,
      state: {
        init: (_config, state) => computeDecorations(state.doc),
        apply(tr, value, _old, newState) {
          if (tr.docChanged || tr.getMeta(key)) return computeDecorations(newState.doc);
          return value;
        },
      },
      props: {
        decorations(state) {
          return key.getState(state);
        },
      },
      view(editorView) {
        // Re-evaluate when the vault tree reference changes (file created /
        // renamed / deleted) so links flip dead/alive without an edit.
        let prevTree = useWorkspaceStore.getState().workspace?.tree;
        const unsub = useWorkspaceStore.subscribe((s) => {
          const tree = s.workspace?.tree;
          if (tree === prevTree) return;
          prevTree = tree;
          editorView.dispatch(editorView.state.tr.setMeta(key, true));
        });
        return { destroy: unsub };
      },
    }),
);
