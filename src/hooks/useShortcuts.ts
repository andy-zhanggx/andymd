import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useDocumentStore } from '../stores/documentStore';
import { useConfigStore } from '../stores/configStore';
import { dialogService } from '../services/dialogService';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useUIStore } from '../stores/uiStore';
import { getActiveView } from '../components/Editor/activeView';
import { navigate } from '../components/Editor/searchPlugin';
import { fsService } from '../services/fsService';
import { buildExportHtml } from '../lib/exportHtml';
import { openWhatsNewForCurrent } from '../lib/whatsNew';
import { invoke } from '@tauri-apps/api/core';

// Inside a workspace, open the in-app file selector (which also creates new
// files); otherwise fall back to the native file picker.
async function chooseFileToOpen() {
  if (useWorkspaceStore.getState().workspace) {
    useUIStore.getState().setOpenFileDialog(true);
    return;
  }
  const file = await dialogService.pickMarkdownFile();
  if (file) await useDocumentStore.getState().open(file);
}

function baseName(path: string | null): string {
  if (!path) return 'Untitled';
  return (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '');
}

async function exportPandoc(to: string, ext: string) {
  const doc = useDocumentStore.getState().doc;
  if (!doc) return;
  const base = baseName(doc.path);
  const target = await dialogService.saveExportAs(`${base}.${ext}`, ext);
  if (!target) return;
  try {
    await invoke('export_via_pandoc', { markdown: doc.draft, to, outPath: target });
  } catch (e) {
    window.alert(`Export failed: ${e}`);
  }
}

async function exportToHtml() {
  const doc = useDocumentStore.getState().doc;
  if (!doc) return;
  const view = getActiveView();
  if (!view) {
    window.alert('Switch off Source Code Mode to export.');
    return;
  }
  const base = baseName(doc.path);
  const html = buildExportHtml({ title: base, body: view.dom.innerHTML });
  const target = await dialogService.saveExportAs(`${base}.html`, 'html');
  if (target) await fsService.writeFile(target, html);
}

function findNext(dir: 1 | -1) {
  const ui = useUIStore.getState();
  if (!ui.findOpen) ui.openFind(false);
  const view = getActiveView();
  if (view) navigate(view, dir);
}

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

  if (id.startsWith('recent-file:')) {
    await doc.open(id.slice('recent-file:'.length));
    return;
  }
  if (id.startsWith('recent-ws:')) {
    const path = id.slice('recent-ws:'.length);
    try {
      await ws.open(path);
    } catch (err) {
      if (String((err as Error).message).startsWith('WORKSPACE_UNAVAILABLE')) {
        window.alert(`That folder is no longer available:\n${path}\n\nIt has been removed from recent workspaces.`);
      } else {
        console.error(err);
      }
    }
    return;
  }

  switch (id) {
    case 'clear-recent':
      await cfg.clearRecent();
      break;
    case 'new':
      await doc.newFile();
      break;
    case 'open': {
      await chooseFileToOpen();
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
    case 'export-html':
      await exportToHtml();
      break;
    case 'export-docx':
      await exportPandoc('docx', 'docx');
      break;
    case 'export-epub':
      await exportPandoc('epub', 'epub');
      break;
    case 'export-latex':
      await exportPandoc('latex', 'tex');
      break;
    case 'export-rtf':
      await exportPandoc('rtf', 'rtf');
      break;
    case 'print':
      window.print();
      break;
    case 'toggle-sidebar':
      await cfg.update({ showSidebar: !cfg.config.showSidebar });
      break;
    case 'spell-toggle':
      await cfg.update({ spellcheck: !cfg.config.spellcheck });
      break;
    case 'smart-punctuation':
      await cfg.update({ smartPunctuation: !cfg.config.smartPunctuation });
      break;
    case 'autosave-toggle':
      await cfg.update({ autoSave: !cfg.config.autoSave });
      break;
    case 'version-history':
      if (doc.doc?.path) useUIStore.getState().setVersionHistoryOpen(true);
      else window.alert('Save the document first to keep version history.');
      break;
    case 'toggle-source':
      useUIStore.getState().toggleSourceMode();
      break;
    case 'toggle-focus':
      useUIStore.getState().toggleFocusMode();
      break;
    case 'toggle-typewriter':
      useUIStore.getState().toggleTypewriterMode();
      break;
    case 'toggle-fullscreen':
      await invoke('toggle_fullscreen').catch((e) => console.warn(e));
      break;
    case 'toggle-outline': {
      const ui = useUIStore.getState();
      ui.setSidebarTab(ui.sidebarTab === 'outline' ? 'files' : 'outline');
      if (!cfg.config.showSidebar) await cfg.update({ showSidebar: true });
      break;
    }
    case 'copy-as-markdown': {
      const d = useDocumentStore.getState().doc;
      if (d) await navigator.clipboard.writeText(d.draft).catch((e) => console.warn(e));
      break;
    }
    case 'copy-as-html': {
      const view = getActiveView();
      if (view) await navigator.clipboard.writeText(view.dom.innerHTML).catch((e) => console.warn(e));
      break;
    }
    case 'find':
      useUIStore.getState().openFind(false);
      break;
    case 'replace':
      useUIStore.getState().openFind(true);
      break;
    case 'find-next':
      findNext(1);
      break;
    case 'find-prev':
      findNext(-1);
      break;
    case 'show-tour':
      useUIStore.getState().startTour();
      break;
    case 'software-update':
      useUIStore.getState().setUpdateSettingsOpen(true);
      break;
    case 'show-whats-new':
      void openWhatsNewForCurrent();
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
          await docStore.newFile();
          break;
        case 'o':
          e.preventDefault();
          if (e.shiftKey) {
            const dir = await dialogService.pickWorkspaceDir();
            if (dir) await wsStore.open(dir);
          } else {
            await chooseFileToOpen();
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
        case 'f':
          e.preventDefault();
          useUIStore.getState().openFind(e.altKey);
          break;
        case 'g':
          e.preventDefault();
          findNext(e.shiftKey ? -1 : 1);
          break;
        case '/':
          e.preventDefault();
          useUIStore.getState().toggleSourceMode();
          break;
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
