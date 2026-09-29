import { fsService } from './fsService';
import { resolveWikilinkInTree, splitWikilinkTarget } from '../lib/wikilink';
import { getActiveView } from '../components/Editor/activeView';
import { revealHeading } from '../components/Editor/reveal';
import { useDocumentStore } from '../stores/documentStore';
import { useWorkspaceStore } from '../stores/workspaceStore';

/**
 * Resolve a wikilink target against the vault containing the current file
 * (or the open workspace) and open the matching note. Prompts to save if
 * the current document has unsaved changes.
 */
export async function openWikilink(
  target: string,
  fromPath: string | null,
  opts: { newTab?: boolean } = {},
): Promise<void> {
  const ws = useWorkspaceStore.getState().workspace;
  const rootDir = fromPath ? await fsService.findVaultRoot(fromPath) : ws?.root;
  if (!rootDir) return;

  const tree =
    ws && ws.root === rootDir ? ws.tree : await fsService.listWorkspace(rootDir, false);
  const resolved = resolveWikilinkInTree(target, tree, fromPath);
  if (!resolved) {
    window.alert(`Note not found: ${target}`);
    return;
  }
  const { heading } = splitWikilinkTarget(target);
  const prevView = getActiveView();

  // `[[#Heading]]` (or a link back into this note) only scrolls.
  if (resolved === fromPath) {
    if (heading) revealHeading(heading, null);
    return;
  }

  // Unsaved edits survive navigation (the store stashes/restores drafts), so
  // open straight through — into a new tab when requested.
  const docStore = useDocumentStore.getState();
  if (opts.newTab) await docStore.openInNewTab(resolved);
  else await docStore.open(resolved);
  if (heading) revealHeading(heading, prevView);
}
