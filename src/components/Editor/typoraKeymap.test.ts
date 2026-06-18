// @vitest-environment happy-dom

import type { Editor } from '@milkdown/core';
import { editorViewCtx } from '@milkdown/core';
import { getMarkdown } from '@milkdown/utils';
import { TextSelection } from '@milkdown/prose/state';
import type { Command } from '@milkdown/prose/state';
import { describe, expect, it } from 'vitest';
import {
  setHeadingLevel,
  setParagraph,
  adjustHeading,
  selectLine,
  selectWord,
  deleteWord,
  clearFormat,
  insertHyperlink,
  insertImage,
  insertMathBlock,
  toggleUnderline,
} from './typoraKeymap';

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

async function mount(md = '\n'): Promise<{ editor: Editor; cleanup: () => Promise<void> }> {
  ensureStandardsMode();
  const { buildEditor } = await import('./milkdownConfig');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const editor = await buildEditor({ root, initialValue: md, onChange: () => {}, listener: false }).create();
  await new Promise((r) => setTimeout(r, 0));
  editor.action((ctx) => ctx.get(editorViewCtx).focus());
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

/** Run a ProseMirror command against the live editor view. */
function exec(editor: Editor, command: Command): boolean {
  return editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    return command(view.state, view.dispatch, view);
  });
}

/** Place the selection at the given document range. */
function select(editor: Editor, from: number, to = from): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
  });
}

function md(editor: Editor): string {
  return editor.action(getMarkdown()).trim();
}

function selectedText(editor: Editor): string {
  return editor.action((ctx) => {
    const { state } = ctx.get(editorViewCtx);
    return state.doc.textBetween(state.selection.from, state.selection.to);
  });
}

describe('typoraKeymap — headings', () => {
  it('⌘2 promotes the current block to an H2', async () => {
    const { editor, cleanup } = await mount('hello\n');
    try {
      exec(editor, setHeadingLevel(2));
      expect(md(editor)).toBe('## hello');
    } finally {
      await cleanup();
    }
  });

  it('repeating the same heading shortcut toggles back to a paragraph', async () => {
    const { editor, cleanup } = await mount('hello\n');
    try {
      exec(editor, setHeadingLevel(1));
      expect(md(editor)).toBe('# hello');
      exec(editor, setHeadingLevel(1));
      expect(md(editor)).toBe('hello');
    } finally {
      await cleanup();
    }
  });

  it('⌘0 turns a heading back into a paragraph', async () => {
    const { editor, cleanup } = await mount('### hello\n');
    try {
      select(editor, 2);
      exec(editor, setParagraph);
      expect(md(editor)).toBe('hello');
    } finally {
      await cleanup();
    }
  });

  it('increase heading level moves a paragraph to H1 then toward H1', async () => {
    const { editor, cleanup } = await mount('hello\n');
    try {
      exec(editor, adjustHeading(-1)); // paragraph -> H1
      expect(md(editor)).toBe('# hello');
      exec(editor, setHeadingLevel(3)); // jump to H3
      exec(editor, adjustHeading(-1)); // H3 -> H2
      expect(md(editor)).toBe('## hello');
    } finally {
      await cleanup();
    }
  });

  it('decrease heading level steps down and drops H6 to a paragraph', async () => {
    const { editor, cleanup } = await mount('###### hello\n');
    try {
      select(editor, 2);
      exec(editor, adjustHeading(1)); // H6 -> paragraph
      expect(md(editor)).toBe('hello');
    } finally {
      await cleanup();
    }
  });
});

describe('typoraKeymap — selection & editing', () => {
  it('select line selects the whole current block', async () => {
    const { editor, cleanup } = await mount('hello world\n');
    try {
      select(editor, 3);
      exec(editor, selectLine);
      expect(selectedText(editor)).toBe('hello world');
    } finally {
      await cleanup();
    }
  });

  it('select word selects the word under the cursor', async () => {
    const { editor, cleanup } = await mount('hello world\n');
    try {
      select(editor, 9); // inside "world"
      exec(editor, selectWord);
      expect(selectedText(editor)).toBe('world');
    } finally {
      await cleanup();
    }
  });

  it('delete word removes the word under the cursor', async () => {
    const { editor, cleanup } = await mount('hello world\n');
    try {
      select(editor, 9); // inside "world"
      exec(editor, deleteWord);
      expect(md(editor)).toBe('hello'); // trailing space is trimmed off
    } finally {
      await cleanup();
    }
  });

  it('clear format strips inline marks from the selection', async () => {
    const { editor, cleanup } = await mount('**hello** world\n');
    try {
      select(editor, 1, 6); // over "hello"
      exec(editor, clearFormat);
      expect(md(editor)).toBe('hello world');
    } finally {
      await cleanup();
    }
  });
});

describe('typoraKeymap — inserts', () => {
  it('hyperlink wraps a selection in a link', async () => {
    const { editor, cleanup } = await mount('hello\n');
    try {
      select(editor, 1, 6);
      exec(editor, insertHyperlink);
      expect(md(editor)).toContain('[hello](https://)');
    } finally {
      await cleanup();
    }
  });

  it('hyperlink on an empty cursor seeds a selected "link text"', async () => {
    const { editor, cleanup } = await mount();
    try {
      exec(editor, insertHyperlink);
      expect(md(editor)).toContain('[link text](https://)');
      expect(selectedText(editor)).toBe('link text');
    } finally {
      await cleanup();
    }
  });

  it('image inserts a placeholder image node', async () => {
    const { editor, cleanup } = await mount();
    try {
      exec(editor, insertImage);
      expect(md(editor)).toContain('![image](path/to/image)');
    } finally {
      await cleanup();
    }
  });

  it('underline wraps a selection in <u> and round-trips', async () => {
    const { editor, cleanup } = await mount('hello world\n');
    try {
      select(editor, 1, 6); // "hello"
      exec(editor, toggleUnderline);
      expect(md(editor)).toContain('<u>hello</u>');
    } finally {
      await cleanup();
    }
  });

  it('underline on an empty cursor inserts an <u> hint', async () => {
    const { editor, cleanup } = await mount();
    try {
      exec(editor, toggleUnderline);
      expect(md(editor)).toContain('<u>underline</u>');
    } finally {
      await cleanup();
    }
  });

  it('math block inserts an empty $$ block', async () => {
    const { editor, cleanup } = await mount();
    try {
      exec(editor, insertMathBlock);
      expect(md(editor)).toContain('$$');
    } finally {
      await cleanup();
    }
  });
});
