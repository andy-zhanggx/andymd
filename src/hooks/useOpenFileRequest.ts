import { useEffect } from 'react';
import { onOpenFileRequest } from '../services/fsService';
import { useDocumentStore } from '../stores/documentStore';

export function useOpenFileRequest() {
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    (async () => {
      try {
        unlisten = await onOpenFileRequest(async (path) => {
          try {
            await useDocumentStore.getState().open(path);
          } catch (e) {
            console.error('open-file-request failed', e);
          }
        });
      } catch (e) {
        console.warn('open-file-request listener not available', e);
      }
    })();

    return () => {
      unlisten?.();
    };
  }, []);
}
