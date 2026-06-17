// @vitest-environment happy-dom

import { editorViewCtx, serializerCtx } from '@milkdown/core';
import type { Editor } from '@milkdown/core';
import { describe, expect, it } from 'vitest';

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

async function mount(md: string): Promise<{ editor: Editor; cleanup: () => Promise<void> }> {
  ensureStandardsMode();
  const { buildEditor } = await import('./milkdownConfig');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const editor: Editor = await buildEditor({ root, initialValue: md, onChange: () => {}, listener: false }).create();
  await new Promise((r) => setTimeout(r, 0));
  return {
    editor,
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

function serialize(editor: Editor): string {
  return editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const serializer = ctx.get(serializerCtx);
    return serializer(view.state.doc);
  });
}

describe('highlight mark (==text==)', () => {
  it('parses ==text== into a <mark> element', async () => {
    const { editor, cleanup } = await mount('a ==highlighted== b');
    try {
      const view = editor.ctx.get(editorViewCtx);
      expect(view.dom.querySelector('mark')).not.toBeNull();
      expect(view.dom.querySelector('mark')?.textContent).toBe('highlighted');
    } finally {
      await cleanup();
    }
  });

  it('round-trips ==text== back to markdown', async () => {
    const { editor, cleanup } = await mount('a ==highlighted== b');
    try {
      expect(serialize(editor)).toContain('==highlighted==');
    } finally {
      await cleanup();
    }
  });
});

describe('superscript mark (^text^)', () => {
  it('parses ^text^ into a <sup> element', async () => {
    const { editor, cleanup } = await mount('E = mc^2^ here');
    try {
      const view = editor.ctx.get(editorViewCtx);
      expect(view.dom.querySelector('sup')?.textContent).toBe('2');
    } finally {
      await cleanup();
    }
  });

  it('round-trips ^text^ back to markdown', async () => {
    const { editor, cleanup } = await mount('E = mc^2^ here');
    try {
      expect(serialize(editor)).toContain('^2^');
    } finally {
      await cleanup();
    }
  });

  it('leaves a lone caret untouched', async () => {
    const { editor, cleanup } = await mount('2 ^ 3 is exponent');
    try {
      expect(editor.ctx.get(editorViewCtx).dom.querySelector('sup')).toBeNull();
    } finally {
      await cleanup();
    }
  });
});

describe('subscript mark (~text~)', () => {
  it('parses ~text~ into a <sub> element', async () => {
    const { editor, cleanup } = await mount('H~2~O is water');
    try {
      expect(editor.ctx.get(editorViewCtx).dom.querySelector('sub')?.textContent).toBe('2');
    } finally {
      await cleanup();
    }
  });

  it('round-trips ~text~ back to markdown', async () => {
    const { editor, cleanup } = await mount('H~2~O is water');
    try {
      expect(serialize(editor)).toContain('~2~');
    } finally {
      await cleanup();
    }
  });

  it('keeps ~~strikethrough~~ as strikethrough (not subscript)', async () => {
    const { editor, cleanup } = await mount('a ~~gone~~ b');
    try {
      const view = editor.ctx.get(editorViewCtx);
      expect(view.dom.querySelector('del, s, strike')).not.toBeNull();
      expect(view.dom.querySelector('sub')).toBeNull();
      expect(serialize(editor)).toContain('~~gone~~');
    } finally {
      await cleanup();
    }
  });
});
