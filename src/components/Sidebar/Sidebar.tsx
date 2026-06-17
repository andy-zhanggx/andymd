import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useDocumentStore } from '../../stores/documentStore';
import { useConfigStore } from '../../stores/configStore';
import { dialogService } from '../../services/dialogService';
import { FileTree } from './FileTree';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { ContextMenu } from './ContextMenu';
import { Outline } from './Outline';
import { useUIStore } from '../../stores/uiStore';

export function Sidebar() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const openWs = useWorkspaceStore((s) => s.open);
  const openDocPath = useDocumentStore((s) => s.doc?.path ?? null);
  const sidebarWidth = useConfigStore((s) => s.config.sidebarWidth);
  const tab = useUIStore((s) => s.sidebarTab);
  const setTab = useUIStore((s) => s.setSidebarTab);
  const hasDoc = useDocumentStore((s) => s.doc !== null);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: sidebarWidth, h: 500 });
  const [menu, setMenu] = useState<{ x: number; y: number; path: string; kind: 'file' | 'dir' } | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      // Subtract the tab bar (~33px) + workspace switcher (~40px) above the tree.
      setSize({ w: rect.width, h: Math.max(0, rect.height - 73) });
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="sidebar-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'files'}
          className={`sidebar-tab${tab === 'files' ? ' active' : ''}`}
          onClick={() => setTab('files')}
        >
          Files
        </button>
        <button
          role="tab"
          aria-selected={tab === 'outline'}
          className={`sidebar-tab${tab === 'outline' ? ' active' : ''}`}
          onClick={() => setTab('outline')}
          disabled={!hasDoc}
        >
          Outline
        </button>
      </div>
      {tab === 'outline' ? (
        <Outline />
      ) : (
        <>
          <WorkspaceSwitcher />
          {workspace ? (
            <FileTree
              root={workspace.tree}
              height={size.h}
              width={size.w}
              activePath={openDocPath}
              onContextMenu={(path, kind, x, y) => setMenu({ x, y, path, kind })}
            />
          ) : (
            <div className="sidebar-empty">
              <p>No folder open</p>
              <button
                className="sidebar-empty-action"
                onClick={async () => {
                  const path = await dialogService.pickWorkspaceDir();
                  if (path) await openWs(path);
                }}
              >
                Open Folder…
              </button>
            </div>
          )}
        </>
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
