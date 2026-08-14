import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Editor } from '@milkdown/core';
import {
  tableAddColLeft,
  tableAddColRight,
  tableAddRowAbove,
  tableAddRowBelow,
  tableAlignColumn,
  tableDelete,
  tableDeleteCol,
  tableDeleteRow,
} from './tableActions';

export interface TableMenuTarget {
  x: number;
  y: number;
}

interface Props extends TableMenuTarget {
  getEditor: () => Editor | null;
  onClose: () => void;
}

/** Right-click menu with Typora-style table row/column operations. */
export function TableContextMenu({ x, y, getEditor, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    const off = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('click', off);
    window.addEventListener('contextmenu', off);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', off);
      window.removeEventListener('contextmenu', off);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Keep the menu inside the viewport when invoked near an edge.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      x: Math.max(4, Math.min(x, window.innerWidth - rect.width - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - rect.height - 4)),
    });
  }, [x, y]);

  const run = (action: (e: Editor) => void) => () => {
    const editor = getEditor();
    if (editor) action(editor);
  };

  const sections: { label: string; action: () => void }[][] = [
    [
      { label: 'Add Row Above', action: run(tableAddRowAbove) },
      { label: 'Add Row Below', action: run(tableAddRowBelow) },
      { label: 'Add Column Left', action: run(tableAddColLeft) },
      { label: 'Add Column Right', action: run(tableAddColRight) },
    ],
    [
      { label: 'Align Column Left', action: run((e) => tableAlignColumn(e, 'left')) },
      { label: 'Align Column Center', action: run((e) => tableAlignColumn(e, 'center')) },
      { label: 'Align Column Right', action: run((e) => tableAlignColumn(e, 'right')) },
    ],
    [
      { label: 'Delete Row', action: run(tableDeleteRow) },
      { label: 'Delete Column', action: run(tableDeleteCol) },
      { label: 'Delete Table', action: run(tableDelete) },
    ],
  ];

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={{ top: pos.y, left: pos.x }}
      onClick={(e) => e.stopPropagation()}
    >
      {sections.map((items, s) => (
        <div key={s} className={s > 0 ? 'context-menu-section' : undefined}>
          {items.map((it) => (
            <div
              key={it.label}
              className="context-menu-item"
              role="menuitem"
              onClick={() => {
                it.action();
                onClose();
              }}
            >
              {it.label}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
