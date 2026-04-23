import { useEffect } from 'react';
import { onWorkspaceChanged } from '../services/fsService';
import { useWorkspaceStore } from '../stores/workspaceStore';

export function useWorkspaceWatcher() {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let timer: number | null = null;

    (async () => {
      try {
        const off = await onWorkspaceChanged(() => {
          if (timer) window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            useWorkspaceStore.getState().refresh();
          }, 200);
        });
        unlisten = off;
      } catch (e) {
        console.warn('workspace watcher not available', e);
      }
    })();

    return () => {
      if (unlisten) unlisten();
      if (timer) window.clearTimeout(timer);
    };
  }, []);
}
