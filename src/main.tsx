import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { useConfigStore } from './stores/configStore';

async function bootstrap() {
  try {
    await useConfigStore.getState().load();
    const cfg = useConfigStore.getState().config;
    const last = cfg.lastWorkspace;
    if (last) {
      const mod = await import('./stores/workspaceStore');
      try { await mod.useWorkspaceStore.getState().open(last); } catch { /* ignore if folder missing */ }
    }

    const { MULTI_TABS } = await import('./featureFlags');

    // Restore the tabs that were open last session (saved files only). Gated:
    // with tabs off, the app opens at most a single document as it always did.
    if (MULTI_TABS && cfg.openTabs.length > 0) {
      const { useDocumentStore } = await import('./stores/documentStore');
      try {
        await useDocumentStore.getState().restoreTabs(cfg.openTabs, cfg.activeTabPath);
      } catch { /* ignore — start with no tabs */ }
    }

    try {
      const pending = await (await import('./services/fsService')).fsService.takePendingOpens();
      if (pending.length > 0) {
        const { useDocumentStore } = await import('./stores/documentStore');
        const path = pending[pending.length - 1];
        // A file the OS asked us to open lands in its own tab (focused) when tabs
        // are on; otherwise it replaces the single open document.
        if (MULTI_TABS) await useDocumentStore.getState().openInNewTab(path);
        else await useDocumentStore.getState().open(path);
      }
    } catch { /* ignore */ }
  } catch {
    // proceed with defaults
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><App /></React.StrictMode>
  );
}
bootstrap();
