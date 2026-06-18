import type { Editor } from '@milkdown/core';
import { editorViewCtx } from '@milkdown/core';
import { callCommand } from '@milkdown/utils';
import { NodeSelection, TextSelection } from '@milkdown/prose/state';
import type { EditorState, Transaction } from '@milkdown/prose/state';
import type { MarkType } from '@milkdown/prose/model';
import {
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  createCodeBlockCommand,
  insertHrCommand,
} from '@milkdown/preset-commonmark';
import { insertTableCommand } from '@milkdown/preset-gfm';

/**
 * Toolbar actions for the Milkdown (ProseMirror) editor.
 *
 * Each action inserts a markdown construct. When a construct has editable
 * content and the user has no selection, the action inserts a placeholder
 * "hint" and selects it, so the user's first keystroke replaces the hint with
 * their own input (the "type to clear the hint" behaviour). When the user has
 * a non-empty selection, inline marks wrap that selection instead.
 *
 * Functions are kept free of React so they can be unit-tested directly against
 * a real editor instance.
 */

function withView(
  editor: Editor,
  fn: (args: {
    state: EditorState;
    dispatch: (tr: Transaction) => void;
    focus: () => void;
  }) => void,
): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    fn({
      state: view.state,
      dispatch: (tr) => view.dispatch(tr),
      focus: () => view.focus(),
    });
  });
}

function selectRange(tr: Transaction, from: number, to: number): Transaction {
  return tr.setSelection(TextSelection.create(tr.doc, from, to));
}

/**
 * Place a NodeSelection on a node of `nodeName` near `hintPos`. Inline nodes
 * keep their insertion position; block nodes shift, so fall back to scanning
 * the document. Leaves the transaction's default selection if none is found.
 */
function selectInsertedNode(
  tr: Transaction,
  nodeName: string,
  hintPos: number,
): Transaction {
  const at = tr.doc.nodeAt(hintPos);
  if (at?.type.name === nodeName) {
    return tr.setSelection(NodeSelection.create(tr.doc, hintPos));
  }
  let found = -1;
  tr.doc.descendants((node, pos) => {
    if (found === -1 && node.type.name === nodeName) found = pos;
    return found === -1;
  });
  return found === -1 ? tr : tr.setSelection(NodeSelection.create(tr.doc, found));
}

/**
 * Apply an inline mark. With a selection, toggle the mark over it. With an
 * empty cursor, insert `placeholder` carrying the mark and select it.
 */
export function applyInlineMark(
  editor: Editor,
  markName: string,
  placeholder: string,
): void {
  withView(editor, ({ state, dispatch, focus }) => {
    const markType: MarkType | undefined = state.schema.marks[markName];
    if (!markType) return;
    const { from, to, empty } = state.selection;

    if (!empty) {
      const has = state.doc.rangeHasMark(from, to, markType);
      const tr = has
        ? state.tr.removeMark(from, to, markType)
        : state.tr.addMark(from, to, markType.create());
      dispatch(tr.scrollIntoView());
    } else {
      let tr = state.tr.insertText(placeholder, from);
      const end = from + placeholder.length;
      tr = tr.addMark(from, end, markType.create());
      tr = selectRange(tr, from, end);
      dispatch(tr.scrollIntoView());
    }
    focus();
  });
}

/** Insert a link. Wraps a selection, or inserts a selected "link text" hint. */
export function insertLink(editor: Editor, href = 'https://'): void {
  withView(editor, ({ state, dispatch, focus }) => {
    const linkType = state.schema.marks.link;
    if (!linkType) return;
    const { from, to, empty } = state.selection;
    const mark = linkType.create({ href });

    if (!empty) {
      dispatch(state.tr.addMark(from, to, mark).scrollIntoView());
    } else {
      const placeholder = 'link text';
      let tr = state.tr.insertText(placeholder, from);
      const end = from + placeholder.length;
      tr = tr.addMark(from, end, mark);
      tr = selectRange(tr, from, end);
      dispatch(tr.scrollIntoView());
    }
    focus();
  });
}

/**
 * Set the current block to a heading of `level`. If the block is empty, insert
 * a selected "Heading" hint; otherwise just promote the existing text.
 */
export function setHeading(editor: Editor, level: number): void {
  withView(editor, ({ state, dispatch, focus }) => {
    const headingType = state.schema.nodes.heading;
    if (!headingType) return;
    const { $from, $to } = state.selection;
    const isEmpty = $from.parent.content.size === 0 && $from.sameParent($to);
    // Cover every block the selection touches (from the start of the first to
    // the end of the last), not just $from's block — a partial multi-block
    // selection would otherwise leave later blocks unchanged.
    let tr = state.tr.setBlockType($from.before(), $to.after(), headingType, {
      level,
    });
    if (isEmpty) {
      const pos = $from.before() + 1;
      const hint = 'Heading';
      tr = tr.insertText(hint, pos);
      tr = selectRange(tr, pos, pos + hint.length);
    }
    dispatch(tr.scrollIntoView());
    focus();
  });
}

/** Insert a hint into an empty current block and select it (no-op if not empty). */
function hintEmptyBlock(editor: Editor, hint: string): void {
  withView(editor, ({ state, dispatch }) => {
    const { $from, empty } = state.selection;
    if (!empty || $from.parent.content.size !== 0) return;
    const pos = $from.pos;
    let tr = state.tr.insertText(hint, pos);
    tr = selectRange(tr, pos, pos + hint.length);
    dispatch(tr);
  });
}

function runCommand(editor: Editor, command: { key: unknown }, payload?: unknown): void {
  // callCommand returns a ctx action; the key type is opaque here.
  editor.action(callCommand(command.key as never, payload as never));
}

/** Wrap the current block in a blockquote, hinting an empty block with "quote". */
export function insertBlockquote(editor: Editor): void {
  hintEmptyBlock(editor, 'quote');
  runCommand(editor, wrapInBlockquoteCommand);
  focusEditor(editor);
}

/** Wrap the current block in a bullet list, hinting an empty block. */
export function insertBulletList(editor: Editor): void {
  hintEmptyBlock(editor, 'List item');
  runCommand(editor, wrapInBulletListCommand);
  focusEditor(editor);
}

/** Wrap the current block in an ordered list, hinting an empty block. */
export function insertOrderedList(editor: Editor): void {
  hintEmptyBlock(editor, 'List item');
  runCommand(editor, wrapInOrderedListCommand);
  focusEditor(editor);
}

/**
 * Wrap the current block in a task list. Builds a bullet list, then marks the
 * enclosing list item as an (unchecked) task item via its `checked` attribute.
 */
export function insertTaskList(editor: Editor): void {
  hintEmptyBlock(editor, 'List item');
  runCommand(editor, wrapInBulletListCommand);
  withView(editor, ({ state, dispatch, focus }) => {
    const listItem = state.schema.nodes.list_item;
    if (!listItem || !('checked' in (listItem.spec.attrs ?? {}))) {
      focus();
      return;
    }
    const { $from } = state.selection;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type === listItem) {
        const pos = $from.before(d);
        const node = $from.node(d);
        dispatch(
          state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: false }),
        );
        break;
      }
    }
    focus();
  });
}

/** Turn the current block into a fenced code block. */
export function insertCodeBlock(editor: Editor): void {
  runCommand(editor, createCodeBlockCommand, '');
  focusEditor(editor);
}

/** Insert a thematic break (horizontal rule). */
export function insertHr(editor: Editor): void {
  runCommand(editor, insertHrCommand);
  focusEditor(editor);
}

/** Insert a GFM table and place the cursor in its first cell. */
export function insertTable(editor: Editor): void {
  runCommand(editor, insertTableCommand);
  focusEditor(editor);
}

/** Insert an image node with placeholder alt/src and select it. */
export function insertImagePlaceholder(editor: Editor): void {
  withView(editor, ({ state, dispatch, focus }) => {
    const imageType = state.schema.nodes.image;
    if (!imageType) return;
    const node = imageType.create({ src: 'path/to/image', alt: 'image', title: null });
    const { from } = state.selection;
    // Focus before dispatch so the node-selection change opens the edit panel
    // immediately (ProseMirror only fires selectNode while the view has focus).
    focus();
    let tr = state.tr.replaceSelectionWith(node, false);
    tr = selectInsertedNode(tr, 'image', from);
    dispatch(tr.scrollIntoView());
  });
}

const MATH_HINT = 'c = \\pm\\sqrt{a^2 + b^2}';

/** Insert an inline math node with a placeholder formula, node-selected. */
export function insertInlineMath(editor: Editor): void {
  withView(editor, ({ state, dispatch, focus }) => {
    const mathType = state.schema.nodes.math_inline;
    if (!mathType) return;
    // math_inline (plugin-math) serializes its text content.
    const node = mathType.create(null, state.schema.text(MATH_HINT));
    const { from } = state.selection;
    // Focus before dispatch so the node-selection change opens the source editor
    // immediately (ProseMirror only fires selectNode while the view has focus).
    focus();
    let tr = state.tr.replaceSelectionWith(node, false);
    tr = selectInsertedNode(tr, 'math_inline', from);
    dispatch(tr.scrollIntoView());
  });
}

/** Insert a block math node with a placeholder formula, node-selected. */
export function insertMathBlock(editor: Editor): void {
  withView(editor, ({ state, dispatch, focus }) => {
    const mathType = state.schema.nodes.math_block;
    if (!mathType) return;
    // math_block (see milkdownConfig override) serializes its `value` attr.
    const node = mathType.create({ value: MATH_HINT });
    const { from } = state.selection;
    // Focus before dispatch so the node-selection change opens the source editor
    // immediately (ProseMirror only fires selectNode while the view has focus).
    focus();
    let tr = state.tr.replaceSelectionWith(node, false);
    tr = selectInsertedNode(tr, 'math_block', from);
    dispatch(tr.scrollIntoView());
  });
}

// Convenience inline-mark wrappers ------------------------------------------

export const insertBold = (e: Editor) => applyInlineMark(e, 'strong', 'bold text');
export const insertItalic = (e: Editor) => applyInlineMark(e, 'emphasis', 'italic text');
export const insertStrikethrough = (e: Editor) =>
  applyInlineMark(e, 'strike_through', 'strikethrough');
export const insertInlineCode = (e: Editor) => applyInlineMark(e, 'inlineCode', 'code');

function focusEditor(editor: Editor): void {
  withView(editor, ({ focus }) => focus());
}
