import { useEffect } from 'react';
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

  useEffect(() => {
    const off = () => onClose();
    window.addEventListener('click', off);
    window.addEventListener('contextmenu', off);
    return () => {
      window.removeEventListener('click', off);
      window.removeEventListener('contextmenu', off);
    };
  }, [onClose]);

  const parent = kind === 'dir' ? path : path.split('/').slice(0, -1).join('/');

  const items: Array<{ label: string; action: () => Promise<void> | void } | 'sep'> = [
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
      action: async () => {
        if (window.confirm(`Move "${path.split('/').pop()}" to Trash?`)) {
          await deleteEntry(path);
        }
      },
    },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        top: y,
        left: x,
        minWidth: 180,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        padding: '4px 0',
        fontSize: 12,
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        color: 'var(--fg-primary)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((it, i) =>
        it === 'sep' ? (
          <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
        ) : (
          <div
            key={i}
            style={{ padding: '4px 12px', cursor: 'pointer' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'var(--selection)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'transparent')}
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
