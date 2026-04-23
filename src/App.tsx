import './styles/global.css';
import { useTheme } from './hooks/useTheme';
import { useConfigStore } from './stores/configStore';
import { TitleBar } from './components/TitleBar';
import { StatusBar } from './components/StatusBar';
import { Sidebar } from './components/Sidebar/Sidebar';

export default function App() {
  useTheme();
  const { showSidebar, sidebarWidth } = useConfigStore((s) => s.config);

  return (
    <div
      id="app-root"
      style={{
        display: 'grid',
        gridTemplateColumns: showSidebar ? `${sidebarWidth}px 1fr` : '1fr',
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
            background: 'var(--bg-sidebar)',
            borderRight: '1px solid var(--border)',
            overflow: 'hidden',
          }}
        >
          <Sidebar />
        </aside>
      )}
      <main style={{ gridArea: 'editor', overflow: 'auto', background: 'var(--bg-primary)' }}>
        {/* filled in Task 17 */}
      </main>
      <div style={{ gridArea: 'statusbar' }}><StatusBar /></div>
    </div>
  );
}
