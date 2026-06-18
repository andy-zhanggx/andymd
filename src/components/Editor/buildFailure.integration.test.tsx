// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// Force the async editor build to reject, simulating a transient create()
// crash. The bug under test: the catch used to silently blank the pane.
const { create, buildEditor } = vi.hoisted(() => {
  const create = vi.fn();
  return { create, buildEditor: vi.fn(() => ({ create })) };
});
vi.mock('./milkdownConfig', () => ({ buildEditor }));
// The toolbar/find-replace pull in unrelated editor machinery; stub them so the
// test exercises only the build-failure path.
vi.mock('./Toolbar', () => ({ Toolbar: () => null }));
vi.mock('./FindReplace', () => ({ FindReplace: () => null }));

import { MarkdownEditor } from './MarkdownEditor';
import { useDocumentStore } from '../../stores/documentStore';

function flush() {
  return act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  create.mockReset();
  buildEditor.mockClear();
  // Empty path = an unsaved doc; keeps session-flush (Tauri-backed) out of this
  // test, which only cares about the build/fallback/reload path.
  useDocumentStore.setState({
    doc: { path: '', content: '# hi', draft: '# hi', isDirty: false, mtime: 0, encoding: 'utf-8' },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useDocumentStore.setState({ doc: null });
  vi.restoreAllMocks();
});

describe('MarkdownEditor build-failure fallback', () => {
  it('surfaces a recoverable error instead of a blank pane, and reload rebuilds', async () => {
    create.mockRejectedValue(new Error('boom: undefined localsInner'));

    await act(async () => {
      root.render(<MarkdownEditor />);
    });
    await flush();

    // The build was attempted and the failure was logged, not swallowed.
    expect(buildEditor).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalled();

    // The fallback is shown with the real error detail.
    expect(container.textContent).toContain('couldn’t be opened');
    expect(container.textContent).toContain('boom: undefined localsInner');

    const reload = [...container.querySelectorAll('button')].find((b) =>
      /reload editor/i.test(b.textContent || ''),
    );
    expect(reload).toBeTruthy();

    // Clicking "Reload editor" re-runs the build effect (recovery without restart).
    await act(async () => {
      reload!.click();
    });
    await flush();
    expect(buildEditor).toHaveBeenCalledTimes(2);
  });
});
