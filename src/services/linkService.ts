import { openUrl, openPath } from '@tauri-apps/plugin-opener';
import { resolveLinkTarget } from '../lib/linkTarget';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useDocumentStore } from '../stores/documentStore';

/**
 * Follow a markdown link. Resolves the href against the current file and the
 * vault tree (directory links open their index note, extensionless links fall
 * back to `<name>.md`), then routes it: markdown notes open in the editor,
 * other files/folders are handed to the OS, external URLs open in the browser,
 * and links that resolve to a missing vault path surface a not-found notice.
 */
export async function openMarkdownLink(
  href: string,
  fromPath: string | null,
  opts: { newTab?: boolean } = {},
): Promise<void> {
  const tree = useWorkspaceStore.getState().workspace?.tree ?? null;
  const target = resolveLinkTarget(href, fromPath, tree);

  switch (target.kind) {
    case 'external':
      await openUrl(target.href);
      return;
    case 'osfile':
      try {
        await openPath(target.absPath);
      } catch {
        // The file may have moved; nothing useful to do beyond ignoring.
      }
      return;
    case 'dead':
      window.alert(`未找到: ${target.absPath}`);
      return;
    case 'ignore':
      return;
    case 'mdfile': {
      // Unsaved edits survive navigation (the store stashes drafts in memory and
      // restores them on reopen), and a new-tab open never replaces — so route
      // straight through without a save prompt.
      const docStore = useDocumentStore.getState();
      try {
        if (opts.newTab) await docStore.openInNewTab(target.absPath);
        else await docStore.open(target.absPath);
      } catch {
        // Out-of-vault link whose target doesn't actually exist.
        window.alert(`未找到: ${target.absPath}`);
      }
      return;
    }
  }
}
