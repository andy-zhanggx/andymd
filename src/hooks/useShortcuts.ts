import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useDocumentStore } from '../stores/documentStore';
import { useConfigStore } from '../stores/configStore';
import { dialogService } from '../services/dialogService';
import { useWorkspaceStore } from '../stores/workspaceStore';

async function saveDocument() {
  const docStore = useDocumentStore.getState();

  try {
    await docStore.save();
  } catch (err) {
    if ((err as Error).message === 'EXTERNAL_MODIFIED') {
      window.alert('This file has been modified externally. Use Save As to keep your changes.');
    } else {
      console.error(err);
    }
  }
}

export async function handleMenuAction(id: string) {
  const doc = useDocumentStore.getState();
  const ws = useWorkspaceStore.getState();
  const cfg = useConfigStore.getState();

  switch (id) {
    case 'new':
      doc.newDraft();
      break;
    case 'open': {
      const file = await dialogService.pickMarkdownFile();
      if (file) await doc.open(file);
      break;
    }
    case 'open-workspace': {
      const dir = await dialogService.pickWorkspaceDir();
      if (dir) await ws.open(dir);
      break;
    }
    case 'save':
      await saveDocument();
      break;
    case 'save-as':
      await doc.saveAs();
      break;
    case 'close':
      await doc.closeWithConfirmation();
      break;
    case 'toggle-sidebar':
      await cfg.update({ showSidebar: !cfg.config.showSidebar });
      break;
  }
}

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
          if (e.shiftKey) await docStore.saveAs();
          else await saveDocument();
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

    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        unlisten = await listen<string>('menu', async (e) => {
          await handleMenuAction(e.payload);
        });
      } catch (e) {
        console.warn('menu event listener not available', e);
      }
    })();

    return () => {
      window.removeEventListener('keydown', handler);
      unlisten?.();
    };
  }, []);
}
