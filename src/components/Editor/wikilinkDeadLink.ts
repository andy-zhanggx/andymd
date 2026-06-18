import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { Node as PMNode } from '@milkdown/prose/model';
import { resolveWikilinkInTree } from '../../lib/wikilink';
import { resolveLinkTarget } from '../../lib/linkTarget';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useDocumentStore } from '../../stores/documentStore';

/**
 * Paints a muted grey-blue "dead link" class on links whose target can't be
 * reached in the current vault, so unreachable links read differently from
 * working ones:
 *   - wikilinks (`[[x]]`, atom nodes)      -> `wikilink-dead`
 *   - markdown links (`[x](y)`, link mark) -> `link-dead`
 *
 * Resolution reuses the same logic as click navigation (`resolveWikilinkInTree`
 * / `resolveLinkTarget`) against the live workspace tree and current file, so a
 * link is only painted dead when clicking it would also fail. Out-of-vault and
 * external links are never flagged. Decorations recompute on edits and whenever
 * the vault tree changes, so links flip dead/alive without a manual reload.
 */

const key = new PluginKey<DecorationSet>('andymd-dead-link');

function vaultContext() {
  const tree = useWorkspaceStore.getState().workspace?.tree ?? null;
  const fromPath = useDocumentStore.getState().doc?.path ?? null;
  return { tree, fromPath };
}

function isDeadWikilink(target: string): boolean {
  const { tree, fromPath } = vaultContext();
  if (!tree) return false; // no vault context — don't flag anything
  return resolveWikilinkInTree(target, tree, fromPath) === null;
}

function isDeadMarkdownLink(href: string): boolean {
  const { tree, fromPath } = vaultContext();
  if (!tree) return false;
  return resolveLinkTarget(href, fromPath, tree).kind === 'dead';
}

function computeDecorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'wikilink') {
      if (isDeadWikilink(node.attrs.target as string)) {
        decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'wikilink-dead' }));
      }
      return;
    }
    if (node.isText) {
      const link = node.marks.find((m) => m.type.name === 'link');
      const href = link?.attrs.href as string | undefined;
      if (href && isDeadMarkdownLink(href)) {
        decos.push(Decoration.inline(pos, pos + node.nodeSize, { class: 'link-dead' }));
      }
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
