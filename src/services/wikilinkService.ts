import { fsService } from './fsService';
import { resolveWikilinkInTree } from '../lib/wikilink';
import { useDocumentStore } from '../stores/documentStore';
import { useWorkspaceStore } from '../stores/workspaceStore';

/**
 * Resolve a wikilink target against the vault containing the current file
 * (or the open workspace) and open the matching note. Prompts to save if
 * the current document has unsaved changes.
 */
export async function openWikilink(target: string, fromPath: string | null): Promise<void> {
  const ws = useWorkspaceStore.getState().workspace;
  const rootDir = fromPath ? await fsService.findVaultRoot(fromPath) : ws?.root;
  if (!rootDir) return;

  const tree =
    ws && ws.root === rootDir ? ws.tree : await fsService.listWorkspace(rootDir, false);
  const resolved = resolveWikilinkInTree(target, tree, fromPath);
  if (!resolved) {
    window.alert(`未找到笔记: ${target}`);
    return;
  }

  // Unsaved edits aren't lost on navigation — they're kept in memory and
  // restored when the file is reopened — so just open the target.
  await useDocumentStore.getState().open(resolved);
}
