import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { useConfigStore } from './stores/configStore';

async function bootstrap() {
  try {
    await useConfigStore.getState().load();
  } catch {
    // config may fail in dev/vitest; proceed with defaults
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><App /></React.StrictMode>
  );
}
bootstrap();
