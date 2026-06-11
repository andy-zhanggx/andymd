import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { fsService } from '../../services/fsService';

export interface Props {
  x: number;
  y: number;
  path: string;
  kind: 'file' | 'dir';
  onClose: () => void;
}

export function ContextMenu({ x, y, path, kind, onClose }: Props) {
  const createFile = useWorkspaceStore((s) => s.createFile);
  const createFolder = useWorkspaceStore((s) => s.createFolder);
  const rename = useWorkspaceStore((s) => s.rename);
  const deleteEntry = useWorkspaceStore((s) => s.deleteEntry);

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

  const parent = kind === 'dir' ? path : path.split('/').slice(0, -1).join('/');

  const items: Array<{ label: string; action: () => Promise<void> | void; danger?: boolean } | 'sep'> = [
    {
      label: 'New File',
      action: async () => {
        const name = window.prompt('File name (include .md)', 'Untitled.md');
        if (name) await createFile(parent, name);
      },
    },
    {
      label: 'New Folder',
      action: async () => {
        const name = window.prompt('Folder name');
        if (name) await createFolder(parent, name);
      },
    },
    'sep',
    {
      label: 'Rename…',
      action: async () => {
        const current = path.split('/').pop() ?? '';
        const next = window.prompt('New name', current);
        if (next && next !== current) {
          const to = path.split('/').slice(0, -1).concat(next).join('/');
          await rename(path, to);
        }
      },
    },
    {
      label: 'Reveal in Finder',
      action: () => fsService.revealInFinder(path),
    },
    'sep',
    {
      label: 'Move to Trash',
      danger: true,
      action: async () => {
        if (window.confirm(`Move "${path.split('/').pop()}" to Trash?`)) {
          await deleteEntry(path);
        }
      },
    },
  ];

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={{ top: pos.y, left: pos.x }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((it, i) =>
        it === 'sep' ? (
          <div key={i} className="context-menu-sep" role="separator" />
        ) : (
          <div
            key={i}
            className={it.danger ? 'context-menu-item danger' : 'context-menu-item'}
            role="menuitem"
            onClick={async () => {
              await it.action();
              onClose();
            }}
          >
            {it.label}
          </div>
        )
      )}
    </div>
  );
}
