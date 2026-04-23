import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useDocumentStore } from '../../stores/documentStore';
import { useConfigStore } from '../../stores/configStore';
import { FileTree } from './FileTree';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { ContextMenu } from './ContextMenu';

export function Sidebar() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const openDocPath = useDocumentStore((s) => s.doc?.path ?? null);
  const sidebarWidth = useConfigStore((s) => s.config.sidebarWidth);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: sidebarWidth, h: 500 });
  const [menu, setMenu] = useState<{ x: number; y: number; path: string; kind: 'file' | 'dir' } | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ w: rect.width, h: Math.max(0, rect.height - 40) });
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <WorkspaceSwitcher />
      {workspace && (
        <FileTree
          root={workspace.tree}
          height={size.h}
          width={size.w}
          activePath={openDocPath}
          onContextMenu={(path, kind, x, y) => setMenu({ x, y, path, kind })}
        />
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          path={menu.path}
          kind={menu.kind}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
