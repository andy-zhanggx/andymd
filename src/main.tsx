import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { useConfigStore } from './stores/configStore';

async function bootstrap() {
  try {
    await useConfigStore.getState().load();
    const last = useConfigStore.getState().config.lastWorkspace;
    if (last) {
      const mod = await import('./stores/workspaceStore');
      try { await mod.useWorkspaceStore.getState().open(last); } catch { /* ignore if folder missing */ }
    }

    try {
      const pending = await (await import('./services/fsService')).fsService.takePendingOpens();
      if (pending.length > 0) {
        const { useDocumentStore } = await import('./stores/documentStore');
        await useDocumentStore.getState().open(pending[pending.length - 1]);
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
