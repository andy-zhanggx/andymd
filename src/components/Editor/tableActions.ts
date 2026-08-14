import type { Editor } from '@milkdown/core';
import { editorViewCtx } from '@milkdown/core';
import type { EditorState, Transaction } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  isInTable,
  selectedRect,
} from '@milkdown/prose/tables';

/**
 * Table editing actions (Typora-style row/column operations), driven by the
 * prosemirror-tables commands re-exported through @milkdown/prose/tables —
 * the same primitives preset-gfm's own commands wrap. All operate on the
 * current cell (the caret's cell), so they work from a plain text cursor
 * without requiring a CellSelection.
 */

type PmCommand = (
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
) => boolean;

function runPm(editor: Editor, cmd: PmCommand): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    cmd(view.state, view.dispatch);
    view.focus();
  });
}

/** Is the (text) selection currently inside a table? */
export function selectionInTable(view: EditorView | null): boolean {
  return !!view && isInTable(view.state);
}

export const tableAddRowAbove = (e: Editor) => runPm(e, addRowBefore);
export const tableAddRowBelow = (e: Editor) => runPm(e, addRowAfter);
export const tableAddColLeft = (e: Editor) => runPm(e, addColumnBefore);
export const tableAddColRight = (e: Editor) => runPm(e, addColumnAfter);
export const tableDeleteRow = (e: Editor) => runPm(e, deleteRow);
export const tableDeleteCol = (e: Editor) => runPm(e, deleteColumn);
export const tableDelete = (e: Editor) => runPm(e, deleteTable);

export type TableAlignment = 'left' | 'center' | 'right';

/**
 * Align the caret's column. GFM stores alignment per column (the delimiter
 * row), so apply it to every cell in the column — aligning just one cell
 * would render but never serialize.
 */
export function tableAlignColumn(editor: Editor, align: TableAlignment): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    if (!isInTable(state)) return;
    const rect = selectedRect(state);
    let tr = state.tr;
    const seen = new Set<number>();
    for (let row = 0; row < rect.map.height; row++) {
      const cellPos = rect.map.map[row * rect.map.width + rect.left] + rect.tableStart;
      if (seen.has(cellPos)) continue; // rowspan'd cell appears once per row
      seen.add(cellPos);
      const node = tr.doc.nodeAt(cellPos);
      if (node) {
        tr = tr.setNodeMarkup(cellPos, undefined, { ...node.attrs, alignment: align });
      }
    }
    view.dispatch(tr);
    view.focus();
  });
}
