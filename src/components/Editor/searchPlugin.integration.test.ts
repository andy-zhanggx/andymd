// @vitest-environment happy-dom

import { editorViewCtx } from '@milkdown/core';
import type { Editor } from '@milkdown/core';
import { describe, expect, it } from 'vitest';
import type { EditorView } from '@milkdown/prose/view';
import { setSearch, navigate, replaceCurrent, replaceAll, getSearchState } from './searchPlugin';

function ensureStandardsMode() {
  if (document.compatMode !== 'CSS1Compat') {
    Object.defineProperty(document, 'compatMode', { configurable: true, get: () => 'CSS1Compat' });
  }
  if (!document.doctype && document.documentElement) {
    document.insertBefore(
      document.implementation.createDocumentType('html', '', ''),
      document.documentElement,
    );
  }
}

async function mount(md: string): Promise<{ view: EditorView; cleanup: () => Promise<void> }> {
  ensureStandardsMode();
  const { buildEditor } = await import('./milkdownConfig');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const editor: Editor = await buildEditor({ root, initialValue: md, onChange: () => {} }).create();
  await new Promise((r) => setTimeout(r, 0));
  const view = editor.ctx.get(editorViewCtx);
  return {
    view,
    cleanup: async () => {
      try {
        await editor.destroy();
      } catch {
        /* noop */
      }
      root.remove();
    },
  };
}

describe('search plugin (integration)', () => {
  it('finds matches and renders highlight decorations', async () => {
    const { view, cleanup } = await mount('alpha beta alpha gamma alpha');
    try {
      const s = setSearch(view, 'alpha', false);
      expect(s.matches.length).toBe(3);
      expect(s.current).toBe(0);
      // Decorations should be painted into the DOM.
      const marks = view.dom.querySelectorAll('.search-match');
      expect(marks.length).toBe(3);
      expect(view.dom.querySelectorAll('.search-match-current').length).toBe(1);
    } finally {
      await cleanup();
    }
  });

  it('navigates forward with wraparound', async () => {
    const { view, cleanup } = await mount('x x x');
    try {
      setSearch(view, 'x', false); // current 0
      expect(navigate(view, 1).current).toBe(1);
      expect(navigate(view, 1).current).toBe(2);
      expect(navigate(view, 1).current).toBe(0); // wraps
      expect(navigate(view, -1).current).toBe(2); // wraps back
    } finally {
      await cleanup();
    }
  });

  it('replaces the current match and recomputes', async () => {
    const { view, cleanup } = await mount('cat cat cat');
    try {
      setSearch(view, 'cat', false);
      replaceCurrent(view, 'dog');
      expect(view.state.doc.textContent).toBe('dog cat cat');
      const s = getSearchState(view.state);
      expect(s.matches.length).toBe(2);
    } finally {
      await cleanup();
    }
  });

  it('replaces all matches', async () => {
    const { view, cleanup } = await mount('foo foo foo bar');
    try {
      setSearch(view, 'foo', false);
      const n = replaceAll(view, 'baz');
      expect(n).toBe(3);
      expect(view.state.doc.textContent).toBe('baz baz baz bar');
    } finally {
      await cleanup();
    }
  });

  it('is case-sensitive when requested', async () => {
    const { view, cleanup } = await mount('Cat cat CAT');
    try {
      expect(setSearch(view, 'cat', true).matches.length).toBe(1);
      expect(setSearch(view, 'cat', false).matches.length).toBe(3);
    } finally {
      await cleanup();
    }
  });
});
