import type { FileNode } from '../types';
import { fsService } from './fsService';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useDocumentStore } from '../stores/documentStore';
import { useUIStore, type RelinkChoice } from '../stores/uiStore';
import { mapPath, mentionNeedles, rewriteNote, type RelinkContext, type Rename } from '../lib/relink';
import { lenifyHeadings } from '../lib/markdown';
import { isPathInside } from '../lib/workspacePath';

const MD = /\.(md|markdown)$/i;

function mdFilesUnder(tree: FileNode, path: string): string[] {
  const out: string[] = [];
  const walk = (n: FileNode) => {
    if (n.kind === 'file' && MD.test(n.name) && (n.path === path || n.path.startsWith(`${path}/`))) out.push(n.path);
    n.children?.forEach(walk);
  };
  walk(tree);
  return out;
}

function allMdFiles(tree: FileNode): string[] {
  return mdFilesUnder(tree, tree.path);
}

export interface RelinkPlan {
  oldPath: string;
  newPath: string;
  /** Rewritten on-disk text. */
  content: string;
  /** Rewritten unsaved buffer, for an open tab with local edits. */
  draft: string | null;
  changes: number;
}

/** Work out which notes' links a rename breaks and how to fix them. */
export async function planRelink(context: RelinkContext): Promise<RelinkPlan[]> {
  const { root, tree, rename } = context;
  let mentioned: string[];
  try {
    mentioned = await fsService.findFilesMentioning(root, mentionNeedles(rename));
  } catch {
    mentioned = allMdFiles(tree);
  }
  // A moved note's own relative links may break too.
  const candidates = [...new Set([...mentioned, ...mdFilesUnder(tree, rename.from)])];
  const tabs = useDocumentStore.getState().tabs;
  const plans: RelinkPlan[] = [];
  for (const oldPath of candidates) {
    const newPath = mapPath(oldPath, rename);
    let disk: string;
    try {
      disk = (await fsService.readFile(oldPath)).content;
    } catch {
      continue;
    }
    const onDisk = rewriteNote(disk, oldPath, newPath, context);
    const tab = tabs.find((t) => t.doc.path === oldPath);
    const inBuffer = tab?.doc.isDirty ? rewriteNote(tab.doc.draft, oldPath, newPath, context) : null;
    const changes = Math.max(onDisk.changes, inBuffer?.changes ?? 0);
    if (changes > 0) {
      plans.push({ oldPath, newPath, content: onDisk.content, draft: inBuffer?.content ?? null, changes });
    }
  }
  return plans;
}

function askUser(rename: Rename, root: string, plans: RelinkPlan[]): Promise<RelinkChoice> {
  const name = (p: string) => p.split('/').pop() ?? p;
  return new Promise((resolve) => {
    useUIStore.getState().setRelinkPrompt({
      fromName: name(rename.from),
      toName: name(rename.to),
      files: plans.map((p) => ({
        relPath: p.newPath.startsWith(`${root}/`) ? p.newPath.slice(root.length + 1) : p.newPath,
        changes: p.changes,
      })),
      resolve: (choice) => {
        useUIStore.getState().setRelinkPrompt(null);
        resolve(choice);
      },
    });
  });
}

/**
 * Rename/move `from` → `to`, offering to update every link that would
 * otherwise break. Open tabs follow the move either way.
 */
export async function renameWithLinks(from: string, to: string): Promise<void> {
  const ws = useWorkspaceStore.getState().workspace;
  const rename = { from, to };
  let plans: RelinkPlan[] = [];
  if (ws && isPathInside(from, ws.root)) {
    plans = await planRelink({ root: ws.root, tree: ws.tree, rename });
  }
  let update = false;
  if (plans.length && ws) {
    const choice = await askUser(rename, ws.root, plans);
    if (choice === 'cancel') return;
    update = choice === 'update';
  }

  await fsService.renamePath(from, to);
  const docs = useDocumentStore.getState();
  docs.retargetPaths(rename);

  if (update) {
    for (const plan of plans) {
      // Update the open tab before writing, so the watcher's echo of our own
      // write matches its snapshot instead of raising a conflict.
      const tab = useDocumentStore.getState().tabs.find((t) => t.doc.path === plan.newPath);
      if (tab) {
        const content = lenifyHeadings(plan.content);
        docs.replaceBuffer(plan.newPath, content, plan.draft ?? content);
      }
      try {
        await fsService.writeFile(plan.newPath, plan.content);
      } catch (err) {
        console.warn('link update failed for', plan.newPath, err);
      }
    }
  }
  await useWorkspaceStore.getState().refresh();
}
