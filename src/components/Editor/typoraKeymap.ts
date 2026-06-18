import { commandsCtx } from '@milkdown/core';
import type { CmdKey } from '@milkdown/core';
import { $shortcut } from '@milkdown/utils';
import { setBlockType } from '@milkdown/prose/commands';
import { NodeSelection, TextSelection } from '@milkdown/prose/state';
import type { Command, EditorState } from '@milkdown/prose/state';
import {
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  toggleInlineCodeCommand,
} from '@milkdown/preset-commonmark';
import { toggleStrikethroughCommand, insertTableCommand } from '@milkdown/preset-gfm';

/**
 * Typora-style keyboard shortcuts for the Milkdown (ProseMirror) editor.
 *
 * Milkdown's commonmark/gfm presets already bind the marks (⌘B, ⌘I, ⌘E),
 * undo/redo (⌘Z, ⌘⇧Z / ⌘Y) and the ⌘⌥-prefixed paragraph commands. This
 * module adds the bindings Typora uses that those presets don't ship, so the
 * in-editor shortcut set matches Typora as closely as the markdown data model
 * allows. App/window-level shortcuts (save, find, sidebar…) live in the native
 * menu and `useShortcuts`; this file only covers actions that operate on the
 * editor content.
 *
 * These keys deliberately have NO matching native-menu accelerator: the webview
 * receives the keydown first and, when a command applies, calls preventDefault —
 * which suppresses the menu accelerator. Keeping the bindings webview-only
 * avoids the double-fire that a duplicate menu accelerator would cause.
 *
 * The pure ProseMirror commands are exported so they can be unit-tested without
 * dispatching synthetic keyboard events.
 */

/** Heading level of the current textblock, or 0 when it is a paragraph. */
function currentLevel(state: EditorState): number {
  const heading = state.schema.nodes.heading;
  const block = state.selection.$from.parent;
  return heading && block.type === heading ? (block.attrs.level as number) : 0;
}

/**
 * Set the current block to a heading of `level`. Pressing the shortcut for the
 * level the block already is toggles it back to a paragraph (Typora behaviour).
 */
export function setHeadingLevel(level: number): Command {
  return (state, dispatch, view) => {
    const { heading, paragraph } = state.schema.nodes;
    if (!heading || !paragraph) return false;
    if (currentLevel(state) === level) {
      return setBlockType(paragraph)(state, dispatch, view);
    }
    return setBlockType(heading, { level })(state, dispatch, view);
  };
}

/** Turn the current block into a plain paragraph (Typora ⌘0). */
export const setParagraph: Command = (state, dispatch, view) => {
  const { paragraph } = state.schema.nodes;
  if (!paragraph) return false;
  return setBlockType(paragraph)(state, dispatch, view);
};

/**
 * Move the current block one step along the heading scale.
 *   dir = -1 ("increase heading level", ⌘=): toward H1. paragraph → H1.
 *   dir = +1 ("decrease heading level", ⌘-): toward paragraph. H6 → paragraph.
 */
export function adjustHeading(dir: -1 | 1): Command {
  return (state, dispatch, view) => {
    const { heading, paragraph } = state.schema.nodes;
    if (!heading || !paragraph) return false;
    const cur = currentLevel(state);
    let next: number;
    if (dir === -1) next = cur === 0 ? 1 : Math.max(1, cur - 1);
    else next = cur === 0 ? 0 : cur >= 6 ? 0 : cur + 1;
    if (next === cur) return false;
    return next === 0
      ? setBlockType(paragraph)(state, dispatch, view)
      : setBlockType(heading, { level: next })(state, dispatch, view);
  };
}

/** Select the whole current line/block (Typora ⌘L). */
export const selectLine: Command = (state, dispatch) => {
  const { $from, $to } = state.selection;
  const from = $from.start();
  const to = $to.end();
  if (dispatch) {
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, from, to)).scrollIntoView());
  }
  return true;
};

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/**
 * The document range of the word under the cursor, or the existing selection if
 * one is present. Returns null when there is no word to act on.
 */
function wordRange(state: EditorState): { from: number; to: number } | null {
  const { $from, empty } = state.selection;
  if (!empty) return { from: state.selection.from, to: state.selection.to };
  const parent = $from.parent;
  if (!parent.isTextblock) return null;
  const text = parent.textContent;
  const offset = Math.min($from.parentOffset, text.length);
  let s = offset;
  let e = offset;
  while (s > 0 && WORD_CHAR.test(text[s - 1])) s--;
  while (e < text.length && WORD_CHAR.test(text[e])) e++;
  if (s === e) return null;
  const base = $from.start();
  return { from: base + s, to: base + e };
}

/** Select the word under the cursor (Typora ⌘D). */
export const selectWord: Command = (state, dispatch) => {
  const range = wordRange(state);
  if (!range) return false;
  if (dispatch) {
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, range.from, range.to)));
  }
  return true;
};

/** Delete the word under the cursor / the current selection (Typora ⌘⇧D). */
export const deleteWord: Command = (state, dispatch) => {
  const range = wordRange(state);
  if (!range) return false;
  if (dispatch) dispatch(state.tr.delete(range.from, range.to).scrollIntoView());
  return true;
};

/** Strip every inline mark from the selection (Typora "Clear Format", ⌘\). */
export const clearFormat: Command = (state, dispatch) => {
  const { from, to, empty } = state.selection;
  if (empty) {
    if (dispatch) dispatch(state.tr.setStoredMarks([]));
    return true;
  }
  if (dispatch) {
    let tr = state.tr;
    for (const name of Object.keys(state.schema.marks)) {
      tr = tr.removeMark(from, to, state.schema.marks[name]);
    }
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/** Insert/extend a hyperlink (Typora ⌘K). Wraps a selection or seeds "link text". */
export const insertHyperlink: Command = (state, dispatch) => {
  const linkMark = state.schema.marks.link;
  if (!linkMark) return false;
  const { from, to, empty } = state.selection;
  const mark = linkMark.create({ href: 'https://' });
  if (!empty) {
    if (dispatch) dispatch(state.tr.addMark(from, to, mark).scrollIntoView());
    return true;
  }
  if (dispatch) {
    const placeholder = 'link text';
    let tr = state.tr.insertText(placeholder, from);
    const end = from + placeholder.length;
    tr = tr.addMark(from, end, mark);
    tr = tr.setSelection(TextSelection.create(tr.doc, from, end));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/** Insert a placeholder image node (Typora ⌘⌃I). */
export const insertImage: Command = (state, dispatch) => {
  const imageType = state.schema.nodes.image;
  if (!imageType) return false;
  if (dispatch) {
    const node = imageType.create({ src: 'path/to/image', alt: 'image', title: null });
    dispatch(state.tr.replaceSelectionWith(node, false).scrollIntoView());
  }
  return true;
};

/** Insert an empty block-math node and select it for editing (Typora ⌘⌥B). */
export const insertMathBlock: Command = (state, dispatch) => {
  const mathType = state.schema.nodes.math_block;
  if (!mathType) return false;
  if (dispatch) {
    const { from } = state.selection;
    const node = mathType.create({ value: '' });
    let tr = state.tr.replaceSelectionWith(node, false);
    const at = tr.doc.nodeAt(from);
    if (at?.type === mathType) tr = tr.setSelection(NodeSelection.create(tr.doc, from));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Underline (Typora ⌘U). Markdown has no underline, so — like Typora — we store
 * it as inline `<u>…</u>` HTML, which AndyMD's html node renders as real
 * underlined DOM and round-trips losslessly. A selection within a single
 * textblock is wrapped; an empty cursor inserts a selected "underline" hint.
 */
export const toggleUnderline: Command = (state, dispatch) => {
  const htmlType = state.schema.nodes.html;
  if (!htmlType) return false;
  const { $from, $to, from, empty } = state.selection;
  if (empty) {
    if (dispatch) {
      const node = htmlType.create({ value: '<u>underline</u>' });
      let tr = state.tr.replaceSelectionWith(node, false);
      tr = tr.setSelection(NodeSelection.create(tr.doc, from));
      dispatch(tr.scrollIntoView());
    }
    return true;
  }
  // Only wrap a selection that stays inside one textblock — `<u>` is inline.
  if ($from.parent !== $to.parent || !$from.parent.isTextblock) return false;
  if (dispatch) {
    const text = state.doc.textBetween(state.selection.from, state.selection.to);
    const node = htmlType.create({ value: `<u>${escapeHtml(text)}</u>` });
    dispatch(state.tr.replaceSelectionWith(node, false).scrollIntoView());
  }
  return true;
};

/**
 * The Typora-parity keymap. Added after the commonmark/gfm presets; none of
 * these keys overlap with what they already bind.
 */
export const typoraKeymap = $shortcut((ctx) => {
  // Run a Milkdown-registered command on this editor's ctx, returning whether it
  // applied (so the keymap reports handled/unhandled correctly).
  const run =
    <T>(command: { key: CmdKey<T> }) =>
    (): boolean =>
      ctx.get(commandsCtx).call(command.key);

  return {
    // Paragraph / headings
    'Mod-1': setHeadingLevel(1),
    'Mod-2': setHeadingLevel(2),
    'Mod-3': setHeadingLevel(3),
    'Mod-4': setHeadingLevel(4),
    'Mod-5': setHeadingLevel(5),
    'Mod-6': setHeadingLevel(6),
    'Mod-0': setParagraph,
    'Mod-=': adjustHeading(-1),
    'Mod--': adjustHeading(1),

    // Block constructs
    'Mod-Alt-t': run(insertTableCommand),
    'Mod-Alt-q': run(wrapInBlockquoteCommand),
    'Mod-Alt-o': run(wrapInOrderedListCommand),
    'Mod-Alt-u': run(wrapInBulletListCommand),
    'Mod-Alt-b': insertMathBlock,

    // Inline formatting
    'Mod-Shift-`': run(toggleInlineCodeCommand),
    'Ctrl-Shift-`': run(toggleStrikethroughCommand),
    'Mod-u': toggleUnderline,
    'Mod-k': insertHyperlink,
    'Mod-Ctrl-i': insertImage,
    'Mod-\\': clearFormat,

    // Selection / editing
    'Mod-l': selectLine,
    'Mod-d': selectWord,
    'Mod-Shift-d': deleteWord,
  };
});
