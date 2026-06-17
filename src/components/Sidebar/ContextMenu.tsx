import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useDocumentStore } from '../../stores/documentStore';
import { fsService } from '../../services/fsService';
import { findNode, uniqueChildName } from '../../lib/workspacePath';

export interface Props {
  x: number;
  y: number;
  path: string;
  kind: 'file' | 'dir' | 'workspace';
  onClose: () => void;
}

export function ContextMenu({ x, y, path, kind, onClose }: Props) {
  const createFile = useWorkspaceStore((s) => s.createFile);
  const createFolder = useWorkspaceStore((s) => s.createFolder);
  const rename = useWorkspaceStore((s) => s.rename);
  const deleteEntry = useWorkspaceStore((s) => s.deleteEntry);
  const tree = useWorkspaceStore((s) => s.workspace?.tree ?? null);
  const openDoc = useDocumentStore((s) => s.open);

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

  // For a file the new-child target is its containing folder; for a folder or
  // the workspace root it is the path itself.
  const parent = kind === 'file' ? path.split('/').slice(0, -1).join('/') : path;

  type Item = { label: string; action: () => Promise<void> | void; danger?: boolean } | 'sep';

  const newFile: Item = {
    label: 'New File',
    action: async () => {
      const parentNode = findNode(tree, parent);
      const suggestion = uniqueChildName(parentNode?.children, 'Untitled', 'md');
      const name = window.prompt('File name (include .md)', suggestion);
      if (!name) return;
      try {
        const node = await createFile(parent, name);
        // Open it right away so the user can start editing — the whole point
        // of "New File" is to land in an editable document.
        await openDoc(node.path);
      } catch (e) {
        window.alert(`Could not create file: ${(e as Error)?.message ?? e}`);
      }
    },
  };

  const newFolder: Item = {
    label: 'New Folder',
    action: async () => {
      const name = window.prompt('Folder name');
      if (!name) return;
      try {
        await createFolder(parent, name);
      } catch (e) {
        window.alert(`Could not create folder: ${(e as Error)?.message ?? e}`);
      }
    },
  };

  const revealInFinder: Item = {
    label: 'Reveal in Finder',
    action: () => fsService.revealInFinder(path),
  };

  // The workspace root gets only safe actions — renaming or trashing the entire
  // vault root from a stray right-click would be a footgun.
  const items: Item[] =
    kind === 'workspace'
      ? [newFile, newFolder, 'sep', revealInFinder]
      : [
          newFile,
          newFolder,
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
          revealInFinder,
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
