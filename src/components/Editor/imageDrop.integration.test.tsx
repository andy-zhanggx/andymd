// @vitest-environment happy-dom
import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Keep the filesystem + asset URL conversion out of the test: we only care that
// the drop handler reaches `importImageBytes` with the dropped bytes.
const importImageBytes = vi.fn(async () => ({ relPath: 'assets/pic.png', absPath: '/v/assets/pic.png' }));
vi.mock('../../services/fsService', () => ({
  fsService: { importImageBytes },
}));
vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (p: string) => `asset://localhost/${p}`,
  invoke: vi.fn(async () => undefined),
}));

function ensureStandardsMode() {
  const d = document as any;
  if (d.compatMode !== 'CSS1Compat')
    Object.defineProperty(d, 'compatMode', { configurable: true, get: () => 'CSS1Compat' });
  if (!d.doctype && d.documentElement)
    d.insertBefore(d.implementation.createDocumentType('html', '', ''), d.documentElement);
}

function imageDropEvent(file: File): DragEvent {
  const e = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(e, 'dataTransfer', {
    value: { types: ['Files'], files: [file] },
  });
  return e;
}

describe('image drop wiring (regression: listeners attach when the editor mounts)', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    ensureStandardsMode();
    importImageBytes.mockClear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('imports a dropped image even when the app launched on the empty state first', async () => {
    const { MarkdownEditor } = await import('./MarkdownEditor');
    const { useDocumentStore } = await import('../../stores/documentStore');

    // 1) Mount with NO document → the empty state renders, the editor container
    //    (the drop target) is absent. This is the flow that broke the old
    //    mount-time `useEffect(…, [])`: it attached to a null root and never
    //    re-ran when the container later mounted.
    useDocumentStore.setState({ doc: null });
    await act(async () => {
      root.render(createElement(MarkdownEditor));
    });
    expect(host.querySelector('.editor-container')).toBeNull();

    // 2) Open a document → the editor container now mounts.
    await act(async () => {
      useDocumentStore.setState({
        doc: { path: '/vault/note.md', content: '', draft: 'Hi\n', isDirty: false, mtime: 0, encoding: 'utf-8' },
      });
    });
    // Let the async Milkdown editor finish building.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    const container = host.querySelector<HTMLElement>('.editor-container');
    expect(container, 'editor container mounts once a doc is open').not.toBeNull();

    // 3) Drop an image onto the container.
    const file = new File([new Uint8Array([1, 2, 3])], 'pic.png', { type: 'image/png' });
    if (typeof file.arrayBuffer !== 'function') {
      Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([1, 2, 3]).buffer });
    }
    await act(async () => {
      container!.dispatchEvent(imageDropEvent(file));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(importImageBytes).toHaveBeenCalledTimes(1);
    expect(importImageBytes).toHaveBeenCalledWith('pic.png', [1, 2, 3], '/vault/note.md');
  });
});
