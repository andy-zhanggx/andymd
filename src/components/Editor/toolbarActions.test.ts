// @vitest-environment happy-dom

import type { Editor } from '@milkdown/core';
import { editorViewCtx } from '@milkdown/core';
import { getMarkdown } from '@milkdown/utils';
import { describe, expect, it } from 'vitest';
import {
  insertBold,
  insertItalic,
  insertStrikethrough,
  insertInlineCode,
  insertLink,
  setHeading,
  insertBlockquote,
  insertBulletList,
  insertOrderedList,
  insertTaskList,
  insertCodeBlock,
  insertHr,
  insertTable,
  insertImagePlaceholder,
  insertInlineMath,
  insertMathBlock,
} from './toolbarActions';

function ensureStandardsMode() {
  if (document.compatMode !== 'CSS1Compat') {
    Object.defineProperty(document, 'compatMode', {
      configurable: true,
      get: () => 'CSS1Compat',
    });
  }
  if (!document.doctype && document.documentElement) {
    document.insertBefore(
      document.implementation.createDocumentType('html', '', ''),
      document.documentElement,
    );
  }
}

async function mount(md = '\n'): Promise<{
  editor: Editor;
  cleanup: () => Promise<void>;
}> {
  ensureStandardsMode();
  const { buildEditor } = await import('./milkdownConfig');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const editor = await buildEditor({ root, initialValue: md, onChange: () => {} }).create();
  await new Promise((r) => setTimeout(r, 0));
  // Place the cursor inside the (empty) first paragraph.
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    view.focus();
  });
  return {
    editor,
    cleanup: async () => {
      try {
        await editor.destroy();
      } catch {
        // noop
      }
      root.remove();
    },
  };
}

function md(editor: Editor): string {
  return editor.action(getMarkdown()).trim();
}

/** The text currently spanned by the selection (empty string for node/cursor). */
function selectedText(editor: Editor): string {
  return editor.action((ctx) => {
    const { state } = ctx.get(editorViewCtx);
    const { from, to } = state.selection;
    return state.doc.textBetween(from, to);
  });
}

describe('toolbarActions — placeholder hints on an empty document', () => {
  it('bold inserts a selected hint that serializes to **bold text**', async () => {
    const { editor, cleanup } = await mount();
    try {
      insertBold(editor);
      expect(md(editor)).toContain('**bold text**');
      expect(selectedText(editor)).toBe('bold text');
    } finally {
      await cleanup();
    }
  });

  it('italic inserts *italic text* with the hint selected', async () => {
    const { editor, cleanup } = await mount();
    try {
      insertItalic(editor);
      expect(md(editor)).toContain('*italic text*');
      expect(selectedText(editor)).toBe('italic text');
    } finally {
      await cleanup();
    }
  });

  it('strikethrough inserts ~~strikethrough~~ with the hint selected', async () => {
    const { editor, cleanup } = await mount();
    try {
      insertStrikethrough(editor);
      expect(md(editor)).toContain('~~strikethrough~~');
      expect(selectedText(editor)).toBe('strikethrough');
    } finally {
      await cleanup();
    }
  });

  it('inline code inserts `code` with the hint selected', async () => {
    const { editor, cleanup } = await mount();
    try {
      insertInlineCode(editor);
      expect(md(editor)).toContain('`code`');
      expect(selectedText(editor)).toBe('code');
    } finally {
      await cleanup();
    }
  });

  it('link inserts [link text](https://) with the text selected', async () => {
    const { editor, cleanup } = await mount();
    try {
      insertLink(editor);
      expect(md(editor)).toContain('[link text](https://)');
      expect(selectedText(editor)).toBe('link text');
    } finally {
      await cleanup();
    }
  });

  it('H2 on an empty line inserts a selected "Heading" hint', async () => {
    const { editor, cleanup } = await mount();
    try {
      setHeading(editor, 2);
      expect(md(editor)).toContain('## Heading');
      expect(selectedText(editor)).toBe('Heading');
    } finally {
      await cleanup();
    }
  });

  it('blockquote wraps with a selected "quote" hint', async () => {
    const { editor, cleanup } = await mount();
    try {
      insertBlockquote(editor);
      expect(md(editor)).toContain('> quote');
      expect(selectedText(editor)).toBe('quote');
    } finally {
      await cleanup();
    }
  });

  it('bullet list inserts a "List item" hint', async () => {
    const { editor, cleanup } = await mount();
    try {
      insertBulletList(editor);
      expect(md(editor)).toMatch(/[-*] List item/);
      expect(selectedText(editor)).toBe('List item');
    } finally {
      await cleanup();
    }
  });

  it('ordered list inserts a numbered "List item" hint', async () => {
    const { editor, cleanup } = await mount();
    try {
      insertOrderedList(editor);
      expect(md(editor)).toMatch(/1\.\s+List item/);
      expect(selectedText(editor)).toBe('List item');
    } finally {
      await cleanup();
    }
  });

  it('task list inserts an unchecked checkbox item', async () => {
    const { editor, cleanup } = await mount();
    try {
      insertTaskList(editor);
      expect(md(editor)).toMatch(/[-*] \[ \] List item/);
    } finally {
      await cleanup();
    }
  });

  it('code block produces a fenced block', async () => {
    const { editor, cleanup } = await mount();
    try {
      insertCodeBlock(editor);
      expect(md(editor)).toContain('```');
    } finally {
      await cleanup();
    }
  });

  it('horizontal rule inserts a thematic break', async () => {
    const { editor, cleanup } = await mount('text\n');
    try {
      insertHr(editor);
      expect(md(editor)).toMatch(/^(\*\*\*|---|___)$/m);
    } finally {
      await cleanup();
    }
  });

  it('table inserts a GFM table', async () => {
    const { editor, cleanup } = await mount();
    try {
      insertTable(editor);
      expect(md(editor)).toContain('|');
      expect(md(editor)).toContain('---');
    } finally {
      await cleanup();
    }
  });

  it('image inserts a placeholder image node', async () => {
    const { editor, cleanup } = await mount();
    try {
      insertImagePlaceholder(editor);
      expect(md(editor)).toContain('![image](path/to/image)');
    } finally {
      await cleanup();
    }
  });

  it('inline math inserts a math node with a placeholder formula', async () => {
    const { editor, cleanup } = await mount();
    try {
      insertInlineMath(editor);
      const out = md(editor);
      expect(out).toContain('$');
      expect(out).toContain('sqrt');
    } finally {
      await cleanup();
    }
  });

  it('math block inserts a $$ block with a placeholder formula', async () => {
    const { editor, cleanup } = await mount();
    try {
      insertMathBlock(editor);
      const out = md(editor);
      expect(out).toContain('$$');
      expect(out).toContain('sqrt');
    } finally {
      await cleanup();
    }
  });
});

describe('toolbarActions — selection-aware marks', () => {
  it('bold wraps an existing selection instead of inserting a hint', async () => {
    const { editor, cleanup } = await mount('hello world\n');
    try {
      // Select the word "hello" (positions 1..6 in the single paragraph).
      const { TextSelection } = await import('@milkdown/prose/state');
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, 1, 6)));
      });
      insertBold(editor);
      expect(md(editor)).toContain('**hello** world');
    } finally {
      await cleanup();
    }
  });
});
