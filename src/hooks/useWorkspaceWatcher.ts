import { useEffect } from 'react';
import { onWorkspaceChanged, type FsEvent } from '../services/fsService';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useDocumentStore } from '../stores/documentStore';

// Paths (per event) that may now hold new content for an open tab.
function changedPaths(ev: FsEvent): string[] {
  switch (ev.kind) {
    case 'modified':
    case 'created':
      return [ev.path];
    case 'renamed':
      return [ev.to];
    default:
      return [];
  }
}

export function useWorkspaceWatcher() {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let timer: number | null = null;
    const fileTimers = new Map<string, number>();

    (async () => {
      try {
        const off = await onWorkspaceChanged((ev) => {
          // Refresh the sidebar tree (debounced across the burst).
          if (timer) window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            useWorkspaceStore.getState().refresh();
          }, 200);

          // If the change hits a file that's open in a tab, reconcile that
          // tab with the disk (debounced per path — editors/sync clients
          // often fire several events per logical write).
          for (const path of changedPaths(ev)) {
            const open = useDocumentStore.getState().tabs.some((t) => t.doc.path === path);
            if (!open) continue;
            const prev = fileTimers.get(path);
            if (prev) window.clearTimeout(prev);
            fileTimers.set(
              path,
              window.setTimeout(() => {
                fileTimers.delete(path);
                void useDocumentStore.getState().checkExternalChange(path);
              }, 200),
            );
          }
        });
        unlisten = off;
      } catch (e) {
        console.warn('workspace watcher not available', e);
      }
    })();

    return () => {
      if (unlisten) unlisten();
      if (timer) window.clearTimeout(timer);
      for (const t of fileTimers.values()) window.clearTimeout(t);
    };
  }, []);
}
