// @vitest-environment happy-dom
import { editorViewCtx } from '@milkdown/core';
import type { Editor } from '@milkdown/core';
import { getMarkdown } from '@milkdown/utils';
import { TextSelection } from '@milkdown/prose/state';
import { describe, it, expect } from 'vitest';
import {
  selectionInTable,
  tableAddColRight,
  tableAddRowBelow,
  tableAlignColumn,
  tableDelete,
  tableDeleteRow,
} from './tableActions';

function ensure() {
  const d = document as unknown as {
    compatMode: string;
    doctype: DocumentType | null;
    documentElement: HTMLElement;
    implementation: DOMImplementation;
    insertBefore: (a: Node, b: Node) => void;
  };
  if (d.compatMode !== 'CSS1Compat')
    Object.defineProperty(d, 'compatMode', { configurable: true, get: () => 'CSS1Compat' });
  if (!d.doctype && d.documentElement)
    d.insertBefore(d.implementation.createDocumentType('html', '', ''), d.documentElement);
}

async function mount(md: string): Promise<Editor> {
  ensure();
  const { buildEditor } = await import('./milkdownConfig');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const e = await buildEditor({ root, initialValue: md, onChange: () => {}, listener: false }).create();
  await new Promise((r) => setTimeout(r, 0));
  return e;
}

const TABLE_MD = '| a | b |\n| --- | --- |\n| 1 | 2 |\n';

/** Put the caret inside the first cell of the given kind. */
function caretIntoFirstCell(e: Editor, kind: 'table_header' | 'table_cell' = 'table_header') {
  e.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    let cellPos = -1;
    view.state.doc.descendants((node, pos) => {
      if (cellPos === -1 && node.type.name === kind) {
        cellPos = pos;
      }
      return cellPos === -1;
    });
    expect(cellPos).toBeGreaterThan(-1);
    const $pos = view.state.doc.resolve(cellPos + 1);
    view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)));
  });
}

function markdown(e: Editor): string {
  let out = '';
  e.action((ctx) => {
    out = getMarkdown()(ctx);
  });
  return out;
}

describe('table editing actions', () => {
  it('detects when the selection is inside a table', async () => {
    const e = await mount(`intro\n\n${TABLE_MD}`);
    const view = e.ctx.get(editorViewCtx);
    expect(selectionInTable(view)).toBe(false); // initial caret in the paragraph
    caretIntoFirstCell(e);
    expect(selectionInTable(view)).toBe(true);
    await e.destroy();
  });

  it('adds a row below and a column right', async () => {
    const e = await mount(TABLE_MD);
    caretIntoFirstCell(e);
    tableAddRowBelow(e);
    tableAddColRight(e);
    const md = markdown(e);
    // 2 original rows + 1 added; 2 original cols + 1 added.
    const rows = md.split('\n').filter((l) => l.trim().startsWith('|'));
    expect(rows.length).toBe(4); // header + delimiter + 2 body rows
    expect(rows[0].split('|').filter((c) => c.trim() !== '' || c.includes(' ')).length).toBeGreaterThan(2);
    await e.destroy();
  });

  it('deletes a row and aligns a column', async () => {
    const e = await mount(TABLE_MD);
    caretIntoFirstCell(e);
    tableAlignColumn(e, 'center');
    let md = markdown(e);
    expect(md).toMatch(/:-+:/);

    // Delete the body row (deleting the header row is a schema-level no-op —
    // Milkdown tables always keep a header row).
    caretIntoFirstCell(e, 'table_cell');
    tableDeleteRow(e);
    md = markdown(e);
    expect(md).toMatch(/\|\s*a\s*\|/); // header survives (padding varies)
    expect(md).not.toMatch(/\|\s*1\s*\|/); // body row removed
    await e.destroy();
  });

  it('deletes the whole table', async () => {
    const e = await mount(`before\n\n${TABLE_MD}\nafter\n`);
    caretIntoFirstCell(e);
    tableDelete(e);
    const md = markdown(e);
    expect(md).not.toContain('|');
    expect(md).toContain('before');
    expect(md).toContain('after');
    await e.destroy();
  });
});
