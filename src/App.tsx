import { useState } from 'react';
import './styles/global.css';
import { useTheme } from './hooks/useTheme';
import { useShortcuts } from './hooks/useShortcuts';
import { useOpenFileRequest } from './hooks/useOpenFileRequest';
import { useWorkspaceWatcher } from './hooks/useWorkspaceWatcher';
import { useConfigStore } from './stores/configStore';
import { DEFAULT_CONFIG } from './types';
import { TitleBar } from './components/TitleBar';
import { StatusBar } from './components/StatusBar';
import { Sidebar } from './components/Sidebar/Sidebar';
import { MarkdownEditor } from './components/Editor/MarkdownEditor';
import { OpenFileDialog } from './components/OpenFileDialog';

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 420;
const clampSidebar = (w: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w));

export default function App() {
  useTheme();
  useShortcuts();
  useOpenFileRequest();
  useWorkspaceWatcher();
  const { showSidebar, sidebarWidth } = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = dragWidth ?? sidebarWidth;

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => setDragWidth(clampSidebar(ev.clientX));
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setDragWidth(null);
      void update({ sidebarWidth: clampSidebar(ev.clientX) });
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      id="app-root"
      style={{
        display: 'grid',
        gridTemplateColumns: showSidebar ? `${width}px 1fr` : '1fr',
        gridTemplateRows: '38px 1fr 24px',
        gridTemplateAreas: showSidebar
          ? '"titlebar titlebar" "sidebar editor" "statusbar statusbar"'
          : '"titlebar" "editor" "statusbar"',
        height: '100vh',
      }}
    >
      <div style={{ gridArea: 'titlebar' }}><TitleBar /></div>
      {showSidebar && (
        <aside
          style={{
            gridArea: 'sidebar',
            position: 'relative',
            background: 'var(--bg-sidebar)',
            borderRight: '1px solid var(--border)',
            overflow: 'hidden',
          }}
        >
          <Sidebar />
          <div
            className={dragWidth !== null ? 'sidebar-resizer dragging' : 'sidebar-resizer'}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            aria-valuenow={Math.round(width)}
            aria-valuemin={SIDEBAR_MIN}
            aria-valuemax={SIDEBAR_MAX}
            tabIndex={0}
            onMouseDown={startResize}
            onDoubleClick={() => void update({ sidebarWidth: DEFAULT_CONFIG.sidebarWidth })}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const delta = e.key === 'ArrowLeft' ? -16 : 16;
                // read from the store, not the render closure — key repeat
                // outpaces re-renders and would drop increments otherwise
                const cur = useConfigStore.getState().config.sidebarWidth;
                void update({ sidebarWidth: clampSidebar(cur + delta) });
              } else if (e.key === 'Home') {
                e.preventDefault();
                void update({ sidebarWidth: SIDEBAR_MIN });
              } else if (e.key === 'End') {
                e.preventDefault();
                void update({ sidebarWidth: SIDEBAR_MAX });
              }
            }}
            title="Drag to resize · double-click to reset"
          />
        </aside>
      )}
      <main style={{ gridArea: 'editor', overflow: 'auto', background: 'var(--bg-primary)' }}>
        <MarkdownEditor />
      </main>
      <div style={{ gridArea: 'statusbar' }}><StatusBar /></div>
      <OpenFileDialog />
    </div>
  );
}
