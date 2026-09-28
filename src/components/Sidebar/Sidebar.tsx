import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useDocumentStore } from '../../stores/documentStore';
import { useConfigStore } from '../../stores/configStore';
import { useSemanticStore } from '../../stores/semanticStore';
import { dialogService } from '../../services/dialogService';
import { FileTree } from './FileTree';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { ContextMenu } from './ContextMenu';
import { Outline } from './Outline';
import { TreeSearch, TREE_SEARCH_HEIGHT, type SearchMode } from './TreeSearch';
import { SemanticConsent } from './SemanticConsent';
import { SemanticResults } from './SemanticResults';
import { useUIStore } from '../../stores/uiStore';
import { countFiles, hitSummary, pruneTree, type TreeFilter } from '../../lib/treeFilter';
import { statusLabel } from '../../lib/semantic';

// Tab bar (~33px) + workspace switcher (~40px) above the tree.
const CHROME_ABOVE_TREE = 73;

export function Sidebar() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const openWs = useWorkspaceStore((s) => s.open);
  const openDocPath = useDocumentStore((s) => s.doc?.path ?? null);
  const sidebarWidth = useConfigStore((s) => s.config.sidebarWidth);
  const semanticEnabled = useConfigStore((s) => s.config.semanticSearch);
  const semanticEndpoint = useConfigStore((s) => s.config.semanticModelEndpoint);
  const semanticStatus = useSemanticStore((s) => s.status);
  const semanticHits = useSemanticStore((s) => s.hits);
  const semanticQuery = useSemanticStore((s) => s.query);
  const enableSemantic = useSemanticStore((s) => s.enable);
  const tab = useUIStore((s) => s.sidebarTab);
  const setTab = useUIStore((s) => s.setSidebarTab);
  const hasDoc = useDocumentStore((s) => s.doc !== null);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: sidebarWidth, h: 500 });
  const [menu, setMenu] = useState<{ x: number; y: number; path: string; kind: 'file' | 'dir' | 'workspace' } | null>(null);
  const [filter, setFilter] = useState<TreeFilter | null>(null);
  const [mode, setMode] = useState<SearchMode>('filter');
  const onFilter = useCallback((f: TreeFilter | null) => setFilter(f), []);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ w: rect.width, h: Math.max(0, rect.height - CHROME_ABOVE_TREE) });
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  // A new workspace starts with the full tree; TreeSearch remounts via `key`.
  const root = workspace?.root ?? null;
  useEffect(() => setFilter(null), [root]);

  const tree = useMemo(() => {
    if (!workspace) return null;
    if (!filter) return workspace.tree;
    return pruneTree(workspace.tree, new Set(filter.hits.keys()));
  }, [workspace, filter]);

  const shown = tree && filter ? countFiles(tree) : 0;
  const treeHeight = workspace ? Math.max(0, size.h - TREE_SEARCH_HEIGHT) : size.h;
  const semanticMode = mode === 'semantic';
  const semanticReady =
    semanticEnabled && semanticStatus.phase === 'ready' && semanticStatus.root === root;
  const hint = semanticMode
    ? semanticEnabled
      ? statusLabel(semanticStatus, semanticQuery ? semanticHits.length : null)
      : null
    : filter
      ? hitSummary(filter, shown)
      : null;

  const renderTreeArea = () => {
    if (!workspace || !tree) return null;
    if (semanticMode && !semanticEnabled) {
      return (
        <div className="treesearch-empty" style={{ height: treeHeight, overflowY: 'auto' }}>
          <SemanticConsent
            defaultEndpoint={semanticEndpoint}
            onEnable={(endpoint) => void enableSemantic(workspace.root, endpoint)}
            onCancel={() => setMode('filter')}
          />
        </div>
      );
    }
    if (semanticMode) {
      return <SemanticResults root={workspace.root} height={treeHeight} />;
    }
    if (filter && shown === 0) {
      return (
        <div className="sidebar-empty treesearch-empty" style={{ height: treeHeight }}>
          <p>
            {filter.status === 'indexing'
              ? 'Indexing workspace…'
              : filter.status === 'searching'
                ? 'Searching…'
                : 'No matching files'}
          </p>
        </div>
      );
    }
    return (
      <FileTree
        root={tree}
        height={treeHeight}
        width={size.w}
        activePath={openDocPath}
        filter={filter}
        onContextMenu={(path, kind, x, y) => setMenu({ x, y, path, kind })}
      />
    );
  };

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
          <WorkspaceSwitcher
            onContextMenu={
              workspace
                ? (x, y) => setMenu({ x, y, path: workspace.root, kind: 'workspace' })
                : undefined
            }
          />
          {workspace && tree ? (
            <>
              <TreeSearch
                key={workspace.root}
                root={workspace.root}
                onFilter={onFilter}
                hint={hint}
                mode={mode}
                onModeChange={setMode}
                semanticReady={semanticReady}
              />
              {renderTreeArea()}
            </>
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
