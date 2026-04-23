import { useEffect } from 'react';
import { useDocumentStore } from '../stores/documentStore';
import { useConfigStore } from '../stores/configStore';
import { dialogService } from '../services/dialogService';
import { useWorkspaceStore } from '../stores/workspaceStore';

export function useShortcuts() {
  useEffect(() => {
    async function handler(e: KeyboardEvent) {
      if (!e.metaKey) return;

      const key = e.key.toLowerCase();
      const docStore = useDocumentStore.getState();
      const cfgStore = useConfigStore.getState();
      const wsStore = useWorkspaceStore.getState();

      switch (key) {
        case 's':
          e.preventDefault();
          try {
            if (e.shiftKey) await docStore.saveAs();
            else await docStore.save();
          } catch (err) {
            if ((err as Error).message === 'EXTERNAL_MODIFIED') {
              window.alert('This file has been modified externally. Use Save As to keep your changes.');
            } else {
              console.error(err);
            }
          }
          break;
        case 'n':
          e.preventDefault();
          docStore.newDraft();
          break;
        case 'o':
          e.preventDefault();
          if (e.shiftKey) {
            const dir = await dialogService.pickWorkspaceDir();
            if (dir) await wsStore.open(dir);
          } else {
            const f = await dialogService.pickMarkdownFile();
            if (f) await docStore.open(f);
          }
          break;
        case 'w':
          e.preventDefault();
          await docStore.closeWithConfirmation();
          break;
        case 'b': {
          const inEditor = document.activeElement?.closest('.editor-container');
          if (!inEditor) {
            e.preventDefault();
            await cfgStore.update({ showSidebar: !cfgStore.config.showSidebar });
          }
          break;
        }
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
